// 작성일시: 2026-10-26 14:39
// OpenRouter API 공통 클라이언트 (재시도, 대체 모델 전환, 요청 예산, 키 상태 조회). 1·2단계 모두 사용한다.
import { config } from "./config.js";

const BASE_URL = "https://openrouter.ai/api/v1";
// 일시적 과부하(502/503)와 네트워크 오류만 같은 모델에서 1회 재시도한다.
// 429는 그 모델이 붐비는 것이므로 기다리지 않고 다음 모델로 넘긴다 (Retry-After가 짧을 때만 예외)
const RETRYABLE = new Set([502, 503]);
// 요청 자체가 잘못된 경우: 다른 모델로 보내도 똑같이 실패하므로 바로 실패한다 (404는 모델 문제라 제외)
const REQUEST_ERRORS = new Set([400, 413, 422]);
// 429의 Retry-After가 이 시간 이하면 같은 모델에서 1회 기다렸다 재시도한다
const SHORT_RETRY_AFTER_MS = 3000;
// 남은 시간이 이보다 짧으면 새 호출을 시작하지 않는다
const MIN_CALL_MS = 1000;

export class OpenRouterError extends Error {
  // detail: 로그·보고용 원본 오류 메시지
  constructor(code, message, status, detail = "") {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const budgetError = (detail) =>
  new OpenRouterError("BUDGET_EXCEEDED", "AI 서버가 응답하지 않거나 여러 번 실패해 요청을 중단했습니다. 잠시 후 다시 시도해 주세요.", 503, detail);
// 사용자가 화면에서 요청을 취소했거나 연결이 끊긴 경우. 모델 문제가 아니므로 재시도·대체 모델로 넘어가지 않는다
const cancelledError = (detail) => new OpenRouterError("CLIENT_CLOSED", "요청이 취소되었습니다.", 499, detail);

// 사용자 요청 1건이 쓸 수 있는 OpenRouter 호출 수와 시간 (재시도·대체 모델·재료 벡터 생성을 모두 합친 상한)
export class RequestBudget {
  // signal: 사용자 요청이 취소되면(클라이언트 연결 끊김) abort되는 신호. 새 호출을 막고 진행 중인 fetch도 멈춘다
  constructor({ maxCalls = config.requestBudget.maxCalls, timeMs = config.requestBudget.timeMs, now = Date.now, signal = null } = {}) {
    this.maxCalls = maxCalls;
    this.calls = 0;
    this.now = now;
    this.deadline = now() + timeMs;
    this.signal = signal;
    this.fallbacks = []; // 대체 모델로 넘어간 이유 (로그용): "모델 코드 상태 (상세)"
  }

  get cancelled() {
    return Boolean(this.signal?.aborted);
  }

  remainingMs() {
    return this.deadline - this.now();
  }

  // 호출 직전에 부른다. 남은 횟수나 시간이 없으면 BUDGET_EXCEEDED
  take() {
    if (this.cancelled) throw cancelledError(`request cancelled after ${this.calls} calls`);
    if (this.calls >= this.maxCalls) throw budgetError(`call budget exhausted (${this.calls}/${this.maxCalls} calls)`);
    if (this.remainingMs() < MIN_CALL_MS) throw budgetError(`time budget exhausted after ${this.calls} calls`);
    this.calls++;
  }

  // fetch에 넣을 신호: 호출 타임아웃 + 요청 취소
  fetchSignal(timeoutMs) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return this.signal ? AbortSignal.any([timeout, this.signal]) : timeout;
  }

  // 로그·보고용 사용량 요약
  usage() {
    return { calls: this.calls, maxCalls: this.maxCalls, fallbacks: [...this.fallbacks] };
  }
}

// 로그 한 줄용: "calls: 2/6, fallback: a:free RATE_LIMITED 429 (...)"
export function formatUsage(usage) {
  if (!usage) return "calls: ?";
  const fallback = usage.fallbacks.length ? `, fallback: ${usage.fallbacks.join("; ")}` : "";
  return `calls: ${usage.calls}/${usage.maxCalls}${fallback}`;
}

// 하루 무료 한도 소진 문구는 error.message와 metadata.raw 중 어느 쪽에 올지 모르므로 둘 다 본다
const isPerDay = (...texts) => texts.some((t) => /per-day/i.test(t));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry-After 헤더(초 또는 HTTP 날짜) → 밀리초. 없거나 읽을 수 없으면 null
function retryAfterMs(res) {
  const value = res.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

// 대체 모델이 있으므로 모델당 재시도는 1회만 한다 (실패한 요청도 하루 한도를 쓴다).
// budget이 있으면 매 호출이 그 예산을 쓰고, 호출 타임아웃도 남은 시간으로 줄인다. retryDelayMs는 테스트용
export async function callOpenRouter(path, body, { retries = 1, timeoutMs = 60000, budget = null, retryDelayMs = 2000 } = {}) {
  let lastStatus = 0;
  let lastMessage = "";
  let dailyLimit = false;
  let wait = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 기다린 뒤 호출할 시간이 남지 않으면 재시도하지 않는다
      if (budget && budget.remainingMs() - wait < MIN_CALL_MS) break;
      await sleep(wait);
    }
    try {
      budget?.take();
    } catch (err) {
      if (lastMessage) err.detail += ` (last error: ${lastStatus} ${lastMessage})`;
      throw err;
    }
    const callTimeoutMs = budget ? Math.min(timeoutMs, budget.remainingMs()) : timeoutMs;
    let res;
    let data;
    try {
      res = await fetch(BASE_URL + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: budget ? budget.fetchSignal(callTimeoutMs) : AbortSignal.timeout(callTimeoutMs),
      });
      data = await res.json().catch((err) => {
        if (err.name === "TimeoutError" || err.name === "AbortError") throw err;
        return {};
      });
    } catch (err) {
      // 사용자 요청이 취소되었으면 재시도하지 않고 바로 멈춘다 (한도를 더 쓰지 않음)
      if (budget?.cancelled) throw cancelledError(`${body.model} cancelled during call ${budget.calls}`);
      if (err.name === "TimeoutError") {
        // 타임아웃은 같은 모델에서 재시도하지 않는다 (같은 시간을 또 기다리게 됨). 전체 시간이 다 됐으면 중단
        if (budget && budget.remainingMs() < MIN_CALL_MS) throw budgetError(`${body.model} timed out after ${callTimeoutMs}ms, no time left`);
        lastStatus = 504;
        lastMessage = `timeout after ${callTimeoutMs}ms`;
        break;
      }
      // 네트워크 오류는 일시적 장애로 보고 재시도
      lastStatus = 503;
      lastMessage = err.message;
      wait = retryDelayMs * 2 ** attempt;
      continue;
    }
    // OpenRouter는 HTTP 200 안에 error 객체를 담아 보내기도 한다
    if (res.ok && !data.error) return data;
    lastStatus = Number(data.error?.code) || res.status;
    const raw = data.error?.metadata?.raw == null ? "" : String(data.error.metadata.raw);
    const message = data.error?.message == null ? "" : String(data.error.message);
    lastMessage = raw || message || `HTTP ${res.status}`;
    // 계정의 하루 무료 요청 한도 소진은 재시도해도 풀리지 않고 한도만 더 쓴다
    dailyLimit = isPerDay(raw, message);
    if (dailyLimit) break;
    if (lastStatus === 429) {
      const after = retryAfterMs(res);
      if (after === null || after > SHORT_RETRY_AFTER_MS) break;
      wait = after;
      continue;
    }
    if (!RETRYABLE.has(lastStatus)) break;
    wait = retryDelayMs * 2 ** attempt;
  }
  console.error(`[openrouter] ${body.model} ${path} failed: ${lastStatus} ${lastMessage}`);
  if (dailyLimit) {
    throw new OpenRouterError("DAILY_LIMIT", "오늘 사용할 수 있는 무료 AI 요청을 모두 썼습니다. 내일(오전 9시 이후) 다시 시도해 주세요.", lastStatus, lastMessage);
  }
  // 402는 키 문제가 아니라 계정 크레딧 부족(잔액 마이너스 등). 모든 모델에 공통이므로 대체 모델로 넘어가지 않는다
  if (lastStatus === 402) {
    throw new OpenRouterError("INSUFFICIENT_CREDITS", "AI 서버 계정의 크레딧이 부족합니다. OpenRouter 계정 잔액을 확인해 주세요.", lastStatus, lastMessage);
  }
  if (lastStatus === 401 || lastStatus === 403) {
    throw new OpenRouterError("AUTH_ERROR", "AI 서버 인증에 실패했습니다. API 키를 확인해 주세요.", lastStatus, lastMessage);
  }
  if (lastStatus === 429) {
    throw new OpenRouterError("RATE_LIMITED", "AI 서버 사용량이 많습니다. 잠시 후 다시 시도해 주세요.", lastStatus, lastMessage);
  }
  if (REQUEST_ERRORS.has(lastStatus)) {
    throw new OpenRouterError("REQUEST_ERROR", "AI 서버가 요청을 처리하지 못했습니다. 입력이나 사진을 바꿔 다시 시도해 주세요.", lastStatus, lastMessage);
  }
  if (lastStatus === 504) {
    throw new OpenRouterError("UPSTREAM_ERROR", "AI 서버 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.", lastStatus, `${body.model}: ${lastMessage}`);
  }
  throw new OpenRouterError("UPSTREAM_ERROR", "AI 서버 응답에 문제가 있습니다. 잠시 후 다시 시도해 주세요.", lastStatus, lastMessage);
}

// 다음 모델로 넘어갈 만한 오류: 그 모델·공급자의 문제 (계정 한도·키 오류는 모든 모델에 똑같이 나므로 제외)
const isModelSpecific = (err) => err instanceof OpenRouterError && (err.code === "RATE_LIMITED" || err.code === "UPSTREAM_ERROR");
const failedAt = new Map(); // 모델 → 마지막 실패 시각

// models를 순서대로 시도해 처음 성공한 결과와 그 모델을 돌려준다. 최근 실패한 모델은 맨 뒤로 미룬다.
// budget이 있으면 다음 모델로 넘어간 이유를 budget.fallbacks에 남긴다 (요청 1건 로그용)
export async function withModelFallback(models, task, { label = "model", now = Date.now, budget = null } = {}) {
  const coolingDown = (m) => now() - (failedAt.get(m) ?? -Infinity) < config.modelCooldownMs;
  const order = [...models.filter((m) => !coolingDown(m)), ...models.filter(coolingDown)];
  let lastError;
  for (const model of order) {
    try {
      const result = await task(model);
      failedAt.delete(model);
      return { result, model };
    } catch (err) {
      if (!isModelSpecific(err)) throw err;
      failedAt.set(model, now());
      lastError = err;
      budget?.fallbacks.push(`${model} ${err.code} ${err.status} (${String(err.detail).slice(0, 120)})`);
      console.warn(`[fallback] ${label} model ${model} failed (${err.code} ${err.status}: ${err.detail})`);
    }
  }
  throw lastError;
}

// 테스트용: 모델 실패 기록 초기화
export const resetModelCooldowns = () => failedAt.clear();

// inputs: 문자열 또는 { content: [...] } 멀티모달 항목의 배열. 입력 순서대로 벡터를 돌려준다.
export async function embed(inputs, model, { budget = null } = {}) {
  const data = await callOpenRouter("/embeddings", { model, input: inputs }, { budget });
  if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
    throw new OpenRouterError("UPSTREAM_ERROR", "AI 서버 응답 형식이 올바르지 않습니다.", 502, `${model}: unexpected embeddings response`);
  }
  return [...data.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

// 대화형 모델 호출. 추론 모델의 내부 추론은 받지 않고(include_reasoning: false) 최종 답만 돌려준다.
export async function chat(messages, { model, maxTokens, temperature, timeoutMs, budget = null } = {}) {
  const data = await callOpenRouter(
    "/chat/completions",
    { model, messages, max_tokens: maxTokens, temperature, include_reasoning: false },
    { timeoutMs, budget },
  );
  const choice = data.choices?.[0];
  return { content: choice?.message?.content ?? "", finishReason: choice?.finish_reason, model };
}

export const imageInput = (buffer, mime = "image/jpeg") => ({
  content: [{ type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } }],
});

// 키 유효성과 무료 모델 하루 요청 사용량 (모델 요청이 아니라 한도를 쓰지 않음)
export async function getKeyStatus() {
  try {
    const res = await fetch(`${BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
    const data = (await res.json()).data ?? {};
    return { valid: true, isFreeTier: data.is_free_tier, freeDaily: data.free_model_daily_requests ?? null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
