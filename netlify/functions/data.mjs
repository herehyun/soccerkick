function csvParse(text) {
  // 간단 CSV 파서(따옴표 포함 대응). 규모가 크면 papaparse 쓰는게 더 낫지만, 의존성 없이 최소 구현합니다.
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
  // 마지막 라인
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

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes";
}
function toNumOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchSheetCsv(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet gid=${gid}: HTTP ${res.status}`);
  return await res.text();
}

export default async function handler(req) {
  try {
    const sheetId = process.env.SHEET_ID;
    const gidPlayers = process.env.GID_PLAYERS;
    const gidMatches = process.env.GID_MATCHES;
    const gidStats = process.env.GID_PLAYER_STATS;

    if (!sheetId || !gidPlayers || !gidMatches || !gidStats) {
      return Response.json(
        { error: "Missing env vars: SHEET_ID / GID_PLAYERS / GID_MATCHES / GID_PLAYER_STATS" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const season = url.searchParams.get("season") || ""; // 비우면 전체 반환

    const [playersCsv, matchesCsv, statsCsv] = await Promise.all([
      fetchSheetCsv(sheetId, gidPlayers),
      fetchSheetCsv(sheetId, gidMatches),
      fetchSheetCsv(sheetId, gidStats),
    ]);

    const playersRaw = csvToObjects(playersCsv);
    const matchesRaw = csvToObjects(matchesCsv);
    const statsRaw = csvToObjects(statsCsv);

    const players = playersRaw.map((p) => ({
      id: p.player_id,
      name: p.name,
      pos: p.pos,
      active: toBool(p.active),
    })).filter((p) => p.id && p.name);

    const matches = matchesRaw.map((m) => ({
      id: m.match_id,
      season: String(m.season || "").trim(),
      type: m.type || "LEAGUE",
      round: toNumOrNull(m.round),
      date: m.date,
      time: m.time,
      opponent: m.opponent,
      location: m.location,
      status: m.status || "SCHEDULED",
      scoreFor: toNumOrNull(m.score_for),
      scoreAgainst: toNumOrNull(m.score_against),
    })).filter((m) => m.id && m.season && m.date && m.opponent);

    const playerMatchStats = statsRaw.map((s) => ({
      matchId: s.match_id,
      playerId: s.player_id,
      attended: toBool(s.attended),
      goals: toNumOrNull(s.goals) ?? 0,
      assists: toNumOrNull(s.assists) ?? 0,
      yc: toNumOrNull(s.yc) ?? 0,
      rc: toNumOrNull(s.rc) ?? 0,
      cleanSheet: toBool(s.clean_sheet),
    })).filter((s) => s.matchId && s.playerId);

    const filtered = season
      ? {
          season,
          players,
          matches: matches.filter((m) => m.season === season),
          playerMatchStats: playerMatchStats.filter((s) => matches.find((m) => m.id === s.matchId)?.season === season),
        }
      : { season: null, players, matches, playerMatchStats };

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 캐시(원하면 조정): 60초 캐시 + 백그라운드 재검증
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    return Response.json({ error: "Server error", details: String(e?.message || e) }, { status: 500 });
  }
}
