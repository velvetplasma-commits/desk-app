// Auditor detail screen: replays the real per-layer results of recently audited coins (state.json), ~0.4 s per layer.
"use strict";
const AUD_LABEL = {mint: "Mint authority", freeze: "Freeze authority", dev: "Dev wallet", top10: "Top 10 holders", lp: "Liquidity", age: "Pool age", bundles: "Bundled wallets", delegations: "Delegations"};
const AUD_ORDER = ["mint", "freeze", "dev", "top10", "lp", "age", "bundles", "delegations"];
const AUD_ICON = {
  mint: '<circle r="20"/><path d="M-8 0h16M0-8v16"/>',
  freeze: '<path d="M-26 0h52M-13-22l26 44M13-22l-26 44"/><path d="M-26 0l8-5M-26 0l8 5M26 0l-8-5M26 0l-8 5"/>',
  dev: '<circle r="22"/><path d="M0 0V-22A22 22 0 0 1 19 11z" fill="currentColor" fill-opacity=".35"/>',
  top10: '<path d="M-22 0A22 22 0 1 1 15 16" stroke-width="5"/>',
  lp: '<rect x="-16" y="-6" width="32" height="22" rx="4"/><path d="M-9-6v-7a9 9 0 0 1 18 0v7"/>',
  age: '<circle r="22"/><path d="M0 0V-14M0 0l11 6"/>',
  bundles: [[-20,-6],[-10,4],[0,-8],[8,6],[18,-4],[-4,12],[14,12],[-16,10],[4,-16]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${2.5+i%3}" fill="currentColor" stroke="none"/>`).join(""),
  delegations: '<rect x="-30" y="-5" width="60" height="10" rx="5"/><circle r="5" fill="currentColor"/>',
};
let AUD = {timer: null, coin: 0, step: 0, pin: null, freeze: null};
const shortAddr = m => m ? m.slice(0, 4) + "…" + m.slice(-4) : "";

function audCoins() {
  const k = (S.cards || {}).auditor || {};
  let list = (k.recent && k.recent.length ? k.recent : (k.last ? [k.last] : [])).filter(c => c.audit && c.audit.layers && c.audit.layers.length);
  if (AUD.pin) { const c = list.find(x => x.mint === AUD.pin) || ((S.coins || {})[AUD.pin] && S.coins[AUD.pin].audit ? S.coins[AUD.pin] : null); list = c ? [c] : list; }
  return list;
}
// normalise a real audit into 8 ordered layers + outcome
function audModel(c) {
  const by = {}; (c.audit.layers || []).forEach(l => by[l.layer] = l);
  const L = AUD_ORDER.map(k => by[k] || {layer: k, pass: null, text: null});
  const fail = L.findIndex(l => l.pass === false);
  const checked = fail >= 0 ? fail + 1 : L.filter(l => l.pass != null).length;
  return {L, fail, checked, cleared: fail < 0 && L.every(l => l.pass === true)};
}

function discSvg(c, m, step, final) {
  const W = 190, top = 26, gap = 47, rx = 76, ry = 21, th = 9;
  let s = `<svg class="aud-stack" viewBox="0 0 ${W} ${top + gap * 7 + ry + th + 6}" width="${W}">
    <defs><clipPath id="audLogo"><ellipse cx="${W / 2}" cy="${top}" rx="${rx}" ry="${ry}"/></clipPath>
    <filter id="audGlow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="5"/></filter></defs>`;
  for (let i = 7; i >= 0; i--) {
    const y = top + i * gap, l = m.L[i];
    const red = final && m.fail >= 0 && i <= m.fail, active = !final && i === step;
    const done = final ? (l.pass != null && (m.fail < 0 || i <= m.fail)) : i < step;
    const col = red ? "#ef4444" : active ? "#60a5fa" : done && l.pass ? "#22c55e" : done && l.pass === false ? "#ef4444" : "#3a3a3a";
    const face = red ? "#2a0b0b" : active ? "#0d1b2e" : "#161616";
    s += `<g class="disc ${active ? "act" : ""}">
      ${active ? `<ellipse cx="${W / 2}" cy="${y + 3}" rx="${rx + 4}" ry="${ry + 4}" fill="#3b82f6" opacity=".55" filter="url(#audGlow)"/>` : ""}
      <path d="M${W / 2 - rx} ${y}v${th}a${rx} ${ry} 0 0 0 ${rx * 2} 0v-${th}" fill="#0b0b0b" stroke="${col}" stroke-opacity=".6"/>
      <ellipse cx="${W / 2}" cy="${y}" rx="${rx}" ry="${ry}" fill="${face}" stroke="${col}" stroke-width="1.4"/>
      ${i === 0 && c.logo ? `<image href="${esc(c.logo)}" x="${W / 2 - rx}" y="${y - rx}" width="${rx * 2}" height="${rx * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#audLogo)" opacity="${red ? .55 : .95}"/>`
        : `<g transform="translate(${W / 2} ${y}) scale(1 .28)" stroke="${red ? "#ef4444" : active ? "#93c5fd" : done && l.pass ? "#4ade80" : "#6b6b6b"}" color="${red ? "#ef4444" : active ? "#93c5fd" : "#6b6b6b"}" fill="none" stroke-width="3">${AUD_ICON[AUD_ORDER[i]]}</g>`}
      <path d="M${W / 2 + rx} ${y}H${W}" stroke="${col}" stroke-dasharray="${done || active || red ? "0" : "2 3"}"/><circle cx="${W / 2 + rx}" cy="${y}" r="2" fill="${col}"/>
    </g>`;
  }
  return s + "</svg>";
}

function audFrame() {
  const coins = audCoins(), el = $("#audBox"); if (!el) return false;
  const k = S.cards.auditor || {};
  if (!coins.length) { el.innerHTML = `<div class="emp">No coin audited yet tonight. The screen fills in as soon as the Auditor takes one apart.</div>`; return false; }
  const c = coins[AUD.coin % coins.length], m = audModel(c);
  const step = AUD.freeze != null ? Math.min(AUD.freeze, m.checked) : AUD.step;
  const final = step >= m.checked;
  const shown = final ? m.checked : step;
  const badge = final ? (m.fail >= 0 ? `<span class="aud-badge r">Rejected</span>` : `<span class="aud-badge g">${m.checked}/8</span>`) : `<span class="aud-badge">${shown}/8</span>`;
  const rows = m.L.map((l, i) => {
    let st = "", val = "—", cls = "";
    if (!final && i === step) { st = "b"; val = "reading…"; cls = "act"; }
    else if ((final && (m.fail < 0 || i <= m.fail) && l.pass != null) || (!final && i < step)) { st = l.pass ? "g" : l.pass === false ? "r" : ""; val = l.text || "—"; if (l.pass == null) { val = "not checked"; } }
    else if (final && m.fail >= 0 && i > m.fail) { val = "skipped"; cls = "skip"; }
    else if (final && l.pass == null) { val = l.text || "not checked"; cls = "skip"; }
    return `<div class="aud-row ${cls}"><div><small>${AUD_LABEL[l.layer]}</small><b class="${st === "b" ? "mono" : ""}">${esc(val)}</b></div><span class="aud-st ${st}">${st === "g" ? "✓" : st === "r" ? "!" : ""}</span></div>`;
  }).join("");
  const f = m.fail >= 0 ? m.L[m.fail] : null, T = esc(tick(c));
  const status = !final
    ? `<div class="aud-card"><span class="aud-sh"><svg viewBox="0 0 24 24"><path d="M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/></svg></span><div style="flex:1"><b>Taking apart ${T}…</b><small>${shown} of 8 parts checked</small><div class="aud-bar"><i style="width:${shown / 8 * 100}%"></i></div></div></div>`
    : f ? `<div class="aud-card r"><span class="aud-sh r">!</span><div style="flex:1"><b>Rejected · ${esc(f.text || AUD_LABEL[f.layer])}</b><small>${esc(AUD_LABEL[f.layer])} failed. Grok Bot won't buy ${T}</small></div></div>`
    : m.cleared ? `<div class="aud-card g"><span class="aud-sh g">✓</span><div style="flex:1"><b>Cleared · 8/8 clean</b><small>${T} sent to Analyst</small></div></div>`
    : `<div class="aud-card"><span class="aud-sh">…</span><div style="flex:1"><b>${m.checked} of 8 parts checked</b><small>remaining layers not checked by the desk yet</small></div></div>`;
  el.innerHTML = `<a class="aud-coin" href="${coinHref(c)}">${av(c, 46)}<div style="flex:1;min-width:0"><b>${T}</b><small class="mono">${esc(shortAddr(c.mint))} · Solana</small></div>${badge}</a>
    <div class="aud-main">${discSvg(c, m, step, final)}<div class="aud-rows">${rows}</div></div>${status}
    ${coins.length > 1 ? `<div class="aud-dots">${coins.map((_, i) => `<i class="${i === AUD.coin % coins.length ? "on" : ""}"></i>`).join("")}</div>` : ""}
    <div class="aud-foot">Replay of the real audit at ${tm(c.audit.ts)} · ${(k.order ? "layer order from desk" : "")}</div>`;
  return final;
}
function audLoop() {
  clearTimeout(AUD.timer);
  if (!location.hash.startsWith("#/auditor")) return;
  const final = audFrame();
  if (AUD.freeze != null) return;
  if (!final) { AUD.step++; AUD.timer = setTimeout(audLoop, 400); }
  else { AUD.timer = setTimeout(() => { AUD.coin++; AUD.step = 0; audLoop(); }, 3200); }
}
function auditorPage(arg, frz) {
  const k = S.cards.auditor || {};
  AUD.pin = arg || null; AUD.freeze = frz != null && frz !== "" ? +frz : null; AUD.step = 0; AUD.coin = 0;
  V.innerHTML = `<div class="page aud"><a class="back" href="#/">‹ Home</a><h1 class="aud-h">Auditor</h1>
    <div class="aud-cnt"><div><small>Taken apart</small><b>${k.taken_apart ?? 0}</b></div><div><small>Rejected</small><b class="neg">${k.rejected ?? 0}</b></div><div><small>Cleared</small><b class="pos">${k.cleared ?? Math.max(0, (k.taken_apart || 0) - (k.rejected || 0))}</b></div></div>
    <div id="audBox"></div>
    <div class="aud-card tg"><div style="flex:1"><b>Take apart before buying</b><small>Never buy a coin it can't take apart first · always on</small></div><span class="tgl on" aria-disabled="true"><i></i></span></div>${foot()}</div>`;
  audLoop();
}
// mini disc stack for the home card, coloured by the latest real audit
function miniStack(l) {
  const m = l && l.audit ? audModel(l) : null;
  return `<div class="mstack">${AUD_ORDER.map((_, i) => { const x = m ? m.L[i] : null; const c = !x || x.pass == null ? "" : x.pass ? "g" : "r"; return `<i class="${c}" style="z-index:${8 - i}"></i>`; }).join("")}</div>`;
}
