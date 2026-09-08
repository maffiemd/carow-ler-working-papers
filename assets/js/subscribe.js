(function () {
  var form = document.getElementById("subscribe-form");
  if (!form) return;

  var status = document.getElementById("subscribe-status");
  var emailInput = document.getElementById("subscribe-email");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    status.textContent = "Subscribing…";

    var email = emailInput.value.trim();
    var submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;

    var { error } = await window.supabaseClient
      .from("subscribers")
      .insert({ email: email });

    submitButton.disabled = false;

    if (!error) {
      status.textContent = "You're subscribed. Thanks for signing up!";
      form.reset();
      return;
    }

    // Postgres unique_violation on the subscribers.email column
    if (error.code === "23505") {
      status.textContent = "That email is already subscribed.";
    } else {
      status.textContent = "Something went wrong — please try again.";
    }
  });
})();
