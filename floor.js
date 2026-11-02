// Desk Floor: pixel trading floor. Replays REAL pipeline events from state.json (S.floor.events); idle if none.
"use strict";
const FL_DESK = {scanner: [70, 70], auditor: [290, 70], analyst: [180, 150], executor: [70, 230], risk: [290, 230]};
const FL_NEXT = {scan: "auditor", audit: "analyst", verdict: "executor", signal: "executor", fill: "risk", exit: null};
const FL_DE = {scan: "gescannt", audit: "geprüft", verdict: "bewertet", signal: "Signal", fill: "Paper-Fill", exit: "Exit"};
// 8x8 pixel sprites: 1=body, 2=eye, 3=accent
const FL_SPR = {
  scanner: ["..3333..", ".111111.", "11211211", "11111111", "11333311", ".111111.", ".1....1.", "11....11"],
  auditor: ["..1111..", ".111111.", "11211211", "11111111", "11111111", "11111111", "1.1.1.1.", "........"],
  analyst: ["3......3", ".311113.", "11211211", "11111111", ".133331.", ".111111.", "..1..1..", ".11..11."],
  executor: ["...33...", "..1111..", ".121121.", "11111111", "13111131", ".111111.", ".11..11.", ".1....1."],
  risk: ["11111111", "13111131", "11211211", "11111111", ".111111.", ".113311.", "..1111..", "...11..."],
};
let FL = null;
function flState() { return (S && S.floor) || {events: []}; }
function flCoinLbl(e) { return e.symbol || e.name || (e.mint || "").slice(0, 5); }
function flText(e) {
  const c = flCoinLbl(e), w = e.why ? ` – ${e.why}` : "";
  if (e.stage === "scan") return e.ok ? `Scanner: ${c} bestanden → Auditor` : `Scanner: ${c} aussortiert${w}`;
  if (e.stage === "audit") return e.ok ? `Auditor: ${c} 8/8 sauber → Analyst` : `Auditor: ${c} abgelehnt${w}`;
  if (e.stage === "verdict") return `Analyst: ${c} Score ${e.score ?? "–"} ${e.ok ? "→ Executor" : "abgelehnt"}${w}`;
  if (e.stage === "signal") return `Executor: Signal ${c} ${usd(e.size_usd)} (${e.why || ""})`;
  if (e.stage === "fill") return `Executor: Paper-Fill ${c} ${usd(e.size_usd)} → Risk überwacht`;
  if (e.stage === "exit") return `Risk: ${c} verkauft (${e.why || ""}) ${usd(e.pnl, true)}`;
  return c;
}
function flAlive(a) { try { return agentState(a); } catch (_) { return {ok: false}; } }

function floorPage() {
  flStop();
  V.innerHTML = `<div class="page fl"><div class="flhd"><a href="#/" class="flb">‹</a><div><b>Desk Floor</b><small id="flSub">PAPER · echte Desk-Events</small></div></div>
  <div class="flcv"><canvas id="flCv"></canvas><div id="flNow" class="flnow"></div></div>
  <div class="flp"><div class="flt">Chart · <span id="flFocus">–</span></div><div id="flChart" class="flch"></div></div>
  <div class="flp"><div class="flt">Desk-Bank (USD)</div><div id="flBank" class="flch"></div></div>
  <div class="flp"><div class="flt">Desk-Roster</div><div id="flRoster"></div></div>
  <div class="fltick"><div id="flTick"></div></div></div>`;
  const cv = $("#flCv"), dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = 360 * dpr; cv.height = 300 * dpr;
  FL = {cv, x: cv.getContext("2d"), dpr, q: [], cur: null, t0: 0, played: 0, seenUpd: 0, raf: 0, pops: [], loopIdx: 0};
  flData(); FL.raf = requestAnimationFrame(flFrame);
}
function flStop() { if (FL) cancelAnimationFrame(FL.raf); FL = null; }
function flData() {
  if (!FL || !S || S.updated === FL.seenUpd) return;
  FL.seenUpd = S.updated;
  const ev = flState().events || [];
  const fresh = ev.filter(e => e.ts > FL.played);
  if (FL.played && fresh.length) FL.q.push(...fresh.slice(-10));
  FL.played = ev.length ? ev[ev.length - 1].ts : 0;
  flPanels();
}
function flNext() {
  const ev = flState().events || [];
  if (FL.q.length) return FL.q.shift();
  if (!ev.length) return null;
  const tail = ev.slice(-12); const e = tail[FL.loopIdx % tail.length]; FL.loopIdx++; return {...e, replay: true};
}
const FL_DUR = 2600;
function flFrame(now) {
  if (!FL || !document.body.contains(FL.cv)) { flStop(); return; }
  if (!location.hash.startsWith("#/floor")) { flStop(); return; }
  if (!FL.cur || now - FL.t0 > FL_DUR) {
    FL.cur = flNext(); FL.t0 = now;
    if (FL.cur) { const n = $("#flNow"); n.textContent = (FL.cur.replay ? "↻ " : "● ") + new Date(FL.cur.ts * 1000).toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"}) + " · " + flText(FL.cur); n.className = "flnow " + (FL.cur.ok ? "ok" : "no"); }
    else $("#flNow").textContent = "Idle – noch keine Desk-Events";
  }
  flDraw(now); FL.raf = requestAnimationFrame(flFrame);
}
function flSprite(x, ctx, name, cx, cy, s, col, dim) {
  const m = FL_SPR[name];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = m[r][c]; if (v === ".") continue;
    x.fillStyle = v === "2" ? (dim ? "#333" : "#111") : v === "3" ? "#fff" : col;
    x.globalAlpha = dim ? .35 : 1; x.fillRect(Math.round(cx - 4 * s + c * s), Math.round(cy - 8 * s + r * s), s, s);
  }
  x.globalAlpha = 1;
}
function flCoin(x, cx, cy, e, a) {
  x.globalAlpha = a; x.fillStyle = "#facc15"; x.beginPath(); x.arc(cx, cy, 7, 0, 7); x.fill();
  x.fillStyle = "#000"; x.font = "bold 7px monospace"; x.textAlign = "center"; x.fillText((flCoinLbl(e) || "?").slice(0, 3).toUpperCase(), cx, cy + 2.5); x.globalAlpha = 1;
}
function flBubble(x, cx, cy, txt, ok, a) {
  x.font = "9px -apple-system,sans-serif"; const t = txt.length > 34 ? txt.slice(0, 33) + "…" : txt, w = x.measureText(t).width + 10;
  const bx = Math.max(2, Math.min(358 - w, cx - w / 2));
  x.globalAlpha = a; x.fillStyle = ok ? "#06301a" : "#33090b"; x.strokeStyle = ok ? "#22c55e" : "#ef4444";
  x.fillRect(bx, cy - 13, w, 15); x.strokeRect(bx + .5, cy - 12.5, w - 1, 14);
  x.fillStyle = ok ? "#4ade80" : "#f87171"; x.textAlign = "left"; x.fillText(t, bx + 5, cy - 2.5); x.globalAlpha = 1;
}
function flDraw(now) {
  const {x, dpr} = FL; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.imageSmoothingEnabled = false;
  x.fillStyle = "#07090d"; x.fillRect(0, 0, 360, 300);
  // floor grid (iso diamonds)
  x.strokeStyle = "#111823"; x.lineWidth = 1;
  for (let i = -300; i < 700; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - 300, 300 * .6 + 120); x.stroke(); x.beginPath(); x.moveTo(i - 300, 0); x.lineTo(i, 300 * .6 + 120); x.stroke(); }
  // pipeline path
  x.strokeStyle = "#1f2a3a"; x.setLineDash([3, 4]); x.beginPath();
  ["scanner", "auditor", "analyst", "executor", "risk"].forEach((a, i) => { const [px, py] = FL_DESK[a]; i ? x.lineTo(px, py + 10) : x.moveTo(px, py + 10); }); x.stroke(); x.setLineDash([]);
  const cur = FL.cur, p = cur ? Math.min(1, (now - FL.t0) / FL_DUR) : 0;
  let mover = null;
  if (cur) {
    const from = cur.stage === "scan" ? null : cur.agent, to = cur.ok ? FL_NEXT[cur.stage] : null;
    mover = {agent: cur.agent, from: FL_DESK[cur.agent], to: to && to !== cur.agent ? FL_DESK[to] : null};
  }
  for (const a of Object.keys(FL_DESK)) {
    const [dx, dy] = FL_DESK[a], st = flAlive(a), col = AG[a].c === "#fff" ? "#e5e5e5" : AG[a].c;
    // desk (iso box)
    x.fillStyle = "#1a2230"; x.beginPath(); x.moveTo(dx - 30, dy + 8); x.lineTo(dx, dy - 4); x.lineTo(dx + 30, dy + 8); x.lineTo(dx, dy + 20); x.fill();
    x.fillStyle = "#121822"; x.beginPath(); x.moveTo(dx - 30, dy + 8); x.lineTo(dx, dy + 20); x.lineTo(dx, dy + 28); x.lineTo(dx - 30, dy + 16); x.fill();
    x.fillStyle = "#0d121a"; x.beginPath(); x.moveTo(dx + 30, dy + 8); x.lineTo(dx, dy + 20); x.lineTo(dx, dy + 28); x.lineTo(dx + 30, dy + 16); x.fill();
    // monitor
    x.fillStyle = "#0b0f15"; x.fillRect(dx - 12, dy - 20, 24, 15); x.fillStyle = st.ok ? col : "#333"; x.globalAlpha = st.ok ? .25 + .15 * Math.sin(now / 400 + dx) : .3; x.fillRect(dx - 10, dy - 18, 20, 11); x.globalAlpha = 1;
    x.fillStyle = "#8e8e93"; x.font = "8px monospace"; x.textAlign = "center"; x.fillText(a.toUpperCase(), dx, dy + 40);
    // character
    let cx = dx + 18, cy = dy + 6, carry = false;
    const moving = mover && mover.agent === a && mover.to && p > .25 && p < .85;
    if (moving) { const k = (p - .25) / .6; cx = dx + 18 + (mover.to[0] - dx - 26) * k; cy = dy + 6 + (mover.to[1] - dy) * k - Math.abs(Math.sin(k * Math.PI * 5)) * 7; carry = true; }
    else if (mover && mover.agent === a && mover.to && p >= .85) { cx = mover.to[0] - 8; cy = mover.to[1] + 6; }
    else if (st.ok) cy -= Math.abs(Math.sin(now / 520 + dx)) * 2;
    flSprite(x, null, a, cx, cy, 2.5, col, !st.ok);
    if (!st.ok) { x.fillStyle = "#64748b"; x.font = "9px monospace"; x.fillText("z", cx + 10, cy - 18 - (now / 300 % 6)); x.fillText("Z", cx + 15, cy - 26 - (now / 300 % 6)); }
    if (carry) flCoin(x, cx, cy - 26, cur, 1);
  }
  if (cur) {
    const [dx, dy] = FL_DESK[cur.agent];
    if (p < .25) { const k = p / .25; flCoin(x, dx, dy - 30 - (cur.stage === "scan" ? (1 - k) * 40 : 0), cur, Math.min(1, k * 2)); }
    if (!cur.ok || !mover.to) {
      const k = Math.max(0, (p - .3) / .7);
      if (!cur.ok) { x.globalAlpha = Math.max(0, 1 - k); x.fillStyle = "#ef4444"; for (let i = 0; i < 8; i++) { const an = i * .785; x.fillRect(dx + Math.cos(an) * k * 26, dy - 30 + Math.sin(an) * k * 26, 3, 3); } x.globalAlpha = 1; }
      else flCoin(x, dx, dy - 30, cur, 1 - k * .3);
      flBubble(x, dx, dy - 42, (cur.ok ? "✓ " : "✗ ") + (cur.why || FL_DE[cur.stage]), cur.ok, Math.min(1, p * 4));
    } else if (p >= .85) flBubble(x, mover.to[0], mover.to[1] - 42, "✓ " + FL_DE[cur.stage] + " → " + FL_NEXT[cur.stage], true, 1);
  }
}
function flSpark(el, pts, col, fmt) {
  if (!pts || pts.length < 2) { el.innerHTML = `<div class="emp" style="padding:16px 0">Keine Daten</div>`; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = t => (t - x0) / ((x1 - x0) || 1) * 340 + 10, Y = v => 70 - (v - y0) / ((y1 - y0) || 1) * 60;
  const d = pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
  el.innerHTML = `<svg viewBox="0 0 360 80" preserveAspectRatio="none"><path d="${d}" stroke="${col}" stroke-width="1.6" fill="none"/></svg>
  <div class="flax"><span>${fmt(y0)}</span><span>${fmt(ys[ys.length - 1])}</span><span>${fmt(y1)}</span></div>`;
}
function flPanels() {
  const f = flState(), ev = f.events || [];
  $("#flFocus").textContent = f.focus_name || "–";
  flSpark($("#flChart"), f.focus_prices, "#22c55e", v => v < 0.01 ? v.toExponential(2) : v.toFixed(4));
  flSpark($("#flBank"), (S.equity || []).slice(-240), "#3b82f6", v => usd(v));
  $("#flRoster").innerHTML = ["scanner", "auditor", "analyst", "executor", "risk"].map(a => {
    const st = flAlive(a), last = [...ev].reverse().find(e => e.agent === a);
    return `<div class="flr"><span style="color:${AG[a].c}">■</span><b>${a.toUpperCase()}</b><i class="${st.ok ? "on" : st.paused ? "pa" : "off"}">${st.ok ? "aktiv" : st.paused ? "pausiert" : "schläft"}</i><span class="flc">${last ? esc(flText(last)) : "–"}</span></div>`;
  }).join("");
  const items = ev.slice(-15).reverse().map(e => `<span>${new Date(e.ts * 1000).toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"})} ${esc(flText(e))}</span>`).join("");
  $("#flTick").innerHTML = items ? items + items : "<span>Keine Events – Desk idle</span>";
  $("#flSub").textContent = `${S.mode === "paper" ? "PAPER" : String(S.mode || "").toUpperCase()} · Stand ${new Date(S.updated * 1000).toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"})} · ${ev.length} Events`;
}
