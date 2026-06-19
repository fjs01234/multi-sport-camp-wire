// Vercel serverless function -- multi-sport proxy for Multi-Sport Camp Wire
// Generalizes the original Mets-only proxy to support MLB, NBA, and NFL with any team.

const SITE = "https://site.api.espn.com/apis/site/v2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

async function espnFetch(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`ESPN ${r.status}: ${url}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { pathname, searchParams } = new URL(req.url, `https://${req.headers.host}`);
  const parts = pathname.replace(/^\/api\/proxy\/?/, '').split('/').filter(Boolean);
  const route = parts[0] || '';

  try {
    // GET /api/proxy/espn?path=...
    if (route === 'espn') {
      const path = searchParams.get('path') || '';
      const data = await espnFetch(`${SITE}/${path}`);
      return res.json(data);
    }

    // GET /api/proxy/teams/:sport/:league  -- list all teams for a league (for the team picker UI)
    if (route === 'teams') {
      const [, sport, league] = parts;
      const data = await espnFetch(`${SITE}/sports/${sport}/${league}/teams?limit=100`);
      const teams = (data?.sports?.[0]?.leagues?.[0]?.teams || []).map(t => ({
        id: t.team?.id,
        abbr: t.team?.abbreviation,
        name: t.team?.displayName,
        shortName: t.team?.shortDisplayName,
        logo: t.team?.logos?.[0]?.href || ''
      })).sort((a,b) => a.name.localeCompare(b.name));
      return res.json({ teams });
    }

    // GET /api/proxy/scoreboard/:sport/:league?dates=YYYYMMDD
    if (route === 'scoreboard') {
      const sport = parts[1];
      const league = parts[2];
      const dates = searchParams.get('dates') || '';
      const url = dates
        ? `${SITE}/sports/${sport}/${league}/scoreboard?dates=${dates}`
        : `${SITE}/sports/${sport}/${league}/scoreboard`;
      return res.json(await espnFetch(url));
    }

    // GET /api/proxy/news/:sport/:league/:teamId
    if (route === 'news') {
      const [,sport, league, teamId] = parts;
      const data = await espnFetch(`${SITE}/sports/${sport}/${league}/news?team=${teamId}&limit=20`);
      const articles = (data?.articles || []).map(a => ({
        headline: a.headline || '',
        description: a.description || a.story?.slice(0, 200) || '',
        published: a.published || a.lastModified || '',
        _published: a.published || a.lastModified || '',
        _isPreview: a.type === 'Preview' || /preview/i.test(a.categories?.map(c=>c.description).join(' ') || '')
      }));
      return res.json({ articles });
    }

    // GET /api/proxy/summary/:sport/:league/:gameId
    if (route === 'summary') {
      const [,sport, league, gameId] = parts;
      return res.json(await espnFetch(`${SITE}/sports/${sport}/${league}/summary?event=${gameId}`));
    }

    // GET /api/proxy/gamedetail/:sport/:league/:teamId/:teamAbbr
    if (route === 'gamedetail') {
      const [,sport, league, teamId, teamAbbr] = parts;
      return res.json(await handleGameDetail(sport, league, teamId, teamAbbr));
    }

    return res.status(404).json({ error: "Unknown route", route, parts });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleGameDetail(sport, league, teamId, teamAbbr) {
  const dates = [
    null,
    (() => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10).replace(/-/g,""); })(),
    (() => { const d=new Date(); d.setDate(d.getDate()-2); return d.toISOString().slice(0,10).replace(/-/g,""); })(),
    (() => { const d=new Date(); d.setDate(d.getDate()-3); return d.toISOString().slice(0,10).replace(/-/g,""); })(),
  ];

  let gameId = null, gameEvent = null;
  for (const date of dates) {
    const url = date
      ? `${SITE}/sports/${sport}/${league}/scoreboard?dates=${date}`
      : `${SITE}/sports/${sport}/${league}/scoreboard`;
    const sb = await fetch(url, { headers: { Accept: "application/json" } }).catch(()=>null);
    if (!sb?.ok) continue;
    const sbData = await sb.json();
    for (const ev of (sbData?.events || [])) {
      const comp = ev.competitions?.[0];
      const involved = comp?.competitors?.some(c => String(c.team?.id) === String(teamId));
      if (involved && ev.status?.type?.completed) { gameId = ev.id; gameEvent = ev; break; }
    }
    if (gameId) break;
  }
  if (!gameId) return { found: false };

  const sumRes = await fetch(`${SITE}/sports/${sport}/${league}/summary?event=${gameId}`, { headers: { Accept: "application/json" } });
  const sum = await sumRes.json();
  const boxscore = sum?.boxscore || {};
  const players  = boxscore?.players || [];

  const compObj = gameEvent?.competitions?.[0];
  const home = compObj?.competitors?.find(c => c.homeAway === "home");
  const away = compObj?.competitors?.find(c => c.homeAway === "away");

  // Team-level box score lines (works for all sports -- these are flat name/displayValue stat arrays)
  const teamBoxLines = {};
  for (const teamBlock of (boxscore.teams || [])) {
    const abbr = teamBlock.team?.abbreviation || "";
    if (!abbr) continue;
    teamBoxLines[abbr] = (teamBlock.statistics || []).map(s => ({
      label: s.label || s.abbreviation || s.name,
      value: s.displayValue
    }));
  }

  // R/H/E for baseball (linescore-based), falls back to plain score for other sports
  const teamRHE = {};
  for (const competitor of (compObj?.competitors || [])) {
    const abbr = competitor?.team?.abbreviation || "";
    if (abbr) teamRHE[abbr] = { R: competitor.score ?? "?", H: "?", E: "0" };
  }
  if (sport === 'baseball') {
    const lsTeams = sum?.linescore?.teams || [];
    for (const lt of lsTeams) {
      const abbr = lt?.team?.abbreviation || "";
      if (abbr) { teamRHE[abbr] = { R: lt?.runs ?? teamRHE[abbr]?.R ?? "?", H: lt?.hits ?? "?", E: lt?.errors ?? "0" }; }
    }
  }

  const teamStats = [];
  for (const teamBlock of players) {
    const tName = teamBlock?.team?.displayName || "";
    const tAbbr = teamBlock?.team?.abbreviation || "";
    const isTracked = tAbbr === teamAbbr || String(teamBlock?.team?.id) === String(teamId);
    const hitters = [], pitchers = []; // baseball-specific naming kept for backward shape compat
    const skaters = [];                // generic per-player lines for basketball/football

    for (const statGroup of (teamBlock?.statistics || [])) {
      const type = (statGroup?.type || statGroup?.name || "").toLowerCase();
      const keys = statGroup?.keys || [];
      const totals = statGroup?.totals || [];

      if (sport === 'baseball') {
        if (type === "batting" && totals.length) {
          const hIdx = keys.indexOf("hits");
          const rIdx = keys.indexOf("runs");
          if (hIdx >= 0 && totals[hIdx]) teamRHE[tAbbr] = { ...teamRHE[tAbbr], H: totals[hIdx] };
          if (rIdx >= 0 && totals[rIdx] && teamRHE[tAbbr]?.R === "?") teamRHE[tAbbr].R = totals[rIdx];
        }

        for (const ath of (statGroup?.athletes || [])) {
          const name = ath?.athlete?.displayName || "";
          const vals = ath?.stats || [];
          if (!name || !vals.length) continue;
          const sm = {};
          keys.forEach((k, i) => { if (vals[i] != null && vals[i] !== "--") sm[k] = vals[i]; });

          if (type === "batting") {
            const hab = sm["hits-atBats"] || "";
            const hr = sm["homeRuns"]; const rbi = sm["RBIs"]; const bb = sm["walks"];
            if (hab) {
              const habReadable = hab.replace(/^(\d+)-(\d+)$/, "$1 for $2");
              let line = `${name}: ${habReadable}`;
              if (hr && hr !== "0") line += `, ${hr === "1" ? "HR" : hr + " HR"}`;
              if (rbi && rbi !== "0") line += `, ${rbi} RBI`;
              if (bb && bb !== "0") line += `, BB`;
              const hitCount = parseInt(hab.split("-")[0]) || 0;
              if (hitCount > 0 || (hr && hr !== "0") || (rbi && rbi !== "0")) hitters.push({ name, line });
            }
          } else if (type === "pitching") {
            const ip = sm["fullInnings.partInnings"];
            const er = sm["earnedRuns"]; const so = sm["strikeouts"];
            const bb = sm["walks"]; const era = sm["ERA"];
            if (ip) {
              let line = `${name}: ${ip} IP`;
              if (er != null) line += `, ${er} ER`;
              if (so && so !== "0") line += `, ${so} K`;
              if (bb && bb !== "0") line += `, ${bb} BB`;
              if (era) line += ` (ERA: ${era})`;
              pitchers.push({ name, line });
            }
          }
        }
      } else if (sport === 'basketball') {
        // NBA boxscore.players[].statistics[0].athletes[] -- keys like points, rebounds, assists, etc.
        for (const ath of (statGroup?.athletes || [])) {
          const name = ath?.athlete?.displayName || "";
          const vals = ath?.stats || [];
          if (!name || !vals.length) continue;
          const sm = {};
          keys.forEach((k, i) => { if (vals[i] != null && vals[i] !== "--") sm[k] = vals[i]; });
          const pts = parseInt(sm["points"] || "0");
          if (pts <= 0 && !sm["rebounds"] && !sm["assists"]) continue; // skip DNPs/zero box lines
          let line = `${name}: ${sm["points"] || 0} PTS`;
          if (sm["rebounds"]) line += `, ${sm["rebounds"]} REB`;
          if (sm["assists"]) line += `, ${sm["assists"]} AST`;
          if (sm["steals"] && sm["steals"] !== "0") line += `, ${sm["steals"]} STL`;
          if (sm["blocks"] && sm["blocks"] !== "0") line += `, ${sm["blocks"]} BLK`;
          if (sm["threePointFieldGoalsMade"] && sm["threePointFieldGoalsMade"] !== "0") line += `, ${sm["threePointFieldGoalsMade"]} 3PM`;
          skaters.push({ name, line });
        }
      } else if (sport === 'football') {
        // NFL boxscore.players[].statistics[] grouped by category: passing, rushing, receiving, defensive
        for (const ath of (statGroup?.athletes || [])) {
          const name = ath?.athlete?.displayName || "";
          const vals = ath?.stats || [];
          if (!name || !vals.length) continue;
          const sm = {};
          keys.forEach((k, i) => { if (vals[i] != null && vals[i] !== "--") sm[k] = vals[i]; });

          if (type === "passing") {
            const compAtt = sm["completions-passingAttempts"];
            const yds = sm["passingYards"]; const td = sm["passingTouchdowns"]; const intc = sm["interceptions"];
            if (compAtt) {
              let line = `${name}: ${compAtt.replace('-', '/')}, ${yds || 0} yds`;
              if (td && td !== "0") line += `, ${td} TD`;
              if (intc && intc !== "0") line += `, ${intc} INT`;
              skaters.push({ name, line });
            }
          } else if (type === "rushing") {
            const att = sm["rushingAttempts"]; const yds = sm["rushingYards"]; const td = sm["rushingTouchdowns"];
            if (yds && parseInt(yds) !== 0) {
              let line = `${name}: ${att || 0} car, ${yds} yds`;
              if (td && td !== "0") line += `, ${td} TD`;
              skaters.push({ name, line });
            }
          } else if (type === "receiving") {
            const rec = sm["receptions"]; const yds = sm["receivingYards"]; const td = sm["receivingTouchdowns"];
            if (rec && parseInt(rec) > 0) {
              let line = `${name}: ${rec} rec, ${yds || 0} yds`;
              if (td && td !== "0") line += `, ${td} TD`;
              skaters.push({ name, line });
            }
          }
        }
      }
    }

    const rhe = teamRHE[tAbbr] || { R:"?", H:"?", E:"0" };
    teamStats.push({ tName, tAbbr, isTracked, hitters, pitchers, skaters, R: rhe.R, H: rhe.H, E: rhe.E });
  }

  // Scoring plays (mainly meaningful for baseball; harmless empty array for others)
  const scoringPlays = (sum?.plays || [])
    .filter(p => p?.scoringPlay)
    .slice(0, 8)
    .map(p => ({ text: p?.text || "", score: p?.homeScore !== undefined ? `${p.awayScore}-${p.homeScore}` : "" }));

  return {
    found: true, gameId,
    home: { name: home?.team?.displayName, abbr: home?.team?.abbreviation, score: home?.score },
    away: { name: away?.team?.displayName, abbr: away?.team?.abbreviation, score: away?.score },
    teamStats, teamBoxLines, scoringPlays,
    status: gameEvent?.status?.type?.description || "Final"
  };
}
