// 작성일시: 2026-11-03 12:00
// 화면 라우팅과 렌더링. 주소 형식: ?bakery=<slug> · ?course=<slug> · ?tab=courses|map (없으면 빵집 목록)

import { fetchBakeries, fetchCourses, fetchHotBakeries, recordView } from "./api.js";
import { hasKakaoKey, renderMap, placeUrl, directionsUrl } from "./kakao.js";
import { CATEGORIES, categoryOf, coverSvg } from "./category.js";
import { mascotNode, MASCOTS } from "./mascot.js";
import { el, toast, distanceKm } from "./dom.js";
import { starField, smileStarSvg, starSvg, logoStarSvg } from "./stars.js";
import { initLive, onLiveChange, liveBadge, liveCard, liveBakeries, liveClassFor, liveStatus, deviceId, WAIT_LEVELS, timeAgo } from "./live.js";

const DISTRICTS = ["전체", "동구", "중구", "서구", "유성구", "대덕구"];
const SOURCES = [
  { id: "all", label: "모든 출처" },
  { id: "시민추천 BEST5", label: "시민추천 BEST 5" },
  { id: "시민추천", label: "대전시 시민추천" },
  { id: "대전시 소개", label: "대전시 소개" },
  { id: "언론·리뷰 소개", label: "언론·리뷰 소개" },
];
const TRANSPORT_ICONS = { 도보: "🚶", 대중교통: "🚇", 차량: "🚗" };

const view = document.getElementById("view");
const navLinks = document.querySelectorAll(".bottom-nav a");

// 목록·지도 필터는 화면을 오가도 유지
const listState = { query: "", district: "전체", category: "all", source: "all" };
const mapState = { category: "all", source: "all" };

function routeHref(params) {
  const search = new URLSearchParams(params).toString();
  return search ? `?${search}` : location.pathname;
}

// 내부 링크: 새로고침 없이 주소만 바꾸고 다시 그림
function link(params, attrs, ...children) {
  return el("a", {
    ...attrs,
    href: routeHref(params),
    onclick: (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      navigate(params);
    },
  }, ...children);
}

function navigate(params) {
  history.pushState(null, "", routeHref(params));
  render();
  window.scrollTo(0, 0);
}

function setActiveTab(tab) {
  navLinks.forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  document.body.classList.toggle("map-mode", tab === "map");
}

function showMessage(text) {
  view.replaceChildren(el("p", { className: "message" }, text));
}

async function shareLink(title, text) {
  const url = location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // 사용자가 공유 시트를 닫은 경우
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("링크를 복사했어요");
  } catch {
    toast("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
  }
}

// ---------- 공통 조각 ----------

// 대표 이미지 우선순위: 직접 찍었거나 허락받은 사진(image_url) → 카카오 이미지 검색 결과 썸네일 → 메뉴 종류 일러스트
// (SVG는 코드가 만든 고정 문자열). 사진을 못 불러오면 일러스트로 바꿈
function cover(bakery, className = "cover", { credit = false } = {}) {
  const category = categoryOf(bakery);
  const box = el("div", { className, style: `--cat:${category.color}` });
  const src = bakery.image_url ?? bakery.photo_thumb_url;
  if (!src) {
    box.innerHTML = coverSvg(bakery, category);
    return box;
  }
  const img = el("img", { src, alt: `${bakery.name} 사진`, loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => {
    box.className = className;
    box.innerHTML = coverSvg(bakery, category);
  }, { once: true });
  if (bakery.image_url) {
    box.append(img);
  } else {
    // 검색 썸네일은 130px라 크게 늘리면 흐려짐: 같은 사진을 흐리게 깐 배경 위에 원래 크기 가까이 올림
    box.classList.add("search-photo");
    box.append(el("span", { className: "photo-blur", style: `background-image:url("${src}")`, "aria-hidden": "true" }), img);
  }
  // 검색 결과 사진은 원본 글 출처를 사진 위에 표시
  if (credit && !bakery.image_url && bakery.photo_doc_url) {
    box.append(el("a", { className: "photo-credit", href: bakery.photo_doc_url, target: "_blank", rel: "noopener" }, `📷 ${bakery.photo_site ?? "출처"}`));
  }
  return box;
}

function categoryBadge(bakery) {
  const category = categoryOf(bakery);
  return el("span", { className: "cat-badge", style: `--cat:${category.color}` }, `${category.emoji} ${category.label}`);
}

function sourceBadges(bakery) {
  const tags = bakery.tags ?? [];
  if (!tags.length) return null;
  return el("div", { className: "badges" },
    tags.map((tag) => el("span", { className: `badge ${tag.startsWith("시민추천") ? "badge-gold" : ""}` }, tag)),
  );
}

function menuChips(menus, limit = menus?.length) {
  if (!menus?.length) return null;
  return el("ul", { className: "chips" }, menus.slice(0, limit).map((menu) => el("li", {}, menu)));
}

// extra: 카드 커버 왼쪽 위에 붙일 추가 표시 (예: 핫한 빵집 순위)
function bakeryCard(bakery, { extra, meta } = {}) {
  const coverNode = cover(bakery);
  coverNode.append(liveBadge(bakery, "on-cover"));
  if (extra) coverNode.append(extra);
  return el("li", { className: "card" },
    link({ bakery: bakery.slug }, { className: "card-link" },
      coverNode,
      el("div", { className: "card-body" },
        meta,
        el("div", { className: "card-meta" }, categoryBadge(bakery), el("span", { className: "district" }, bakery.district)),
        el("h3", {}, bakery.name),
        el("p", { className: "card-menus" }, bakery.signature_menus.slice(0, 3).join(" · ") || "대표 메뉴 정보 준비 중"),
        bakery.tags?.some((t) => t.startsWith("시민추천")) && el("span", { className: "mini-badge" }, "대전시 시민추천"),
      ),
    ),
  );
}

// 가로 칩 묶음. 고르면 onPick(id) 호출 후 활성 표시만 갱신
function chipGroup(label, options, current, onPick, className = "") {
  const group = el("div", { className: `chip-row ${className}`, role: "group", "aria-label": label });
  options.forEach(({ id, text, color }) => {
    group.append(el("button", {
      type: "button",
      className: id === current ? "chip active" : "chip",
      style: color ? `--cat:${color}` : null,
      "aria-pressed": String(id === current),
      onclick: (event) => {
        group.querySelectorAll(".chip").forEach((b) => {
          const on = b === event.currentTarget;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        onPick(id);
      },
    }, text));
  });
  return group;
}

const categoryOptions = () => [
  { id: "all", text: "전체" },
  ...CATEGORIES.map((c) => ({ id: c.id, text: `${c.emoji} ${c.label}`, color: c.color })),
];

function matchesSource(bakery, source) {
  if (source === "all") return true;
  return (bakery.tags ?? []).some((tag) => tag.startsWith(source));
}

// ---------- 지금 현장 소식 · 요즘 핫한 빵집 ----------

// 첫 화면 "지금 현장" 소식판: 최근 90분 제보가 있는 빵집을 한 줄씩, 누르면 상세로 이동
const TICKER_VISIBLE = 4;

function liveTicker(bakeries) {
  const section = el("section", { className: "live-ticker", id: "live-now", "aria-label": "지금 현장 소식" });
  const seen = new Set(); // 처음 그린 뒤 새로 들어온 제보만 반짝이게
  let firstFill = true;
  let expanded = false;

  const row = ({ bakery, report }) => {
    const level = WAIT_LEVELS[report.wait_level];
    const isNew = !firstFill && !seen.has(report.id);
    seen.add(report.id);
    return el("li", { className: isNew ? "is-new" : null, style: `--live:${level.color}` },
      link({ bakery: bakery.slug }, { className: "ticker-row" },
        cover(bakery, "cover ticker-thumb"),
        el("div", { className: "ticker-main" },
          el("div", { className: "ticker-line" },
            el("strong", {}, bakery.name),
            el("span", { className: "ticker-level" }, el("span", { className: "live-dot" }), level.label),
          ),
          el("p", { className: "ticker-sub" },
            report.memo ? `“${report.memo}”` : [bakery.district, report.queue_count != null && `줄 약 ${report.queue_count}명`].filter(Boolean).join(" · "),
          ),
        ),
        el("span", { className: "ticker-time" }, timeAgo(report.created_at)),
        el("span", { className: "ticker-go", "aria-hidden": "true" }, "›"),
      ),
    );
  };

  const fill = () => {
    const items = liveBakeries(bakeries);
    const shown = expanded ? items : items.slice(0, TICKER_VISIBLE);
    // replaceChildren은 false를 글자로 넣으므로 빈 값은 걸러서 넣음
    const children = [
      el("div", { className: "ticker-head" },
        el("h2", {}, "📣 지금 현장"),
        liveStatus(),
        el("span", { className: "ticker-count" }, items.length ? `최근 90분 · ${items.length}곳` : "최근 90분"),
      ),
      items.length
        ? el("ul", { className: "ticker-list" }, shown.map(row))
        : el("p", { className: "ticker-empty" },
          el("span", { className: "ticker-empty-star", "aria-hidden": "true" }),
          "아직 올라온 현장 소식이 없어요. 빵집에 계시면 상세 화면에서 첫 소식을 알려 주세요!",
        ),
      items.length > TICKER_VISIBLE && el("button", {
        type: "button",
        className: "ticker-more",
        onclick: () => { expanded = !expanded; fill(); },
      }, expanded ? "접기" : `+${items.length - TICKER_VISIBLE}곳 더 보기`),
    ];
    section.replaceChildren(...children.filter(Boolean));
    items.forEach(({ report }) => seen.add(report.id));
    firstFill = false;
  };
  fill();
  // 새 제보·1분 시계에 맞춰 다시 그림. 다른 화면으로 넘어가 이 영역이 사라지면 구독 해제
  const stop = onLiveChange(() => (section.isConnected ? fill() : stop()));
  return section;
}

// 최근 7일 조회 + 제보 순위 (불러오는 동안·자료가 없으면 숨김)
function hotSection(bakeries) {
  const section = el("section", { hidden: "" });
  const byId = new Map(bakeries.map((b) => [b.id, b]));
  fetchHotBakeries(10).then((rows) => {
    const items = rows.filter((r) => r.score > 0 && byId.has(r.bakery_id));
    if (!items.length) return;
    section.hidden = false;
    section.append(
      el("div", { className: "section-head" },
        el("h2", { className: "dots" }, "🔥 요즘 핫한 빵집"),
        el("p", {}, "최근 7일 조회·제보 순"),
      ),
      el("ul", { className: "rail" }, items.map((row, i) => bakeryCard(byId.get(row.bakery_id), {
        extra: el("span", { className: `rank rank-${i + 1}` }, `${i + 1}`),
        meta: el("p", { className: "hot-meta" }, `👀 ${row.views_7d} · 📣 ${row.reports_7d}`),
      }))),
    );
  }).catch((error) => console.warn(error));
  return section;
}

// ---------- 소개 카드 ----------

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// 0부터 목표값까지 올라가는 숫자
function countUp(node, target, duration = 1100) {
  if (reduceMotion()) {
    node.textContent = String(target);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    node.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  node.textContent = "0";
  requestAnimationFrame(tick);
}

function statBox(icon, label, value, className) {
  const number = el("dd", {}, String(value));
  countUp(number, value);
  return el("div", { className: `stat ${className}` },
    el("span", { className: "stat-icon", "aria-hidden": "true" }, icon),
    el("dt", {}, label),
    number,
  );
}

// 구별 캐릭터들이 언덕길을 따라 폴짝폴짝 행진하는 장면 + 궤도를 도는 별 + 떠오르는 빵
function introScene() {
  const parade = el("div", { className: "parade" },
    ["동구", "중구", "서구", "유성구", "대덕구"].map((district, i) =>
      el("div", { className: "parade-item", style: `--i:${i}` }, mascotNode(district, { pose: i === 0 ? 1 : 0 })),
    ),
  );
  const breads = el("div", { className: "float-breads" },
    ["🥐", "🍞", "🥯", "🧁", "🥖"].map((b, i) => el("span", { style: `--i:${i}` }, b)),
  );
  const orbitStar = el("span", { className: "orbit-star" });
  orbitStar.innerHTML = starSvg("#ffd54a");
  // 궤도는 카드 모서리에, 행진 장면은 글 옆(모바일은 아래)에 놓이도록 둘을 나눠 돌려줌
  return [
    el("div", { className: "orbit", "aria-hidden": "true" }, orbitStar),
    el("div", { className: "intro-scene", "aria-hidden": "true" },
      el("div", { className: "hill" }),
      breads,
      parade,
    ),
  ];
}

// 웃는 별과 함께 하는 꼬리말
function starFooter() {
  const icon = el("div", { className: "smile-star" });
  icon.innerHTML = smileStarSvg();
  return el("footer", { className: "star-footer" },
    starField({ count: 8, seed: 41, maxSize: 13 }),
    icon,
    el("p", { className: "star-footer-title" }, "빵과 별의 도시, 대전"),
    el("p", { className: "muted small" }, "대전시 시민추천 빵집과 언론·리뷰 자료를 모아 만들었어요. 영업 정보는 방문 전에 확인해 주세요."),
    el("div", { className: "maker" },
      el("span", { className: "maker-label" }, "만든이"),
      el("strong", {}, "hyunjo"),
      el("div", { className: "maker-links" },
        el("a", { href: "mailto:hyunjog@gmail.com" }, "✉ hyunjog@gmail.com"),
        el("a", { href: "https://github.com/winsHyun", target: "_blank", rel: "noopener" }, "GitHub @winsHyun"),
      ),
    ),
  );
}

// ---------- 빵집 목록 ----------

function renderBakeryList(bakeries, courses) {
  setActiveTab("bakeries");
  document.title = "대전 빵지순례";

  const grid = el("ul", { className: "card-grid" });
  const count = el("p", { className: "result-count" });
  const featured = el("section", { className: "featured" });

  const update = () => {
    const query = listState.query.trim().toLowerCase();
    const filtered = bakeries.filter((b) =>
      (listState.district === "전체" || b.district === listState.district) &&
      (listState.category === "all" || categoryOf(b).id === listState.category) &&
      matchesSource(b, listState.source) &&
      (!query || [b.name, b.brand ?? "", b.address, ...b.signature_menus].some((text) => text.toLowerCase().includes(query))),
    );
    const filtering = query || listState.district !== "전체" || listState.category !== "all" || listState.source !== "all";
    featured.hidden = Boolean(filtering);
    count.textContent = filtering ? `${filtered.length}곳을 찾았어요` : `전체 ${filtered.length}곳`;
    grid.replaceChildren(...filtered.map(bakeryCard));
    if (!filtered.length) grid.append(el("li", { className: "message" }, "조건에 맞는 빵집이 없어요."));
  };

  // 꼭 가볼 곳: 성심당 본점 + 시민추천 BEST5
  const picks = bakeries.filter((b) => b.slug === "sungsimdang-main" || b.tags.includes("시민추천 BEST5"));
  featured.append(
    hotSection(bakeries),
    el("div", { className: "section-head" },
      el("h2", { className: "dots" }, "꼭 가볼 곳"),
      el("p", {}, "성심당 본점과 대전시민이 뽑은 BEST 5"),
    ),
    el("ul", { className: "rail" }, picks.map(bakeryCard)),
    el("div", { className: "section-head" },
      el("h2", { className: "dots" }, "추천 코스"),
      link({ tab: "courses" }, { className: "more" }, "전체 보기 →"),
    ),
    el("ul", { className: "rail" }, courses.slice(0, 4).map((c) => courseCard(c, bakeries))),
  );

  const search = el("input", {
    type: "search",
    className: "search",
    placeholder: "빵집, 메뉴, 동네 검색 (예: 소금빵, 도안동)",
    value: listState.query,
    "aria-label": "빵집 검색",
    oninput: (event) => {
      listState.query = event.target.value;
      update();
    },
  });

  const citizenCount = bakeries.filter((b) => b.tags.includes("시민추천")).length;
  const allSection = el("div", { className: "section-head", id: "all-bakeries" }, el("h2", { className: "dots" }, "모든 빵집"), count);

  // 필터를 바꾸고 목록 위치로 이동 (구별 캐릭터·BEST5 배너에서 사용)
  const jumpToList = (patch) => {
    Object.assign(listState, patch);
    renderBakeryList(bakeries, courses);
    document.getElementById("all-bakeries")?.scrollIntoView({ behavior: "smooth" });
  };

  view.replaceChildren(
    el("section", { className: "intro-card" },
      el("div", { className: "intro-text" },
        el("p", { className: "eyebrow" }, "2026 빵지순례 in 대전"),
        el("h1", {}, "우리 동네 숨겨진", el("br"), el("span", { className: "marker" }, "빵 맛집"), "을 모두 모아", el("span", { className: "title-sparkle", "aria-hidden": "true" })),
        el("p", { className: "intro-sub" }, "빵의 도시 대전! 대전시 시민추천 빵집과 언론에 소개된 빵집을 한곳에 모았어요."),
        el("dl", { className: "stats" },
          statBox("🍞", "빵집", bakeries.length, "stat-bread"),
          statBox("⭐", "시민추천", citizenCount, "stat-star"),
          statBox("🗺️", "코스", courses.length, "stat-course"),
        ),
        link({ tab: "map" }, { className: "button primary intro-cta" }, "빵지순례 지도 열기 →"),
      ),
      introScene(),
      starField({ count: 11, seed: 3, minSize: 10, maxSize: 22, shooting: true }),
    ),
    liveTicker(bakeries),
    el("button", { type: "button", className: "best-banner", onclick: () => jumpToList({ source: "시민추천 BEST5", district: "전체", category: "all", query: "" }) },
      el("span", {}, "대전인이 추천하는 빵집 ", el("strong", {}, "BEST 5")),
      el("span", { className: "round-arrow", "aria-hidden": "true" }, "→"),
      starField({ count: 6, seed: 11, maxSize: 14 }),
    ),
    el("section", { className: "district-banner", "aria-label": "구별 빵집" },
      starField({ count: 12, seed: 21, minSize: 7, maxSize: 14 }),
      DISTRICTS.slice(1).map((district, i) => el("button", {
        type: "button",
        className: "district-item",
        onclick: () => jumpToList({ district, source: "all", category: "all", query: "" }),
      },
        el("span", { className: "pill" }, `${district}의 빵 →`),
        mascotNode(district, { pose: i % 2 }),
        el("span", { className: "mascot-name" }, MASCOTS[district].name),
        el("span", { className: "district-count" }, `${MASCOTS[district].motif} · ${bakeries.filter((b) => b.district === district).length}곳`),
      )),
    ),
    el("div", { className: "filters" },
      search,
      chipGroup("빵 종류", categoryOptions(), listState.category, (id) => { listState.category = id; update(); }, "scroll"),
      chipGroup("지역", DISTRICTS.map((d) => ({ id: d, text: d })), listState.district, (id) => { listState.district = id; update(); }, "scroll"),
      chipGroup("출처", SOURCES.map((s) => ({ id: s.id, text: s.label })), listState.source, (id) => { listState.source = id; update(); }, "scroll small"),
    ),
    featured,
    allSection,
    grid,
    starFooter(),
  );
  update();
}

// ---------- 빵집 상세 ----------

function infoRow(icon, label, value) {
  if (!value) return null;
  return el("div", { className: "info-row" },
    el("dt", {}, el("span", { "aria-hidden": "true" }, icon), " ", label),
    el("dd", {}, value),
  );
}

function pinFor(bakery, label, onClick) {
  const category = categoryOf(bakery);
  return el("button", {
    type: "button",
    className: `pin ${liveClassFor(bakery.id)}`,
    "data-live-pin": bakery.id,
    style: `--cat:${category.color}`,
    title: bakery.name,
    "aria-label": bakery.name,
    onclick: onClick,
  }, el("span", { className: "pin-head" }, el("span", {}, label ?? category.emoji)));
}

function mapBox(bakeries, options = {}) {
  if (!hasKakaoKey() || !bakeries.some((b) => b.lat != null)) return null;
  const box = el("div", { className: "map-box", role: "region", "aria-label": "지도" });
  // 요소가 화면에 붙은 뒤 지도를 그려야 크기가 맞음
  requestAnimationFrame(() => {
    renderMap(box, bakeries, {
      makePin: (b, i) => pinFor(b, options.numbered ? String(i + 1) : null, () => options.onSelect?.(b)),
      withPath: options.withPath,
    }).catch(() => {
      box.replaceChildren(el("p", { className: "message" }, "지도를 불러오지 못했어요."));
    });
  });
  return box;
}

function renderBakeryDetail(bakery, bakeries, courses) {
  setActiveTab("bakeries");
  document.title = `${bakery.name} · 대전 빵지순례`;

  const relatedCourses = courses.filter((c) => c.course_stops.some((s) => s.bakery_id === bakery.id));
  const siblings = bakery.brand ? bakeries.filter((b) => b.brand === bakery.brand && b.id !== bakery.id) : [];
  const nearby = bakery.lat == null ? [] : bakeries
    .filter((b) => b.id !== bakery.id && b.lat != null)
    .map((b) => ({ bakery: b, km: distanceKm(bakery, b) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 6);

  recordView(bakery.slug, deviceId());

  view.replaceChildren(
    el("article", { className: "detail" },
      el("div", { className: "detail-cover" },
        cover(bakery, "cover cover-hero", { credit: true }),
        link({}, { className: "back-float", "aria-label": "빵집 목록으로" }, "←"),
      ),
      el("div", { className: "detail-body" },
        el("div", { className: "card-meta" }, categoryBadge(bakery), el("span", { className: "district" }, [bakery.district, bakery.brand].filter(Boolean).join(" · "))),
        el("h1", {}, bakery.name),
        bakery.description && el("p", { className: "lead" }, bakery.description),
        sourceBadges(bakery),
        liveCard(bakery),
        el("h2", { className: "label" }, "대표 메뉴"),
        menuChips(bakery.signature_menus) ?? el("p", { className: "muted" }, "메뉴 정보 준비 중"),
        bakery.photos?.length > 0 && el("section", { className: "photo-strip" },
          el("h2", { className: "label" }, "블로그·리뷰 사진 ", el("span", { className: "muted small" }, "(카카오 이미지 검색 결과)")),
          el("ul", {},
            bakery.photos.map((photo) => el("li", {},
              el("a", { href: photo.doc, target: "_blank", rel: "noopener", title: `${photo.site} 원본 글 보기` },
                el("img", { src: photo.thumb, alt: `${bakery.name} 관련 사진 (${photo.site})`, loading: "lazy", referrerpolicy: "no-referrer" }),
                el("span", {}, photo.site),
              ),
            )),
          ),
        ),
        el("dl", { className: "info" },
          infoRow("📍", "주소", bakery.address),
          infoRow("🕘", "영업", bakery.hours_text ?? "카카오맵에서 확인해 주세요"),
          infoRow("🚫", "휴무", bakery.closed_text),
          infoRow("💡", "팁", bakery.tips),
        ),
        el("div", { className: "actions" },
          el("a", { className: "button", href: placeUrl(bakery), target: "_blank", rel: "noopener" }, "카카오맵"),
          el("a", { className: "button", href: directionsUrl(bakery), target: "_blank", rel: "noopener" }, "길찾기"),
          el("button", {
            type: "button",
            className: "button primary",
            onclick: () => shareLink(bakery.name, `${bakery.name} - 대전 빵지순례`),
          }, "공유하기"),
        ),
        mapBox([bakery]),
        relatedCourses.length > 0 && el("section", { className: "sub" },
          el("h2", {}, "이 빵집이 있는 코스"),
          el("ul", { className: "link-list" },
            relatedCourses.map((c) => el("li", {}, link({ course: c.slug }, {}, `${TRANSPORT_ICONS[c.transport] ?? ""} ${c.title}`))),
          ),
        ),
        siblings.length > 0 && el("section", { className: "sub" },
          el("h2", {}, `다른 ${bakery.brand} 매장`),
          el("ul", { className: "rail small" }, siblings.map(bakeryCard)),
        ),
        nearby.length > 0 && el("section", { className: "sub" },
          el("h2", {}, "가까운 빵집"),
          el("ul", { className: "nearby" },
            nearby.map(({ bakery: b, km }) => el("li", {},
              link({ bakery: b.slug }, { className: "nearby-link" },
                cover(b, "cover cover-thumb"),
                el("span", { className: "nearby-name" }, b.name),
                el("span", { className: "nearby-km" }, km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`),
              ),
            )),
          ),
        ),
        el("p", { className: "source" },
          "영업 정보는 바뀔 수 있어요. 방문 전에 확인하세요. ",
          bakery.source_url && el("a", { href: bakery.source_url, target: "_blank", rel: "noopener" }, "정보 출처"),
          bakery.checked_at && ` · ${bakery.checked_at} 확인`,
          !bakery.image_url && (bakery.photo_thumb_url
            ? [" · 사진은 카카오 이미지 검색 결과이며 저작권은 ", el("a", { href: bakery.photo_doc_url, target: "_blank", rel: "noopener" }, "원본 글"), " 작성자에게 있어요. 실제 매장과 다를 수 있어요."]
            : " · 이미지는 대표 메뉴 일러스트예요."),
        ),
      ),
    ),
  );
}

// ---------- 코스 ----------

function courseCard(course, bakeries) {
  const byId = new Map(bakeries.map((b) => [b.id, b]));
  const stops = course.course_stops.map((s) => byId.get(s.bakery_id)).filter(Boolean);
  return el("li", { className: "card course-card" },
    link({ course: course.slug }, { className: "card-link" },
      el("div", { className: "course-covers" }, stops.slice(0, 3).map((b) => cover(b, "cover"))),
      el("div", { className: "card-body" },
        el("div", { className: "card-meta" },
          el("span", { className: "cat-badge plain" }, `${TRANSPORT_ICONS[course.transport] ?? ""} ${course.transport}`),
          el("span", { className: "district" }, `⏱ ${course.duration_text}`),
        ),
        el("h3", {}, course.title),
        el("p", { className: "card-menus" }, stops.map((b) => b.name).join(" → ")),
      ),
    ),
  );
}

function renderCourseList(courses, bakeries) {
  setActiveTab("courses");
  document.title = "추천 코스 · 대전 빵지순례";
  view.replaceChildren(
    el("section", { className: "page-head starry" },
      starField({ count: 7, seed: 31, maxSize: 15 }),
      el("p", { className: "hero-eyebrow" }, "COURSES"),
      el("h1", {}, "추천 코스"),
      el("p", { className: "hero-sub" }, "동선을 고려해 묶은 빵지순례 코스예요. 이동 시간은 직선거리로 추정했어요."),
    ),
    el("ul", { className: "card-grid wide" }, courses.map((c) => courseCard(c, bakeries))),
  );
}

function renderCourseDetail(course, bakeries) {
  setActiveTab("courses");
  document.title = `${course.title} · 대전 빵지순례`;
  const byId = new Map(bakeries.map((b) => [b.id, b]));
  const stops = course.course_stops.map((s) => ({ ...s, bakery: byId.get(s.bakery_id) })).filter((s) => s.bakery);

  view.replaceChildren(
    link({ tab: "courses" }, { className: "back" }, "← 코스 목록"),
    el("article", { className: "detail course-detail" },
      el("div", { className: "card-meta" },
        el("span", { className: "cat-badge plain" }, `${TRANSPORT_ICONS[course.transport] ?? ""} ${course.transport}`),
        el("span", { className: "district" }, `⏱ ${course.duration_text} · 빵집 ${stops.length}곳`),
      ),
      el("h1", {}, course.title),
      el("p", { className: "lead" }, course.summary),
      course.tips && el("p", { className: "tip" }, `💡 ${course.tips}`),
      mapBox(stops.map((s) => s.bakery), { withPath: true, numbered: true, onSelect: (b) => navigate({ bakery: b.slug }) }),
      el("div", { className: "actions" },
        el("button", {
          type: "button",
          className: "button primary",
          onclick: () => shareLink(course.title, `${course.title} - 대전 빵지순례`),
        }, "이 코스 공유하기"),
      ),
      el("ol", { className: "stops" },
        el("li", { className: "stop-start" }, `출발 · ${course.start_point}`),
        stops.map((stop) => el("li", { className: "stop" },
          stop.move_min != null && el("p", { className: "move" }, `${TRANSPORT_ICONS[course.transport] ?? ""} 약 ${stop.move_min}분 (직선거리 기준 추정)`),
          stop.note && el("p", { className: "move" }, stop.note),
          link({ bakery: stop.bakery.slug }, { className: "stop-card" },
            cover(stop.bakery, "cover cover-thumb"),
            el("div", {},
              el("h3", {}, stop.bakery.name),
              el("p", { className: "card-menus" }, stop.bakery.signature_menus.slice(0, 3).join(" · ")),
              liveBadge(stop.bakery),
              el("p", { className: "meta" }, [stop.bakery.hours_text, stop.bakery.closed_text].filter(Boolean).join(" · ") || "영업시간은 카카오맵에서 확인"),
            ),
          ),
        )),
      ),
    ),
  );
}

// ---------- 빵지순례 지도 ----------

function sourceSummary(bakeries) {
  const count = (tag) => bakeries.filter((b) => b.tags.some((t) => t.startsWith(tag))).length;
  return el("div", { className: "sheet-body" },
    el("h2", {}, "지도 자료 출처"),
    el("p", { className: "muted" }, "인터넷에 공개된 자료를 모아 카카오 장소 검색으로 위치를 확인했어요."),
    el("ul", { className: "source-list" },
      el("li", {}, el("a", { href: "https://www.daejeon.go.kr/fod/BreadRecommendList.do?colmn1Cont=05&menuSeq=7833", target: "_blank", rel: "noopener" }, "대전시 「빵산책 in 대전」 시민추천 빵집"), ` · ${count("시민추천")}곳`),
      el("li", {}, el("a", { href: "https://www.daejeon.go.kr/fod/ContentsHtmlView.do?menuSeq=7834", target: "_blank", rel: "noopener" }, "대전시 시민추천 빵집 BEST 5"), ` · ${count("시민추천 BEST5")}곳`),
      el("li", {}, el("a", { href: "https://daejeon.go.kr/its/ItsdjNormalboardView.do?menuSeq=5931&boardSeq=3318&boardGubun=itsdj01&pageIndex=1", target: "_blank", rel: "noopener" }, "대전시 「성심당만큼 유명해진 로컬 빵집」"), ` · ${count("대전시 소개")}곳`),
      el("li", {}, "언론 기사·리뷰 사이트(위키트리, 다이닝코드 등)", ` · ${count("언론·리뷰 소개")}곳`),
    ),
    el("p", { className: "muted small" }, "핀 색은 대표 메뉴로 나눈 빵 종류예요. 영업 정보는 바뀔 수 있으니 방문 전에 확인하세요."),
  );
}

function renderMapTab(bakeries) {
  setActiveTab("map");
  document.title = "빵지순례 지도 · 대전 빵지순례";

  if (!hasKakaoKey()) {
    view.replaceChildren(el("p", { className: "message" }, "지도를 준비 중이에요."));
    return;
  }

  const box = el("div", { className: "map-full", role: "region", "aria-label": "빵지순례 지도" });
  const sheet = el("div", { className: "sheet", hidden: true });
  const counter = el("span", { className: "map-count" });
  let handle = null;
  let selectedPin = null;

  const closeSheet = () => {
    sheet.hidden = true;
    selectedPin?.classList.remove("selected");
    selectedPin = null;
  };

  const openSheet = (content) => {
    sheet.replaceChildren(
      el("button", { type: "button", className: "sheet-close", "aria-label": "닫기", onclick: closeSheet }, "✕"),
      content,
    );
    sheet.hidden = false;
  };

  const select = (bakery, pin) => {
    selectedPin?.classList.remove("selected");
    selectedPin = pin;
    pin.classList.add("selected");
    handle?.panTo(bakery);
    openSheet(el("div", { className: "sheet-bakery" },
      cover(bakery, "cover cover-thumb"),
      el("div", { className: "sheet-info" },
        el("div", { className: "card-meta" }, categoryBadge(bakery), el("span", { className: "district" }, bakery.district)),
        el("h2", {}, bakery.name),
        liveBadge(bakery),
        el("p", { className: "card-menus" }, bakery.signature_menus.slice(0, 3).join(" · ")),
        el("div", { className: "actions compact" },
          link({ bakery: bakery.slug }, { className: "button primary" }, "자세히 보기"),
          el("a", { className: "button", href: directionsUrl(bakery), target: "_blank", rel: "noopener" }, "길찾기"),
        ),
      ),
    ));
  };

  const applyFilter = ({ refit = true } = {}) => {
    const shown = [];
    for (const b of bakeries) {
      const visible = (mapState.category === "all" || categoryOf(b).id === mapState.category) &&
        (mapState.source === "live" ? Boolean(liveClassFor(b.id)) : matchesSource(b, mapState.source));
      handle?.setVisible(b.id, visible);
      if (visible) shown.push(b);
    }
    counter.textContent = `${shown.length}곳`;
    if (refit) handle?.fitTo(shown);
    closeSheet();
  };

  view.replaceChildren(
    el("div", { className: "map-page" },
      box,
      el("div", { className: "map-top" },
        el("div", { className: "map-title" },
          el("h1", {}, "빵지순례 지도"),
          counter,
          el("button", { type: "button", className: "info-button", onclick: () => openSheet(sourceSummary(bakeries)) }, "ⓘ 자료 출처"),
        ),
        chipGroup("빵 종류", categoryOptions(), mapState.category, (id) => { mapState.category = id; applyFilter(); }, "scroll floating"),
        chipGroup("출처", [SOURCES[0], { id: "live", text: "📣 지금 제보 있는 곳" }, ...SOURCES.slice(1)].map((s) => ({ id: s.id, text: s.text ?? s.label })), mapState.source, (id) => { mapState.source = id; applyFilter(); }, "scroll floating small"),
      ),
      sheet,
    ),
  );

  requestAnimationFrame(async () => {
    try {
      handle = await renderMap(box, bakeries, {
        makePin: (b) => {
          const pin = pinFor(b, null, () => select(b, pin));
          return pin;
        },
        padding: [170, 30, 30, 30],
        zoomControl: true,
      });
      applyFilter();
    } catch {
      box.replaceChildren(el("p", { className: "message" }, "지도를 불러오지 못했어요."));
    }
  });
}

// ---------- 라우터 ----------

async function render() {
  const params = new URLSearchParams(location.search);
  try {
    const [bakeries, courses] = await Promise.all([fetchBakeries(), fetchCourses()]);

    if (params.has("bakery")) {
      const bakery = bakeries.find((b) => b.slug === params.get("bakery"));
      return bakery ? renderBakeryDetail(bakery, bakeries, courses) : showMessage("빵집을 찾을 수 없어요.");
    }
    if (params.has("course")) {
      const course = courses.find((c) => c.slug === params.get("course"));
      return course ? renderCourseDetail(course, bakeries) : showMessage("코스를 찾을 수 없어요.");
    }
    if (params.get("tab") === "courses") return renderCourseList(courses, bakeries);
    if (params.get("tab") === "map") return renderMapTab(bakeries);
    return renderBakeryList(bakeries, courses);
  } catch (error) {
    console.error(error);
    showMessage("정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

navLinks.forEach((a) => {
  a.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(a.dataset.tab === "bakeries" ? {} : { tab: a.dataset.tab });
  });
});

// 헤더 로고 아이콘을 빵 별 캐릭터로 교체
const logoIcon = document.querySelector(".logo-icon");
if (logoIcon) {
  logoIcon.innerHTML = logoStarSvg();
  logoIcon.classList.add("logo-star-char");
}

window.addEventListener("popstate", render);
initLive();
render();
