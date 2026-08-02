// Shared helpers for the public pages of Resend Daily Briefing.

// Prefer the path where this script was loaded from (works with or without
// a trailing slash on the page URL). Fall back to the first path segment
// or an inline window.__RDB_BASE set by the page.
function getBasePath() {
  if (typeof window !== "undefined" && typeof window.__RDB_BASE === "string") {
    return window.__RDB_BASE.replace(/\/$/, "");
  }
  const scripts = document.querySelectorAll('script[src*="assets/app.js"]');
  const src = scripts.length ? scripts[scripts.length - 1].src : "";
  if (src) {
    try {
      // …/resend/assets/app.js → /resend
      return new URL("..", src).pathname.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
  }
  const m = (window.location.pathname || "").match(/^(\/[^/]+)/);
  return m ? m[1] : "";
}

const BASE = getBasePath();

async function getJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore non-JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

async function postJson(path, body) {
  return getJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function renderProviders(container, checked) {
  const { ok, data } = await getJson("/providers");
  if (!ok || !data || !data.providers) {
    throw new Error("Could not load providers");
  }
  const providers = data.providers;
  container.innerHTML = "";
  for (const p of providers) {
    const label = document.createElement("label");
    label.className = "provider";
    label.innerHTML = `
      <input type="checkbox" value="${p.slug}" ${checked.has(p.slug) ? "checked" : ""} />
      <span class="dot" style="background:#${p.accent}"></span>
      <span class="meta">
        <span class="name">${p.displayName}</span>
        <span class="tag">${p.tagline} · ${p.repoCount} repo${p.repoCount === 1 ? "" : "s"}</span>
      </span>`;
    container.appendChild(label);
  }
  return providers;
}

function showStatus(el, kind, msg) {
  el.className = `status show ${kind}`;
  el.textContent = msg;
}

function getCheckedSlugs(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
}

window.RDB = { BASE, getJson, postJson, renderProviders, showStatus, getCheckedSlugs };
