// Shared helpers for the public pages of Resend Daily Briefing.

// basePath is the path the app is mounted under (e.g. "/resend").
// We read it from the <base> tag or fall back to the location pathname prefix.
function getBasePath() {
  const base = document.querySelector("base")?.getAttribute("href");
  if (base) return base.replace(/\/$/, "");
  // fall back: derive from current path if it contains /resend/
  const m = window.location.pathname.match(/^(\/[^/]+)\//);
  return m ? m[1] : "";
}

const BASE = getBasePath();

async function getJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

async function postJson(path, body) {
  return getJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Render the provider list as checkboxes into a container.
// `checked` is the set of slugs that should be pre-checked.
async function renderProviders(container, checked) {
  const { data } = await getJson("/providers");
  const providers = (data && data.providers) || [];
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
