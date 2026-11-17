const $ = (id) => document.getElementById(id);
let data = null;
let stats = [];
let sortCol = 1;

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").className = isError ? "error" : "";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://app.musicleague.com/")) {
    throw new Error("Bitte zuerst eine League auf app.musicleague.com öffnen.");
  }
  return tab;
}

async function runInPage(tab, fnName) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["scraper.js"] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (name) => window[name](),
    args: [fnName],
  });
  return res.result;
}

function people(d) {
  const set = new Set();
  for (const r of d.rounds) {
    for (const s of r.submissions) {
      set.add(s.submitter);
      s.votes.forEach((v) => set.add(v.voter));
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function computeStats(d, me) {
  const map = new Map();
  const get = (p) => {
    if (!map.has(p)) map.set(p, { person: p, toMe: 0, toMeCount: 0, fromMe: 0, fromMeCount: 0 });
    return map.get(p);
  };
  for (const r of d.rounds) {
    for (const s of r.submissions) {
      for (const v of s.votes) {
        if (s.submitter === me && v.voter !== me) {
          const e = get(v.voter);
          e.toMe += v.points;
          e.toMeCount++;
        } else if (v.voter === me && s.submitter !== me) {
          const e = get(s.submitter);
          e.fromMe += v.points;
          e.fromMeCount++;
        }
      }
    }
  }
  for (const p of people(d)) if (p !== me) get(p);
  return [...map.values()];
}

function render() {
  const me = $("me").value;
  stats = computeStats(data, me);
  const keys = ["person", "toMe", "toMeCount", "fromMe", "fromMeCount"];
  const key = keys[sortCol];
  stats.sort((a, b) => (key === "person" ? a.person.localeCompare(b.person) : b[key] - a[key]));

  const tbody = $("rows");
  tbody.replaceChildren();
  for (const s of stats) {
    const tr = document.createElement("tr");
    for (const k of keys) {
      const td = document.createElement("td");
      td.textContent = s[k];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function showData(d, savedMe) {
  data = d;
  const subs = d.rounds.reduce((n, r) => n + r.submissions.length, 0);
  $("meta").textContent =
    `${d.leagueName}: ${d.rounds.length}/${d.roundsChecked} Runden mit Ergebnissen, ${subs} Songs ` +
    `(Stand ${new Date(d.scrapedAt).toLocaleString()})`;

  const select = $("me");
  select.replaceChildren();
  for (const p of people(d)) select.appendChild(new Option(p, p));
  if (savedMe && people(d).includes(savedMe)) select.value = savedMe;

  $("result").hidden = false;
  render();
}

$("scrape").addEventListener("click", async () => {
  $("scrape").disabled = true;
  setStatus("Lade Runden ...");
  try {
    const tab = await activeTab();
    const d = await runInPage(tab, "__mlScrape");
    if (!d.rounds.length) {
      throw new Error("Keine Ergebnisse gefunden. Bitte Debug-HTML einer Ergebnisseite speichern und Parser anpassen.");
    }
    await chrome.storage.local.set({ [d.base]: d, lastBase: d.base });
    const { me } = await chrome.storage.local.get("me");
    showData(d, me);
    setStatus("Fertig.");
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $("scrape").disabled = false;
  }
});

$("debug").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    const html = await runInPage(tab, "__mlDebugHtml");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = "musicleague-page.html";
    a.click();
  } catch (e) {
    setStatus(e.message, true);
  }
});

$("me").addEventListener("change", () => {
  chrome.storage.local.set({ me: $("me").value });
  render();
});

document.querySelectorAll("th").forEach((th, i) =>
  th.addEventListener("click", () => {
    sortCol = i;
    if (data) render();
  })
);

function downloadCsv(lines, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = lines.map((l) => l.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

$("csv").addEventListener("click", () => {
  const lines = [["Person", "Punkte an mich", "Stimmen an mich", "Punkte von mir", "Stimmen von mir"]];
  for (const s of stats) lines.push([s.person, s.toMe, s.toMeCount, s.fromMe, s.fromMeCount]);
  downloadCsv(lines, `mlstats-${$("me").value}.csv`);
});

$("csv-detail").addEventListener("click", () => {
  const me = $("me").value;
  const bySubmitter = new Map();
  for (const r of data.rounds) {
    for (const s of r.submissions) {
      if (!bySubmitter.has(s.submitter)) bySubmitter.set(s.submitter, []);
      bySubmitter.get(s.submitter).push({ round: `${r.label} ${r.title}`.trim(), ...s });
    }
  }
  const order = [me, ...people(data).filter((p) => p !== me)].filter((p) => bySubmitter.has(p));

  const lines = [["Einreicher", "Runde", "Song", "Artist", "Punkte gesamt", "Stimmen", "Meine Punkte", "Stimme von", "Punkte"]];
  for (const person of order) {
    for (const s of bySubmitter.get(person)) {
      const total = s.votes.reduce((n, v) => n + v.points, 0);
      const mine = s.votes.find((v) => v.voter === me)?.points ?? "";
      lines.push([person, s.round, s.track, s.artist, total, s.votes.length, person === me ? "" : mine]);
      for (const v of [...s.votes].sort((a, b) => b.points - a.points)) {
        lines.push(["", "", "", "", "", "", "", v.voter, v.points]);
      }
    }
    lines.push([]);
  }
  downloadCsv(lines, `mlstats-songs-${me}.csv`);
});

(async () => {
  const { lastBase, me } = await chrome.storage.local.get(["lastBase", "me"]);
  if (!lastBase) return;
  const { [lastBase]: d } = await chrome.storage.local.get(lastBase);
  if (d) showData(d, me);
})();
