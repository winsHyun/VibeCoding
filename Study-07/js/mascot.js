// 작성일시: 2026-11-03 14:50
// 구별 빵 친구 캐릭터 (이 서비스의 자체 캐릭터). 구마다 다른 빵 + 동네 특징 소품
// 꿈돌이 등 공식 캐릭터는 대전관광공사 승인 후 config.js의 CHARACTER_IMAGES에 경로를 넣으면 그 이미지를 대신 씀

import { CHARACTER_IMAGES } from "./config.js";

export const MASCOTS = {
  동구: { name: "기관사 소금빵", motif: "대전역" },
  중구: { name: "딸기 케이크", motif: "원도심 빵집 거리" },
  서구: { name: "화가 크루아상", motif: "둔산 문화 거리" },
  유성구: { name: "온천 에그타르트", motif: "유성온천" },
  대덕구: { name: "등산 머핀", motif: "계족산 황톳길" },
};

// 반짝이는 큰 눈 + 볼터치 + 입. mood: smile(활짝) · open(와아) · wink(윙크)
function face(cx, cy, mood = "smile") {
  const eye = (x) => `<ellipse cx="${x}" cy="${cy}" rx="4.6" ry="5.6" fill="#3a2418"/>
    <circle cx="${x - 1.6}" cy="${cy - 2}" r="1.8" fill="#fff"/><circle cx="${x + 1.4}" cy="${cy + 1.8}" r="0.9" fill="#fff"/>`;
  const wink = (x) => `<path d="M${x - 5} ${cy}q5 -5 10 0" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>`;
  const mouth = {
    smile: `<path d="M${cx - 5} ${cy + 8}q5 6 10 0" fill="none" stroke="#3a2418" stroke-width="2.2" stroke-linecap="round"/>`,
    open: `<path d="M${cx - 5} ${cy + 7}q5 9 10 0z" fill="#7a2e2e"/><path d="M${cx - 2.6} ${cy + 11}q2.6 -2 5.2 0" fill="#ff8f8f"/>`,
    wink: `<path d="M${cx - 4} ${cy + 8}q4 5 8 0" fill="none" stroke="#3a2418" stroke-width="2.2" stroke-linecap="round"/>`,
  }[mood];
  return `<g>
    ${eye(cx - 11)}${mood === "wink" ? wink(cx + 11) : eye(cx + 11)}
    <ellipse cx="${cx - 19}" cy="${cy + 7}" rx="6" ry="3.6" fill="#ff7b8a" opacity=".5"/>
    <ellipse cx="${cx + 19}" cy="${cy + 7}" rx="6" ry="3.6" fill="#ff7b8a" opacity=".5"/>
    ${mouth}
  </g>`;
}

const shadow = `<ellipse cx="60" cy="133" rx="32" ry="5" fill="#000" opacity=".1"/>`;
const feet = (color) => `<ellipse cx="47" cy="127" rx="9" ry="5.5" fill="${color}"/><ellipse cx="73" cy="127" rx="9" ry="5.5" fill="${color}"/>`;
// 손 흔드는 팔: 몸 바깥 왼쪽 위로 들고 흔들림 표시
const wave = (fill, stroke) => `<ellipse cx="12" cy="64" rx="6.5" ry="10" transform="rotate(-30 12 64)" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
    <path d="M3 48q-4 5 0 10M-2 44q-5 8 0 16" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
const arm = (x, y, rot, fill, stroke) => `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="10" transform="rotate(${rot} ${x} ${y})" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`;

const ART = {
  // 동구: 대전역 기관사 모자를 쓴 소금빵
  동구: (pose) => `${shadow}${feet("#b8732f")}
    ${pose ? wave("#eaa95d", "#b8732f") : arm(21, 98, 25, "#eaa95d", "#b8732f")}
    ${arm(99, 98, -25, "#eaa95d", "#b8732f")}
    <path d="M18 98c0-24 19-40 42-40s42 16 42 40c0 16-14 26-42 26S18 114 18 98z" fill="#eaa95d" stroke="#b8732f" stroke-width="3"/>
    <path d="M28 88c6-12 18-19 32-19s26 7 32 19" fill="none" stroke="#c98637" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>
    <path d="M32 72c5-5 12-8 18-8" fill="none" stroke="#fbd49a" stroke-width="3.4" stroke-linecap="round"/>
    <g fill="#fff"><rect x="44" y="64" width="3" height="3" rx=".6" transform="rotate(20 45 65)"/><rect x="66" y="62" width="3" height="3" rx=".6"/><rect x="78" y="68" width="2.6" height="2.6" rx=".5" transform="rotate(30 79 69)"/></g>
    ${face(60, 94, "smile")}
    <g transform="translate(60 52)">
      <path d="M-24 6c0-14 11-22 24-22s24 8 24 22z" fill="#2f4f86"/>
      <rect x="-25" y="3" width="50" height="7" rx="3" fill="#24406f"/>
      <path d="M-26 10h52c-4 6-14 8-26 8s-22-2-26-8z" fill="#1c2f52"/>
      <circle cx="0" cy="-4" r="5" fill="#f6c343" stroke="#d99a1e" stroke-width="1.4"/>
      <path d="M-2 -5l2-2 2 2-2 2z" fill="#fff"/>
    </g>`,

  // 중구: 원도심 빵집 거리, 딸기를 모자처럼 얹은 생크림 케이크
  중구: (pose) => `${shadow}${feet("#e58fa6")}
    ${pose ? wave("#fff4ec", "#e8b9b0") : arm(23, 98, 25, "#fff4ec", "#e8b9b0")}
    ${arm(97, 98, -25, "#fff4ec", "#e8b9b0")}
    <rect x="26" y="58" width="68" height="66" rx="18" fill="#fff4ec" stroke="#e8b9b0" stroke-width="3"/>
    <rect x="29" y="104" width="62" height="7" fill="#f7d4a8"/>
    <rect x="29" y="111" width="62" height="5" fill="#f7a8bb"/>
    <path d="M26 72c4 6 9 6 12 0 3 7 9 7 12 0 3 7 9 7 12 0 3 7 9 7 12 0 3 7 9 7 12 0 3 6 8 6 8 0V70c0-8-8-12-16-12H42c-8 0-16 4-16 12z" fill="#fff" stroke="#f0d6cf" stroke-width="1.5"/>
    ${face(60, 88, "open")}
    <g transform="translate(60 44)">
      <path d="M0 -14c11 0 17 9 15 18-2 8-9 14-15 14S-13 12-15 4c-2-9 4-18 15-18z" fill="#ec3f5c"/>
      <g fill="#ffe08a"><ellipse cx="-6" cy="-2" rx="1.3" ry="1.8"/><ellipse cx="5" cy="-4" rx="1.3" ry="1.8"/><ellipse cx="0" cy="5" rx="1.3" ry="1.8"/><ellipse cx="8" cy="5" rx="1.3" ry="1.8"/><ellipse cx="-8" cy="7" rx="1.3" ry="1.8"/></g>
      <path d="M-9 -14c3-6 6-6 9 -1 3-5 6-5 9 1-4 2-8 3-9 3s-5-1-9-3z" fill="#4caf50"/>
      <circle cx="-5" cy="-6" r="3" fill="#fff" opacity=".5"/>
    </g>
    <g transform="translate(86 64) rotate(15)"><path d="M0 0l-8-5v10zM0 0l8-5v10z" fill="#ff8fb1"/><circle r="2.6" fill="#f2668f"/></g>`,

  // 서구: 둔산 문화 거리, 베레모를 쓰고 붓을 든 크루아상
  서구: (pose) => `${shadow}${feet("#a8601d")}
    ${pose ? wave("#df9a4f", "#a8601d") : arm(19, 98, 25, "#df9a4f", "#a8601d")}
    ${arm(101, 96, -30, "#df9a4f", "#a8601d")}
    <path d="M14 104c2-28 20-46 46-46s44 18 46 46c-8 8-20 6-24 0-6 10-14 16-22 16s-16-6-22-16c-4 6-16 8-24 0z" fill="#df9a4f" stroke="#a8601d" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 62c-4 14-3 30 2 44M60 58v50M80 62c4 14 3 30-2 44" fill="none" stroke="#b9702a" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
    <path d="M28 82c3-8 9-14 15-17" fill="none" stroke="#f7c58a" stroke-width="3.4" stroke-linecap="round"/>
    ${face(60, 88, "wink")}
    <g transform="translate(60 54) rotate(-12)">
      <ellipse cx="0" cy="0" rx="25" ry="9" fill="#c0392b"/>
      <ellipse cx="0" cy="-3" rx="20" ry="7" fill="#d9493a"/>
      <path d="M0 -10v-5" stroke="#8e2a20" stroke-width="3" stroke-linecap="round"/>
    </g>
    <g transform="translate(106 82) rotate(25)">
      <rect x="-2" y="-2" width="4" height="26" rx="2" fill="#8d6e63"/>
      <rect x="-2.6" y="-6" width="5.2" height="6" fill="#bdbdbd"/>
      <path d="M-3 -6c0-6 1.5-9 3-11 1.5 2 3 5 3 11z" fill="#4fc3f7"/>
    </g>`,

  // 유성구: 유성온천에 몸을 담근 에그타르트 (머리 수건 + 김)
  유성구: (pose) => `${shadow}
    <ellipse cx="60" cy="124" rx="46" ry="9" fill="#9fd8f0" opacity=".85"/>
    <path d="M24 122c6-3 10 3 16 0s10 3 16 0 10 3 16 0 10 3 16 0 10 3 12 1" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>
    ${pose ? wave("#d99a4e", "#a86d2c") : arm(19, 102, 25, "#d99a4e", "#a86d2c")}
    ${arm(101, 102, -25, "#d99a4e", "#a86d2c")}
    <path d="M20 86c0-14 18-24 40-24s40 10 40 24v24c0 8-18 14-40 14s-40-6-40-14z" fill="#d99a4e" stroke="#a86d2c" stroke-width="3"/>
    <path d="M22 88q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0q4 5 8 0" fill="none" stroke="#b97a36" stroke-width="2"/>
    <ellipse cx="60" cy="80" rx="34" ry="13" fill="#ffd34d"/>
    <g fill="#a35a16" opacity=".8"><ellipse cx="46" cy="78" rx="5" ry="3"/><ellipse cx="70" cy="83" rx="4" ry="2.4"/><ellipse cx="63" cy="74" rx="2.6" ry="1.8"/></g>
    ${face(60, 102, "smile")}
    <g transform="translate(60 62)">
      <path d="M-20 4c2-10 10-14 20-14s18 4 20 14c-6 3-14 4-20 4s-14-1-20-4z" fill="#fff" stroke="#d9d9d9" stroke-width="1.5"/>
      <path d="M-14 0h28M-12 -5h24" stroke="#8fd0ea" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g fill="none" stroke="#c9c9c9" stroke-width="2.4" stroke-linecap="round" opacity=".8">
      <path d="M22 60c-4-5 4-8 0-14"/><path d="M98 60c-4-5 4-8 0-14"/><path d="M104 74c-3-4 3-6 0-11"/>
    </g>`,

  // 대덕구: 계족산 황톳길을 걷는 등산 모자 초코칩 머핀
  대덕구: (pose) => `${shadow}${feet("#7a4b2a")}
    ${pose ? wave("#f3d3a3", "#b98a54") : arm(22, 100, 25, "#f3d3a3", "#b98a54")}
    ${arm(98, 100, -25, "#f3d3a3", "#b98a54")}
    <path d="M30 92h60l-7 32H37z" fill="#8fb8e8" stroke="#5b86b8" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 94l2 28M50 94l1 28M60 94v28M70 94l-1 28M80 94l-2 28" stroke="#6d98c9" stroke-width="2"/>
    <path d="M22 92c-4-24 14-40 38-40s42 16 38 40c-10 4-26 5-38 5s-28-1-38-5z" fill="#f3d3a3" stroke="#b98a54" stroke-width="3"/>
    <g fill="#5d3a1a"><ellipse cx="36" cy="80" rx="3.4" ry="2.6"/><ellipse cx="84" cy="78" rx="3.4" ry="2.6"/><ellipse cx="74" cy="90" rx="2.8" ry="2.2"/><ellipse cx="44" cy="90" rx="2.8" ry="2.2"/></g>
    ${face(60, 78, "open")}
    <g transform="translate(60 50)">
      <path d="M-22 4c0-12 10-18 22-18s22 6 22 18z" fill="#6aa84f"/>
      <path d="M-30 4h60c0 4-12 6-30 6s-30-2-30-6z" fill="#558b3e"/>
      <rect x="-22" y="0" width="44" height="4" fill="#f6c343"/>
      <path d="M8 -14c4-8 12-8 14-4-4 4-10 6-14 4zM8 -14c-2-6-8-8-11-5 3 4 8 6 11 5z" fill="#8bc34a"/>
    </g>
    <g transform="translate(104 78) rotate(10)"><rect x="-1.6" y="0" width="3.2" height="40" rx="1.6" fill="#8d6e63"/><circle r="3" fill="#a1887f"/></g>`,
};

// pose: 0 기본, 1 한쪽 팔 들기 (같은 캐릭터라도 자리마다 조금 다르게)
export function mascotSvg(district, { pose = 0 } = {}) {
  const meta = MASCOTS[district] ?? MASCOTS.동구;
  const draw = ART[district] ?? ART.동구;
  return `<svg viewBox="-8 0 128 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${meta.name} 캐릭터">${draw(pose)}</svg>`;
}

// 공식 캐릭터 이미지가 설정되어 있으면 img, 아니면 자체 캐릭터 SVG
export function mascotNode(district, options) {
  const box = document.createElement("div");
  box.className = "mascot";
  const src = CHARACTER_IMAGES?.[district];
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = `${district} 캐릭터`;
    img.loading = "lazy";
    box.append(img);
  } else {
    box.innerHTML = mascotSvg(district, options);
  }
  return box;
}
