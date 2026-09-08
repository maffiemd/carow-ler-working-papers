(async function () {
  var statusEl = document.getElementById("unsubscribe-status");
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token");

  if (!token) {
    statusEl.textContent = "Missing unsubscribe link — please use the link from your email.";
    return;
  }

  var { error } = await window.supabaseClient.rpc("unsubscribe", { token: token });

  if (error) {
    statusEl.textContent = "Something went wrong — please try again or contact us.";
    return;
  }

  statusEl.textContent = "You've been unsubscribed. Sorry to see you go.";
})();
