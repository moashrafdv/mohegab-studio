(() => {
  const config = window.SUPABASE_CONFIG || {};
  const apiUrl = typeof config.url === "string" ? config.url.replace(/\/+$/, "") : "";
  const apiKey = typeof config.anonKey === "string" ? config.anonKey : "";
  const configured = apiUrl.startsWith("https://")
    && !apiUrl.includes("YOUR-PROJECT-REF")
    && apiKey.length > 20
    && !apiKey.includes("YOUR_SUPABASE");
  const sessionKey = "mohegab-review-admin-session";
  const loginForm = document.getElementById("admin-login");
  const loginStatus = document.getElementById("admin-login-status");
  const panel = document.getElementById("admin-panel");
  const panelStatus = document.getElementById("admin-panel-status");
  const reviewList = document.getElementById("admin-review-list");
  const loginButton = loginForm.querySelector('button[type="submit"]');
  let session = null;

  function showLoginStatus(message) {
    loginStatus.textContent = message;
  }

  function showPanelStatus(message) {
    panelStatus.textContent = message;
  }

  function saveSession(value) {
    session = value;
    sessionStorage.setItem(sessionKey, JSON.stringify(value));
  }

  function clearSession() {
    session = null;
    sessionStorage.removeItem(sessionKey);
  }

  function readSession() {
    const stored = sessionStorage.getItem(sessionKey);
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error("Could not read the dashboard session.", error);
      clearSession();
      return null;
    }
  }

  async function responseError(response) {
    const text = await response.text();
    if (text) {
      try {
        const detail = JSON.parse(text);
        return detail.msg || detail.message || detail.error_description || detail.error || `Request failed (${response.status}).`;
      } catch {
        return `Request failed (${response.status}).`;
      }
    }
    return `Request failed (${response.status}).`;
  }

  async function authRequest(path, body) {
    const response = await fetch(`${apiUrl}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(await responseError(response));
    }
    return response.json();
  }

  async function accessToken() {
    if (!session) {
      throw new Error("Sign in to continue.");
    }
    if (session.expiresAt > Date.now() + 30000) {
      return session.access_token;
    }
    if (!session.refresh_token) {
      clearSession();
      throw new Error("Your session expired. Please sign in again.");
    }

    const refreshed = await authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token
    });
    saveSession({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000
    });
    return session.access_token;
  }

  async function adminRequest(path, options = {}) {
    const token = await accessToken();
    const headers = {
      apikey: apiKey,
      Authorization: `Bearer ${token}`
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    if (response.status === 401) {
      clearSession();
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) {
      throw new Error(await responseError(response));
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function isAdmin() {
    return adminRequest("rpc/is_review_admin", {
      method: "POST",
      body: {}
    });
  }

  function setSignedIn(isSignedIn) {
    loginForm.hidden = isSignedIn;
    panel.hidden = !isSignedIn;
  }

  function makeReviewCard(review) {
    const card = document.createElement("article");
    card.className = "admin-card";

    const header = document.createElement("div");
    header.className = "review-card-header";
    const reviewer = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = review.customer_name;
    const date = document.createElement("span");
    date.className = "review-date";
    date.textContent = new Date(review.created_at).toLocaleString("en", {
      dateStyle: "medium",
      timeStyle: "short"
    });
    reviewer.append(name, date);
    const stars = document.createElement("span");
    stars.className = "review-stars";
    stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
    header.append(reviewer, stars);

    const status = document.createElement("span");
    status.className = "badge";
    status.textContent = review.status === "approved" ? "Approved" : "Pending approval";
    const comment = document.createElement("p");
    comment.textContent = review.comment;
    const actions = document.createElement("div");
    actions.className = "admin-actions";

    if (review.status === "pending") {
      const approveButton = document.createElement("button");
      approveButton.className = "approve-review";
      approveButton.type = "button";
      approveButton.textContent = "Approve";
      approveButton.addEventListener("click", () => updateReview(review.id, approveButton));
      actions.append(approveButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-review";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteReview(review.id, deleteButton));
    actions.append(deleteButton);
    card.append(header, status, comment, actions);
    return card;
  }

  async function loadReviews() {
    showPanelStatus("Loading reviews...");
    const reviews = await adminRequest(
      "reviews?select=id,customer_name,rating,comment,status,created_at&order=created_at.desc&limit=100"
    );
    if (reviews.length === 0) {
      const empty = document.createElement("p");
      empty.className = "review-notice";
      empty.textContent = "No reviews have been submitted yet.";
      reviewList.replaceChildren(empty);
    } else {
      reviewList.replaceChildren(...reviews.map(makeReviewCard));
    }
    showPanelStatus(`${reviews.length} ${reviews.length === 1 ? "review" : "reviews"} loaded.`);
  }

  async function updateReview(id, button) {
    button.disabled = true;
    showPanelStatus("Approving review...");
    try {
      await adminRequest(`reviews?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { status: "approved" }
      });
      await loadReviews();
    } catch (error) {
      console.error("Could not approve review.", error);
      showPanelStatus(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteReview(id, button) {
    if (!window.confirm("Delete this review permanently?")) {
      return;
    }
    button.disabled = true;
    showPanelStatus("Deleting review...");
    try {
      await adminRequest(`reviews?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      await loadReviews();
    } catch (error) {
      console.error("Could not delete review.", error);
      showPanelStatus(error.message);
    } finally {
      button.disabled = false;
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!configured) {
      showLoginStatus("Add your Supabase URL and public key to supabase-config.js first.");
      return;
    }

    const formData = new FormData(loginForm);
    loginButton.disabled = true;
    showLoginStatus("Signing in...");
    try {
      const result = await authRequest("token?grant_type=password", {
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || "")
      });
      saveSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expiresAt: Date.now() + result.expires_in * 1000
      });

      if (!await isAdmin()) {
        clearSession();
        throw new Error("This account is not authorized to manage reviews.");
      }

      showLoginStatus("");
      setSignedIn(true);
      await loadReviews();
    } catch (error) {
      console.error("Dashboard sign-in failed.", error);
      clearSession();
      setSignedIn(false);
      showLoginStatus(error.message);
    } finally {
      loginButton.disabled = false;
    }
  });

  document.getElementById("admin-logout").addEventListener("click", async () => {
    try {
      const token = await accessToken();
      const response = await fetch(`${apiUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(await responseError(response));
      }
      showLoginStatus("You have signed out.");
    } catch (error) {
      console.error("Dashboard sign-out failed.", error);
      showLoginStatus("The session was removed from this browser, but the sign-out request failed.");
    } finally {
      clearSession();
      setSignedIn(false);
    }
  });

  async function restoreSession() {
    if (!configured) {
      showLoginStatus("Add your Supabase URL and public key to supabase-config.js first.");
      return;
    }
    session = readSession();
    if (!session) {
      return;
    }

    try {
      if (!await isAdmin()) {
        clearSession();
        showLoginStatus("This account is not authorized to manage reviews.");
        return;
      }
      setSignedIn(true);
      await loadReviews();
    } catch (error) {
      console.error("Could not restore the dashboard session.", error);
      clearSession();
      setSignedIn(false);
      showLoginStatus(error.message);
    }
  }

  if (!configured) {
    showLoginStatus("Add your Supabase URL and public key to supabase-config.js first.");
  } else {
    restoreSession();
  }
})();
