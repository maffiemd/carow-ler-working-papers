(function () {
  var supabase = window.supabaseClient;

  var signinSection = document.getElementById("dashboard-signin");
  var mainSection = document.getElementById("dashboard-main");
  var signOutButton = document.getElementById("dashboard-sign-out");

  var signinForm = document.getElementById("signin-form");
  var signinStatus = document.getElementById("signin-status");

  var showAcceptInviteLink = document.getElementById("show-accept-invite");
  var acceptInviteForm = document.getElementById("accept-invite-form");
  var acceptInviteStatus = document.getElementById("accept-invite-status");

  var showAddFormButton = document.getElementById("show-add-form");
  var cancelAddFormButton = document.getElementById("cancel-add-form");
  var addForm = document.getElementById("add-form");
  var addStatus = document.getElementById("add-status");
  var assignedSelect = document.getElementById("add-assigned");
  var receivedInput = document.getElementById("add-received");
  var editIdInput = document.getElementById("edit-id");
  var addFormTitle = document.getElementById("add-form-title");
  var addSubmitButton = document.getElementById("add-submit");
  var manuscriptInput = document.getElementById("add-manuscript");
  var manuscriptHint = document.getElementById("add-manuscript-hint");
  var publishedHint = document.getElementById("add-published-hint");
  var showHiddenCheckbox = document.getElementById("show-hidden");

  // The submission currently being edited in the shared add/edit form (null
  // when the form is in "add" mode).
  var editingSubmission = null;

  var tbody = document.getElementById("submissions-tbody");
  var emptyNote = document.getElementById("submissions-empty");

  var STATUSES = ["submitted", "under_review", "accepted", "rejected", "published"];

  function populateRoster() {
    (window.EDITOR_ROSTER || []).forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      assignedSelect.appendChild(option);
    });
  }

  // Parses "Name (Affiliation) <email>; Name2 (Affiliation2) <email2>" (or
  // one per line) into [{name, affiliation, email}]. Missing parts are left
  // empty rather than rejected, since editors may not always have an email
  // or affiliation on hand when first logging a submission.
  function parseAuthors(raw) {
    return raw
      .split(/[;\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean)
      .map(function (entry) {
        var email = "";
        var emailMatch = entry.match(/<([^>]*)>/);
        if (emailMatch) {
          email = emailMatch[1].trim();
          entry = entry.replace(emailMatch[0], "").trim();
        }
        var affiliation = "";
        var affMatch = entry.match(/\(([^)]*)\)/);
        if (affMatch) {
          affiliation = affMatch[1].trim();
          entry = entry.replace(affMatch[0], "").trim();
        }
        return { name: entry, affiliation: affiliation, email: email };
      });
  }

  function formatAuthors(authors) {
    return (authors || [])
      .map(function (a) { return a.affiliation ? a.name + " (" + a.affiliation + ")" : a.name; })
      .join(", ");
  }

  // Inverse of parseAuthors: one "Name (Affiliation) <email>" per line.
  function formatAuthorsForEdit(authors) {
    return (authors || [])
      .map(function (a) {
        var line = a.name || "";
        if (a.affiliation) line += " (" + a.affiliation + ")";
        if (a.email) line += " <" + a.email + ">";
        return line;
      })
      .join("\n");
  }

  function resetAddForm() {
    editingSubmission = null;
    addForm.reset();
    editIdInput.value = "";
    addFormTitle.textContent = "New submission";
    addSubmitButton.textContent = "Save submission";
    manuscriptInput.required = true;
    manuscriptHint.hidden = true;
    publishedHint.hidden = true;
    addStatus.textContent = "";
  }

  function openEditForm(submission) {
    resetAddForm();
    editingSubmission = submission;
    editIdInput.value = submission.id;
    addFormTitle.textContent = "Edit submission";
    addSubmitButton.textContent = "Save changes";
    document.getElementById("add-title").value = submission.title || "";
    document.getElementById("add-authors").value = formatAuthorsForEdit(submission.authors);
    document.getElementById("add-abstract").value = submission.abstract || "";
    assignedSelect.value = submission.assigned_to || "";
    receivedInput.value = submission.received_date || "";
    manuscriptInput.required = false;
    manuscriptHint.hidden = false;
    publishedHint.hidden = submission.status !== "published";
    addForm.hidden = false;
    showAddFormButton.hidden = true;
    addForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function setHidden(submission, hidden) {
    var { error } = await supabase
      .from("submissions")
      .update({ hidden: hidden, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (error) {
      alert("Couldn't update: " + error.message);
      return;
    }
    loadSubmissions();
  }

  async function deletePermanently(submission) {
    var warning =
      'Permanently delete "' + submission.title + '"? This removes the submission record and its manuscript file, and cannot be undone.';
    if (submission.status === "published") {
      warning += "\n\nThis paper is already published. Deleting it here does NOT take it off the live site.";
    }
    if (!confirm(warning)) return;

    if (submission.manuscript_path) {
      var { error: storageError } = await supabase.storage.from("manuscripts").remove([submission.manuscript_path]);
      if (storageError) {
        alert("Couldn't delete the manuscript file, so nothing was deleted: " + storageError.message);
        return;
      }
    }
    var { error } = await supabase.from("submissions").delete().eq("id", submission.id);
    if (error) {
      alert("Deleted the manuscript file, but couldn't delete the record: " + error.message);
      return;
    }
    loadSubmissions();
  }

  function statusSelectHtml(current) {
    return STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (s === current ? " selected" : "") + ">" + s.replace("_", " ") + "</option>";
    }).join("");
  }

  async function downloadManuscript(path) {
    var { data, error } = await supabase.storage.from("manuscripts").createSignedUrl(path, 300);
    if (error || !data) {
      alert("Couldn't create a download link: " + (error ? error.message : "unknown error"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function acceptAndPublish(submission) {
    if (!submission.manuscript_path) {
      alert("This submission has no manuscript file uploaded — cannot publish.");
      return;
    }
    var wpNumber = prompt(
      "WP number for this paper (e.g. 2026-03):",
      submission.wp_number || ""
    );
    if (!wpNumber) return;

    if (!confirm('Publish "' + submission.title + '" as ' + wpNumber + " and notify the author(s)? This goes live on the site.")) {
      return;
    }

    var { error: updateError } = await supabase
      .from("submissions")
      .update({ status: "accepted", wp_number: wpNumber, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (updateError) {
      alert("Couldn't save the WP number: " + updateError.message);
      return;
    }

    var { data: fnData, error: fnError } = await supabase.functions.invoke("publish-submission", {
      body: { submission_id: submission.id },
    });
    if (fnError) {
      alert("Publish failed: " + fnError.message);
      return;
    }
    alert("Publishing started. The site and the author's inbox will update in a minute or two.");
    loadSubmissions();
  }

  function renderRow(submission) {
    var tr = document.createElement("tr");
    if (submission.hidden) tr.className = "dashboard-row--hidden";

    var titleTd = document.createElement("td");
    titleTd.textContent = submission.title;
    if (submission.hidden) {
      var hiddenBadge = document.createElement("span");
      hiddenBadge.className = "dashboard-badge";
      hiddenBadge.textContent = "Hidden";
      titleTd.appendChild(document.createElement("br"));
      titleTd.appendChild(hiddenBadge);
    }
    tr.appendChild(titleTd);

    var authorsTd = document.createElement("td");
    authorsTd.textContent = formatAuthors(submission.authors);
    tr.appendChild(authorsTd);

    var assignedTd = document.createElement("td");
    var assignedSelectEl = document.createElement("select");
    (window.EDITOR_ROSTER || []).forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === submission.assigned_to) opt.selected = true;
      assignedSelectEl.appendChild(opt);
    });
    assignedSelectEl.addEventListener("change", async function () {
      await supabase
        .from("submissions")
        .update({ assigned_to: assignedSelectEl.value, updated_at: new Date().toISOString() })
        .eq("id", submission.id);
    });
    assignedTd.appendChild(assignedSelectEl);
    tr.appendChild(assignedTd);

    var receivedTd = document.createElement("td");
    receivedTd.textContent = submission.received_date;
    tr.appendChild(receivedTd);

    var statusTd = document.createElement("td");
    var statusSelectEl = document.createElement("select");
    statusSelectEl.innerHTML = statusSelectHtml(submission.status);
    statusSelectEl.addEventListener("change", async function () {
      await supabase
        .from("submissions")
        .update({ status: statusSelectEl.value, updated_at: new Date().toISOString() })
        .eq("id", submission.id);
      loadSubmissions();
    });
    statusTd.appendChild(statusSelectEl);
    tr.appendChild(statusTd);

    var notesTd = document.createElement("td");
    var notesInput = document.createElement("input");
    notesInput.type = "text";
    notesInput.value = submission.decision_notes || "";
    notesInput.placeholder = "notes…";
    notesInput.addEventListener("blur", async function () {
      await supabase
        .from("submissions")
        .update({ decision_notes: notesInput.value, updated_at: new Date().toISOString() })
        .eq("id", submission.id);
    });
    notesTd.appendChild(notesInput);
    tr.appendChild(notesTd);

    var manuscriptTd = document.createElement("td");
    if (submission.manuscript_path) {
      var dlButton = document.createElement("button");
      dlButton.type = "button";
      dlButton.className = "dashboard-button--secondary";
      dlButton.textContent = "Download";
      dlButton.addEventListener("click", function () { downloadManuscript(submission.manuscript_path); });
      manuscriptTd.appendChild(dlButton);
    } else {
      manuscriptTd.textContent = "—";
    }
    tr.appendChild(manuscriptTd);

    var actionsTd = document.createElement("td");
    if (submission.status === "published") {
      var publishedLabel = document.createElement("div");
      publishedLabel.textContent = "Published (" + (submission.wp_number || "") + ")";
      actionsTd.appendChild(publishedLabel);
    } else {
      var publishButton = document.createElement("button");
      publishButton.type = "button";
      publishButton.textContent = "Accept & Publish";
      publishButton.addEventListener("click", function () { acceptAndPublish(submission); });
      actionsTd.appendChild(publishButton);
    }

    var rowActions = document.createElement("div");
    rowActions.className = "dashboard-row-actions";
    function addRowAction(label, handler, extraClass) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "dashboard-button--secondary dashboard-button--small" + (extraClass ? " " + extraClass : "");
      button.textContent = label;
      button.addEventListener("click", handler);
      rowActions.appendChild(button);
    }
    addRowAction("Edit", function () { openEditForm(submission); });
    addRowAction(submission.hidden ? "Unhide" : "Hide", function () { setHidden(submission, !submission.hidden); });
    if (submission.hidden) {
      addRowAction("Delete permanently", function () { deletePermanently(submission); }, "dashboard-button--danger");
    }
    actionsTd.appendChild(rowActions);
    tr.appendChild(actionsTd);

    return tr;
  }

  async function loadSubmissions() {
    var query = supabase.from("submissions").select("*");
    if (!showHiddenCheckbox.checked) {
      query = query.eq("hidden", false);
    }
    var { data, error } = await query.order("received_date", { ascending: false });

    if (error) {
      console.error("Failed to load submissions:", error);
      return;
    }

    tbody.innerHTML = "";
    if (!data || data.length === 0) {
      emptyNote.hidden = false;
      return;
    }
    emptyNote.hidden = true;
    data.forEach(function (submission) {
      tbody.appendChild(renderRow(submission));
    });
  }

  function showDashboard() {
    signinSection.hidden = true;
    mainSection.hidden = false;
    signOutButton.hidden = false;
    loadSubmissions();
  }

  function showSignin() {
    signinSection.hidden = false;
    mainSection.hidden = true;
    signOutButton.hidden = true;
  }

  signinForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    signinStatus.textContent = "Signing in…";
    var email = document.getElementById("signin-email").value.trim();
    var password = document.getElementById("signin-password").value;

    var { error } = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (error) {
      signinStatus.textContent = "Sign-in failed: " + error.message;
      return;
    }
    signinStatus.textContent = "";
  });

  signOutButton.addEventListener("click", async function () {
    await supabase.auth.signOut();
  });

  showAcceptInviteLink.addEventListener("click", function (event) {
    event.preventDefault();
    acceptInviteForm.hidden = !acceptInviteForm.hidden;
    showAcceptInviteLink.textContent = acceptInviteForm.hidden
      ? "Have an invite code instead?"
      : "Back to password sign-in";
  });

  acceptInviteForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var submitButton = acceptInviteForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    acceptInviteStatus.textContent = "Verifying…";

    var email = document.getElementById("invite-email").value.trim();
    var code = document.getElementById("invite-code").value.trim();
    var newPassword = document.getElementById("invite-password").value;

    var { error: verifyError } = await supabase.auth.verifyOtp({ email: email, token: code, type: "invite" });
    if (verifyError) {
      acceptInviteStatus.textContent = "Couldn't verify that code: " + verifyError.message;
      submitButton.disabled = false;
      return;
    }

    var { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    submitButton.disabled = false;
    if (passwordError) {
      acceptInviteStatus.textContent = "Signed in, but couldn't set your password: " + passwordError.message;
      return;
    }
    acceptInviteStatus.textContent = "";
    // onAuthStateChange below picks up the new session and shows the dashboard.
  });

  showAddFormButton.addEventListener("click", function () {
    resetAddForm();
    addForm.hidden = false;
    showAddFormButton.hidden = true;
    receivedInput.value = new Date().toISOString().slice(0, 10);
  });

  cancelAddFormButton.addEventListener("click", function () {
    resetAddForm();
    addForm.hidden = true;
    showAddFormButton.hidden = false;
  });

  showHiddenCheckbox.addEventListener("change", loadSubmissions);

  addForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var submitButton = addForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    addStatus.textContent = "Saving…";

    var title = document.getElementById("add-title").value.trim();
    var authors = parseAuthors(document.getElementById("add-authors").value);
    var abstract = document.getElementById("add-abstract").value.trim();
    var assignedTo = assignedSelect.value;
    var receivedDate = receivedInput.value;
    var file = manuscriptInput.files[0];
    var editing = editingSubmission;

    if (!file && !editing) {
      addStatus.textContent = "Please attach a manuscript PDF.";
      submitButton.disabled = false;
      return;
    }

    var path = editing ? editing.manuscript_path : null;
    var uploadedNewFile = false;
    if (file) {
      var newPath = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
      var { error: uploadError } = await supabase.storage.from("manuscripts").upload(newPath, file);
      if (uploadError) {
        addStatus.textContent = "Upload failed: " + uploadError.message;
        submitButton.disabled = false;
        return;
      }
      path = newPath;
      uploadedNewFile = true;
    }

    var fields = {
      title: title,
      authors: authors,
      abstract: abstract,
      assigned_to: assignedTo,
      received_date: receivedDate,
      manuscript_path: path,
    };

    var saveError;
    if (editing) {
      fields.updated_at = new Date().toISOString();
      saveError = (await supabase.from("submissions").update(fields).eq("id", editing.id)).error;
    } else {
      saveError = (await supabase.from("submissions").insert(fields)).error;
    }

    submitButton.disabled = false;
    if (saveError) {
      if (uploadedNewFile) {
        await supabase.storage.from("manuscripts").remove([path]);
      }
      addStatus.textContent = "Couldn't save: " + saveError.message;
      return;
    }

    // The old manuscript is only removed once the new record is safely saved,
    // so a failed save never leaves the submission pointing at a deleted file.
    if (editing && uploadedNewFile && editing.manuscript_path) {
      await supabase.storage.from("manuscripts").remove([editing.manuscript_path]);
    }

    resetAddForm();
    addForm.hidden = true;
    showAddFormButton.hidden = false;
    loadSubmissions();
  });

  document.querySelectorAll(".dashboard-password-toggle").forEach(function (toggleButton) {
    toggleButton.addEventListener("click", function () {
      var input = document.getElementById(toggleButton.dataset.target);
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggleButton.textContent = showing ? "Show" : "Hide";
      toggleButton.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });

  populateRoster();

  supabase.auth.onAuthStateChange(function (_event, session) {
    if (session) {
      showDashboard();
    } else {
      showSignin();
    }
  });

  supabase.auth.getSession().then(function (result) {
    if (result.data.session) {
      showDashboard();
    } else {
      showSignin();
    }
  });
})();
