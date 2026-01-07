import React, { useMemo, useState } from "react";

function formatMs(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return `${v.toFixed(2)} ms`;
}

function nowLocal(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function downloadCsv(rows) {
  const header = ["measuredAt", "url", "status", "ttfbMs"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        JSON.stringify(r.measuredAt ?? ""),
        JSON.stringify(r.url ?? ""),
        String(r.status ?? ""),
        String(r.ttfbMs ?? "")
      ].join(",")
    )
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ttfb_history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function App() {
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const stats = useMemo(() => {
    const xs = history.map((h) => h.ttfbMs).filter((n) => typeof n === "number");
    if (xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const median =
      sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return { n: xs.length, mean, median, p95, min, max };
  }, [history]);

  async function measure() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setHistory((prev) => [data, ...prev].slice(0, 50)); // 최근 50개만 보관
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>TTFB_WED Dashboard (Clone)</h1>
          <p className="sub">
            Netlify Functions로 TTFB(헤더 수신까지)를 측정하고 기록/통계를 보여주는 대시보드
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Measure</h2>
        <div className="row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="input"
          />
          <button className="btn" onClick={measure} disabled={loading}>
            {loading ? "Measuring..." : "Run"}
          </button>
          <button className="btn secondary" onClick={() => downloadCsv(history)} disabled={history.length === 0}>
            Export CSV
          </button>
          <button className="btn danger" onClick={clearHistory} disabled={history.length === 0}>
            Clear
          </button>
        </div>
        {error ? <div className="error">Error: {error}</div> : null}
      </section>

      <section className="grid">
        <div className="card">
          <h2>Stats</h2>
          {stats ? (
            <div className="stats">
              <div><span>N</span><strong>{stats.n}</strong></div>
              <div><span>Mean</span><strong>{formatMs(stats.mean)}</strong></div>
              <div><span>Median</span><strong>{formatMs(stats.median)}</strong></div>
              <div><span>P95</span><strong>{formatMs(stats.p95)}</strong></div>
              <div><span>Min</span><strong>{formatMs(stats.min)}</strong></div>
              <div><span>Max</span><strong>{formatMs(stats.max)}</strong></div>
            </div>
          ) : (
            <p className="muted">아직 측정 데이터가 없습니다.</p>
          )}
        </div>

        <div className="card">
          <h2>Recent Results</h2>
          {history.length === 0 ? (
            <p className="muted">최근 기록이 여기에 표시됩니다.</p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>URL</th>
                    <th>Status</th>
                    <th>TTFB</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, idx) => (
                    <tr key={`${h.measuredAt}-${idx}`}>
                      <td className="mono">{nowLocal(h.measuredAt)}</td>
                      <td className="mono clip" title={h.url}>{h.url}</td>
                      <td className="mono">{h.status}</td>
                      <td className="mono">{formatMs(h.ttfbMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        <p className="muted">
          참고: 이 구현은 “응답 헤더 수신까지” 시간을 TTFB 근사치로 사용합니다. 네트워크/리다이렉트/캐시 상태에 따라 변동됩니다.
        </p>
      </footer>
    </div>
  );
}
