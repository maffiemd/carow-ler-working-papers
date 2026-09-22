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
    <input type="password" id="signin-password" required autocomplete="current-password">
    <button type="submit">Sign in</button>
    <p id="signin-status" class="dashboard-status" role="status"></p>
  </form>
</section>

<section id="dashboard-main" class="dashboard-panel" hidden>
  <div class="dashboard-panel__header">
    <h1>Submissions</h1>
    <button type="button" id="show-add-form">Add submission</button>
  </div>

  <form id="add-form" class="dashboard-form dashboard-form--card" hidden>
    <h2>New submission</h2>
    <label for="add-title">Title</label>
    <input type="text" id="add-title" required>

    <label for="add-authors">Authors</label>
    <textarea id="add-authors" rows="3" placeholder="Jane Doe (MIT) &lt;jane@mit.edu&gt;; John Smith (Yale) &lt;jsmith@yale.edu&gt;" required></textarea>
    <p class="dashboard-hint">One author per line or separated by ";" — format: Name (Affiliation) &lt;email&gt;</p>

    <label for="add-abstract">Abstract</label>
    <textarea id="add-abstract" rows="4"></textarea>

    <label for="add-assigned">Assigned to</label>
    <select id="add-assigned"></select>

    <label for="add-received">Date received</label>
    <input type="date" id="add-received" required>

    <label for="add-manuscript">Manuscript (PDF)</label>
    <input type="file" id="add-manuscript" accept="application/pdf" required>

    <div class="dashboard-form__actions">
      <button type="submit">Save submission</button>
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
