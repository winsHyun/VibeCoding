// 작성일시: 2026-10-26 15:35
// 화면 공통 도구: API 호출, 상태 표시, 화면 전환, 레시피 카드
export const $ = (id) => document.getElementById(id);

export const DIFFICULTY_KO = { easy: "쉬움", medium: "보통", hard: "어려움" };

// 텍스트는 모두 textContent로 넣는다 (AI 응답·사용자 입력을 HTML로 해석하지 않음)
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// 일반 API(프로필 등)와 AI를 부르는 API의 응답 대기 시간. AI 쪽은 서버의 요청당 시간 상한(90초)보다 넉넉하게 둔다
const DEFAULT_TIMEOUT_MS = 30000;
export const AI_TIMEOUT_MS = 120000;

// 서버 API 호출. 실패하면 서버가 준 한국어 메시지와 code를 담은 Error를 던진다.
// signal: 화면에서 요청을 버릴 때 abort하는 신호. abort되면 code "ABORTED" 오류를 던지며, 화면에 띄우지 않는다
// (연결이 끊기면 서버도 그 요청의 AI 호출을 멈춘다)
export async function api(path, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS, signal: cancelSignal } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = cancelSignal ? AbortSignal.any([timeout, cancelSignal]) : timeout;
  let res;
  let data;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    data = await res.json().catch((err) => {
      if (signal.aborted) throw err;
      return {};
    });
  } catch {
    if (cancelSignal?.aborted) throw Object.assign(new Error("요청을 취소했어요."), { code: "ABORTED" });
    if (timeout.aborted) {
      throw Object.assign(new Error("서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요."), { code: "TIMEOUT" });
    }
    throw Object.assign(new Error("서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요."), { code: "NETWORK" });
  }
  if (!res.ok) {
    throw Object.assign(new Error(data.error?.message || `요청에 실패했어요. (HTTP ${res.status})`), {
      code: data.error?.code,
      status: res.status,
      detail: data.error,
    });
  }
  return data;
}

const statusEl = () => $("status");
let elapsedTimer = null;

// 상태 줄. type: info | warning | error | loading
// actions: [{ label, onClick, primary }] 상태 줄 안에 붙일 다음 행동 버튼 (예: 다시 시도, 재료 직접 입력)
// loading이면 경과 시간을 1초마다 보여 준다 (AI 요청은 수십 초 걸리므로 멈춘 게 아님을 알림).
// startedAt: 경과 시간의 기준 시각 (다른 화면에 다녀온 뒤 로딩 표시를 다시 띄울 때 이어서 센다)
export function showStatus(message, type = "info", { actions = [], startedAt = Date.now() } = {}) {
  const node = statusEl();
  clearInterval(elapsedTimer);
  // 오류는 화면 낭독기가 하던 말을 끊고 바로 읽게 한다. 내용을 바꾸기 전에 역할을 먼저 바꿔야 새 역할로 읽힌다
  const isError = type === "error";
  node.setAttribute("role", isError ? "alert" : "status");
  node.setAttribute("aria-live", isError ? "assertive" : "polite");
  const parts = [el("span", "status-text", message)];
  if (type === "loading") {
    // 1초마다 바뀌는 숫자를 화면 낭독기가 계속 읽지 않도록 aria-hidden
    const elapsed = el("span", "status-elapsed", "");
    elapsed.setAttribute("aria-hidden", "true");
    const tick = () => {
      elapsed.textContent = `${Math.floor((Date.now() - startedAt) / 1000)}초 경과`;
    };
    if (Date.now() - startedAt >= 1000) tick();
    elapsedTimer = setInterval(tick, 1000);
    parts.push(elapsed);
  }
  if (actions.length) {
    const bar = el("span", "status-actions");
    for (const { label, onClick, primary } of actions) {
      const button = el("button", primary ? "btn small primary" : "btn small", label);
      button.type = "button";
      button.addEventListener("click", onClick);
      bar.append(button);
    }
    parts.push(bar);
  }
  node.replaceChildren(...parts);
  node.className = `status ${type}`;
  node.hidden = false;
}

export const hideStatus = () => {
  clearInterval(elapsedTimer);
  statusEl().hidden = true;
};

// 처리 중인 버튼: 누를 수 없게 하고 문구를 바꾼다. busy=false면 원래 문구로 돌린다
export function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label ??= button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    if (button.dataset.label !== undefined) button.textContent = button.dataset.label;
    delete button.dataset.label;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

// 서버·네트워크 오류 code를 사용자가 할 수 있는 행동이 담긴 문구로 바꾼다.
// context: recognize(재료 인식) | recipes(레시피 추천) | save(레시피 저장) | 그 밖
// retry: 같은 요청을 다시 해 볼 만한 오류인지
export function friendlyError(err, context) {
  const manualHint = context === "recognize" ? " 기다리기 어려우면 재료를 직접 입력해도 돼요." : "";
  switch (err.code) {
    case "DAILY_LIMIT":
      return {
        message:
          context === "recognize"
            ? "오늘 쓸 수 있는 무료 AI 요청을 모두 썼어요. 한국 시간 오전 9시에 다시 채워져요. 그동안 재료를 직접 입력해 주세요."
            : "오늘 쓸 수 있는 무료 AI 요청을 모두 썼어요. 레시피 추천은 한국 시간 오전 9시 이후에 다시 할 수 있어요. 저장해 둔 레시피는 지금도 볼 수 있어요.",
        retry: false,
      };
    case "RATE_LIMITED":
      return { message: `지금 AI 서버에 요청이 몰려 있어요. 1~2분 뒤에 다시 시도해 주세요.${manualHint}`, retry: true };
    case "BUDGET_EXCEEDED":
    case "UPSTREAM_ERROR":
    case "TIMEOUT":
      return { message: `AI 서버가 제때 응답하지 않았어요. 잠시 후 다시 시도해 주세요.${manualHint}`, retry: true };
    case "REQUEST_ERROR":
      return {
        message: context === "recognize" ? "AI가 이 사진을 처리하지 못했어요. 다른 사진을 고르거나 재료를 직접 입력해 주세요." : "AI가 요청을 처리하지 못했어요. 재료나 조건을 조금 바꿔 다시 시도해 주세요.",
        retry: context !== "recognize",
      };
    case "INVALID_MODEL_OUTPUT":
      return { message: "AI가 레시피를 알아볼 수 없는 형식으로 보냈어요. 다시 시도하면 대부분 해결돼요.", retry: true };
    case "AUTH_ERROR":
      return { message: `AI 서버 인증에 실패했어요. 앱을 설치한 분께 API 키 설정(.env)을 확인해 달라고 알려 주세요.${context === "recognize" ? " 재료는 직접 입력할 수 있어요." : ""}`, retry: false };
    case "INSUFFICIENT_CREDITS":
      return { message: `AI 서버 계정의 크레딧이 부족해요. 앱을 설치한 분께 OpenRouter 계정 잔액을 확인해 달라고 알려 주세요.${context === "recognize" ? " 재료는 직접 입력할 수 있어요." : ""}`, retry: false };
    case "INVALID_IMAGE":
      // 서버가 이유(너무 작음·너무 큼·읽을 수 없음)를 한국어로 알려 주므로 그대로 쓴다
      return { message: `${err.detail?.message || "이 사진을 읽을 수 없어요. JPEG, PNG, WebP 사진으로 다시 골라 주세요."} 재료는 직접 입력해도 돼요.`, retry: false };
    case "NOT_FOUND":
      // 다른 창에서 지운 프로필로 요청한 경우. 화면이 profileMissing을 보고 프로필 선택으로 가는 버튼을 붙인다
      if (["recipes", "save", "saved"].includes(context)) {
        return { message: "이 프로필을 찾을 수 없어요. 다른 창에서 삭제됐을 수 있어요. 프로필을 다시 골라 주세요.", retry: false, profileMissing: true };
      }
      return { message: err.message, retry: false };
    case "NETWORK":
      return { message: "서버에 연결할 수 없어요. 앱 서버(start.bat)가 켜져 있는지 확인한 뒤 다시 시도해 주세요.", retry: true };
    case "INTERNAL_ERROR":
      return { message: "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", retry: true };
    case "LIMIT_EXCEEDED":
      if (context === "save") {
        return { message: "저장 공간이 가득 찼어요(프로필당 최대 100개). 내 레시피에서 안 쓰는 레시피를 지운 뒤 다시 저장해 주세요.", retry: false };
      }
      return { message: err.message, retry: false };
    default:
      // 검증 오류 등은 서버가 준 한국어 문구가 이미 구체적이다
      return { message: err.message, retry: false };
  }
}

const viewListeners = [];
// 화면이 바뀐 뒤 불릴 함수 (예: 메인으로 돌아왔을 때 진행 중인 요청의 로딩 표시를 다시 띄움)
export const onViewChange = (fn) => viewListeners.push(fn);

// data-view 속성이 name인 화면만 보이고 나머지는 숨긴다.
// 이전 화면의 안내가 남지 않도록 상태 줄도 지운다 (새 안내는 showView 뒤에 띄운다)
export function showView(name) {
  hideStatus();
  for (const view of document.querySelectorAll("[data-view]")) view.hidden = view.dataset.view !== name;
  window.scrollTo({ top: 0 });
  viewListeners.forEach((fn) => fn(name));
}

// 대체 모델로 넘어갔는지 알 수 있도록 실제 응답한 모델 이름을 상태 줄에 붙인다
export const modelNote = (model) => (model ? ` · 모델 ${model.replace(/:free$/, "")}` : "");

// 레시피 카드: <article> 안에 펼침 영역(<details>)과 그 아래 버튼 줄.
// actions는 카드 아래 버튼 줄에 붙일 버튼(펼치기와 별개로 누를 수 있게 <summary> 밖에 둔다),
// notes는 요약 줄 끝에 붙일 글(저장 날짜 등), extras는 펼친 본문 끝에 붙일 요소
export function renderRecipeCard(recipe, { actions = [], notes = [], extras = [] } = {}) {
  const missing = recipe.ingredients.filter((g) => !g.owned).length;
  const warnings = recipe.allergyWarning ?? [];
  // 알레르기 재료가 있는 카드는 테두리와 글자 경고를 함께 보여 준다 (색만으로 알리지 않음)
  const card = el("article", warnings.length ? "recipe-card has-allergy" : "recipe-card");
  const details = el("details");

  const summary = el("summary");
  // '펼치기/접기' 표시는 눈으로만 보는 안내라 화면 낭독기에는 숨긴다 (펼침 상태는 <details>가 알려 줌)
  const head = el("div", "recipe-head");
  const toggleHint = el("span", "toggle-hint");
  toggleHint.setAttribute("aria-hidden", "true");
  head.append(el("h3", "recipe-title", recipe.title), toggleHint);
  const meta = el("div", "recipe-meta");
  if (warnings.length) meta.append(el("span", "tag danger", `⚠ 알레르기 주의: ${warnings.join(", ")}`));
  if (recipe.cookTimeMinutes) meta.append(el("span", "tag", `⏱ ${recipe.cookTimeMinutes}분`));
  meta.append(el("span", "tag", DIFFICULTY_KO[recipe.difficulty] ?? recipe.difficulty));
  if (recipe.servings) meta.append(el("span", "tag", `${recipe.servings}인분`));
  if (recipe.caloriesPerServing) meta.append(el("span", "tag", `1인분 약 ${recipe.caloriesPerServing}kcal`));
  meta.append(
    el("span", "tag owned", `가진 재료 ${recipe.ingredients.length - missing}개`),
    el("span", missing ? "tag missing" : "tag owned", missing ? `추가 필요 ${missing}개` : "추가 재료 없음"),
  );
  summary.append(head, el("p", "recipe-summary", recipe.summary), meta, ...notes);

  const body = el("div", "recipe-body");
  const ingredientList = el("ul", "ingredient-list");
  for (const g of recipe.ingredients) {
    const li = el("li");
    li.append(el("span", g.owned ? "tag owned" : "tag missing", g.owned ? "보유" : "필요"), el("span", "", g.name), el("span", "amount", g.amount));
    if (g.allergens?.length) li.append(el("span", "tag danger", `알레르기: ${g.allergens.join(", ")}`));
    ingredientList.append(li);
  }
  const stepList = el("ol", "step-list");
  stepList.append(...recipe.steps.map((s) => el("li", "", s)));
  body.append(el("h3", "", "재료"), ingredientList, el("h3", "", "조리 순서"), stepList);
  if (recipe.tips) body.append(el("p", "tips", `💡 ${recipe.tips}`));
  body.append(...extras);

  details.append(summary, body);
  card.append(details);
  if (actions.length) {
    const bar = el("div", "recipe-actions");
    bar.append(...actions);
    card.append(bar);
  }
  return card;
}

// 카드 아래 버튼 줄에 넣을 작은 버튼. onClick은 버튼 자신을 받는다
export function cardButton(text, className, onClick) {
  const button = el("button", `btn small ${className}`.trim(), text);
  button.type = "button";
  button.addEventListener("click", () => onClick(button));
  return button;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

// localStorage는 사생활 보호 모드 등에서 실패할 수 있으므로 감싸서 쓴다
export const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // 저장하지 못해도 이번 방문 동안은 동작한다
    }
  },
};
