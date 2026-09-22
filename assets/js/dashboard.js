(function () {
  var supabase = window.supabaseClient;

  var signinSection = document.getElementById("dashboard-signin");
  var mainSection = document.getElementById("dashboard-main");
  var signOutButton = document.getElementById("dashboard-sign-out");

  var signinForm = document.getElementById("signin-form");
  var signinStatus = document.getElementById("signin-status");

  var showAddFormButton = document.getElementById("show-add-form");
  var cancelAddFormButton = document.getElementById("cancel-add-form");
  var addForm = document.getElementById("add-form");
  var addStatus = document.getElementById("add-status");
  var assignedSelect = document.getElementById("add-assigned");
  var receivedInput = document.getElementById("add-received");

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

    var titleTd = document.createElement("td");
    titleTd.textContent = submission.title;
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
      actionsTd.textContent = "Published (" + (submission.wp_number || "") + ")";
    } else {
      var publishButton = document.createElement("button");
      publishButton.type = "button";
      publishButton.textContent = "Accept & Publish";
      publishButton.addEventListener("click", function () { acceptAndPublish(submission); });
      actionsTd.appendChild(publishButton);
    }
    tr.appendChild(actionsTd);

    return tr;
  }

  async function loadSubmissions() {
    var { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("received_date", { ascending: false });

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

  showAddFormButton.addEventListener("click", function () {
    addForm.hidden = false;
    showAddFormButton.hidden = true;
    if (!receivedInput.value) {
      receivedInput.value = new Date().toISOString().slice(0, 10);
    }
  });

  cancelAddFormButton.addEventListener("click", function () {
    addForm.hidden = true;
    showAddFormButton.hidden = false;
    addForm.reset();
    addStatus.textContent = "";
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
    var file = document.getElementById("add-manuscript").files[0];

    if (!file) {
      addStatus.textContent = "Please attach a manuscript PDF.";
      submitButton.disabled = false;
      return;
    }

    var path = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
    var { error: uploadError } = await supabase.storage.from("manuscripts").upload(path, file);
    if (uploadError) {
      addStatus.textContent = "Upload failed: " + uploadError.message;
      submitButton.disabled = false;
      return;
    }

    var { error: insertError } = await supabase.from("submissions").insert({
      title: title,
      authors: authors,
      abstract: abstract,
      assigned_to: assignedTo,
      received_date: receivedDate,
      manuscript_path: path,
    });

    submitButton.disabled = false;
    if (insertError) {
      addStatus.textContent = "Couldn't save: " + insertError.message;
      return;
    }

    addStatus.textContent = "";
    addForm.reset();
    addForm.hidden = true;
    showAddFormButton.hidden = false;
    loadSubmissions();
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
