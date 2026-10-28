// 작성일시: 2026-10-27 14:59
// OpenRouter chat completions 클라이언트.
// - createChat: 호출 1회 (HTTP 오류를 AiCallError로 분류)
// - chatWithFallback: 요청 1건의 예산(Budget) 안에서 재시도·대체 모델 전환
// 테스트는 fetchImpl·chat을 주입해 실제 호출 없이 돌린다.
import { ApiError } from "./errors.js";

const BASE_URL = "https://openrouter.ai/api/v1";
// 남은 시간이 이보다 짧으면 새 호출을 시작하지 않는다
export const MIN_CALL_MS = 3000;

// 호출 1회의 실패. action: "retry"(같은 모델 1회 재시도) | "next"(다음 모델) | "fatal"(바로 실패)
export class AiCallError extends ApiError {
  constructor(code, action, detail, message) {
    super(code, message, detail);
    this.action = action;
  }
}

// 클라이언트 연결이 끊겨 멈춘 경우. 응답을 보낼 곳이 없으므로 로그에만 남는다
export function cancelledError(detail = "client closed") {
  const err = new AiCallError("INTERNAL_ERROR", "fatal", detail, "요청이 취소되었습니다.");
  err.cancelled = true;
  return err;
}

// AI_AUTH_ERROR 원인별 안내 (사용자는 관리자에게 무엇을 알려야 할지 알 수 있게)
export const AUTH_MESSAGES = {
  401: "AI 서비스 API 키가 올바르지 않거나 만료되었어요. 관리자에게 .env의 키를 확인해 달라고 알려 주세요.",
  402: "AI 서비스 계정의 크레딧이 부족해요. 관리자에게 문의해 주세요.",
  403: "AI 서비스가 이 API 키의 요청을 허용하지 않아요. 관리자에게 키 권한을 확인해 달라고 알려 주세요.",
};

// OpenRouter HTTP 오류(또는 200 안의 error 객체) → AiCallError
export function classifyHttpError(status, message = "") {
  const detail = `${status} ${message}`.trim().slice(0, 300);
  // 키 오류(401)·크레딧 부족(402)은 모든 모델에 공통이라 재시도·전환하지 않는다
  if (status === 401 || status === 402) return new AiCallError("AI_AUTH_ERROR", "fatal", detail, AUTH_MESSAGES[status]);
  if (status === 403) {
    // 403은 키 문제 외에 입력이 검열(moderation)에 걸린 경우에도 온다. 같은 글은 다른 모델로 보내도 걸린다
    if (/moderat|flagged/i.test(message)) return new AiCallError("CONTENT_BLOCKED", "fatal", detail);
    return new AiCallError("AI_AUTH_ERROR", "fatal", detail, AUTH_MESSAGES[403]);
  }
  if (status === 429) {
    // 계정 하루 무료 한도는 모든 무료 모델이 공유하므로 다른 모델로 넘어가도 소용없다
    if (/per-day|free-models-per-day|daily/i.test(message)) return new AiCallError("DAILY_LIMIT", "fatal", detail);
    return new AiCallError("RATE_LIMITED", "next", detail);
  }
  // 본문이 너무 큼: 다른 모델로 보내도 똑같다
  if (status === 413) return new AiCallError("UPSTREAM_ERROR", "fatal", detail);
  // 400·422는 보내는 형식이 고정이라 대개 그 모델이 매개변수(reasoning 등)를 받지 않는 경우다 → 다음 모델
  if (status === 400 || status === 422) return new AiCallError("UPSTREAM_ERROR", "next", detail);
  if (status === 408 || status === 500 || status === 502 || status === 503) return new AiCallError("UPSTREAM_ERROR", "retry", detail);
  // 404(모델 없음·무료 제공 종료) 등은 그 모델 문제로 보고 다음 모델로
  const err = new AiCallError("UPSTREAM_ERROR", "next", detail);
  err.unavailable = status === 404;
  return err;
}

// 호출 1회: { content, finishReason, model } 반환, 실패하면 AiCallError
export function createChat({ apiKey, fetchImpl = globalThis.fetch, baseUrl = BASE_URL, appTitle = "AI Empathy Diary" } = {}) {
  return async function chat({ model, messages, temperature, maxTokens, reasoningEffort, timeoutMs, signal }) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const callSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res;
    let data;
    try {
      res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": appTitle },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        }),
        signal: callSignal,
      });
      const raw = await res.text();
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { unparsable: raw.slice(0, 200) };
      }
    } catch (err) {
      if (signal?.aborted) throw cancelledError(`${model} cancelled during call`);
      if (timeout.aborted || err.name === "TimeoutError") {
        throw new AiCallError("AI_TIMEOUT", "next", `${model} timeout after ${timeoutMs}ms`);
      }
      throw new AiCallError("UPSTREAM_ERROR", "retry", `${model} network error: ${err.message}`);
    }
    // OpenRouter는 HTTP 200 안에 error 객체를 담아 보내기도 한다
    if (!res.ok || data.error) {
      const status = Number(data.error?.code) || res.status;
      const message = [data.error?.message, data.error?.metadata?.raw].filter((v) => v != null).map(String).join(" | ");
      throw classifyHttpError(status === 200 ? 502 : status, `${model}: ${message || data.unparsable || `HTTP ${res.status}`}`);
    }
    // 200인데 본문이 JSON이 아니면 그 경로(공급자) 문제로 보고 형식 재요청 대신 다음 모델로 넘어간다
    if (data.unparsable !== undefined) {
      throw new AiCallError("UPSTREAM_ERROR", "next", `${model}: 200 with non-JSON body: ${data.unparsable.slice(0, 120)}`);
    }
    const choice = data.choices?.[0];
    return {
      content: typeof choice?.message?.content === "string" ? choice.message.content : "",
      finishReason: choice?.finish_reason ?? null,
      model: typeof data.model === "string" && data.model ? data.model : model,
    };
  };
}

// 요청 1건(일기 1건 분석)이 쓸 수 있는 호출 수와 시간
export class Budget {
  constructor({ maxCalls, totalMs, signal = null, now = Date.now }) {
    this.maxCalls = maxCalls;
    this.calls = 0;
    this.now = now;
    this.deadline = now() + totalMs;
    this.signal = signal;
    this.fallbacks = []; // 로그용: 다음 모델로 넘어간 이유
  }
  remainingMs() {
    return this.deadline - this.now();
  }
  canCall() {
    return this.calls < this.maxCalls && this.remainingMs() >= MIN_CALL_MS;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (!ms) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

const failedAt = new Map(); // 모델 → 마지막 실패 시각 (쿨다운용, 프로세스 전체 공유)
export const resetModelCooldown = () => failedAt.clear();

// models를 순서대로 시도해 처음 성공한 결과를 돌려준다.
// 5xx·네트워크 오류는 같은 모델에서 1회 재시도하되, 남은 호출 수가 아직 안 불러 본 모델마다 1회씩 남을 때만 한다
// (재시도로 예산을 다 써서 다른 공급자 모델을 못 부르는 일을 막음). 429·404·타임아웃은 다음 모델,
// 인증·크레딧·하루 한도·검열·요청 오류는 바로 실패. 최근 실패한 모델은 cooldownMs 동안 순서 맨 뒤로 미룬다.
export async function chatWithFallback({ chat, models, messages, budget, options, retryDelayMs = 1000, cooldownMs = 0 }) {
  const now = budget.now;
  const cooling = (m) => cooldownMs > 0 && now() - (failedAt.get(m) ?? -Infinity) < cooldownMs;
  const order = [...models.filter((m) => !cooling(m)), ...models.filter(cooling)];
  const errors = [];
  for (const [index, model] of order.entries()) {
    const untriedModels = order.length - index - 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (budget.signal?.aborted) throw cancelledError(`cancelled after ${budget.calls} calls`);
      if (!budget.canCall()) return failWith(errors, budget);
      budget.calls++;
      try {
        const timeoutMs = Math.min(options.timeoutMs, budget.remainingMs());
        const result = await chat({ ...options, model, messages, timeoutMs, signal: budget.signal });
        failedAt.delete(model);
        return result;
      } catch (err) {
        if (err.cancelled) throw err;
        if (budget.signal?.aborted) throw cancelledError(`cancelled after ${budget.calls} calls`);
        if (!(err instanceof AiCallError)) throw err;
        errors.push(err);
        if (err.action === "fatal") throw err;
        if (err.action === "retry" && attempt === 0 && budget.maxCalls - budget.calls > untriedModels) {
          await sleep(retryDelayMs, budget.signal);
          continue;
        }
        failedAt.set(model, now());
        budget.fallbacks.push(`${model} ${err.code} (${err.detail.slice(0, 160)})`);
        break;
      }
    }
  }
  return failWith(errors, budget);
}

// 모든 모델이 실패했거나 예산이 끝났을 때의 최종 오류
function failWith(errors, budget) {
  // 모델별 이유는 budget.fallbacks로 로그에 남으므로 여기엔 마지막 오류만 적는다
  const last = errors.at(-1);
  const summary = last ? `last: ${last.detail}` : "";
  if (!last) throw new ApiError("AI_TIMEOUT", undefined, "budget exhausted before any call");
  // 한도 초과(429)와 없어진 모델(404)뿐이면 "잠시 후 다시"가 맞는 안내다
  if (errors.some((e) => e.code === "RATE_LIMITED") && errors.every((e) => e.code === "RATE_LIMITED" || e.unavailable)) {
    throw new ApiError("RATE_LIMITED", undefined, summary);
  }
  // 시간 예산이 끝나서 멈췄으면 타임아웃으로 본다
  if (budget.remainingMs() < MIN_CALL_MS) throw new ApiError("AI_TIMEOUT", undefined, summary);
  throw new ApiError(last.code, undefined, summary);
}
