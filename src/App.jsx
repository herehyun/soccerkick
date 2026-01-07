import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Schedule from "./pages/Schedule.jsx";
import Records from "./pages/Records.jsx";
import Admin from "./pages/Admin.jsx";
import { fetchSeasonData } from "./lib/api.js";

/**
 * 이미지 기준 공통 쉘:
 * - 상단: TTFB_WED + 시즌 드롭다운
 * - 본문: 라우팅 페이지(홈/일정/기록/관리)
 * - 하단: 탭바
 * - 전체: 모바일 고정폭 + 카드형 다크 UI
 */

const DEFAULT_SEASON = "2026";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 이미지처럼 "시즌 드롭다운"이 상단 우측에 고정되어야 하므로,
  // 시즌은 App 최상단 상태로 둡니다.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    fetchSeasonData(season)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [season]);

  // 시즌 목록은 데이터에서 파생할 수도 있으나,
  // 우선 이미지처럼 "2026 시즌"이 확실히 뜨게 기본값 유지 + 확장 가능하게 처리
  const seasonOptions = useMemo(() => {
    // data.matches가 있다면 그 안에서 시즌을 추출해도 됩니다.
    // 당장은 최소 구현: 현재 시즌 + (추후 확장)
    const set = new Set([season]);
    if (data?.matches?.length) {
      for (const m of data.matches) {
        if (m.season) set.add(String(m.season));
      }
    }
    return Array.from(set).sort();
  }, [data, season]);

  // 로딩/에러 화면도 이미지 스타일(카드형)로 맞춥니다.
  const body
