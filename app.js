// Signal Desk viewer. Static: reads state.json published by the desk (~60s). Never places orders.
"use strict";
const $ = s => document.querySelector(s);
const V = $("#view");
let S = null, RANGE = localStorage.range || "LIVE", FILTER = "all", lastShown = null;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd = (x, sign) => x == null ? "–" : (sign && x > 0 ? "+" : x < 0 ? "-" : "") + "$" + Math.abs(x).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pct = x => x == null ? "" : (x > 0 ? "+" : "") + Number(x).toFixed(1) + "%";
const tm = t => t ? new Date(t * 1000).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"}) : "";
const ago = t => { const s = Math.max(0, Math.round(Date.now() / 1000 - t)); return s < 60 ? s + " s" : s < 3600 ? Math.round(s / 60) + " min" : Math.round(s / 3600) + " h"; };
const tick = c => (c.symbol || c.name || "").toUpperCase().slice(0, 12);
const hue = s => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);

// coin logo: DexScreener image if published, else generated initial avatar
function av(c, n = 40) {
  const init = esc((c.symbol || c.name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "?");
  const a = `<span class="av" style="width:${n}px;height:${n}px;font-size:${n * .42}px;background:hsl(${hue(c.mint || c.name)} 55% 32%)">${init}</span>`;
  if (!c.logo) return a;
  return `<img class="lg" src="${esc(c.logo)}" width="${n}" height="${n}" loading="lazy" alt="" onerror="this.outerHTML=this.dataset.f" data-f='${a.replace(/'/g, "&#39;")}'>`;
}
const coinHref = c => `#/coin/${encodeURIComponent(c.mint)}`;

// ---------- agents ----------
const AG = {
  auditor: {c: "#fff", bg: "#2a2a2a", i: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3a8 8 0 00-8 8v10l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2 2.7 2V11a8 8 0 00-8-8z"/><circle cx="9" cy="11" r="1.6" fill="#1a1a1a"/><circle cx="15" cy="11" r="1.6" fill="#1a1a1a"/></svg>'},
  scanner: {c: "#2dd4bf", bg: "#0f2e2b", i: '<svg viewBox="0 0 24 24"><path fill="#2dd4bf" d="M12 2l2.4 5.2L20 6l-2 5 4 4-5.6.8L15 22l-3-4.6L9 22l-1.4-6.2L2 15l4-4-2-5 5.6 1.2z"/><circle cx="12" cy="12" r="2.6" fill="#0f2e2b"/></svg>'},
  analyst: {c: "#ef4444", bg: "#3a1111", i: '<svg viewBox="0 0 24 24"><path fill="#ef4444" d="M12 3l10 17H2z"/><rect x="8.3" y="12" width="2.2" height="3" rx="1" fill="#3a1111"/><rect x="13.5" y="12" width="2.2" height="3" rx="1" fill="#3a1111"/></svg>'},
  executor: {c: "#a855f7", bg: "#2a1540", i: '<svg viewBox="0 0 24 24"><path fill="#a855f7" d="M4 9c0-4 3.6-6 8-6s8 2 8 6v6c0 3.5-3.6 6-8 6s-8-2.5-8-6z"/><path fill="#a855f7" d="M5 6L3 2l5 2zM19 6l2-4-5 2z"/><circle cx="9" cy="11" r="1.6" fill="#2a1540"/><circle cx="15" cy="11" r="1.6" fill="#2a1540"/></svg>'},
  risk: {c: "#f97316", bg: "#3a1d08", i: '<svg viewBox="0 0 24 24"><path fill="#f97316" d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#3a1d08" stroke-width="2.2" fill="none"/></svg>'},
  telegram: {c: "#38bdf8", bg: "#0c2a3a", i: '<svg viewBox="0 0 24 24"><path fill="#38bdf8" d="M21 4L3 11l5 2 2 6 3-4 5 4z"/></svg>'},
  desk: {c: "#fff", bg: "#222", i: '<img src="icons/icon-192.png" width="34" height="34" style="border-radius:10px">'},
};
const NAMES = ["auditor", "scanner", "analyst", "executor", "risk"];
const icon = (a, n = 34) => `<span class="ai" style="background:${AG[a].bg};width:${n}px;height:${n}px">${AG[a].i}</span>`;
function agentState(name) {
  const a = (S.agents || []).find(x => x.name === name) || {};
  const deskAge = a.last ? S.updated - a.last : 1e9;   // heartbeat age at publish time
  const ok = !a.paused && deskAge < 150 && Date.now() / 1000 - S.updated < 900;
  return {ok, paused: a.paused, last: a.last};
}
const running = () => NAMES.filter(n => agentState(n).ok).length;
function statusLine(name, txt, color) {
  const st = agentState(name);
  const col = st.paused ? "#facc15" : st.ok ? (color || AG[name].c) : "#ef4444";
  return `<div class="as" style="color:${col}" data-hb="${name}">${esc(st.paused ? "pausiert" : st.ok ? txt : "offline")}</div>`;
}
function ringSvg(score, n = 78) {
  const r = 33, C = 2 * Math.PI * r, s = score == null ? 0 : Math.max(0, Math.min(100, score));
  const col = score == null ? "#444" : s >= 70 ? "#22c55e" : "#facc15";
  return `<div class="ring" style="width:${n}px;height:${n}px"><svg viewBox="0 0 78 78" style="width:${n}px;height:${n}px"><circle class="bg" cx="39" cy="39" r="${r}" fill="none"/>
  <circle class="fg" cx="39" cy="39" r="${r}" fill="none" stroke="${col}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - s / 100)}"/></svg><b>${score == null ? "–" : Math.round(s)}</b></div>`;
}
function card(name) {
  const k = S.cards[name], head = (sub, col) => `<div class="ah">${icon(name)}<div><div class="an">${name[0].toUpperCase() + name.slice(1)}</div>${statusLine(name, sub, col)}</div></div>`;
  let body = "";
  if (name === "auditor") {
    const l = k.last, layers = l && l.audit ? l.audit.layers : [];
    const sq = Array.from({length: 8}, (_, i) => `<i class="${layers[i] ? (layers[i].pass ? "g" : layers[i].pass === false ? "r" : "") : ""}"></i>`).join("");
    const mm = l && l.audit ? audModel(l) : null, nxt = !mm ? "" : mm.fail >= 0 ? `Rejected · layer ${mm.fail + 1}` : mm.cleared ? "8/8 → Analyst" : `${mm.checked}/8 checked`;
    body = head(`${k.taken_apart} taken apart`, "#22c55e") + `<div style="display:flex;gap:10px;margin-top:12px">${miniStack(l)}
      <div style="min-width:0">${l ? `<a href="#/auditor" class="sl"><span class="nm">${av(l, 18)}${esc(tick(l))}</span></a>` : `<div class="sl" style="color:#777">wartet…</div>`}
      <div class="sq">${sq}</div><div style="font-size:11.5px;color:#aaa;margin-top:6px">${l ? esc(nxt) : "noch kein Coin"}</div>
      <div style="font-size:11.5px;color:#777">${k.rejected} rejected</div></div></div>`;
  } else if (name === "scanner") {
    const rows = (S.scans || []).slice(0, 4).map(s => `<a href="${coinHref(s)}" class="sl ${s.verdict === "pass" ? "p" : "k"}"><span class="nm">${av(s, 16)}${esc(tick(s))}</span>
      <span class="mono">${s.verdict === "pass" ? "→ auditor" : esc(s.reason)}</span></a>`).join("");
    body = head(`${k.pools.toLocaleString("en-US")} pools`, "#60a5fa") + `<div style="margin-top:8px">${rows || '<div class="sl" style="color:#777">lauscht auf Graduations…</div>'}</div>`;
  } else if (name === "analyst") {
    const l = k.last, v = l && l.verdict;
    body = head(v ? (v.pass ? "Passed" : "Scoring") : "Idle", "#facc15") + `<div style="display:flex;gap:10px;align-items:center;margin-top:12px">${ringSvg(v ? v.score : null)}
      <div style="min-width:0">${l ? `<a href="${coinHref(l)}">${av(l, 22)}<div style="font-weight:600;font-size:13px;margin-top:4px">${esc(tick(l))}</div></a><div style="font-size:11.5px;color:#999">${v.pass ? "passed" : esc(v.reason)}</div>`
      : `<div style="font-size:12px;color:#777">noch nichts bewertet</div>`}</div></div>`;
  } else if (name === "executor") {
    const l = k.last;
    body = head(`${k.signals_tonight} Signale`, "#22c55e") + (l ? `<a href="${coinHref(l)}" class="sl" style="margin-top:14px"><span class="nm">${av(l, 26)}<span>${esc(tick(l))}<br><small style="color:#999">${usd(l.size_usd)} · ${l.stack_pct}%</small></span></span></a>
      <a class="badge" style="margin-top:12px" href="${esc(l.url)}" target="_blank" rel="noopener">Exec ↗</a>`
      : `<div style="font-size:12px;color:#777;margin-top:14px">Noch kein Kaufsignal.<br>Ticket ${k.stack_pct}% vom Stack, min ${usd(k.min_ticket)}</div>`);
  } else if (name === "risk") {
    const ops = S.open || [];
    body = head(`${k.open} offen`, "#f97316") + `<div style="margin-top:10px;font-size:12.5px"><div class="sl"><span>Stop-Loss</span><b style="color:#ef4444">-${k.stop_pct}%</b></div>
      <div class="sl"><span>Trailing</span><b style="color:#22c55e">${k.trail_pct}% ab +${k.trail_start_pct}%</b></div><div class="sl"><span>Timeout</span><b>${k.timeout_h}h</b></div>
      ${ops.slice(0, 1).map(p => `<a href="${coinHref(p)}" class="sl"><span class="nm">${av(p, 16)}${esc(tick(p))}</span><span class="${p.upnl_pct >= 0 ? "pos" : "neg"}">${pct(p.upnl_pct)}</span></a>`).join("")}</div>`;
  }
  return `<div class="ac" data-agent="${name}" onclick="location.hash='${name === "auditor" ? "#/auditor" : "#/agents/" + name}'">${body}</div>`;
}
function cardsRow() {
  return `<div class="cards" id="cards">${NAMES.map(card).join("")}</div><div class="dots" id="dots">${NAMES.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>`;
}
function wireCards() {
  const el = $("#cards"); if (!el) return;
  el.addEventListener("scroll", () => { const i = Math.round(el.scrollLeft / 192); document.querySelectorAll("#dots i").forEach((d, j) => d.classList.toggle("on", j === Math.min(i, NAMES.length - 1))); }, {passive: true});
  requestAnimationFrame(() => document.querySelectorAll(".ring .fg").forEach(c => c.style.strokeDashoffset = c.dataset.off));
}

// ---------- chart ----------
const RANGES = {LIVE: 3600, "1H": 3600, "4H": 4 * 3600, "1D": 86400, "1W": 7 * 86400, ALL: Infinity};
function chartHtml(series, markers, opts = {}) {
  const W = 390, H = opts.h || 230, padT = 40, padB = 18;
  let pts = series.slice();
  if (pts.length === 1) pts = [[pts[0][0] - 60, pts[0][1]], pts[0]];
  if (!pts.length) return `<div class="chart" style="height:${H}px"><div class="empty-chart">Keine Daten</div></div>`;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
  if (hi - lo < (opts.minSpan ?? Math.max(hi * 0.004, 1e-12))) { const m = (hi + lo) / 2, s = (opts.minSpan ?? Math.max(hi * 0.004, 1e-12)) / 2; lo = m - s; hi = m + s; }
  const X = t => (t1 === t0 ? W : (t - t0) / (t1 - t0) * W), Y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(X(pts[i][0]) - X(pts[i - 1][0]), Y(pts[i][1]) - Y(pts[i - 1][1]));
  const neg = pts[pts.length - 1][1] < pts[0][1] && opts.colorByTrend;
  const last = pts[pts.length - 1], id = "g" + Math.random().toString(36).slice(2, 7), col = neg ? "#ef4444" : "#22c55e";
  const valAt = t => { let b = pts[0]; for (const p of pts) { if (p[0] <= t) b = p; else break; } return b[1]; };
  const mk = (markers || []).filter(m => m.ts >= t0 && m.ts <= t1).slice(-6).map(m => {
    const x = X(m.ts) / W * 100, y = Y(valAt(m.ts));
    const lab = m.type === "buy" ? `Bought ${esc(tick(m))}` : `${usd(m.pnl, true).replace(".00", "")}`;
    const top = m.type === "buy" ? 4 : Math.max(0, y - 34);
    return `<a class="mk ${m.type} ${m.type === "sell" && m.pnl < 0 ? "neg" : ""}" href="${coinHref(m)}" style="left:${Math.min(88, Math.max(12, x))}%;top:${top}px;height:${Math.max(26, y - top + 4)}px">
      <span class="pill">${av(m, 16)}${lab}</span>${m.type === "buy" ? '<span class="vl"></span><span class="dt"></span>' : ""}</a>`;
  }).join("");
  return `<div class="chart ${neg ? "neg" : ""}" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d="${d}L${W},${H}L0,${H}Z" fill="url(#${id})" stroke="none"/><path class="line" d="${d}" style="--len:${Math.ceil(len) + 2}" vector-effect="non-scaling-stroke"/></svg>
    <span class="pulse" style="left:${X(last[0]) / W * 100}%;top:${Y(last[1])}px"></span>${mk}${opts.note ? `<div class="empty-chart">${opts.note}</div>` : ""}</div>`;
}
function equitySeries() {
  const eq = S.equity || [], now = eq.length ? eq[eq.length - 1][0] : S.updated, span = RANGES[RANGE];
  const s = span === Infinity ? eq : eq.filter(p => p[0] >= now - span);
  return s.length ? s : eq.slice(-1);
}

// ---------- big number ----------
function countUp(el, to) {
  const from = lastShown == null ? to * 0.96 : lastShown; lastShown = to;
  const t0 = performance.now(), dur = 900;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = usd(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- activity rows ----------
function actRow(a) {
  const kind = a.kind === "reject" ? "skip" : a.kind, red = a.kind === "reject" || a.kind === "skip";
  const sub = (a.subtitle || "").replace(/^(\w+) · /, (m, ag) => ag[0].toUpperCase() + ag.slice(1) + " · ");
  let right = `<b>${esc(a.value)}</b>`;
  if (a.kind === "buy") { const [v, p] = (a.value || "").split(" · "); right = `<b>${esc(v)}</b><small>${esc(p || "")}</small>`; }
  if (a.kind === "sell") { const [v, p] = (a.value || "").split(" · "); const g = !String(v).startsWith("-"); right = `<b class="${g ? "pos" : "neg"}">${esc(v)}</b><small class="${g ? "pos" : "neg"}">${esc(p || "")}</small>`; }
  if (red) right = `<b>Skipped</b><small>${tm(a.ts)}</small>`;
  const subTxt = a.kind === "buy" ? `Executor · ${tm(a.ts)}` : a.kind === "sell" ? `${esc(sub.replace(/ · \d.*$/, ""))} · ${tm(a.ts)}` : esc(sub);
  return `<a class="row" href="${coinHref(a)}"><span class="ic">${av(a, 40)}<span class="bd ${kind}">${a.kind === "buy" ? "↗" : a.kind === "sell" ? "↙" : "!"}</span></span>
    <span class="rt"><b>${esc(a.title)}</b><small class="${red ? "red" : ""}">${subTxt}</small></span><span class="rr">${right}</span></a>`;
}
function scanRow(s) {
  return `<a class="row" href="${coinHref(s)}"><span class="ic">${av(s, 40)}<span class="bd ${s.verdict === "pass" ? "sell" : "skip"}">${s.verdict === "pass" ? "✓" : "×"}</span></span>
    <span class="rt"><b>${s.verdict === "pass" ? "Passed" : s.verdict === "drop" ? "Dropped" : "Killed"} ${esc(tick(s))}</b><small class="${s.verdict === "pass" ? "" : "red"}">Scanner · ${esc(s.reason)}</small></span>
    <span class="rr"><b>${s.verdict === "pass" ? "→ Auditor" : "Skipped"}</b><small>${tm(s.ts)}</small></span></a>`;
}
// activity = desk activity rows + scanner kills (so the list is never misleadingly empty)
function allActivity() {
  const a = (S.activity || []).map(x => ({...x, _t: x.ts}));
  const s = (S.scans || []).map(x => ({...x, _scan: 1, _t: x.ts, kind: x.verdict === "pass" ? "pass" : "skip"}));
  return [...a, ...s].sort((x, y) => y._t - x._t);
}
const rowAny = x => x._scan ? scanRow(x) : actRow(x);

// ---------- pages ----------
function home() {
  const v = S.value, base = S.start_stack || 200, ch = v - base, cp = base ? ch / base * 100 : 0, neg = ch < 0;
  const ser = equitySeries(), trades = (S.closed || []).length;
  const flat = (S.equity || []).every(p => Math.abs(p[1] - base) < 0.005);
  V.innerHTML = `<div class="page"><div class="hero"><div class="big" id="bigv">${usd(v)}</div>
    <div class="chg ${neg ? "neg" : ""}">${neg ? "▼" : "▲"} ${usd(Math.abs(ch))} (${Math.abs(cp).toFixed(2)}%) <span class="mult">${(v / base).toFixed(2)}×</span></div></div>
    ${chartHtml(ser, S.markers, {minSpan: 2, colorByTrend: true, note: flat ? `${trades} Trades · flach bei ${usd(base)} – wartet auf erstes Signal` : ""})}
    <div class="ranges">${Object.keys(RANGES).map(r => `<button class="${r === RANGE ? "on" : ""} ${r === "LIVE" ? "live" : ""}" data-r="${r}">${r}</button>`).join("")}</div>
    <div class="sec"><h2>Agents</h2><span><span data-run>${running()}</span> running</span></div>${cardsRow()}
    <div class="sec"><h2>Activity</h2><a href="#/activity">See all</a></div>
    <div class="rows">${allActivity().slice(0, 8).map(rowAny).join("") || '<div class="emp">Noch keine Aktivität.</div>'}</div>${foot()}</div>`;
  countUp($("#bigv"), v);
  document.querySelectorAll(".ranges button").forEach(b => b.onclick = () => { RANGE = localStorage.range = b.dataset.r; render(); });
  wireCards();
}
const AGTEXT = {
  scanner: "Lauscht auf PumpPortal-Graduations, prüft Liquidität, Top-10, 1h-Pump und Copycats.",
  auditor: "8 Sicherheitsprüfungen: Mint, Freeze, Dev, Top-10, LP, Alter, Bundles, Delegationen.",
  analyst: "Jev bewertet alive / organic / flush / chase, Gate im Code, Score 0–100.",
  executor: "Größe 8 % vom Stack (max 2 % Pool), Recheck, Telegram-Push mit FOMO-Button. PAPER füllt sofort.",
  risk: "Alle 15 s Preis: Stop, Trailing ab +20 %, Timeout 3 h. Stops wandern nie nach unten.",
};
function feedHtml(items) {
  const deskLine = S.closed && S.closed.length ? [] : [];
  return `<div class="feed">${items.map(f => `<a class="fr" href="${f.mint ? coinHref(f) : "#/agents"}">${icon(f.agent)}<div style="min-width:0"><b>${f.agent[0].toUpperCase() + f.agent.slice(1)}</b><p>${esc(f.text)}</p></div><time>${tm(f.ts)}</time></a>`).join("") || '<div class="emp">Noch keine Meldungen.</div>'}</div>`;
}
function agents(which) {
  const nightLine = {ts: S.updated, agent: "desk", text: `Night läuft seit ${tm(S.night_start)}. ${usd(S.start_stack)} → ${usd(S.value)}. ${S.cards.scanner.kills} aussortiert, ${S.cards.auditor.rejected} refused.`};
  const items = [nightLine, ...(S.feed || []).filter(f => !which || f.agent === which)];
  const detail = which ? agentDetail(which) : "";
  V.innerHTML = `<div class="page">${which ? `<a class="back" href="#/agents">‹ Agents</a>` : ""}<div class="sec" style="padding-top:6px"><h2>${which ? which[0].toUpperCase() + which.slice(1) : "Agents"}</h2><span><span data-run>${running()}</span> running</span></div>
    ${which ? `<div class="cards" style="overflow:visible">${card(which).replace('class="ac"', 'class="ac" style="flex:1 1 auto;height:auto;min-height:168px"')}</div>` : cardsRow()}
    ${detail}${which ? "" : NAMES.map(n => `<a class="panel" style="display:flex;gap:12px;align-items:center" href="#/agents/${n}">${icon(n, 38)}<div style="flex:1;min-width:0"><b>${n[0].toUpperCase() + n.slice(1)}</b><div style="font-size:12.5px;color:#999">${AGTEXT[n]}</div></div>${statusLine(n, "läuft")}</a>`).join("")}
    <div class="sec"><h2>Feed</h2><span>${which ? "" : "alle Agenten"}</span></div>${feedHtml(items.map(x => ({...x, agent: AG[x.agent] ? x.agent : "desk"})))}${foot()}</div>`;
  wireCards();
}
function agentDetail(n) {
  const k = S.cards[n], st = agentState(n);
  const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
  let rows = kv("Status", st.paused ? "pausiert" : st.ok ? "läuft" : "offline") + kv("Letzter Heartbeat", st.last ? `<span data-ago="${st.last}">vor ${ago(st.last)}</span>` : "–");
  if (n === "scanner") rows += kv("Pools gesamt", k.pools) + kv("Heute Nacht", k.tonight) + kv("Im Warteraum", k.waiting) + kv("Aussortiert", k.kills) + kv("Bestanden", k.passed);
  if (n === "auditor") rows += kv("Geprüft", k.taken_apart) + kv("Abgelehnt", k.rejected);
  if (n === "analyst") rows += kv("Modus", k.mode) + kv("Bewertet", k.scored) + kv("Bestanden", k.passed) + kv("Jev-Tokens", (k.tokens || 0).toLocaleString("de-DE"));
  if (n === "executor") rows += kv("Signale heute", k.signals_tonight) + kv("Ticket", `${k.stack_pct}% · min ${usd(k.min_ticket)}`) + kv("Frei", usd(S.free));
  if (n === "risk") rows += kv("Offen", k.open) + kv("Stop", `-${k.stop_pct}%`) + kv("Trailing", `${k.trail_pct}% ab +${k.trail_start_pct}%`) + kv("Timeout", `${k.timeout_h} h`);
  let extra = "";
  if (n === "scanner") extra = `<div class="sec"><h2>Warteraum</h2><span>${(S.waiting || []).length}</span></div><div class="rows">${(S.waiting || []).map(w => `<a class="row" href="${coinHref(w)}">${av(w, 36)}<span class="rt"><b>${esc(w.name)}</b><small>seit Migration ${w.age_min} min</small></span></a>`).join("") || '<div class="emp">leer</div>'}</div>`;
  if (n === "risk") extra = `<div class="sec"><h2>Offene Positionen</h2></div><div class="rows">${(S.open || []).map(p => `<a class="row" href="${coinHref(p)}">${av(p, 36)}<span class="rt"><b>${esc(p.name)}</b><small>Stop -${p.stop_pct}% · Trail ${S.cards.risk.trail_pct}%${p.trail ? " aktiv" : ""}</small></span><span class="rr"><b class="${p.upnl_pct >= 0 ? "pos" : "neg"}">${pct(p.upnl_pct)}</b><small>${usd(p.size_usd)}</small></span></a>`).join("") || '<div class="emp">Keine offenen Positionen.</div>'}</div>`;
  return `<div class="panel" style="margin-top:12px"><div style="font-size:13px;color:#aaa;margin-bottom:6px">${AGTEXT[n]}</div>${rows}</div>${extra}`;
}
function activity() {
  const all = allActivity();
  const f = {all: () => true, buy: x => x.kind === "buy", sell: x => x.kind === "sell", skip: x => ["skip", "reject"].includes(x.kind)}[FILTER];
  const list = all.filter(f);
  V.innerHTML = `<div class="page"><div class="sec" style="padding-top:6px"><h2>Activity</h2><span>${list.length}</span></div>
    <div class="chips">${[["all", "Alle"], ["buy", "Käufe"], ["sell", "Verkäufe"], ["skip", "Übersprungen"]].map(([k, l]) => `<button class="${k === FILTER ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
    <div class="rows">${list.map(rowAny).join("") || '<div class="emp">Nichts in dieser Kategorie – noch keine Trades.</div>'}</div>${foot()}</div>`;
  document.querySelectorAll(".chips button").forEach(b => b.onclick = () => { FILTER = b.dataset.f; activity(); });
}
const SET_DE = {scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk", desk: "Desk"};
function account() {
  const groups = {};
  Object.entries(S.settings || {}).forEach(([k, v]) => { const [g, n] = k.split("."); (groups[g] = groups[g] || []).push([n, v]); });
  V.innerHTML = `<div class="page"><div class="sec" style="padding-top:6px"><h2>Account</h2><span class="mbadge">${esc(S.mode)}</span></div>
    <div class="panel"><div class="kv"><span>Modus</span><b>${esc(S.mode)} · nur Signale, keine Orders</b></div>
    <div class="kv"><span>FOMO</span><b><a class="pos" href="${esc(S.profile_url)}" target="_blank" rel="noopener">@${esc(S.fomo_handle)} ↗</a></b></div>
    <div class="kv"><span>Stack</span><b>${usd(S.stack)}</b></div><div class="kv"><span>Frei</span><b>${usd(S.free)}</b></div>
    <div class="kv"><span>PnL Nacht / gesamt</span><b>${usd(S.pnl_night, true)} / ${usd(S.pnl_total, true)}</b></div>
    <div class="kv"><span>Trades</span><b>${(S.closed || []).length}</b></div><div class="kv"><span>Stand</span><b>${tm(S.updated)} (vor ${ago(S.updated)})</b></div></div>
    <a class="cta" href="${esc(S.profile_url)}" target="_blank" rel="noopener">Mein FOMO-Profil öffnen</a>
    <div style="padding:0 22px 6px;color:#999;font-size:13px">Einstellungen (nur lesen – ändern per Telegram: „set stop to 8“)</div>
    ${Object.entries(groups).map(([g, l]) => `<div class="panel"><b>${SET_DE[g] || g}</b>${l.map(([n, v]) => `<div class="kv"><span>${esc(n)}</span><b>${esc(v)}</b></div>`).join("")}</div>`).join("")}
    <div class="panel" style="font-size:13px;color:#aaa">Web-Push ist nicht aktiv (braucht einen Server). Alarme kommen per Telegram.</div>${foot()}</div>`;
}
function coin(mint) {
  const c = (S.coins || {})[mint];
  if (!c) { V.innerHTML = `<div class="page"><a class="back" href="#/">‹ Zurück</a><div class="emp">Coin nicht im aktuellen Stand.</div>${foot()}</div>`; return; }
  const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
  const pr = c.prices || [], lastP = pr.length ? pr[pr.length - 1][1] : null, firstP = pr.length ? pr[0][1] : null;
  const L = c.audit ? c.audit.layers : [];
  const NAMES8 = ["Mint authority", "Freeze authority", "Dev balance", "Top 10 holders", "LP locked", "Pool age", "Bundled wallets", "Delegations"];
  const layers = NAMES8.map((nm, i) => { const l = L[i]; const s = !l ? "n" : l.pass ? "g" : l.pass === false ? "r" : "n";
    return `<div class="layer"><span class="st ${s}">${s === "g" ? "✓" : s === "r" ? "✕" : i + 1}</span>${nm}<em>${esc(l ? l.text : "nicht geprüft")}</em></div>`; }).join("");
  const v = c.verdict;
  const pos = (c.positions || []).map(p => `<div class="panel"><b>Position ${p.closed ? "geschlossen" : "offen"}</b>${kv("Einstieg", `${tm(p.opened)} · $${p.entry}`)}${kv("Größe", usd(p.size_usd))}${kv("Stop", `-${p.stop_pct}%`)}
    ${p.closed ? kv("Ausstieg", `${tm(p.closed)} · $${p.exit} · ${esc(p.reason)}`) + kv("PnL", `<span class="${p.pnl >= 0 ? "pos" : "neg"}">${usd(p.pnl, true)} (${pct(p.pnl_pct)})</span>`) + kv("Gebühren", usd(p.fees))
      : kv("Aktuell", `<span class="${p.upnl_pct >= 0 ? "pos" : "neg"}">${pct(p.upnl_pct)} · ${usd(p.upnl, true)}</span>`)}</div>`).join("");
  V.innerHTML = `<div class="page"><a class="back" href="javascript:history.back()">‹ Zurück</a>
    <div class="ch" style="display:flex;gap:14px;align-items:center">${av(c, 56)}<div style="min-width:0"><h1>${esc(c.name)}</h1><div class="sub">${esc(c.symbol || "")} · ${esc(c.mint)}</div></div></div>
    <div class="hero" style="margin-top:14px"><div class="big" style="font-size:40px">${lastP ? "$" + Number(lastP).toPrecision(4) : "–"}</div>
    ${firstP && lastP ? `<div class="chg ${lastP < firstP ? "neg" : ""}">${lastP < firstP ? "▼" : "▲"} ${Math.abs((lastP / firstP - 1) * 100).toFixed(1)}% seit erstem Preis</div>` : `<div class="chg" style="color:#888">noch keine Preisdaten</div>`}</div>
    ${chartHtml(pr, (S.markers || []).filter(m => m.mint === mint).map(m => ({...m})).map(m => ({...m, ts: m.ts})), {h: 200, colorByTrend: true, minSpan: lastP ? lastP * 0.01 : 1e-9})}
    <a class="cta" href="${esc(c.url)}" target="_blank" rel="noopener">Auf FOMO öffnen</a>
    <div class="panel"><b>Scanner</b>${c.scan ? kv("Ergebnis", esc(c.scan.verdict)) + kv("Grund", esc(c.scan.reason)) + kv("Liquidität", c.scan.liq ? usd(c.scan.liq) : "–") + kv("Top 10", c.scan.top10 != null ? c.scan.top10.toFixed(0) + "%" : "–") + kv("1h", c.scan.h1 != null ? pct(c.scan.h1) : "–") : '<div class="kv"><span>noch im Warteraum</span></div>'}
      ${kv("Migriert", c.migrated ? tm(c.migrated) : "–")}${c.holders ? kv("Holder", c.holders) : ""}</div>
    <div class="panel"><b>Auditor · 8 Layer</b>${layers}</div>
    <div class="panel"><b>Analyst</b>${v ? `<div style="display:flex;gap:14px;align-items:center;margin:8px 0">${ringSvg(v.score)}<div>${v.pass ? '<b class="pos">bestanden</b>' : `<b class="neg">abgelehnt</b><div style="font-size:13px;color:#aaa">${esc(v.reason)}</div>`}<div style="font-size:12px;color:#888">Modell ${esc(v.model)}</div></div></div>
      ${kv("alive_6h", v.alive_6h ?? "–")}${kv("organic", v.organic ?? "–")}${kv("flush", v.flush ?? "–")}${kv("chase", v.chase ?? "–")}` : '<div class="kv"><span>nicht bewertet</span></div>'}</div>
    ${pos}<div class="panel" style="padding:0;overflow:hidden"><details><summary style="padding:14px;cursor:pointer">DexScreener-Chart laden</summary>
      <iframe loading="lazy" style="width:100%;height:420px;border:0" data-src="https://dexscreener.com/solana/${encodeURIComponent(mint)}?embed=1&theme=dark&info=0&trades=0"></iframe></details></div>${foot()}</div>`;
  const det = V.querySelector("details"); det.addEventListener("toggle", () => { const f = det.querySelector("iframe"); if (det.open && !f.src) f.src = f.dataset.src; });
  requestAnimationFrame(() => document.querySelectorAll(".ring .fg").forEach(x => x.style.strokeDashoffset = x.dataset.off));
}
const foot = () => `<div class="foot">Nur PAPER-Signale · diese App platziert nie Orders<br>New to FOMO? <a href="${esc(S.signup_url)}" target="_blank" rel="noopener">${esc(S.signup_url)}</a></div>`;

// ---------- notifications / search / confetti ----------
function notifs() {
  const seen = +localStorage.seenTs || 0;
  $("#notif").innerHTML = `<div class="rows">${allActivity().slice(0, 40).map(rowAny).join("") || '<div class="emp">Keine Benachrichtigungen.</div>'}</div>`;
  $("#sheet").hidden = false; localStorage.seenTs = S.updated; $("#bellDot").classList.remove("on");
}
$("#btnBell").onclick = notifs;
$("#sheet").onclick = e => { if (e.target.id === "sheet" || e.target.closest("a")) $("#sheet").hidden = true; };
$("#btnSearch").onclick = () => { const b = $("#searchBar"); b.hidden = !b.hidden; if (!b.hidden) $("#searchIn").focus(); };
$("#searchIn").oninput = e => {
  const q = e.target.value.trim().toLowerCase();
  const hits = q ? Object.values(S.coins || {}).filter(c => [c.name, c.symbol, c.mint].some(x => (x || "").toLowerCase().includes(q))).slice(0, 8) : [];
  $("#searchRes").innerHTML = hits.map(c => `<a class="row" href="${coinHref(c)}" onclick="document.getElementById('searchBar').hidden=true">${av(c, 32)}<span class="rt"><b>${esc(c.name)}</b><small>${esc(c.symbol || "")}</small></span></a>`).join("");
};
function confetti() {
  const cv = $("#confetti"), x = cv.getContext("2d"), W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const cols = ["#22c55e", "#facc15", "#ef4444", "#3b82f6", "#a855f7", "#fff", "#f97316"];
  const P = Array.from({length: 160}, () => ({x: W / 2, y: H * .3, vx: (Math.random() - .5) * 26, vy: -Math.random() * 22 - 6, s: 6 + Math.random() * 8, c: cols[Math.random() * 7 | 0], r: Math.random() * 6}));
  let n = 0; const step = () => { x.clearRect(0, 0, W, H); P.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .6; p.vx *= .99; p.r += .2; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++n < 150) requestAnimationFrame(step); else x.clearRect(0, 0, W, H); }; step();
}
function checkBigWin() {
  const known = JSON.parse(localStorage.wins || "[]"), big = (S.closed || []).filter(p => (p.pnl_pct || 0) >= 50);
  const fresh = big.filter(p => !known.includes(p.id));
  if (fresh.length && localStorage.wins) confetti();
  localStorage.wins = JSON.stringify(big.map(p => p.id));
}

// ---------- router / load ----------
function render() {
  if (!S) return;
  const h = location.hash.replace(/^#\/?/, ""), [r, a, b] = h.split("/");
  document.querySelectorAll("#tabs a").forEach(t => t.classList.toggle("on", t.dataset.t === (r === "coin" ? "" : r || "home")));
  if (r === "agents") agents(a && NAMES.includes(a) ? a : null);
  else if (r === "activity") activity();
  else if (r === "account") account();
  else if (r === "auditor") auditorPage(a ? decodeURIComponent(a) : null, b);
  else if (r === "coin") coin(decodeURIComponent(a || ""));
  else home();
}
let lastUpdated = 0;
async function load() {
  try {
    const r = await fetch(`state.json?t=${Date.now()}`, {cache: "no-store"});
    if (!r.ok) throw new Error(r.status);
    const s = await r.json();
    if (s.updated === lastUpdated) return;
    const first = !S; S = s; lastUpdated = s.updated;
    if ((S.activity || []).some(a => a.ts > (+localStorage.seenTs || 0))) $("#bellDot").classList.add("on");
    checkBigWin();
    if (first || !/^#\/(coin|auditor)/.test(location.hash)) { const y = scrollY; render(); scrollTo(0, y); }
  } catch (e) { if (!S) V.innerHTML = `<div class="emp" style="padding-top:40px">Keine Verbindung zum Desk-Stand. Wird erneut versucht…</div>`; }
}
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
setInterval(() => { document.querySelectorAll("[data-ago]").forEach(e => e.textContent = "vor " + ago(+e.dataset.ago)); }, 1000);
load(); setInterval(load, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
