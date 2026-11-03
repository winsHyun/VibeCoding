// 작성일시: 2026-11-03 18:10
// 방문자 수(누적·오늘·어제)와 현재 접속자. 헤더 알약과 꼬리말 방문자 판을 그림
// data-visitors 속성이 붙은 요소는 숫자가 바뀌면 자동으로 다시 채워짐

import { recordVisit, joinPresence } from "./api.js";
import { el } from "./dom.js";

const state = { total: null, today: null, yesterday: null, online: null };

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const format = (n) => (n == null ? "–" : n.toLocaleString("ko-KR"));

// 이전 값에서 새 값까지 숫자가 굴러가듯 올라감
function rollTo(node, target) {
  const from = Number(node.dataset.value) || 0; // 처음엔 "null"·"" 이라 0부터
  node.dataset.value = String(target);
  if (target == null) return void (node.textContent = "–");
  if (reduceMotion() || from === target) return void (node.textContent = format(target));
  const start = performance.now();
  const duration = 900;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    node.textContent = format(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  node.closest(".visit-stat, .online-pill")?.classList.remove("bump");
  void node.offsetWidth; // 애니메이션 다시 시작
  node.closest(".visit-stat, .online-pill")?.classList.add("bump");
}

function refresh() {
  document.querySelectorAll("[data-visitors]").forEach((node) => {
    const value = state[node.dataset.visitors];
    if (node.dataset.value !== String(value)) rollTo(node, value);
  });
  document.querySelectorAll(".online-pill").forEach((pill) => (pill.hidden = state.online == null));
}

export function initVisitors(device) {
  recordVisit(device)
    .then((counts) => {
      Object.assign(state, counts);
      refresh();
    })
    .catch((error) => console.warn(error));
  joinPresence(device, (count) => {
    state.online = Math.max(1, count); // 동기화 직후 0이 잠깐 오는 경우에도 나 자신은 셈
    refresh();
  });
}

// 헤더 오른쪽 "N명 보는 중" 알약. onClick은 첫 화면 꼬리말 방문자 판으로 이동하는 함수
export function onlinePill(onClick) {
  const number = el("strong", { "data-visitors": "online" }, format(state.online));
  number.dataset.value = String(state.online);
  return el("button", {
    type: "button",
    className: "online-pill",
    onclick: onClick,
    hidden: state.online == null ? "" : null,
    title: "지금 이 사이트를 보고 있는 사람 수",
  },
    el("span", { className: "online-dot", "aria-hidden": "true" }),
    number,
    el("span", {}, "명 보는 중"),
  );
}

function stat(key, icon, label, className) {
  const number = el("strong", { className: "visit-num", "data-visitors": key }, "–");
  number.dataset.value = "";
  return el("li", { className: `visit-stat ${className}` },
    el("span", { className: "visit-icon", "aria-hidden": "true" }, icon),
    el("span", { className: "visit-label" }, label),
    number,
  );
}

// 꼬리말 방문자 판: 지금 · 오늘 · 어제 · 누적
export function visitorBoard() {
  const board = el("section", { className: "visitor-board", id: "visitors", "aria-label": "방문자 수" },
    el("p", { className: "visit-title" }, "🧺 함께 빵지순례 중인 사람들"),
    el("ul", { className: "visit-stats" },
      stat("online", el("span", { className: "online-dot" }), "지금 접속", "visit-online"),
      stat("today", "☀️", "오늘", "visit-today"),
      stat("yesterday", "🌙", "어제", "visit-yesterday"),
      stat("total", "⭐", "누적", "visit-total"),
    ),
    el("p", { className: "visit-note" }, "하루에 한 기기를 한 번만 세요 · 한국 시간 기준"),
  );
  // 이미 받은 숫자가 있으면 붙인 직후 굴러가며 채움
  requestAnimationFrame(refresh);
  return board;
}
