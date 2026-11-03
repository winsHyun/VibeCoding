// 작성일시: 2026-11-03 14:20
// 대표 메뉴로 빵 종류를 정하고, 사진이 없을 때 쓸 일러스트 커버를 만듦

// 우선순위 순서. 대표 메뉴를 앞에서부터 보며 처음 맞는 종류로 정함
export const CATEGORIES = [
  { id: "salt", label: "소금빵", emoji: "🧂", color: "#c98a3d", bg: ["#f7e7cf", "#eccb9c"], match: /소금빵|소금 ?버터|소금베이글|시오/ },
  { id: "tart", label: "타르트·파이", emoji: "🥧", color: "#d9a21f", bg: ["#fdf0c9", "#f6d77f"], match: /타르트|파이|플랑/ },
  { id: "pastry", label: "크루아상", emoji: "🥐", color: "#b5651d", bg: ["#f8e2c8", "#e9b884"], match: /크루아상|크로와상|크로아상|크루아망|페스츄리|데니쉬|퀸아망/ },
  { id: "baked", label: "구움과자", emoji: "🍪", color: "#d07a4a", bg: ["#fbe5d6", "#f1bfa0"], match: /마들렌|휘낭시에|낭시에|까눌레|스콘|쿠키|버터바|브라우니|마카롱|쿠키슈|갸또|갸토|파운드/ },
  { id: "cake", label: "케이크", emoji: "🍰", color: "#d4657a", bg: ["#fde4ea", "#f5b8c6"], match: /케이크|케잌|시루|롤|카스테라|카스텔라|쉬폰|티라미수|몽블랑/ },
  { id: "hard", label: "바게트·베이글", emoji: "🥖", color: "#8a6a3b", bg: ["#efe6d6", "#d9c4a0"], match: /바게트|치아바타|깜빠뉴|샌드위치|잠봉|샤워도우|포카치아|베이글|통밀빵|건강빵|하비스트/ },
  { id: "loaf", label: "식빵", emoji: "🍞", color: "#c4934f", bg: ["#f6ecdc", "#e6cfa6"], match: /식빵|브레드|브리오쉬/ },
  { id: "sweet", label: "단과자·옛날빵", emoji: "🍩", color: "#9c5b3a", bg: ["#f5e1d3", "#e2b596"], match: /팥|소보로|소보루|맘모스|찹쌀|고구마|꽈배기|도넛|도너츠|사라다|크림빵|공갈빵|메론빵|모찌|쌀빵|부추빵|햄버거|핫도그|빵/ },
];

const FALLBACK = CATEGORIES[CATEGORIES.length - 1];

export function categoryOf(bakery) {
  for (const menu of bakery.signature_menus ?? []) {
    const found = CATEGORIES.find((c) => c.match.test(menu));
    if (found) return found;
  }
  return FALLBACK;
}

// 종류별 일러스트 (viewBox 0 0 120 80)
const ART = {
  salt: `
    <ellipse cx="60" cy="58" rx="40" ry="6" fill="#000" opacity=".08"/>
    <path d="M22 50c0-16 17-28 38-28s38 12 38 28c0 5-6 8-14 8H36c-8 0-14-3-14-8z" fill="#d9974a"/>
    <path d="M30 46c4-11 16-18 30-18s26 7 30 18" fill="none" stroke="#b9772f" stroke-width="3" stroke-linecap="round"/>
    <path d="M40 52c3-8 11-13 20-13s17 5 20 13" fill="none" stroke="#b9772f" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 36c6-6 16-9 22-9" fill="none" stroke="#f3c98a" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <g fill="#fff"><rect x="48" y="30" width="3" height="3" rx=".6" transform="rotate(20 49 31)"/><rect x="62" y="27" width="3" height="3" rx=".6"/><rect x="72" y="33" width="3" height="3" rx=".6" transform="rotate(35 73 34)"/><rect x="56" y="40" width="2.5" height="2.5" rx=".5"/><rect x="40" y="38" width="2.5" height="2.5" rx=".5"/></g>`,
  tart: `
    <ellipse cx="60" cy="60" rx="34" ry="6" fill="#000" opacity=".08"/>
    <circle cx="60" cy="42" r="26" fill="#d39550"/>
    <circle cx="60" cy="42" r="26" fill="none" stroke="#b97a35" stroke-width="2" stroke-dasharray="4 3"/>
    <circle cx="60" cy="42" r="19" fill="#f6c443"/>
    <circle cx="60" cy="42" r="19" fill="url(#shine)"/>
    <g fill="#9a5a1c" opacity=".75"><ellipse cx="54" cy="38" rx="4" ry="3"/><ellipse cx="66" cy="46" rx="3" ry="2"/><ellipse cx="62" cy="35" rx="2" ry="1.5"/></g>`,
  pastry: `
    <ellipse cx="60" cy="60" rx="40" ry="6" fill="#000" opacity=".08"/>
    <path d="M20 50c4-14 18-26 40-26s36 12 40 26c-6 4-14 2-18-2-6 6-16 8-22 8s-16-2-22-8c-4 4-12 6-18 2z" fill="#d2873a"/>
    <path d="M44 28c-2 10 0 20 4 28M60 24v32M76 28c2 10 0 20-4 28" fill="none" stroke="#a8601d" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 40c2-4 6-8 10-10" fill="none" stroke="#f0bb7a" stroke-width="3" stroke-linecap="round"/>`,
  baked: `
    <ellipse cx="60" cy="62" rx="34" ry="5" fill="#000" opacity=".08"/>
    <path d="M30 56c0-20 13-34 30-34s30 14 30 34z" fill="#e3a35a"/>
    <path d="M60 24v32M47 27l7 29M73 27l-7 29M37 35l15 21M83 35L68 56" stroke="#c4823a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M30 56h60" stroke="#b46f2a" stroke-width="3" stroke-linecap="round"/>`,
  cake: `
    <ellipse cx="60" cy="64" rx="36" ry="5" fill="#000" opacity=".08"/>
    <path d="M28 40l52-18 12 18z" fill="#fff6ef"/>
    <rect x="28" y="40" width="64" height="22" rx="3" fill="#f3d9b8"/>
    <rect x="28" y="47" width="64" height="5" fill="#fff6ef"/>
    <rect x="28" y="56" width="64" height="3" fill="#e9b7c1"/>
    <path d="M28 40h64" stroke="#fff" stroke-width="3"/>
    <path d="M74 20c4-6 12-4 12 2 0 5-6 9-6 9s-8-4-6-11z" fill="#e2445c"/>
    <path d="M78 18c1-3 4-4 6-3" stroke="#3f9b4b" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  hard: `
    <ellipse cx="60" cy="62" rx="44" ry="5" fill="#000" opacity=".08"/>
    <rect x="12" y="34" width="96" height="22" rx="11" fill="#c78a45" transform="rotate(-12 60 45)"/>
    <g stroke="#f1cf96" stroke-width="3.5" stroke-linecap="round" transform="rotate(-12 60 45)"><path d="M28 40l10 8M48 40l10 8M68 40l10 8M88 40l8 6"/></g>`,
  loaf: `
    <ellipse cx="60" cy="64" rx="34" ry="5" fill="#000" opacity=".08"/>
    <path d="M32 62V38c-6-2-8-8-6-12 3-7 14-10 20-6 4-4 10-6 14-6s10 2 14 6c6-4 17-1 20 6 2 4 0 10-6 12v24z" fill="#d79a52"/>
    <path d="M38 62V40c-4-1-6-5-4-8 2-4 9-6 13-3 4-4 9-5 13-5s9 1 13 5c4-3 11-1 13 3 2 3 0 7-4 8v22z" fill="#fbecd2"/>`,
  sweet: `
    <ellipse cx="60" cy="62" rx="32" ry="5" fill="#000" opacity=".08"/>
    <ellipse cx="60" cy="44" rx="30" ry="20" fill="#c9783c"/>
    <ellipse cx="60" cy="40" rx="24" ry="13" fill="#d98c4c"/>
    <ellipse cx="52" cy="35" rx="9" ry="4" fill="#efb27a" opacity=".7"/>
    <g fill="#fff8e8"><ellipse cx="58" cy="38" rx="1.6" ry="1"/><ellipse cx="64" cy="42" rx="1.6" ry="1"/><ellipse cx="54" cy="44" rx="1.6" ry="1"/><ellipse cx="68" cy="36" rx="1.6" ry="1"/><ellipse cx="60" cy="47" rx="1.6" ry="1"/></g>`,
};

// 같은 종류라도 빵집마다 배경 무늬 위치가 조금씩 달라 보이게 이름으로 값을 정함
function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

export function coverSvg(bakery, category = categoryOf(bakery)) {
  const h = hash(bakery.slug ?? bakery.name);
  const dx = (h % 40) - 20;
  const rot = (h % 30) - 15;
  const [c1, c2] = category.bg;
  const id = `g${h}`;
  return `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${category.label} 일러스트">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <radialGradient id="shine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="120" height="80" fill="url(#${id})"/>
    <g fill="#fff" opacity=".35"><circle cx="${18 + dx}" cy="14" r="9"/><circle cx="${104 - dx}" cy="70" r="13"/><circle cx="${100 + dx / 2}" cy="12" r="4"/></g>
    <g transform="rotate(${rot / 3} 60 42)">${ART[category.id]}</g>
  </svg>`;
}
