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

  // supabase-js reports any non-2xx Edge Function response as a generic
  // "non-2xx status code" message; the real reason is in the response body.
  async function functionErrorMessage(fnError) {
    if (fnError && fnError.context && typeof fnError.context.text === "function") {
      try {
        var text = await fnError.context.text();
        if (text) return text;
      } catch (e) { /* fall through to the generic message */ }
    }
    return fnError.message;
  }

  var publishModal = document.getElementById("publish-modal");
  var publishForm = document.getElementById("publish-form");
  var publishWpInput = document.getElementById("publish-wp");
  var publishMessageInput = document.getElementById("publish-message");
  var publishStatus = document.getElementById("publish-status");
  var publishingSubmission = null;

  function openPublishModal(submission) {
    if (!submission.manuscript_path) {
      alert("This submission has no manuscript file uploaded — cannot publish.");
      return;
    }
    publishingSubmission = submission;
    document.getElementById("publish-title").textContent = submission.title;
    publishWpInput.value = submission.wp_number || "";
    publishMessageInput.value = submission.author_message || "";
    var emails = (submission.authors || [])
      .map(function (a) { return a.email; })
      .filter(Boolean);
    document.getElementById("publish-recipients").textContent = emails.length
      ? "Will email: " + emails.join(", ")
      : "No author email is on file, so no email will be sent to the author(s).";
    publishStatus.textContent = "";
    publishModal.hidden = false;
    publishWpInput.focus();
  }

  function closePublishModal() {
    publishModal.hidden = true;
    publishingSubmission = null;
  }

  publishForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var submission = publishingSubmission;
    if (!submission) return;

    var submitButton = publishForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    publishStatus.textContent = "Publishing…";

    var wpNumber = publishWpInput.value.trim();
    var message = publishMessageInput.value.trim();

    var { error: updateError } = await supabase
      .from("submissions")
      .update({
        status: "accepted",
        wp_number: wpNumber,
        author_message: message || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id);
    if (updateError) {
      publishStatus.textContent = "Couldn't save: " + updateError.message;
      submitButton.disabled = false;
      return;
    }

    var { error: fnError } = await supabase.functions.invoke("publish-submission", {
      body: { submission_id: submission.id },
    });
    submitButton.disabled = false;
    if (fnError) {
      publishStatus.textContent = "Publish failed: " + (await functionErrorMessage(fnError));
      return;
    }

    closePublishModal();
    alert("Publishing started. The site and the author's inbox will update in a minute or two.");
    loadSubmissions();
  });

  document.getElementById("publish-cancel").addEventListener("click", closePublishModal);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !publishModal.hidden) closePublishModal();
  });

  var REJECT_PLACEHOLDER = "[Add specific feedback for the author(s) here, or delete this line.]";
  var rejectModal = document.getElementById("reject-modal");
  var rejectForm = document.getElementById("reject-form");
  var rejectSubject = document.getElementById("reject-subject");
  var rejectBody = document.getElementById("reject-body");
  var rejectStatus = document.getElementById("reject-status");
  var rejectingSubmission = null;

  function joinNames(names) {
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
  }

  function draftRejectionLetter(submission) {
    var names = (submission.authors || []).map(function (a) { return a.name; }).filter(Boolean);
    return (
      (names.length ? "Dear " + joinNames(names) + "," : "Dear author,") + "\n\n" +
      'Thank you for submitting "' + submission.title + '" to CAROW LER Working Papers. ' +
      "After careful consideration, we have decided not to include it in the series at this time.\n\n" +
      REJECT_PLACEHOLDER + "\n\n" +
      "We appreciate your interest in the series and wish you the best with the paper.\n\n" +
      "Best,\nKourtney Koebel and Michael Maffie\nEditors, CAROW LER Working Papers"
    );
  }

  function authorEmails(submission) {
    return (submission.authors || []).map(function (a) { return a.email; }).filter(Boolean);
  }

  function openRejectModal(submission) {
    rejectingSubmission = submission;
    document.getElementById("reject-title").textContent = submission.title;
    rejectSubject.value = "Your submission to CAROW LER Working Papers: " + submission.title;
    rejectBody.value = draftRejectionLetter(submission);
    var emails = authorEmails(submission);
    document.getElementById("reject-recipients").textContent = emails.length
      ? "Will email: " + emails.join(", ")
      : "No author email is on file, so sending will only mark this submission as rejected; nothing will be emailed.";
    document.getElementById("reject-send").textContent = emails.length ? "Send rejection letter" : "Mark as rejected";
    rejectStatus.textContent = "";
    rejectModal.hidden = false;
    rejectSubject.focus();
  }

  function closeRejectModal() {
    rejectModal.hidden = true;
    rejectingSubmission = null;
  }

  async function sendRejection(preview) {
    var submission = rejectingSubmission;
    if (!submission) return;
    var subject = rejectSubject.value.trim();
    var body = rejectBody.value.trim();
    if (!subject || !body) {
      rejectStatus.textContent = "The subject and letter can't be empty.";
      return;
    }
    if (body.indexOf(REJECT_PLACEHOLDER) !== -1) {
      rejectStatus.textContent = "Replace or delete the bracketed placeholder line first.";
      return;
    }
    if (!preview) {
      var emails = authorEmails(submission);
      var question = emails.length
        ? "Send this rejection letter to " + emails.join(", ") + "? This can't be undone."
        : 'Mark "' + submission.title + '" as rejected? No email will be sent, since no author email is on file.';
      if (!confirm(question)) return;
    }

    var buttons = rejectForm.querySelectorAll("button");
    buttons.forEach(function (b) { b.disabled = true; });
    rejectStatus.textContent = preview ? "Sending preview…" : "Sending…";

    var { data, error } = await supabase.functions.invoke("reject-submission", {
      body: { submission_id: submission.id, subject: subject, body: body, preview: preview },
    });
    buttons.forEach(function (b) { b.disabled = false; });
    if (error) {
      rejectStatus.textContent = "Failed: " + (await functionErrorMessage(error));
      return;
    }

    if (preview) {
      rejectStatus.textContent = "Preview sent to " + (data && data.to ? data.to.join(", ") : "you") + ".";
      return;
    }
    closeRejectModal();
    if (data && data.staging) {
      alert("STAGING: the letter was sent to " + data.to.join(", ") + " instead of the authors. The submission is marked rejected.");
    } else if (data && data.emailed) {
      alert("Rejection letter sent to " + data.emailed + " address" + (data.emailed === 1 ? "" : "es") + ".");
    } else {
      alert("Marked as rejected. No email was sent, since no author email is on file.");
    }
    loadSubmissions();
  }

  rejectForm.addEventListener("submit", function (event) {
    event.preventDefault();
    sendRejection(false);
  });
  document.getElementById("reject-preview").addEventListener("click", function () { sendRejection(true); });
  document.getElementById("reject-cancel").addEventListener("click", closeRejectModal);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !rejectModal.hidden) closeRejectModal();
  });

  function buildActionMenu(items) {
    var wrapper = document.createElement("div");
    wrapper.className = "dashboard-action-menu";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dashboard-button--secondary dashboard-button--small dashboard-action-toggle";
    toggle.textContent = "Action";

    var dropdown = document.createElement("div");
    dropdown.className = "dashboard-action-dropdown";
    dropdown.hidden = true;

    items.forEach(function (item) {
      var itemButton = document.createElement("button");
      itemButton.type = "button";
      itemButton.className = "dashboard-button--secondary dashboard-button--small" + (item.danger ? " dashboard-button--danger" : "");
      itemButton.textContent = item.label;
      itemButton.addEventListener("click", function () {
        dropdown.hidden = true;
        item.handler();
      });
      dropdown.appendChild(itemButton);
    });

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  document.addEventListener("click", function () {
    document.querySelectorAll(".dashboard-action-dropdown").forEach(function (menu) {
      menu.hidden = true;
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      document.querySelectorAll(".dashboard-action-dropdown").forEach(function (menu) {
        menu.hidden = true;
      });
    }
  });

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
    var menuItems = [];
    if (submission.status === "published") {
      var publishedLabel = document.createElement("div");
      publishedLabel.textContent = "Published (" + (submission.wp_number || "") + ")";
      actionsTd.appendChild(publishedLabel);
    } else {
      menuItems.push({ label: "Accept & Publish", handler: function () { openPublishModal(submission); } });

      if (submission.rejection_letter) {
        var sentLabel = document.createElement("div");
        sentLabel.className = "dashboard-hint";
        sentLabel.textContent = "Rejection letter sent";
        actionsTd.appendChild(sentLabel);
      } else {
        menuItems.push({ label: "Reject & notify", handler: function () { openRejectModal(submission); }, danger: true });
      }
    }

    menuItems.push({ label: "Edit", handler: function () { openEditForm(submission); } });
    menuItems.push({ label: submission.hidden ? "Unhide" : "Hide", handler: function () { setHidden(submission, !submission.hidden); } });
    if (submission.hidden) {
      menuItems.push({ label: "Delete permanently", handler: function () { deletePermanently(submission); }, danger: true });
    }

    actionsTd.appendChild(buildActionMenu(menuItems));
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

  // Text copied out of a PDF has a hard line break at the end of every visual
  // line. Join those back into flowing paragraphs, keeping real paragraph
  // breaks (blank lines). A hyphen at a line end is left in place: it's
  // usually a split word ("collec-tive"), but could be a real compound
  // ("labor-management"), and silently deleting it would corrupt the latter.
  function cleanPastedText(text) {
    var PARAGRAPH = "\u0000";
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/\n[ \t]*\n(?:[ \t]*\n)*/g, PARAGRAPH)
      .replace(/-\n[ \t]*(?=\S)/g, "-")
      .replace(/[ \t]*\n[ \t]*/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(new RegExp(PARAGRAPH, "g"), "\n\n")
      .trim();
  }

  document.getElementById("add-abstract").addEventListener("paste", function (event) {
    var pasted = event.clipboardData && event.clipboardData.getData("text/plain");
    if (!pasted) return;
    event.preventDefault();
    var cleaned = cleanPastedText(pasted);
    // execCommand keeps the browser's undo stack, so Ctrl/Cmd+Z restores
    // the original text if the cleanup wasn't wanted.
    if (!document.execCommand("insertText", false, cleaned)) {
      this.setRangeText(cleaned, this.selectionStart, this.selectionEnd, "end");
    }
  });

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
