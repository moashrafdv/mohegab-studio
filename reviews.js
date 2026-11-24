(() => {
  const config = window.SUPABASE_CONFIG || {};
  const apiUrl = typeof config.url === "string" ? config.url.replace(/\/+$/, "") : "";
  const apiKey = typeof config.anonKey === "string" ? config.anonKey : "";
  const configured = apiUrl.startsWith("https://")
    && !apiUrl.includes("YOUR-PROJECT-REF")
    && apiKey.length > 20
    && !apiKey.includes("YOUR_SUPABASE");
  const list = document.getElementById("reviews-list");
  const form = document.getElementById("review-form");
  const formStatus = document.getElementById("review-form-status");
  const submitButton = form.querySelector('button[type="submit"]');

  function showFormStatus(message) {
    formStatus.textContent = message;
  }

  function setSummary(reviews) {
    const average = reviews.length
      ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
      : 0;
    const averageElement = document.getElementById("review-average");
    const starsElement = document.getElementById("review-average-stars");
    const countElement = document.getElementById("review-count");

    averageElement.textContent = reviews.length ? average.toFixed(1) : "—";
    starsElement.textContent = `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}`;
    starsElement.setAttribute(
      "aria-label",
      reviews.length ? `${average.toFixed(1)} out of 5 stars` : "No ratings yet"
    );
    countElement.textContent = `${reviews.length} approved ${reviews.length === 1 ? "review" : "reviews"}`;
  }

  function createReviewCard(review) {
    const card = document.createElement("article");
    card.className = "review-card";

    const header = document.createElement("div");
    header.className = "review-card-header";

    const reviewer = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = review.customer_name;
    const date = document.createElement("span");
    date.className = "review-date";
    date.textContent = new Date(review.created_at).toLocaleDateString("en", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    reviewer.append(name, date);

    const stars = document.createElement("span");
    stars.className = "review-stars";
    stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
    header.append(reviewer, stars);

    const comment = document.createElement("p");
    comment.textContent = review.comment;
    card.append(header, comment);
    return card;
  }

  async function loadReviews() {
    const response = await fetch(
      `${apiUrl}/rest/v1/reviews?select=id,customer_name,rating,comment,created_at&status=eq.approved&order=created_at.desc&limit=50`,
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Could not load reviews (${response.status}).`);
    }

    const reviews = await response.json();
    setSummary(reviews);

    if (reviews.length === 0) {
      const notice = document.createElement("p");
      notice.className = "review-notice";
      notice.textContent = "No approved reviews yet. Be the first to share your experience.";
      list.replaceChildren(notice);
      return;
    }

    list.replaceChildren(...reviews.map(createReviewCard));
  }

  if (!configured) {
    list.querySelector(".review-notice").textContent = "Reviews will be available after the review system is configured.";
    submitButton.disabled = true;
    showFormStatus("The review system is not connected yet.");
  } else {
    loadReviews().catch(error => {
      console.error("Could not load client reviews.", error);
      list.replaceChildren();
      const notice = document.createElement("p");
      notice.className = "review-notice";
      notice.textContent = "Reviews could not be loaded right now. Please try again later.";
      list.append(notice);
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!configured) {
      showFormStatus("The review system is not connected yet.");
      return;
    }

    const formData = new FormData(form);
    const customerName = String(formData.get("customer_name") || "").trim();
    const comment = String(formData.get("comment") || "").trim();
    const rating = Number(formData.get("rating"));
    if (!customerName || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      showFormStatus("Please enter your name, choose a star rating, and write a review.");
      return;
    }

    submitButton.disabled = true;
    showFormStatus("Submitting your review...");
    try {
      const response = await fetch(`${apiUrl}/rest/v1/reviews`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          customer_name: customerName,
          rating,
          comment
        })
      });

      if (!response.ok) {
        throw new Error(`Review submission failed (${response.status}).`);
      }

      form.reset();
      showFormStatus("Thanks! Your review was received and will appear after approval.");
    } catch (error) {
      console.error("Could not submit client review.", error);
      showFormStatus("Your review could not be submitted. Please try again later.");
    } finally {
      submitButton.disabled = false;
    }
  });
})();
