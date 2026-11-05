// Front end for the Suno music studio. All Suno calls go through the
// Netlify Functions under /api/*, which hold the API key server-side.

const $ = (s) => document.querySelector(s);
const POLL_MS = 8000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const RUNNING = ["PENDING", "TEXT_SUCCESS", "FIRST_SUCCESS", "GENERATING"];

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

let mode = "simple";

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const pw = store.get("appPassword", "");
  if (pw) headers["x-app-password"] = pw;
  const res = await fetch(path, { ...opts, headers });
  let data;
  try { data = await res.json(); } catch { data = { code: res.status, msg: res.statusText }; }
  if (res.status === 401) showLock();
  return data;
}

function setStatus(text, kind = "") {
  const el = $("#status");
  el.className = "status " + kind;
  el.innerHTML = text;
}

// ---------- password lock ----------
function showLock() { $("#lock").hidden = false; $("#studio").hidden = true; }
$("#lockForm").addEventListener("submit", (e) => {
  e.preventDefault();
  store.set("appPassword", $("#pw").value);
  $("#lock").hidden = true;
  $("#studio").hidden = false;
  loadCredits();
});

// ---------- credits ----------
async function loadCredits() {
  const r = await api("/api/credits");
  $("#credits").textContent = r.code === 200 ? `Credits: ${r.data}` : "Credits: —";
}

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    mode = t.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => {
      x.classList.toggle("active", x === t);
      x.setAttribute("aria-selected", x === t);
    });
    document.querySelectorAll(".mode").forEach((m) => (m.hidden = m.dataset.for !== mode));
    store.set("mode", mode);
  })
);

// ---------- small UI helpers ----------
for (const id of ["styleWeight", "weirdness"]) {
  const input = $("#" + id), out = $("#" + id + "Out");
  input.addEventListener("input", () => (out.textContent = Number(input.value).toFixed(2)));
}
document.querySelectorAll("[data-count]").forEach((c) => {
  const input = $("#" + c.dataset.count);
  const upd = () => (c.textContent = `${input.value.length}/${input.maxLength}`);
  input.addEventListener("input", upd);
  upd();
});
$("#instrumental").addEventListener("change", (e) => {
  $("#lyrics").disabled = e.target.checked;
  $("#lyricsBtn").disabled = e.target.checked;
});

// ---------- lyrics helper ----------
$("#lyricsBtn").addEventListener("click", async () => {
  const idea = prompt("What should the lyrics be about? (max 200 characters)", $("#title").value || "");
  if (!idea) return;
  const btn = $("#lyricsBtn");
  btn.disabled = true;
  setStatus('<span class="spinner"></span>Writing lyrics…');
  try {
    const r = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt: idea.slice(0, 200) }) });
    if (r.code !== 200) throw new Error(r.msg);
    const taskId = r.data.taskId;
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await sleep(5000);
      const s = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      const st = s.data?.status;
      if (st === "SUCCESS") {
        const options = (s.data.response?.data || []).filter((d) => d.text);
        if (!options.length) throw new Error("No lyrics returned.");
        const pick = options[0];
        $("#lyrics").value = pick.text;
        $("#lyrics").dispatchEvent(new Event("input"));
        if (!$("#title").value && pick.title) $("#title").value = pick.title;
        setStatus(`Lyrics ready${options.length > 1 ? ` (${options.length} versions, used the first)` : ""}.`, "ok");
        return;
      }
      if (st && !RUNNING.includes(st)) throw new Error(s.data.errorMessage || st);
    }
    throw new Error("Timed out waiting for lyrics.");
  } catch (err) {
    setStatus("Lyrics failed: " + escapeHtml(err.message), "error");
  } finally {
    btn.disabled = $("#instrumental").checked;
  }
});

// ---------- generate ----------
$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    customMode: mode === "custom",
    instrumental: $("#instrumental").checked,
    model: $("#model").value,
    style: $("#style").value,
  };
  if (mode === "simple") {
    body.prompt = $("#prompt").value;
  } else {
    Object.assign(body, {
      title: $("#title").value,
      lyrics: $("#lyrics").value,
      negativeTags: $("#negativeTags").value,
      vocalGender: $("#vocalGender").value,
      duration: $("#duration").value,
      variety: Number($("#variety").value),
      styleWeight: $("#styleWeight").value,
      weirdnessConstraint: $("#weirdness").value,
    });
  }

  const btn = $("#genBtn");
  btn.disabled = true;
  setStatus('<span class="spinner"></span>Sending to Suno…');
  try {
    const r = await api("/api/generate", { method: "POST", body: JSON.stringify(body) });
    if (r.code !== 200) throw new Error(r.msg || "Request failed");
    const taskId = r.data.taskId;
    const label = (mode === "custom" && body.title) || body.prompt || body.style || "Untitled";
    addHistory({ taskId, label: label.slice(0, 60), at: Date.now() });
    setStatus("Task started. Songs usually take 1–3 minutes.", "ok");
    track(taskId);
  } catch (err) {
    setStatus(escapeHtml(err.message), "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------- polling + rendering ----------
const active = new Set();

async function track(taskId) {
  if (active.has(taskId)) return;
  active.add(taskId);
  const card = taskCard(taskId);
  const started = Date.now();
  try {
    while (Date.now() - started < MAX_WAIT_MS) {
      const r = await api(`/api/status?taskId=${encodeURIComponent(taskId)}`);
      if (r.code !== 200) throw new Error(r.msg || "Status check failed");
      const d = r.data || {};
      const tracks = d.response?.sunoData || d.response?.data || [];
      renderTask(card, d.status, tracks, d.errorMessage);
      if (!RUNNING.includes(d.status)) break;
      await sleep(POLL_MS);
    }
  } catch (err) {
    renderTask(card, "ERROR", [], err.message);
  } finally {
    active.delete(taskId);
    loadCredits();
  }
}

function taskCard(taskId) {
  let card = document.getElementById("task-" + taskId);
  if (!card) {
    card = document.createElement("article");
    card.className = "card task";
    card.id = "task-" + taskId;
    $("#results").prepend(card);
  }
  return card;
}

const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music…",
  FIRST_SUCCESS: "First track ready, finishing the second…",
  SUCCESS: "Done",
};

function renderTask(card, status, tracks, error) {
  const running = RUNNING.includes(status);
  const failed = !running && status !== "SUCCESS";
  const label = STATUS_TEXT[status] || status || "Working…";
  card.innerHTML = `
    <div class="task-head">
      <h2>${running ? '<span class="spinner"></span>' : ""}${escapeHtml(tracks[0]?.title || "New song")}</h2>
      <span class="badge ${failed ? "fail" : ""}">${escapeHtml(label)}</span>
    </div>
    ${failed && error ? `<p class="status error">${escapeHtml(error)}</p>` : ""}
    ${tracks.map(trackHtml).join("")}
    ${!tracks.length && running ? '<p class="muted">Tracks will appear here as soon as they stream.</p>' : ""}
  `;
}

function trackHtml(t) {
  const src = t.audioUrl || t.audio_url || t.streamAudioUrl || t.stream_audio_url || "";
  const img = t.imageUrl || t.image_url || "";
  const dur = t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` : "";
  const download = t.audioUrl || t.audio_url;
  return `
    <div class="track">
      ${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy" />` : '<img alt="" />'}
      <div>
        <h3>${escapeHtml(t.title || "Untitled")}</h3>
        <p class="tags">${escapeHtml(t.tags || "")}${dur ? " · " + dur : ""}</p>
        ${src ? `<audio controls preload="none" src="${escapeAttr(src)}"></audio>` : '<p class="muted">Audio not ready yet…</p>'}
        <div class="links">
          ${download ? `<a href="${escapeAttr(download)}" target="_blank" rel="noopener" download>Download MP3</a>` : ""}
          ${img ? `<a href="${escapeAttr(img)}" target="_blank" rel="noopener">Cover art</a>` : ""}
        </div>
        ${t.prompt ? `<details><summary>Lyrics</summary><pre>${escapeHtml(t.prompt)}</pre></details>` : ""}
      </div>
    </div>`;
}

// ---------- history ----------
function addHistory(item) {
  const h = store.get("history", []).filter((x) => x.taskId !== item.taskId);
  h.unshift(item);
  store.set("history", h.slice(0, 20));
  renderHistory();
}
function renderHistory() {
  const h = store.get("history", []);
  $("#historyCard").hidden = !h.length;
  $("#history").innerHTML = h
    .map((x) => `<li><span>${escapeHtml(x.label)} <span class="muted">· ${new Date(x.at).toLocaleString()}</span></span>
      <button class="ghost" data-task="${escapeHtml(x.taskId)}">Open</button></li>`)
    .join("");
}
$("#history").addEventListener("click", (e) => {
  const id = e.target.dataset?.task;
  if (id) { track(id); window.scrollTo({ top: $("#results").offsetTop - 16, behavior: "smooth" }); }
});
$("#clearHistory").addEventListener("click", () => { store.set("history", []); renderHistory(); });

// ---------- utils ----------
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  const v = String(s ?? "");
  return /^https?:\/\//i.test(v) ? escapeHtml(v) : "";
}

// ---------- init ----------
if (store.get("mode", "simple") === "custom") document.querySelector('.tab[data-mode="custom"]').click();
renderHistory();
loadCredits();
