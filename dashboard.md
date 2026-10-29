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

  <p class="dashboard-hint"><a href="#" id="show-reset-password">Forgot your password?</a></p>

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

  <form id="reset-password-form" class="dashboard-form" hidden>
    <h2>Reset your password</h2>
    <p class="dashboard-hint">
      Click "Send code", then use the 6-digit code from the email — not the
      button/link in it — many institutional email systems auto-scan links
      before you ever see them, which uses up the link's one-time token. The
      code is unaffected by that.
    </p>
    <label for="reset-email">Email</label>
    <input type="email" id="reset-email" required autocomplete="username">
    <button type="button" id="reset-send-code" class="dashboard-button--secondary">Send code</button>
    <label for="reset-code">Reset code</label>
    <input type="text" id="reset-code" inputmode="numeric" pattern="[0-9]*" required autocomplete="one-time-code">
    <label for="reset-password">New password</label>
    <div class="dashboard-password-field">
      <input type="password" id="reset-password" required autocomplete="new-password" minlength="6">
      <button type="button" class="dashboard-password-toggle" data-target="reset-password" aria-label="Show password">Show</button>
    </div>
    <button type="submit">Set new password &amp; sign in</button>
    <p id="reset-password-status" class="dashboard-status" role="status"></p>
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

    <label>Authors</label>
    <div id="authors-list"></div>
    <button type="button" id="add-author-row" class="dashboard-button--secondary dashboard-button--small">Add author</button>
    <p class="dashboard-hint">At least one author is required.</p>

    <label for="add-abstract">Abstract</label>
    <textarea id="add-abstract" rows="4"></textarea>
    <p class="dashboard-hint">Pasted text is cleaned up automatically: line breaks from the PDF are joined into paragraphs. Undo (Cmd/Ctrl+Z) restores what you pasted.</p>

    <label for="add-assigned">Assigned to</label>
    <select id="add-assigned"></select>

    <label for="add-received">Date received</label>
    <input type="date" id="add-received" required>

    <label for="add-manuscript">Manuscript link (Box)</label>
    <input type="url" id="add-manuscript" placeholder="https://cornell.app.box.com/s/..." required>
    <p class="dashboard-hint">Paste the manuscript's Box shared link (not the submission-form link) — set its sharing to "Anyone with the link can view" first, since the publish pipeline and some emails use this link directly.</p>
    <p id="add-manuscript-hint" class="dashboard-hint" hidden>Leave empty to keep the current link. Paste a new one to replace it.</p>
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
          <th>Actions</th>
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

<div id="reject-modal" class="dashboard-modal" hidden>
  <form id="reject-form" class="dashboard-form">
    <h2>Reject &amp; notify</h2>
    <p id="reject-title" class="dashboard-hint"></p>

    <label for="reject-subject">Subject</label>
    <input type="text" id="reject-subject" required>

    <label for="reject-body">Letter</label>
    <textarea id="reject-body" rows="14" required></textarea>
    <p class="dashboard-hint">Edit freely. A blank line starts a new paragraph. Replace or delete the bracketed placeholder line before sending.</p>
    <p id="reject-recipients" class="dashboard-hint"></p>
    <p class="dashboard-hint">Sending can't be undone. Use <strong>Send preview to me</strong> first to see exactly how it will look.</p>

    <div class="dashboard-form__actions">
      <button type="submit" id="reject-send">Send rejection letter</button>
      <button type="button" id="reject-preview" class="dashboard-button--secondary">Send preview to me</button>
      <button type="button" id="reject-cancel" class="dashboard-button--secondary">Cancel</button>
    </div>
    <p id="reject-status" class="dashboard-status" role="status"></p>
  </form>
</div>

<div id="email-modal" class="dashboard-modal" hidden>
  <form id="email-form" class="dashboard-form">
    <h2>Email authors</h2>
    <p id="email-title" class="dashboard-hint"></p>

    <label for="email-subject">Subject</label>
    <input type="text" id="email-subject" required>

    <label for="email-body">Message</label>
    <textarea id="email-body" rows="14" required></textarea>
    <p class="dashboard-hint">A blank line starts a new paragraph. This does not change the submission's status.</p>
    <p id="email-recipients" class="dashboard-hint"></p>
    <p class="dashboard-hint">Sending can't be undone. Use <strong>Send preview to me</strong> first to see exactly how it will look.</p>

    <div class="dashboard-form__actions">
      <button type="submit" id="email-send">Send email</button>
      <button type="button" id="email-preview" class="dashboard-button--secondary">Send preview to me</button>
      <button type="button" id="email-cancel" class="dashboard-button--secondary">Cancel</button>
    </div>
    <p id="email-status" class="dashboard-status" role="status"></p>
  </form>
</div>

<div id="invite-board-modal" class="dashboard-modal" hidden>
  <form id="invite-board-form" class="dashboard-form">
    <h2>Ask for help reviewing</h2>
    <p id="invite-board-title" class="dashboard-hint"></p>

    <label for="invite-board-subject">Subject</label>
    <input type="text" id="invite-board-subject" required>

    <label for="invite-board-body">Message</label>
    <textarea id="invite-board-body" rows="14" required></textarea>
    <p class="dashboard-hint">A blank line starts a new paragraph. The manuscript will be attached automatically.</p>
    <p id="invite-board-recipient" class="dashboard-hint"></p>
    <p class="dashboard-hint">Sending can't be undone. Use <strong>Send preview to me</strong> first to see exactly how it will look.</p>

    <div class="dashboard-form__actions">
      <button type="submit" id="invite-board-send">Send request</button>
      <button type="button" id="invite-board-preview" class="dashboard-button--secondary">Send preview to me</button>
      <button type="button" id="invite-board-cancel" class="dashboard-button--secondary">Cancel</button>
    </div>
    <p id="invite-board-status" class="dashboard-status" role="status"></p>
  </form>
</div>
