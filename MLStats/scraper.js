// Injected into app.musicleague.com. Exposes window.__mlScrape / window.__mlDebugHtml.
// Uses the htmx fragment endpoints: /l/<league>/-/rounds and /l/<league>/<round>/-/results
(() => {
  if (window.__mlScrape) return;

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: "include", headers: { "HX-Request": "true" } });
    if (!res.ok) throw new Error(`${res.status} bei ${url}`);
    return new DOMParser().parseFromString(await res.text(), "text/html");
  }

  function leagueBase() {
    const m = location.pathname.match(/^\/l\/([0-9a-f]{32})/);
    return m ? `/l/${m[1]}/` : null;
  }

  function parseRounds(doc) {
    return [...doc.querySelectorAll(".league-round-item[id]")].map((el) => ({
      id: el.id,
      label: clean(el.querySelector(".card-body .text-body-tertiary")?.textContent),
      title: clean(el.querySelector("h5.card-title")?.textContent),
      complete: /status:\s*'COMPLETE'/.test(el.getAttribute("x-data") || ""),
    }));
  }

  function parseResults(doc) {
    return [...doc.querySelectorAll('.card[id^="spotify:track:"]')].map((card) => {
      const header = card.querySelector(".card-body.sticky-top");
      const votes = [...card.querySelectorAll('.card-footer[id^="votes-"] > .row')]
        .map((row) => ({
          voter: clean(row.querySelector("b")?.textContent),
          points: parseInt(clean(row.querySelector(".col-auto.my-auto h6")?.textContent), 10),
        }))
        .filter((v) => v.voter && !Number.isNaN(v.points));
      return {
        track: clean(header?.querySelector('a[href*="open.spotify.com/track"]')?.textContent),
        artist: clean(header?.querySelector("p.card-text")?.textContent),
        submitter: clean(header?.querySelector(".card.mt-3 h6.fw-semibold")?.textContent),
        votes,
      };
    });
  }

  window.__mlScrape = async () => {
    const base = leagueBase();
    if (!base) throw new Error("Bitte eine League-Seite öffnen (URL /l/<id>/...).");

    const [leagueDoc, roundsDoc] = await Promise.all([fetchDoc(base), fetchDoc(`${base}-/rounds`)]);
    const roundList = parseRounds(roundsDoc).filter((r) => r.complete);

    const rounds = await Promise.all(
      roundList.map(async (r) => ({
        ...r,
        submissions: parseResults(await fetchDoc(`${base}${r.id}/-/results`)).filter((s) => s.submitter),
      }))
    );

    return {
      leagueName: clean(leagueDoc.querySelector("title")?.textContent) || base,
      base,
      scrapedAt: new Date().toISOString(),
      roundsChecked: roundList.length,
      rounds: rounds.filter((r) => r.submissions.length),
    };
  };

  window.__mlDebugHtml = () => document.documentElement.outerHTML;
})();
