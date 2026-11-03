// 작성일시: 2026-11-03 16:50
// 별 장식: 반짝이는 별가루, 웃는 별, 별 터짐 효과
// (대전의 '과학·우주' 이미지를 별 도형으로만 표현. 공식 캐릭터는 쓰지 않음)

import { el } from "./dom.js";

export const STAR_COLORS = ["#ffd54a", "#ff9fbf", "#7fd6c2", "#ffe9a8", "#b9a4ff"];

// 모서리가 둥근 다섯 꼭짓점 별 (viewBox 0 0 24 24)
const STAR_PATH = "M12 2.5l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 16.9 6.3 20l1.2-6.4-4.7-4.4 6.4-.8z";

export function starSvg(color = STAR_COLORS[0]) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="${color}" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
}

// 웃는 별 (볼터치 + 반짝이는 눈). 특정 캐릭터가 아닌 일반 별 얼굴
export function smileStarSvg(color = "#ffd54a") {
  return `<svg viewBox="0 0 64 64" role="img" aria-label="웃는 별">
    <path d="M32 5l7.6 15.6 17 2.2-12.4 11.8 3.2 17L32 43.4 16.6 51.6l3.2-17L7.4 22.8l17-2.2z" fill="${color}" stroke="#f2b705" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="26" cy="30" rx="2.6" ry="3.2" fill="#3a2418"/><ellipse cx="38" cy="30" rx="2.6" ry="3.2" fill="#3a2418"/>
    <circle cx="25.2" cy="28.8" r="1" fill="#fff"/><circle cx="37.2" cy="28.8" r="1" fill="#fff"/>
    <ellipse cx="21" cy="35" rx="3.4" ry="2" fill="#ff8a8a" opacity=".55"/><ellipse cx="43" cy="35" rx="3.4" ry="2" fill="#ff8a8a" opacity=".55"/>
    <path d="M28.5 35.5q3.5 3.6 7 0" fill="none" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// 로고용 빵 별: 웃는 별 + 작은 요리사 모자 (viewBox를 위로 넓혀 모자 자리 확보)
export function logoStarSvg() {
  return `<svg viewBox="0 -16 64 80" role="img" aria-label="빵 별">
    <path d="M32 5l7.6 15.6 17 2.2-12.4 11.8 3.2 17L32 43.4 16.6 51.6l3.2-17L7.4 22.8l17-2.2z" fill="#ffd54a" stroke="#f2b705" stroke-width="3" stroke-linejoin="round"/>
    <g transform="translate(32 11) scale(1.15)">
      <circle cx="-7" cy="-8" r="6" fill="#fff" stroke="#b9a58c" stroke-width="2"/>
      <circle cx="7" cy="-8" r="6" fill="#fff" stroke="#b9a58c" stroke-width="2"/>
      <circle cx="0" cy="-11" r="7.5" fill="#fff" stroke="#b9a58c" stroke-width="2"/>
      <rect x="-10" y="-6" width="20" height="8" rx="2.5" fill="#fff" stroke="#b9a58c" stroke-width="2"/>
      <path d="M-11 -10a6 6 0 0 1 8 -5M3 -16a7 7 0 0 1 9 4" fill="#fff"/>
      <path d="M-4 -4v4M0 -4v4M4 -4v4" stroke="#e6dccf" stroke-width="1.4"/>
    </g>
    <ellipse cx="26" cy="30" rx="2.8" ry="3.4" fill="#3a2418"/><ellipse cx="38" cy="30" rx="2.8" ry="3.4" fill="#3a2418"/>
    <circle cx="25.1" cy="28.7" r="1.1" fill="#fff"/><circle cx="37.1" cy="28.7" r="1.1" fill="#fff"/>
    <ellipse cx="21" cy="35.5" rx="3.6" ry="2.1" fill="#ff8a8a" opacity=".6"/><ellipse cx="43" cy="35.5" rx="3.6" ry="2.1" fill="#ff8a8a" opacity=".6"/>
    <path d="M28.5 35.5q3.5 3.8 7 0" fill="none" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// 같은 자리면 매번 같은 배치가 나오도록 씨앗값으로 만드는 의사난수
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// 영역 위에 흩뿌린 반짝이는 별들. 부모는 position: relative 여야 함
export function starField({ count = 10, seed = 7, minSize = 8, maxSize = 18, shooting = false } = {}) {
  const rand = seeded(seed);
  const field = el("div", { className: "star-field", "aria-hidden": "true" });
  for (let i = 0; i < count; i++) {
    const size = Math.round(minSize + rand() * (maxSize - minSize));
    const star = el("span", {
      className: rand() < 0.3 ? "star twinkle-slow" : "star",
      style: `left:${(rand() * 94).toFixed(1)}%;top:${(rand() * 88).toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${(-rand() * 4).toFixed(2)}s`,
    });
    star.innerHTML = starSvg(STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)]);
    field.append(star);
  }
  // 작은 점 별 (반짝임 없이 은은하게)
  for (let i = 0; i < Math.round(count * 0.8); i++) {
    field.append(el("span", {
      className: "star-dot",
      style: `left:${(rand() * 98).toFixed(1)}%;top:${(rand() * 95).toFixed(1)}%;background:${STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)]}`,
    }));
  }
  if (shooting) field.append(el("span", { className: "shooting-star" }));
  return field;
}

// 기준 요소에서 별이 퐁 터지는 효과 (제보 성공 등)
export function starBurst(anchor, count = 14) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    const size = 12 + Math.random() * 12;
    const star = el("span", {
      className: "burst-star",
      style: `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;--rot:${Math.random() * 360}deg`,
    });
    star.innerHTML = starSvg(STAR_COLORS[i % STAR_COLORS.length]);
    document.body.append(star);
    star.addEventListener("animationend", () => star.remove());
  }
}
