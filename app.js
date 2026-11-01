// Static viewer: reads state.json (published by the desk every ~60s). Never places orders.
const $ = id => document.getElementById(id);
const usd = x => x == null ? "–" : (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
const pct = x => x == null ? "" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";
const cls = x => x > 0 ? "pos" : x < 0 ? "neg" : "";
const tm = t => t ? new Date(t * 1000).toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"}) : "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RE = {liq:"Liquidität", "never":"nie qualifiziert"};

function item(c, sub, right, btn = "Auf FOMO öffnen") {
  // c.url is links.coin_url(mint) from the desk, used verbatim (r=savipww kept)
  return `<div class="item"><div class="t"><div class="n">${esc(c.name)}${c.symbol ? ` <span class="muted">${esc(c.symbol)}</span>` : ""}</div>
  <div class="s">${sub}</div></div>${right ? `<div>${right}</div>` : ""}
  <a class="btn" href="${esc(c.url)}" target="_blank" rel="noopener">${btn}</a></div>`;
}
function fill(id, arr, f, empty) { $(id).innerHTML = arr && arr.length ? arr.map(f).join("") : `<div class="empty">${empty}</div>`; }

function render(s) {
  $("mode").textContent = s.mode === "PAPER" ? "PAPIER" : s.mode;
  const age = Math.round(Date.now() / 1000 - s.updated);
  $("updated").textContent = `Stand ${tm(s.updated)} · vor ${age < 60 ? age + " s" : Math.round(age / 60) + " min"}`;
  $("stack").textContent = usd(s.stack); $("free").textContent = usd(s.free);
  $("pnln").innerHTML = `<span class="${cls(s.pnl_night)}">${usd(s.pnl_night)}</span>`;
  $("pnlt").innerHTML = `<span class="${cls(s.pnl_total)}">${usd(s.pnl_total)}</span>`;
  $("agents").innerHTML = s.agents.map(a => `<span class="ag"><span class="dot ${a.ok ? "ok" : ""}"></span>${esc(a.name)}${a.paused ? " (pausiert)" : ""}</span>`).join("");
  fill("open", s.open, p => item(p, `Einstieg ${usd(p.size_usd)} · Stop -${p.stop_pct}%${p.trail ? " · Trail aktiv" : ""} · seit ${tm(p.opened)}`,
       `<span class="${cls(p.upnl_pct)}">${pct(p.upnl_pct)}</span>`, "Auf FOMO verkaufen"), "Keine offenen Positionen.");
  fill("signals", s.signals, x => item(x, `${tm(x.ts)} · ${usd(x.size_usd)} · ${x.stack_pct}% vom Stack · Analyst ${x.score ?? "–"} · ${esc(x.status)}`, "", "Auf FOMO kaufen"), "Noch keine Signale heute Nacht.");
  $("seen").textContent = `· ${s.coins_seen_tonight} Coins heute Nacht gesehen`;
  fill("waiting", s.waiting, w => item(w, `seit Migration ${w.age_min} min`), "Warteraum leer.");
  fill("closed", s.closed, p => item(p, `${esc(p.reason)} · ${tm(p.closed)} · Gebühren ${usd(p.fees)}`,
       `<span class="${cls(p.pnl)}">${usd(p.pnl)}</span>`), "Noch keine geschlossenen Positionen.");
  fill("activity", s.activity, a => item(a, `${tm(a.ts)} · ${esc(a.subtitle)} · ${esc(a.value)}`), "Keine Aktivität.");
  fill("scans", s.scans, k => item(k, `${tm(k.ts)} · ${k.verdict === "kill" ? "aussortiert" : k.verdict === "pass" ? "bestanden" : "verworfen"} · ${esc(k.reason)}`), "Noch nichts gescannt.");
  fill("skips", s.skips, k => item(k, `übersprungen bis ${tm(k.until)}`), "Nichts übersprungen.");
  if (s.signup_url) { $("signup").href = s.signup_url; $("signup").textContent = s.signup_url; }
  if (s.profile_url) $("profile").href = s.profile_url;
}

async function load() {
  try {
    const r = await fetch(`state.json?t=${Date.now()}`, {cache: "no-store"});
    if (!r.ok) throw new Error(r.status);
    render(await r.json());
  } catch (e) { $("updated").textContent = "Keine Verbindung – zeige letzten Stand"; }
}
load(); setInterval(load, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
