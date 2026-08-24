// shared.js — nav, auth guard, utilities

function requireAuth() {
  const session = localStorage.getItem("athrion_session");
  if (!session) {
    window.location.href = "../index.html";
    return null;
  }
  return JSON.parse(session);
}

function logout() {
  localStorage.removeItem("athrion_session");
  window.location.href = "../index.html";
}

function renderNav(activePage) {
  const session = requireAuth();
  if (!session) return;

  const pages = [
    { id: "workout", label: "Workout", icon: "🏋️", href: "workout.html" },
    { id: "calories", label: "Calories", icon: "🥗", href: "calories.html" },
    { id: "library", label: "Library", icon: "📚", href: "library.html" },
  ];

  const navHTML = `
  <nav style="position:fixed;bottom:0;left:0;right:0;z-index:50;background:#0F0F0F;border-top:1px solid #1e1e1e;padding:10px 0 20px;">
    <div style="display:flex;justify-content:space-around;align-items:center;max-width:480px;margin:0 auto;">
      ${pages
        .map(
          (p) => `
        <a href="${p.href}" style="display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;padding:6px 20px;border-radius:12px;transition:all 0.2s;${activePage === p.id ? "background:rgba(200,241,53,0.1);" : ""}">
          <span style="font-size:22px;">${p.icon}</span>
          <span style="font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${activePage === p.id ? "#C8F135" : "#555"};">${p.label}</span>
        </a>
      `,
        )
        .join("")}
    </div>
  </nav>
  <header style="position:fixed;top:0;left:0;right:0;z-index:50;background:#0A0A0A;border-bottom:1px solid #1e1e1e;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <a href="../index.html" style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:0.08em;color:#fff;text-decoration:none;transition:color 0.2s;" onmouseover="this.style.color='#C8F135'" onmouseout="this.style.color='#fff'">ATHRION</a>
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="color:#888;font-size:14px;">Hey, ${session.name.split(" ")[0]}</span>
      <button onclick="logout()" style="background:#1a1a1a;border:1px solid #2a2a2a;color:#888;padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;" onmouseover="this.style.color='#C8F135'" onmouseout="this.style.color='#888'">Logout</button>
    </div>
  </header>`;

  document.body.insertAdjacentHTML("afterbegin", navHTML);
}

// Format seconds to MM:SS
function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Today's date string
function todayKey() {
  return new Date().toISOString().split("T")[0];
}

// Get user key for storage
function userKey(suffix) {
  const s = JSON.parse(localStorage.getItem("athrion_session") || "{}");
  return `athrion_${s.email}_${suffix}`;
}
