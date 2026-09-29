/* Loadle — guess the country from its electricity load curve.
 * Data comes from data/curves.json (built from data/curves.csv by scripts/build.py).
 * Country list and aliases come from js/world.js.
 */
(async function () {
  "use strict";

  // ---------- Config ----------
  const EPOCH = Date.UTC(2026, 8, 24);   // puzzle #1
  const SEED = 20260924;                 // daily shuffle seed (move to the Worker before public launch)
  const MAX_GUESSES = 6;
  const MAX_DIST_KM = 20000;
  const HINT_UNLOCK_AFTER = 2;           // first clue unlocks after this many guesses

  // ---------- Data ----------
  const resp = await fetch("data/curves.json");
  const DATA = await resp.json();
  const C = DATA.countries;
  const PUZZLES = C.flatMap(c => ["winter", "summer"].map(season => ({ c, season })));
  const NP = PUZZLES.length;
  const byName = Object.fromEntries(C.map(c => [c.n, c]));
  const ALL = WORLD.map(w => byName[w.n] || w);

  // ---------- Daily selection ----------
  const today = new Date();
  const dayNum = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - EPOCH) / 864e5);
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffledOrder(seed) { const r = mulberry32(seed); const o = [...Array(NP).keys()]; for (let i = NP - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }
  const cycle = Math.floor(dayNum / NP);
  const dailyIdx = shuffledOrder(SEED + cycle)[((dayNum % NP) + NP) % NP];

  // ---------- State ----------
  let target = PUZZLES[dailyIdx].c, tSeason = PUZZLES[dailyIdx].season;
  let guesses = [], done = false, revealed = new Set();
  const curve = () => target.curves[tSeason];
  const peakGW = () => target.pk[tSeason];
  const isHit = g => g.n === target.n;

  const KEY = "loadle-state", SKEY = "loadle-settings";
  function loadState() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
  function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
  let S = loadState();
  if (!S.stats) S.stats = { played: 0, won: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0] };
  function restoreToday() {
    const fresh = S.day === dayNum;
    guesses = fresh && Array.isArray(S.guesses) ? S.guesses.map(n => ALL.find(c => c.n === n)).filter(Boolean) : [];
    done = !!(fresh && S.done);
    revealed = new Set(fresh && Array.isArray(S.revealed) ? S.revealed : []);
  }
  restoreToday();
  function persist() { saveState({ ...S, day: dayNum, guesses: guesses.map(g => g.n), done, revealed: [...revealed] }); }

  let settings = { hard: false, theme: "system" };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (e) { }
  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", settings.theme);
    $("hardSwitch").setAttribute("aria-checked", String(settings.hard));
    $("themeSel").value = settings.theme;
    $("hints").style.display = settings.hard ? "none" : "";
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { }
  }

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const toRad = d => d * Math.PI / 180;
  function distKm(a, b) { const R = 6371, dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon); const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function bearing(a, b) {            // rhumb-line bearing: "which way on the map", not great-circle
    let dLon = toRad(b.lon - a.lon);
    if (Math.abs(dLon) > Math.PI) dLon -= Math.sign(dLon) * 2 * Math.PI;
    const dPsi = Math.log(Math.tan(Math.PI / 4 + toRad(b.lat) / 2) / Math.tan(Math.PI / 4 + toRad(a.lat) / 2));
    return (Math.atan2(dLon, dPsi) * 180 / Math.PI + 360) % 360;
  }
  const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
  const arrow = deg => ARROWS[Math.round(deg / 45) % 8];
  const norm = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const names = c => [c.n, ...(ALIASES[c.n] || [])];

  // ---------- Chart ----------
  const cW = 600, cH = 270, padL = 46, padR = 14, padT = 22, padB = 34;
  const cx = i => padL + (i / 23) * (cW - padL - padR);
  const cy = v => padT + (1 - (v - 0.5) / 0.5) * (cH - padT - padB);
  function drawChart(h, gw) {
    const fmt = v => gw ? ((v * gw >= 100 ? Math.round(v * gw) : (v * gw).toFixed(1)) + " GW") : Math.round(v * 100) + "%";
    let path = "";
    h.forEach((v, i) => { path += (i ? " L" : "M") + cx(i).toFixed(1) + " " + cy(v).toFixed(1); });
    const area = path + ` L${cx(23).toFixed(1)} ${cy(0.5)} L${cx(0).toFixed(1)} ${cy(0.5)} Z`;
    const night = `<rect x="${cx(0)}" y="${padT}" width="${cx(6) - cx(0)}" height="${cH - padT - padB}" fill="var(--curve)" opacity=".07"/>
      <rect x="${cx(21)}" y="${padT}" width="${cx(23) - cx(21)}" height="${cH - padT - padB}" fill="var(--curve)" opacity=".07"/>`;
    let grid = "";
    [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(v => {
      const lab = gw ? (v * gw >= 100 ? Math.round(v * gw) : (v * gw).toFixed(1)) : Math.round(v * 100) + "%";
      grid += `<line x1="${padL}" x2="${cW - padR}" y1="${cy(v)}" y2="${cy(v)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${cy(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${lab}</text>`;
    });
    let ticks = "";
    [0, 6, 12, 18, 23].forEach(i => { ticks += `<text x="${cx(i)}" y="${cH - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${String(i).padStart(2, "0")}:00</text>`; });
    const pk = h.indexOf(Math.max(...h)), tr = h.indexOf(Math.min(...h));
    const lab = (i, txt, above) => `<text x="${cx(i)}" y="${cy(h[i]) + (above ? -11 : 17)}" text-anchor="${i < 3 ? "start" : i > 20 ? "end" : "middle"}" font-size="11" font-weight="700" fill="${above ? "var(--curve)" : "var(--muted)"}">${txt}</text>`;
    const ylab = `<text x="10" y="${padT - 8}" font-size="10" fill="var(--muted)">${gw ? "Demand, GW" : "% of daily peak"}</text>`;
    $("chart").innerHTML = `<svg id="chartSvg" viewBox="0 0 ${cW} ${cH}" role="img" aria-label="Hourly load curve">${night}${grid}${ticks}${ylab}
      <defs><linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--bolt)" stop-opacity=".55"/><stop offset=".55" stop-color="var(--curve)" stop-opacity=".25"/><stop offset="1" stop-color="var(--curve)" stop-opacity=".02"/></linearGradient></defs>
      <path d="${area}" fill="url(#loadGrad)"/>
      <path class="curve-anim" d="${path}" fill="none" stroke="var(--curve)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${cx(pk)}" cy="${cy(h[pk])}" r="6" fill="var(--bolt)" stroke="var(--curve)" stroke-width="2"/>
      <circle cx="${cx(tr)}" cy="${cy(h[tr])}" r="5" fill="var(--surface)" stroke="var(--curve)" stroke-width="2"/>
      ${lab(pk, "peak " + String(pk).padStart(2, "0") + ":00", true)}${lab(tr, "low " + fmt(h[tr]), false)}
      <g id="hover" style="display:none"><line id="hvLine" y1="${padT}" y2="${cH - padB}" stroke="var(--muted)" stroke-dasharray="3 3"/><circle id="hvDot" r="4" fill="var(--bolt)" stroke="var(--ink)" stroke-width="1.5"/><rect id="hvBox" height="20" fill="var(--ink)"/><text id="hvTxt" font-size="11" fill="var(--bg)" font-weight="600"></text></g>
      <rect x="${padL}" y="${padT}" width="${cW - padL - padR}" height="${cH - padT - padB}" fill="transparent"/></svg>`;
    const svg = $("chartSvg"), hv = $("hover");
    const move = e => {
      const r = svg.getBoundingClientRect(); const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * cW;
      const i = Math.max(0, Math.min(23, Math.round((px - padL) / (cW - padL - padR) * 23)));
      const x = cx(i), y = cy(h[i]); const txt = `${String(i).padStart(2, "0")}:00  ${fmt(h[i])}`;
      $("hvLine").setAttribute("x1", x); $("hvLine").setAttribute("x2", x);
      $("hvDot").setAttribute("cx", x); $("hvDot").setAttribute("cy", y);
      const t = $("hvTxt"); t.textContent = txt; const w = txt.length * 6.4 + 12;
      const bx = Math.min(Math.max(x - w / 2, padL), cW - padR - w), by = Math.max(padT, y - 34);
      const box = $("hvBox"); box.setAttribute("x", bx); box.setAttribute("y", by); box.setAttribute("width", w);
      t.setAttribute("x", bx + 6); t.setAttribute("y", by + 14); hv.style.display = "";
    };
    svg.addEventListener("mousemove", move); svg.addEventListener("touchmove", move, { passive: true });
    svg.addEventListener("mouseleave", () => hv.style.display = "none"); svg.addEventListener("touchend", () => hv.style.display = "none");
  }

  // ---------- Hints ----------
  const HINTS = [
    t => ["Typical peak demand", peakGW() + " GW (shown on the chart)"],
    t => ["Peak season", t.season === "flat" ? "no strong season" : t.season + "-peaking"],
    t => ["Largest generation source", t.src],
    t => ["Continent", t.cont],
  ];
  function renderHints() {
    const ul = $("hints"); ul.innerHTML = "";
    HINTS.forEach((f, i) => {
      const [k, v] = f(target);
      const li = document.createElement("li"), b = document.createElement("button"); b.type = "button";
      const unlocked = done || guesses.length >= i + HINT_UNLOCK_AFTER;
      if (revealed.has(i)) { b.textContent = `${k}: ${v}`; b.classList.add("shown"); b.disabled = true; }
      else if (unlocked) { b.textContent = `${k} — tap to reveal`; b.classList.add("ready"); b.onclick = () => { revealed.add(i); persist(); renderHints(); if (i === 0) drawChart(curve(), peakGW()); }; }
      else { b.textContent = `${k} · unlocks after guess ${i + HINT_UNLOCK_AFTER}`; b.disabled = true; }
      li.appendChild(b); ul.appendChild(li);
    });
  }

  // ---------- Guess rows ----------
  function renderRows() {
    const el = $("rows"); el.innerHTML = "";
    for (let i = 0; i < MAX_GUESSES; i++) {
      const g = guesses[i];
      if (!g) { const d = document.createElement("div"); d.className = "row empty"; d.innerHTML = `<span class="n">${i + 1}</span><span></span><span></span><span></span>`; el.appendChild(d); continue; }
      const hit = isHit(g), d = hit ? 0 : distKm(g, target), prox = Math.max(0, 1 - d / MAX_DIST_KM);
      const r = document.createElement("div"); r.className = "row" + (hit ? " hit" : "");
      r.innerHTML = `<div class="bar" style="width:${(prox * 100).toFixed(0)}%"></div>
        <span class="n">${i + 1}</span><span class="name">${g.n}</span>
        <span class="dist">${hit ? "0 km" : Math.round(d).toLocaleString() + " km"}</span>
        <span class="dir">${hit ? "✓" : arrow(bearing(g, target))}</span>`;
      el.appendChild(r);
    }
  }

  // ---------- Guessing ----------
  const input = $("guessInput"), sugg = $("sugg");
  function matches(q) {
    q = norm(q.trim()); if (!q) return [];
    const m = ALL.filter(c => !guesses.includes(c) && names(c).some(x => norm(x).includes(q)));
    const rank = c => names(c).some(x => norm(x) === q) ? 0 : names(c).some(x => norm(x).startsWith(q)) ? 1 : 2;
    m.sort((a, b) => rank(a) - rank(b)); return m.slice(0, 6);
  }
  function showSugg() {
    const m = matches(input.value); sugg.innerHTML = "";
    if (!m.length || done) { sugg.style.display = "none"; return; }
    const q = norm(input.value.trim());
    m.forEach(c => {
      const b = document.createElement("button"); b.type = "button";
      const al = (ALIASES[c.n] || []).find(x => norm(x).includes(q));
      b.textContent = (al && !norm(c.n).includes(q)) ? `${c.n} (${al})` : c.n;
      b.onclick = () => submit(c); sugg.appendChild(b);
    });
    sugg.style.display = "block";
  }
  input.addEventListener("input", showSugg);
  input.addEventListener("focus", showSugg);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { const m = matches(input.value); if (m.length) submit(m[0]); } if (e.key === "Escape") sugg.style.display = "none"; });
  document.addEventListener("click", e => { if (!$("guessArea").contains(e.target)) sugg.style.display = "none"; });

  function submit(c) {
    if (done || guesses.includes(c)) return;
    guesses.push(c); input.value = ""; sugg.style.display = "none";
    const hit = isHit(c);
    if (hit || guesses.length >= MAX_GUESSES) { done = true; recordResult(hit); }
    persist(); render();
    if (done) setTimeout(() => openDlg("statsDlg"), 1400);
  }
  function recordResult(won) {
    const st = S.stats; st.played++;
    if (won) { st.won++; st.streak = (S.lastWinDay === dayNum - 1) ? st.streak + 1 : 1; st.max = Math.max(st.max, st.streak); st.dist[guesses.length - 1]++; S.lastWinDay = dayNum; }
    else st.streak = 0;
  }

  // ---------- Result & share ----------
  function emojiLine() { return guesses.map(g => { if (isHit(g)) return "🟩"; const d = distKm(g, target); return d < 1500 ? "🟨" : d < 5000 ? "🟧" : "⬜"; }).join(""); }
  function shareText() {
    return `Loadle #${dayNum + 1} ${guesses.some(isHit) ? guesses.length : "X"}/${MAX_GUESSES}\n📈 ${emojiLine()}\nhttps://loadle.energy`;
  }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }
  async function share() {
    const txt = shareText();
    try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch (e) { }
    try { await navigator.clipboard.writeText(txt); toast("Copied to clipboard"); }
    catch (e) { toast("Copy failed — select the text manually"); }
  }
  function renderResult() {
    const el = $("result");
    if (!done) { el.innerHTML = ""; return; }
    const won = guesses.some(isHit);
    el.innerHTML = `<div class="result">
      <h2>${won ? `It's ${target.n} in ${tSeason}. Got it in ${guesses.length}.` : `It was ${target.n} in ${tSeason}.`}</h2>
      <p class="why">${target.why}</p>
      <p class="why" style="font-size:.8rem">Data: ${target.source}, ${target.year}.</p>
      <div class="actions"><button class="btn" id="shareBtn">Share result</button></div></div>`;
    $("shareBtn").onclick = share;
  }

  // ---------- Modals ----------
  function openDlg(id) { if (id === "statsDlg") renderStats(); $(id).showModal(); }
  $("helpBtn").onclick = () => openDlg("helpDlg");
  $("statsBtn").onclick = () => openDlg("statsDlg");
  $("settingsBtn").onclick = () => openDlg("settingsDlg");
  document.querySelectorAll("dialog").forEach(d => {
    d.querySelectorAll("[data-close]").forEach(b => b.onclick = () => d.close());
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
  });
  $("hardSwitch").onclick = () => { settings.hard = !settings.hard; applySettings(); };
  $("themeSel").onchange = e => { settings.theme = e.target.value; applySettings(); };
  function renderStats() {
    const st = S.stats, mx = Math.max(1, ...st.dist);
    const mine = (done && guesses.some(isHit)) ? guesses.length - 1 : -1;
    $("statsBody").innerHTML = `
      <div class="statgrid">
        <div><b>${st.played}</b><span>Played</span></div>
        <div><b>${st.played ? Math.round(100 * st.won / st.played) : 0}</b><span>Win %</span></div>
        <div><b>${st.streak}</b><span>Current<br>streak</span></div>
        <div><b>${st.max}</b><span>Max<br>streak</span></div>
      </div>
      <h2 style="font-size:.85rem">Guess distribution</h2>
      <div class="dist">${st.dist.map((n, i) => `<div class="drow"><span>${i + 1}</span><div class="dbar${i === mine ? " me" : ""}" style="width:${Math.max(8, 100 * n / mx)}%">${n}</div></div>`).join("")}</div>
      ${done ? `<div class="actions" style="justify-content:center"><button class="btn" id="shareBtn2">Share result</button></div>` : ""}`;
    const b = $("shareBtn2"); if (b) b.onclick = share;
  }

  // ---------- Render ----------
  function render() {
    $("meta").textContent = `Puzzle #${dayNum + 1}`;
    $("chartCap").innerHTML = `<span class="${tSeason === "summer" ? "sun" : ""}">${cap(tSeason)}</span> · Weekday`;
    drawChart(curve(), (revealed.has(0) || done) ? peakGW() : null);
    renderHints(); renderRows(); renderResult(); applySettings();
    input.disabled = done; input.placeholder = done ? "Come back tomorrow for a new curve" : "Guess a country";
  }
  render();
  if (!S.seenHelp) { openDlg("helpDlg"); S.seenHelp = true; saveState(S); }
})();
