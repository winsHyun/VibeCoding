// 작성일시: 2026-11-03 12:00
// 카카오맵 SDK 로딩과 지도·링크 도우미

import { KAKAO_JS_KEY } from "./config.js";

let sdkPromise = null;

export function hasKakaoKey() {
  return Boolean(KAKAO_JS_KEY);
}

// SDK를 한 번만 불러옴 (autoload=false 후 kakao.maps.load로 초기화)
export function loadKakao() {
  if (!hasKakaoKey()) return Promise.reject(new Error("NO_KAKAO_KEY"));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false&libraries=services`;
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("KAKAO_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// 카카오맵 장소 페이지(있으면) 또는 이름 검색 링크
export function placeUrl(bakery) {
  if (bakery.kakao_place_id) return `https://place.map.kakao.com/${bakery.kakao_place_id}`;
  return `https://map.kakao.com/link/search/${encodeURIComponent(bakery.name)}`;
}

// 길찾기 링크 (좌표가 없으면 검색 링크로 대신)
export function directionsUrl(bakery) {
  if (bakery.lat == null || bakery.lng == null) return placeUrl(bakery);
  return `https://map.kakao.com/link/to/${encodeURIComponent(bakery.name)},${bakery.lat},${bakery.lng}`;
}

// 대전 시청 부근을 기본 중심으로 지도 생성
const DAEJEON_CENTER = { lat: 36.3504, lng: 127.3845 };

// 빵집마다 makePin(bakery, index)이 만든 DOM 요소를 핀으로 올림.
// withPath면 순서대로 선을 이음(코스용). 핀 표시 여부를 바꾸는 setVisible을 돌려줌
export async function renderMap(container, bakeries, { makePin, withPath = false, padding = [60, 40, 20, 40], zoomControl = false } = {}) {
  const kakao = await loadKakao();
  const points = bakeries.filter((b) => b.lat != null && b.lng != null);
  const map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(DAEJEON_CENTER.lat, DAEJEON_CENTER.lng),
    level: 8,
  });
  if (zoomControl) map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.BOTTOMRIGHT);

  const pins = new Map();
  const bounds = new kakao.maps.LatLngBounds();
  const path = [];
  points.forEach((bakery, index) => {
    const position = new kakao.maps.LatLng(bakery.lat, bakery.lng);
    bounds.extend(position);
    path.push(position);
    const overlay = new kakao.maps.CustomOverlay({ map, position, content: makePin(bakery, index), yAnchor: 1, clickable: true });
    pins.set(bakery.id, overlay);
  });

  if (withPath && path.length > 1) {
    new kakao.maps.Polyline({ map, path, strokeWeight: 4, strokeColor: "#b8641f", strokeOpacity: 0.7, strokeStyle: "shortdash" });
  }
  if (points.length === 1) {
    map.setCenter(path[0]);
    map.setLevel(4);
  } else if (points.length > 1) {
    // 여백 순서: top, right, bottom, left (위쪽은 핀 높이·떠 있는 메뉴만큼 더 줌)
    map.setBounds(bounds, ...padding);
  }

  return {
    map,
    shown: points.length,
    setVisible(bakeryId, visible) {
      pins.get(bakeryId)?.setMap(visible ? map : null);
    },
    // 보이는 빵집만 담기도록 범위 다시 맞춤
    fitTo(visible) {
      const shownPoints = visible.filter((b) => b.lat != null && b.lng != null);
      if (!shownPoints.length) return;
      const next = new kakao.maps.LatLngBounds();
      shownPoints.forEach((b) => next.extend(new kakao.maps.LatLng(b.lat, b.lng)));
      map.setBounds(next, ...padding);
    },
    panTo(bakery) {
      map.panTo(new kakao.maps.LatLng(bakery.lat, bakery.lng));
    },
    relayout() {
      map.relayout();
    },
  };
}
