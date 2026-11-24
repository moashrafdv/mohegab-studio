const grid = document.getElementById("projects-grid");
const buttons = document.querySelectorAll(".filter");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.getElementById("main-nav");

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  nav.classList.toggle("open", !isOpen);
});

nav?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    menuToggle?.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
  });
});

function render(filter = "All") {
  const list = filter === "All"
    ? projects
    : projects.filter(p => p.category === filter);

  if (list.length === 0) {
    grid.innerHTML = '<p class="empty">New projects coming soon.</p>';
    return;
  }

  grid.innerHTML = list.map(p => `
    <article class="project">
      <img src="${p.image}" alt="${p.title}" loading="lazy">
      <div class="project-info">
        <span class="badge">${p.category}</span>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
        ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">View Project →</a>` : ""}
      </div>
    </article>
  `).join("");
}

buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    buttons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    render(btn.dataset.filter);
  });
});

render();