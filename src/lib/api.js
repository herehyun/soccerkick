export async function fetchSeasonData(season) {
  const res = await fetch(`/api/data?season=${encodeURIComponent(season)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
