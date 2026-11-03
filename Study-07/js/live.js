// 작성일시: 2026-11-03 16:00
// 현장 상황 제보: 실시간 상태 보관, 배지·현장 카드·제보 시트·신고
// 화면 어디서든 data-live-* 속성이 붙은 요소는 새 제보가 오면 자동으로 다시 그려짐

import { fetchRecentReports, submitReport, flagReport, subscribeReports } from "./api.js";
import { el, toast, distanceKm } from "./dom.js";
import { starBurst } from "./stars.js";

export const WAIT_LEVELS = {
  none: { label: "바로 입장", detail: "대기 없음", emoji: "🟢", color: "#16a34a" },
  short: { label: "10분 이내", detail: "짧은 줄", emoji: "🟡", color: "#d4a106" },
  medium: { label: "10~30분", detail: "보통 줄", emoji: "🟠", color: "#ea580c" },
  long: { label: "30분 이상", detail: "긴 줄", emoji: "🔴", color: "#dc2626" },
};
const FRESH_MINUTES = 90; // 이보다 오래된 제보는 배지에 쓰지 않음
const MAX_DISTANCE_M = 300;
const MEMO_MAX = 140;
const FLAG_REASONS = [
  { id: "false_info", label: "거짓 정보" },
  { id: "inappropriate", label: "부적절한 내용" },
  { id: "ad", label: "광고" },
];
const ERROR_MESSAGES = {
  TOO_FAR: (m) => `빵집에서 약 ${formatDistance(m)} 떨어져 있어요. ${MAX_DISTANCE_M}m 안에서만 올릴 수 있어요.`,
  RATE_LIMITED: () => "같은 빵집은 10분에 한 번, 전체는 1시간에 10번까지 올릴 수 있어요.",
  INVALID_MEMO: () => "메모에는 링크나 연락처를 넣을 수 없어요.",
  INVALID_INPUT: () => "입력값을 다시 확인해 주세요.",
  NO_LOCATION: () => "위치를 확인하지 못했어요.",
  NOT_FOUND: () => "빵집 정보를 찾지 못했어요.",
  OWN_REPORT: () => "내가 올린 제보는 신고할 수 없어요.",
};

// replaceChildren은 배열을 펼치지 않고 false도 글자로 넣으므로 걸러서 넣음
const put = (node, ...children) => node.replaceChildren(...children.flat().filter((c) => c != null && c !== false && c !== ""));

const state = {
  reports: [], // 최신순
  status: "connecting",
  listeners: new Set(),
  bakeries: new Map(), // 현장 카드를 다시 그릴 때 쓰는 빵집 정보
};

// 기기 구분용 무작위 ID (서버에는 해시로만 저장)
export function deviceId() {
  const KEY = "bbang-device-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    state.memoryDevice ??= crypto.randomUUID();
    return state.memoryDevice;
  }
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

export function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}

const isFresh = (report) => Date.now() - new Date(report.created_at).getTime() < FRESH_MINUTES * 60000;
const reportsFor = (bakeryId) => state.reports.filter((r) => r.bakery_id === bakeryId);
const latestFresh = (bakeryId) => reportsFor(bakeryId).find(isFresh) ?? null;

export function liveClassFor(bakeryId) {
  const latest = latestFresh(bakeryId);
  return latest ? `live live-${latest.wait_level}` : "";
}

// 최근 제보가 있는 빵집을 최신 제보 순으로
export function liveBakeries(bakeries) {
  const byId = new Map(bakeries.map((b) => [b.id, b]));
  const seen = new Set();
  const out = [];
  for (const report of state.reports) {
    if (!isFresh(report) || seen.has(report.bakery_id) || !byId.has(report.bakery_id)) continue;
    seen.add(report.bakery_id);
    out.push({ bakery: byId.get(report.bakery_id), report });
  }
  return out;
}

export function onLiveChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function notify() {
  // 화면에 붙어 있는 배지·핀·현장 카드 갱신
  document.querySelectorAll("[data-live-bakery]").forEach((node) => fillBadge(node, Number(node.dataset.liveBakery)));
  document.querySelectorAll("[data-live-pin]").forEach((node) => {
    node.classList.remove("live", "live-none", "live-short", "live-medium", "live-long");
    const cls = liveClassFor(Number(node.dataset.livePin));
    if (cls) node.classList.add(...cls.split(" "));
  });
  document.querySelectorAll("[data-live-card]").forEach((node) => {
    const bakery = state.bakeries.get(Number(node.dataset.liveCard));
    if (bakery) fillCard(node, bakery);
  });
  state.listeners.forEach((fn) => fn());
}

function addReport(report) {
  if (state.reports.some((r) => r.id === report.id)) return;
  state.reports.unshift(report);
  state.reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  notify();
}

async function reload() {
  try {
    state.reports = await fetchRecentReports();
    notify();
  } catch (error) {
    console.error(error);
  }
}

export async function initLive() {
  await reload();
  subscribeReports(addReport, (status) => {
    state.status = status === "SUBSCRIBED" ? "live" : status === "CLOSED" ? "closed" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting";
    document.querySelectorAll("[data-live-status]").forEach(fillStatus);
    // 다시 연결되면 끊긴 동안의 제보를 채움
    if (state.status === "live") reload();
  });
  // 1분마다 "n분 전" 글자와 만료(90분)를 갱신, 5분마다 숨김 처리된 제보를 반영하려고 다시 불러옴
  setInterval(notify, 60_000);
  setInterval(reload, 5 * 60_000);
}

// ---------- 배지 ----------

function fillBadge(node, bakeryId) {
  const latest = latestFresh(bakeryId);
  node.hidden = !latest;
  if (!latest) return;
  const level = WAIT_LEVELS[latest.wait_level];
  node.style.setProperty("--live", level.color);
  put(node, el("span", { className: "live-dot" }), `${level.label} · ${timeAgo(latest.created_at)}`);
}

export function liveBadge(bakery, variant = "") {
  const node = el("span", { className: `live-badge ${variant}`, "data-live-bakery": bakery.id });
  fillBadge(node, bakery.id);
  return node;
}

function fillStatus(node) {
  const text = { live: "실시간", connecting: "연결 중…", error: "연결 끊김 · 다시 연결 중", closed: "연결 끊김" }[state.status];
  node.className = `live-status ${state.status}`;
  node.textContent = text;
}

// 실시간 연결 상태 표시 (연결 상태가 바뀌면 자동 갱신)
export function liveStatus() {
  const node = el("span", { "data-live-status": "" });
  fillStatus(node);
  return node;
}

// ---------- 빵집 상세의 현장 카드 ----------

function reportItem(report, bakery) {
  const level = WAIT_LEVELS[report.wait_level];
  const flagArea = el("div", { className: "flag-area" });
  const openFlag = () => {
    put(flagArea, 
      el("span", { className: "muted small" }, "신고 사유:"),
      FLAG_REASONS.map((reason) => el("button", {
        type: "button",
        className: "chip small-chip",
        onclick: async () => {
          try {
            const result = await flagReport(report.id, reason.id, deviceId());
            toast(result === "HIDDEN" ? "신고가 쌓여 이 제보를 숨겼어요." : "신고했어요. 고마워요.");
            if (result === "HIDDEN") reload();
          } catch (error) {
            toast((ERROR_MESSAGES[error.code] ?? (() => "신고하지 못했어요."))());
          }
          put(flagArea, flagButton);
        },
      }, reason.label)),
      el("button", { type: "button", className: "link-button", onclick: () => put(flagArea, flagButton) }, "취소"),
    );
  };
  const flagButton = el("button", { type: "button", className: "link-button", onclick: openFlag }, "신고");
  flagArea.append(flagButton);

  return el("li", { className: `report-item ${isFresh(report) ? "" : "old"}`, style: `--live:${level.color}` },
    el("div", { className: "report-head" },
      el("span", { className: "report-level" }, el("span", { className: "live-dot" }), level.label),
      el("span", { className: "muted small" }, timeAgo(report.created_at)),
    ),
    (report.queue_count != null || report.sold_out.length > 0) && el("p", { className: "report-meta" },
      report.queue_count != null && `줄 약 ${report.queue_count}명`,
      report.queue_count != null && report.sold_out.length > 0 && " · ",
      report.sold_out.length > 0 && `품절: ${report.sold_out.join(", ")}`,
    ),
    report.memo && el("p", { className: "report-memo" }, report.memo),
    flagArea,
  );
}

function fillCard(node, bakery) {
  const reports = reportsFor(bakery.id);
  const latest = reports.find(isFresh);
  const level = latest && WAIT_LEVELS[latest.wait_level];
  const statusNode = el("span", {});
  fillStatus(statusNode);
  statusNode.setAttribute("data-live-status", "");

  put(node, 
    el("div", { className: "live-card-head" },
      el("h2", {}, "지금 현장 상황"),
      statusNode,
    ),
    latest
      ? el("div", { className: "live-now", style: `--live:${level.color}` },
        el("span", { className: "live-emoji", "aria-hidden": "true" }, level.emoji),
        el("div", {},
          el("p", { className: "live-level" }, level.label, el("small", {}, ` ${level.detail}`)),
          el("p", { className: "muted small" }, `${timeAgo(latest.created_at)} 현장 제보 · 빵집에서 ${formatDistance(latest.distance_m)}`),
        ),
      )
      : el("p", { className: "live-empty" }, "최근 90분 동안 제보가 없어요. 현장에 계시면 다른 사람들에게 알려 주세요!"),
    el("button", { type: "button", className: "button primary live-cta", onclick: () => openReportSheet(bakery) }, "📣 지금 상황 알리기"),
    reports.length > 0 && el("details", { className: "report-list", open: reports.length <= 3 ? "" : null },
      el("summary", {}, `최근 24시간 제보 ${reports.length}건`),
      el("ul", {}, reports.slice(0, 20).map((r) => reportItem(r, bakery))),
    ),
    el("p", { className: "muted small" }, "이용자 제보라 실제와 다를 수 있어요. 빵집 300m 안에서만 올릴 수 있어요."),
  );
}

export function liveCard(bakery) {
  state.bakeries.set(bakery.id, bakery);
  const node = el("section", { className: "live-card", "data-live-card": bakery.id });
  fillCard(node, bakery);
  return node;
}

// ---------- 제보 시트 ----------

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("UNSUPPORTED"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? "DENIED" : "UNAVAILABLE")),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function openReportSheet(bakery) {
  const form = { waitLevel: null, queueCount: null, soldOut: new Set(), memo: "", position: null };
  const locationLine = el("div", { className: "geo-line" });
  const submit = el("button", { type: "submit", className: "button primary", disabled: "" }, "제보 올리기");
  const errorLine = el("p", { className: "form-error", role: "alert" });

  const updateSubmit = () => {
    const near = form.position && form.position.distance <= MAX_DISTANCE_M;
    submit.disabled = !(form.waitLevel && near);
  };

  const locate = async () => {
    locationLine.className = "geo-line";
    put(locationLine, "📍 위치를 확인하는 중…");
    form.position = null;
    updateSubmit();
    try {
      const pos = await getPosition();
      const distance = distanceKm(pos, bakery) * 1000;
      form.position = { ...pos, distance };
      const near = distance <= MAX_DISTANCE_M;
      locationLine.className = `geo-line ${near ? "ok" : "far"}`;
      put(locationLine, 
        near ? `✅ 빵집에서 약 ${formatDistance(distance)} — 제보할 수 있어요` : `⚠️ ${ERROR_MESSAGES.TOO_FAR(distance)}`,
        near ? "" : el("button", { type: "button", className: "link-button", onclick: locate }, "다시 확인"),
      );
    } catch (error) {
      locationLine.className = "geo-line far";
      put(locationLine, 
        error.message === "DENIED" ? "⚠️ 위치 권한이 필요해요. 브라우저 설정에서 위치를 허용해 주세요." : "⚠️ 위치를 확인하지 못했어요.",
        el("button", { type: "button", className: "link-button", onclick: locate }, "다시 시도"),
      );
    }
    updateSubmit();
  };

  const levelButtons = el("div", { className: "level-grid", role: "radiogroup", "aria-label": "대기 수준" },
    Object.entries(WAIT_LEVELS).map(([id, level]) => el("button", {
      type: "button",
      role: "radio",
      "aria-checked": "false",
      className: "level-option",
      style: `--live:${level.color}`,
      onclick: (event) => {
        form.waitLevel = id;
        levelButtons.querySelectorAll(".level-option").forEach((b) => {
          const on = b === event.currentTarget;
          b.classList.toggle("active", on);
          b.setAttribute("aria-checked", String(on));
        });
        updateSubmit();
      },
    }, el("span", { className: "level-emoji" }, level.emoji), el("strong", {}, level.label), el("small", {}, level.detail))),
  );

  const queueInput = el("input", {
    type: "number", min: "0", max: "300", inputmode: "numeric", placeholder: "예: 15", className: "text-input",
    oninput: (e) => {
      const n = e.target.value === "" ? null : Math.max(0, Math.min(300, Math.round(Number(e.target.value))));
      form.queueCount = Number.isFinite(n) ? n : null;
    },
  });

  const soldOutChips = bakery.signature_menus.length > 0 && el("div", { className: "chip-row" },
    bakery.signature_menus.slice(0, 8).map((menu) => el("button", {
      type: "button",
      className: "chip",
      "aria-pressed": "false",
      onclick: (e) => {
        const on = !form.soldOut.has(menu);
        on ? form.soldOut.add(menu) : form.soldOut.delete(menu);
        e.currentTarget.classList.toggle("active", on);
        e.currentTarget.setAttribute("aria-pressed", String(on));
      },
    }, menu)),
  );

  const counter = el("span", { className: "muted small" }, `0/${MEMO_MAX}`);
  const memo = el("textarea", {
    rows: "3", maxlength: String(MEMO_MAX), className: "text-input", placeholder: "예: 튀김소보로 줄과 일반 줄이 따로 있어요",
    oninput: (e) => {
      form.memo = e.target.value;
      counter.textContent = `${[...e.target.value].length}/${MEMO_MAX}`;
    },
  });

  const backdrop = el("div", { className: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) close(); } });
  const close = () => {
    backdrop.remove();
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  const formEl = el("form", {
    className: "modal-sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": `${bakery.name} 현장 상황 알리기`,
    onsubmit: async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      submit.textContent = "올리는 중…";
      errorLine.textContent = "";
      try {
        await submitReport({
          slug: bakery.slug,
          waitLevel: form.waitLevel,
          queueCount: form.queueCount,
          soldOut: [...form.soldOut],
          memo: form.memo.trim() || null,
          lat: form.position.lat,
          lng: form.position.lng,
          device: deviceId(),
        });
        starBurst(submit);
        close();
        toast("⭐ 제보 고마워요! 다른 사람들에게 바로 보여요.");
        reload();
      } catch (error) {
        errorLine.textContent = (ERROR_MESSAGES[error.code] ?? (() => "올리지 못했어요. 잠시 후 다시 시도해 주세요."))(error.value);
        submit.textContent = "제보 올리기";
        updateSubmit();
      }
    },
  },
    el("div", { className: "modal-head" },
      el("div", {},
        el("p", { className: "muted small" }, "현장 제보"),
        el("h2", {}, `지금 ${bakery.name}은?`),
      ),
      el("button", { type: "button", className: "sheet-close", "aria-label": "닫기", onclick: () => close() }, "✕"),
    ),
    locationLine,
    el("fieldset", {}, el("legend", {}, "대기 줄 ", el("span", { className: "req" }, "필수")), levelButtons),
    el("fieldset", {}, el("legend", {}, "줄 선 사람 (대략)"), queueInput),
    soldOutChips && el("fieldset", {}, el("legend", {}, "품절된 메뉴"), soldOutChips),
    el("fieldset", {}, el("legend", { className: "legend-row" }, "한마디", counter), memo),
    errorLine,
    el("p", { className: "muted small" }, "제보는 24시간 동안 공개돼요. 위치는 거리 확인에만 쓰고 저장하지 않아요."),
    submit,
  );

  backdrop.append(formEl);
  document.body.append(backdrop);
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", onKey);
  levelButtons.querySelector("button")?.focus();
  locate();
}
