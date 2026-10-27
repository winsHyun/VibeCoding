// 작성일시: 2026-10-26 15:20
// 대체 모델 전환 로직 테스트 (API 호출 없음): npm test
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { OpenRouterError, RequestBudget, callOpenRouter, chat, withModelFallback, resetModelCooldowns, formatUsage } from "../src/openrouter.js";

const MODELS = ["a:free", "b:free", "c:free"];
const fail = (code, status) => {
  throw new OpenRouterError(code, "msg", status, `${code} detail`);
};

// 실제 OpenRouter 대신 응답을 흉내 내는 fetch. reply(call)은 Response를 돌려주고, 호출 기록은 calls에 남는다
const realFetch = globalThis.fetch;
let calls = [];
function mockFetch(reply) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), body: JSON.parse(init.body), signal: init.signal };
    calls.push(call);
    return reply(call, calls.length);
  };
}
const jsonResponse = (status, data, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const errorResponse = (status, message = "error", headers) => jsonResponse(status, { error: { code: status, message } }, headers);
const okChat = () => jsonResponse(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });

// 모든 호출을 같은 예산으로 묶어 대체 모델까지 시도하는 레시피 경로와 같은 모양
const chatAll = (budget) => withModelFallback(MODELS, (model) => chat([], { model, budget, timeoutMs: 5000 }), { label: "test", budget });

beforeEach(() => resetModelCooldowns());
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("첫 모델이 성공하면 그 결과와 모델 이름을 돌려준다", async () => {
  const { result, model } = await withModelFallback(MODELS, async (m) => `ok:${m}`);
  assert.equal(result, "ok:a:free");
  assert.equal(model, "a:free");
});

test("모델 쪽 장애(과부하·공유 사용량 초과)면 다음 모델로 넘어간다", async () => {
  const tried = [];
  const { model } = await withModelFallback(MODELS, async (m) => {
    tried.push(m);
    if (m === "a:free") fail("UPSTREAM_ERROR", 502);
    if (m === "b:free") fail("RATE_LIMITED", 429);
    return "ok";
  });
  assert.deepEqual(tried, MODELS);
  assert.equal(model, "c:free");
});

test("계정 하루 한도와 키 오류는 다른 모델로 넘어가지 않고 바로 실패", async () => {
  for (const code of ["DAILY_LIMIT", "AUTH_ERROR"]) {
    const tried = [];
    await assert.rejects(
      withModelFallback(MODELS, async (m) => (tried.push(m), fail(code, 429))),
      (err) => err.code === code,
    );
    assert.deepEqual(tried, ["a:free"]);
  }
});

test("모든 모델이 실패하면 마지막 오류를 던진다", async () => {
  await assert.rejects(
    withModelFallback(MODELS, async (m) => fail(m === "c:free" ? "RATE_LIMITED" : "UPSTREAM_ERROR", 502)),
    (err) => err.code === "RATE_LIMITED",
  );
});

test("최근 실패한 모델은 쿨다운 동안 맨 뒤로 밀리고, 쿨다운이 지나면 원래 순서로 돌아온다", async () => {
  let clock = 0;
  const now = () => clock;
  await withModelFallback(MODELS, async (m) => (m === "a:free" ? fail("UPSTREAM_ERROR", 502) : "ok"), { now });

  const tried = [];
  await withModelFallback(MODELS, async (m) => (tried.push(m), "ok"), { now });
  assert.deepEqual(tried, ["b:free"]);

  clock = 10 * 60 * 1000; // 기본 쿨다운 5분 경과
  const later = await withModelFallback(MODELS, async () => "ok", { now });
  assert.equal(later.model, "a:free");
});

test("OpenRouterError가 아닌 오류(코드 버그 등)는 그대로 던진다", async () => {
  const tried = [];
  await assert.rejects(
    withModelFallback(MODELS, async (m) => {
      tried.push(m);
      throw new TypeError("bug");
    }),
    TypeError,
  );
  assert.deepEqual(tried, ["a:free"]);
});

// ---- callOpenRouter 재시도 정책과 요청 예산 (가짜 fetch, API 호출 없음) ----

test("429는 같은 모델에서 재시도하지 않고 다음 모델로 넘어간다", async () => {
  mockFetch((call) => (call.body.model === "c:free" ? okChat() : errorResponse(429, "rate limited")));
  const { model } = await chatAll(new RequestBudget());
  assert.equal(model, "c:free");
  assert.deepEqual(calls.map((c) => c.body.model), MODELS); // 모델당 1회씩
});

test("429라도 Retry-After가 짧으면 같은 모델에서 1회 기다렸다 재시도", async () => {
  mockFetch((_, n) => (n === 1 ? errorResponse(429, "rate limited", { "retry-after": "0" }) : okChat()));
  await callOpenRouter("/chat/completions", { model: "a:free" });
  assert.equal(calls.length, 2);
});

test("502/503과 네트워크 오류는 같은 모델에서 1회만 재시도", async () => {
  mockFetch(() => errorResponse(503, "overloaded"));
  await assert.rejects(callOpenRouter("/x", { model: "a:free" }, { retryDelayMs: 1 }), (err) => err.code === "UPSTREAM_ERROR");
  assert.equal(calls.length, 2);

  mockFetch((_, n) => {
    if (n === 1) throw new TypeError("fetch failed");
    return okChat();
  });
  await callOpenRouter("/x", { model: "a:free" }, { retryDelayMs: 1 });
  assert.equal(calls.length, 2);
});

test("타임아웃은 같은 모델에서 재시도하지 않는다 (UPSTREAM_ERROR 504 → 다음 모델로)", async () => {
  mockFetch((call) => new Promise((_, reject) => call.signal.addEventListener("abort", () => reject(call.signal.reason))));
  await assert.rejects(callOpenRouter("/x", { model: "a:free" }, { timeoutMs: 30 }), (err) => err.code === "UPSTREAM_ERROR" && err.status === 504);
  assert.equal(calls.length, 1);
});

test("400/413/422는 REQUEST_ERROR로 바로 실패하고 대체 모델로 넘어가지 않는다", async () => {
  for (const status of [400, 413, 422]) {
    mockFetch(() => errorResponse(status, "bad request"));
    await assert.rejects(chatAll(new RequestBudget()), (err) => err.code === "REQUEST_ERROR");
    assert.equal(calls.length, 1, `status ${status}`);
  }
});

test("404(모델 없음)는 모델 문제이므로 다음 모델로 넘어간다", async () => {
  mockFetch((call) => (call.body.model === "a:free" ? errorResponse(404, "No endpoints found") : okChat()));
  const { model } = await chatAll(new RequestBudget());
  assert.equal(model, "b:free");
});

test("하루 한도(per-day)는 재시도·대체 없이 DAILY_LIMIT", async () => {
  mockFetch(() => errorResponse(429, "Rate limit exceeded: free-models-per-day"));
  await assert.rejects(chatAll(new RequestBudget()), (err) => err.code === "DAILY_LIMIT");
  assert.equal(calls.length, 1);
});

test("요청 예산: 호출 수 상한을 넘으면 BUDGET_EXCEEDED로 중단 (대체 모델이 남아 있어도)", async () => {
  mockFetch(() => errorResponse(429, "rate limited"));
  await assert.rejects(chatAll(new RequestBudget({ maxCalls: 2 })), (err) => err.code === "BUDGET_EXCEEDED");
  assert.equal(calls.length, 2);
});

test("요청 예산: 전체 시간이 다 되면 새 호출을 시작하지 않는다", async () => {
  let clock = 0;
  const budget = new RequestBudget({ maxCalls: 10, timeMs: 5000, now: () => clock });
  mockFetch((call) => {
    clock += 4500; // 첫 호출이 4.5초 걸림
    return errorResponse(429, "rate limited");
  });
  await assert.rejects(chatAll(budget), (err) => err.code === "BUDGET_EXCEEDED");
  assert.equal(calls.length, 1); // 남은 0.5초로는 다음 모델을 부르지 않음
});

test("하루 한도: per-day가 error.message에만 있고 metadata.raw는 다른 문구여도 DAILY_LIMIT", async () => {
  mockFetch(() => jsonResponse(429, { error: { code: 429, message: "Rate limit exceeded: free-models-per-day", metadata: { raw: "upstream busy" } } }));
  await assert.rejects(chatAll(new RequestBudget()), (err) => err.code === "DAILY_LIMIT");
  assert.equal(calls.length, 1);
});

test("402(크레딧 부족)는 AUTH_ERROR가 아니라 INSUFFICIENT_CREDITS이고 대체 모델로 넘어가지 않는다", async () => {
  mockFetch(() => errorResponse(402, "Insufficient credits"));
  await assert.rejects(chatAll(new RequestBudget()), (err) => err.code === "INSUFFICIENT_CREDITS" && err.status === 402);
  assert.equal(calls.length, 1);
});

// fetch가 응답하지 않고 기다리다가 신호가 abort되면 그 이유로 실패한다 (실제 fetch와 같은 동작)
const hangingFetch = () => mockFetch((call) => new Promise((_, reject) => call.signal.addEventListener("abort", () => reject(call.signal.reason))));

test("요청 취소: 클라이언트 신호가 abort되면 진행 중인 호출을 멈추고 재시도·대체 모델 없이 CLIENT_CLOSED", async () => {
  hangingFetch();
  const controller = new AbortController();
  const pending = chatAll(new RequestBudget({ signal: controller.signal }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, (err) => err.code === "CLIENT_CLOSED");
  assert.equal(calls.length, 1);
  // 모델 탓이 아니므로 쿨다운에 넣지 않는다 (다음 요청은 첫 모델부터)
  mockFetch(okChat);
  const { model } = await chatAll(new RequestBudget());
  assert.equal(model, "a:free");
});

test("요청 취소: 이미 abort된 요청은 호출을 시작하지 않는다", async () => {
  mockFetch(okChat);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(chatAll(new RequestBudget({ signal: controller.signal })), (err) => err.code === "CLIENT_CLOSED");
  assert.equal(calls.length, 0);
});

test("요청 취소 신호가 있어도 타임아웃은 그대로 UPSTREAM_ERROR 504", async () => {
  hangingFetch();
  const budget = new RequestBudget({ signal: new AbortController().signal });
  await assert.rejects(callOpenRouter("/x", { model: "a:free" }, { timeoutMs: 30, budget }), (err) => err.code === "UPSTREAM_ERROR" && err.status === 504);
});

test("사용량 요약: 실제 호출 수와 대체 모델로 넘어간 이유를 남긴다", async () => {
  mockFetch((call) => (call.body.model === "c:free" ? okChat() : errorResponse(429, "rate limited")));
  const budget = new RequestBudget({ maxCalls: 6 });
  await chatAll(budget);
  const usage = budget.usage();
  assert.equal(usage.calls, 3);
  assert.equal(usage.fallbacks.length, 2);
  assert.match(usage.fallbacks[0], /^a:free RATE_LIMITED 429/);
  assert.match(formatUsage(usage), /^calls: 3\/6, fallback: a:free RATE_LIMITED 429 .*; b:free RATE_LIMITED 429/);
  assert.equal(formatUsage(new RequestBudget({ maxCalls: 6 }).usage()), "calls: 0/6");
});
