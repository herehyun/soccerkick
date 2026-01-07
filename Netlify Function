export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUrl = (body?.url || "").trim();

    if (!targetUrl) {
      return Response.json({ error: "Missing url" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return Response.json({ error: "Invalid url" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return Response.json({ error: "Only http/https allowed" }, { status: 400 });
    }

    // 간단한 SSRF 완화(로컬/사설망 차단) - 필요 시 더 강화 권장
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (blockedHosts.has(host)) {
      return Response.json({ error: "Blocked host" }, { status: 403 });
    }

    const start = performance.now();

    // fetch()가 resolve되는 시점은 "응답 헤더 수신 완료"에 가깝습니다.
    // 따라서 start ~ await fetch 완료 시간을 TTFB 근사치로 사용합니다.
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "ttfbwed-clone/1.0 (Netlify Function)"
      }
    });

    const headersReceived = performance.now();

    // 본문 다운로드까지 시간을 원하면 아래를 사용
    // await res.arrayBuffer();
    // const end = performance.now();

    const ttfbMs = headersReceived - start;

    return Response.json({
      url: targetUrl,
      status: res.status,
      ok: res.ok,
      ttfbMs: Math.round(ttfbMs * 100) / 100,
      measuredAt: new Date().toISOString()
    });
  } catch (e) {
    return Response.json(
      { error: "Server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
