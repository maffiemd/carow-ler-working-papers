---
layout: dashboard
title: Editorial Dashboard
permalink: /dashboard/
---

<section id="dashboard-signin" class="dashboard-panel">
  <h1>Sign in</h1>
  <form id="signin-form" class="dashboard-form">
    <label for="signin-email">Email</label>
    <input type="email" id="signin-email" required autocomplete="username">
    <label for="signin-password">Password</label>
    <div class="dashboard-password-field">
      <input type="password" id="signin-password" required autocomplete="current-password">
      <button type="button" class="dashboard-password-toggle" data-target="signin-password" aria-label="Show password">Show</button>
    </div>
    <button type="submit">Sign in</button>
    <p id="signin-status" class="dashboard-status" role="status"></p>
  </form>

  <p class="dashboard-hint"><a href="#" id="show-accept-invite">Have an invite code instead?</a></p>

  <form id="accept-invite-form" class="dashboard-form" hidden>
    <h2>Accept your invite</h2>
    <p class="dashboard-hint">
      Use the 6-digit code from your invite email, not the button/link in it — many
      institutional email systems auto-scan links before you ever see them, which uses
      up the link's one-time token. The code is unaffected by that.
    </p>
    <label for="invite-email">Email</label>
    <input type="email" id="invite-email" required autocomplete="username">
    <label for="invite-code">Invite code</label>
    <input type="text" id="invite-code" inputmode="numeric" pattern="[0-9]*" required autocomplete="one-time-code">
    <label for="invite-password">Choose a password</label>
    <div class="dashboard-password-field">
      <input type="password" id="invite-password" required autocomplete="new-password" minlength="6">
      <button type="button" class="dashboard-password-toggle" data-target="invite-password" aria-label="Show password">Show</button>
    </div>
    <button type="submit">Set password &amp; sign in</button>
    <p id="accept-invite-status" class="dashboard-status" role="status"></p>
  </form>
</section>

<section id="dashboard-main" class="dashboard-panel" hidden>
  <div class="dashboard-panel__header">
    <h1>Submissions</h1>
    <div class="dashboard-panel__actions">
      <label class="dashboard-checkbox"><input type="checkbox" id="show-hidden"> Show hidden</label>
      <button type="button" id="show-add-form">Add submission</button>
    </div>
  </div>

  <form id="add-form" class="dashboard-form dashboard-form--card" hidden>
    <h2 id="add-form-title">New submission</h2>
    <input type="hidden" id="edit-id">
    <label for="add-title">Title</label>
    <input type="text" id="add-title" required>

    <label for="add-authors">Authors</label>
    <textarea id="add-authors" rows="3" placeholder="Jane Doe (MIT) &lt;jane@mit.edu&gt;; John Smith (Yale) &lt;jsmith@yale.edu&gt;" required></textarea>
    <p class="dashboard-hint">One author per line or separated by ";" — format: Name (Affiliation) &lt;email&gt;</p>

    <label for="add-abstract">Abstract</label>
    <textarea id="add-abstract" rows="4"></textarea>
    <p class="dashboard-hint">Pasted text is cleaned up automatically: line breaks from the PDF are joined into paragraphs. Undo (Cmd/Ctrl+Z) restores what you pasted.</p>

    <label for="add-assigned">Assigned to</label>
    <select id="add-assigned"></select>

    <label for="add-received">Date received</label>
    <input type="date" id="add-received" required>

    <label for="add-manuscript">Manuscript (PDF)</label>
    <input type="file" id="add-manuscript" accept="application/pdf" required>
    <p id="add-manuscript-hint" class="dashboard-hint" hidden>Leave empty to keep the current file. Choosing a new one replaces it.</p>
    <p id="add-published-hint" class="dashboard-hint" hidden>This paper is already published. Edits here change the dashboard record only, not the live paper page or PDF.</p>

    <div class="dashboard-form__actions">
      <button type="submit" id="add-submit">Save submission</button>
      <button type="button" id="cancel-add-form" class="dashboard-button--secondary">Cancel</button>
    </div>
    <p id="add-status" class="dashboard-status" role="status"></p>
  </form>

  <div class="dashboard-table-wrap">
    <table class="dashboard-table" id="submissions-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Authors</th>
          <th>Assigned to</th>
          <th>Received</th>
          <th>Status</th>
          <th>Decision notes</th>
          <th>Manuscript</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="submissions-tbody"></tbody>
    </table>
    <p id="submissions-empty" class="dashboard-hint" hidden>No submissions yet.</p>
  </div>
</section>

<div id="publish-modal" class="dashboard-modal" hidden>
  <form id="publish-form" class="dashboard-form">
    <h2>Accept &amp; publish</h2>
    <p id="publish-title" class="dashboard-hint"></p>

    <label for="publish-wp">WP number</label>
    <input type="text" id="publish-wp" required placeholder="e.g. 2026-03">

    <label for="publish-message">Message to the author(s) (optional)</label>
    <textarea id="publish-message" rows="7" placeholder="Feedback or a personal note, e.g. what the reviewers liked or a request for a final check."></textarea>
    <p class="dashboard-hint">Shown in the acceptance email, under the congratulations. Leave blank to send the standard email. A blank line starts a new paragraph.</p>
    <p id="publish-recipients" class="dashboard-hint"></p>
    <p class="dashboard-hint">This puts the paper live on the site and emails the mailing list and the author(s).</p>

    <div class="dashboard-form__actions">
      <button type="submit">Publish &amp; notify</button>
      <button type="button" id="publish-cancel" class="dashboard-button--secondary">Cancel</button>
    </div>
    <p id="publish-status" class="dashboard-status" role="status"></p>
  </form>
</div>
