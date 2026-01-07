const SHEET_NAMES = {
  players: "players",
  matches: "matches",
  playerStats: "player_stats",
};

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvToObjects(csvText) {
  const rows = csvParse(csvText).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = (r[i] ?? "").trim();
    return obj;
  });
}

const toBool = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes";
};

const toNumOrNull = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// gid 대신 sheet name으로 CSV 추출: gviz
async function fetchSheetCsvByName(sheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet="${sheetName}": HTTP ${res.status}`);
  return await res.text();
}

export default async function handler(req) {
  try {
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) {
      return Response.json({ error: "Missing env var SHEET_ID" }, { status: 500 });
    }

    const url = new URL(req.url);
    const season = (url.searchParams.get("season") || "").trim(); // ex) "2026"

    const [playersCsv, matchesCsv, statsCsv] = await Promise.all([
      fetchSheetCsvByName(sheetId, SHEET_NAMES.players),
      fetchSheetCsvByName(sheetId, SHEET_NAMES.matches),
      fetchSheetCsvByName(sheetId, SHEET_NAMES.playerStats),
    ]);

    const playersRaw = csvToObjects(playersCsv);
    const matchesRaw = csvToObjects(matchesCsv);
    const statsRaw = csvToObjects(statsCsv);

    const players = playersRaw
      .map((p) => ({
        id: p.player_id,
        name: p.name,
        pos: p.pos,
        active: toBool(p.active),
      }))
      .filter((p) => p.id && p.name);

    const matches = matchesRaw
      .map((m) => ({
        id: m.match_id,
        season: String(m.season || "").trim(),
        type: (m.type || "LEAGUE").trim(),
        round: toNumOrNull(m.round),
        date: (m.date || "").trim(),       // YYYY-MM-DD
        time: (m.time || "").trim(),       // HH:MM
        opponent: (m.opponent || "").trim(),
        location: (m.location || "").trim(),
        status: (m.status || "SCHEDULED").trim(), // SCHEDULED | DONE
        scoreFor: toNumOrNull(m.score_for),
        scoreAgainst: toNumOrNull(m.score_against),
      }))
      .filter((m) => m.id && m.season && m.date && m.opponent);

    const playerMatchStats = statsRaw
      .map((s) => ({
        matchId: (s.match_id || "").trim(),
        playerId: (s.player_id || "").trim(),
        attended: toBool(s.attended),
        goals: toNumOrNull(s.goals) ?? 0,
        assists: toNumOrNull(s.assists) ?? 0,
        yc: toNumOrNull(s.yc) ?? 0,
        rc: toNumOrNull(s.rc) ?? 0,
        cleanSheet: toBool(s.clean_sheet),
      }))
      .filter((s) => s.matchId && s.playerId);

    // 시즌 필터링
    const seasonMatches = season ? matches.filter((m) => m.season === season) : matches;
    const seasonMatchIdSet = new Set(seasonMatches.map((m) => m.id));
    const seasonStats = season ? playerMatchStats.filter((s) => seasonMatchIdSet.has(s.matchId)) : playerMatchStats;

    return new Response(
      JSON.stringify({
        sheetId,
        season: season || null,
        players,
        matches: seasonMatches,
        playerMatchStats: seasonStats,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    return Response.json({ error: "Server error", details: String(e?.message || e) }, { status: 500 });
  }
}
