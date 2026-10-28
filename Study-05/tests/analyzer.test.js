// 작성일시: 2026-10-27 15:24
// 모델 대체 전환·재시도·오류 코드 매핑·형식 오류 재요청 테스트. OpenRouter는 가짜 chat/fetch로 대신한다
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { createAnalyzer } from "../src/diary.js";
import { AiCallError, classifyHttpError, createChat, resetModelCooldown } from "../src/openrouter.js";

const MODELS = ["a:free", "b:free", "c:free"];
const AI = { temperature: 0.4, maxTokens: 800, callTimeoutMs: 30000, maxCalls: 4, totalTimeoutMs: 60000, retryDelayMs: 0, modelCooldownMs: 0 };
const GOOD = JSON.stringify({
  primary: "sadness",
  intensity: 3,
  keywords: ["서운함"],
  empathy: "친구와 다투셔서 마음이 많이 상하셨겠어요. 서운한 마음이 드는 게 당연해요.",
  comfort: "오늘은 스스로를 다독여 주세요.",
});

// script: 호출 순서대로 (model) => 결과 또는 throw 할 오류
function fakeChat(script) {
  const calls = [];
  const chat = async ({ model, signal }) => {
    calls.push(model);
    const step = script[calls.length - 1];
    if (!step) throw new Error(`unexpected call #${calls.length} to ${model}`);
    const out = await step(model, signal);
    if (out instanceof Error) throw out;
    return { content: out, finishReason: "stop", model };
  };
  return { chat, calls };
}
const ok = (content = GOOD) => () => content;
const fail = (status, msg = "") => () => classifyHttpError(status, msg);
const timeout = () => () => new AiCallError("AI_TIMEOUT", "next", "timeout");

const analyzerWith = (script, ai = AI) => {
  const fake = fakeChat(script);
  return { analyze: createAnalyzer({ chat: fake.chat, models: MODELS, ai }), calls: fake.calls };
};

beforeEach(() => resetModelCooldown());

describe("모델 대체 전환", () => {
  test("성공하면 실제 응답한 모델을 돌려준다", async () => {
    const { analyze, calls } = analyzerWith([ok()]);
    const r = await analyze("친구랑 싸웠다");
    assert.equal(r.model, "a:free");
    assert.equal(r.emotion.label, "슬픔");
    assert.deepEqual(calls, ["a:free"]);
  });
  test("429 → 다음 모델", async () => {
    const { analyze, calls } = analyzerWith([fail(429, "rate-limited upstream"), ok()]);
    const r = await analyze("친구랑 싸웠다");
    assert.equal(r.model, "b:free");
    assert.deepEqual(calls, ["a:free", "b:free"]);
    assert.equal(r.usage.fallbacks.length, 1);
  });
  test("404(모델 없음) → 다음 모델", async () => {
    const { analyze, calls } = analyzerWith([fail(404, "This model is unavailable for free"), fail(404), ok()]);
    assert.equal((await analyze("x 했다")).model, "c:free");
    assert.deepEqual(calls, MODELS);
  });
  test("503은 같은 모델에서 1회 재시도", async () => {
    const { analyze, calls } = analyzerWith([fail(503), ok()]);
    assert.equal((await analyze("오늘")).model, "a:free");
    assert.deepEqual(calls, ["a:free", "a:free"]);
  });
  test("503이 두 번이면 다음 모델", async () => {
    const { analyze, calls } = analyzerWith([fail(502), fail(503), ok()]);
    assert.equal((await analyze("오늘")).model, "b:free");
    assert.deepEqual(calls, ["a:free", "a:free", "b:free"]);
  });
  test("실패한 모델은 쿨다운 동안 뒤로 밀린다", async () => {
    const ai = { ...AI, modelCooldownMs: 60000 };
    const first = analyzerWith([fail(429), ok()], ai);
    await first.analyze("오늘");
    const second = analyzerWith([ok()], ai);
    assert.equal((await second.analyze("오늘")).model, "b:free");
  });
});

describe("오류 코드 매핑", () => {
  const cases = [
    ["401 → AI_AUTH_ERROR, 재시도·전환 없음", [fail(401, "No auth credentials")], "AI_AUTH_ERROR", 502, 1],
    ["402 → AI_AUTH_ERROR", [fail(402, "Insufficient credits")], "AI_AUTH_ERROR", 502, 1],
    ["403 → AI_AUTH_ERROR", [fail(403, "Forbidden")], "AI_AUTH_ERROR", 502, 1],
    ["하루 한도 429 → DAILY_LIMIT, 전환 없음", [fail(429, "Rate limit exceeded: free-models-per-day")], "DAILY_LIMIT", 429, 1],
    ["403 검열(moderation) → CONTENT_BLOCKED 422, 전환 없음", [fail(403, "Input was flagged by moderation")], "CONTENT_BLOCKED", 422, 1],
    ["모든 모델 500 → 같은 모델 재시도는 다른 모델 몫을 남길 때만, 세 모델 모두 시도", [fail(500), fail(500), fail(500), fail(500)], "UPSTREAM_ERROR", 502, 4],
    ["모든 모델 429 → RATE_LIMITED", [fail(429), fail(429), fail(429)], "RATE_LIMITED", 429, 3],
    ["모든 모델 타임아웃 → AI_TIMEOUT", [timeout(), timeout(), timeout()], "AI_TIMEOUT", 504, 3],
    ["413 → UPSTREAM_ERROR, 전환 없음", [fail(413, "too large")], "UPSTREAM_ERROR", 502, 1],
    ["400(매개변수 미지원)은 다음 모델, 모두 400 → UPSTREAM_ERROR", [fail(400), fail(400), fail(400)], "UPSTREAM_ERROR", 502, 3],
    ["429와 404(모델 없음)뿐 → RATE_LIMITED", [fail(429), fail(404), fail(429)], "RATE_LIMITED", 429, 3],
    ["429와 5xx가 섞이면 마지막 오류 UPSTREAM_ERROR", [fail(429), fail(500), fail(500), fail(503)], "UPSTREAM_ERROR", 502, 4],
  ];
  for (const [name, script, code, status, callCount] of cases) {
    test(name, async () => {
      const { analyze, calls } = analyzerWith(script);
      await assert.rejects(analyze("오늘"), (err) => err.code === code && err.status === status);
      assert.equal(calls.length, callCount);
    });
  }
  test("호출 수 상한(maxCalls)을 넘지 않는다", async () => {
    const { analyze, calls } = analyzerWith([fail(503), fail(503), fail(503), fail(503)], { ...AI, maxCalls: 3 });
    await assert.rejects(analyze("오늘"), { code: "UPSTREAM_ERROR" });
    assert.equal(calls.length, 3);
  });
});

describe("형식 오류 재요청", () => {
  test("첫 답이 JSON이 아니면 1회 재요청해 성공", async () => {
    const { analyze, calls } = analyzerWith([ok("죄송해요, 다시 말씀해 주세요."), ok("```json\n" + GOOD + "\n```")]);
    assert.equal((await analyze("오늘")).emotion.primary, "sadness");
    assert.equal(calls.length, 2);
  });
  test("두 번 다 형식 오류면 AI_BAD_RESPONSE", async () => {
    const { analyze, calls } = analyzerWith([ok("not json"), ok('{"primary":"joy"}')]);
    await assert.rejects(analyze("오늘"), { code: "AI_BAD_RESPONSE", status: 502 });
    assert.equal(calls.length, 2);
  });
});

describe("취소", () => {
  test("클라이언트가 끊기면 진행 중인 호출을 멈추고 더 호출하지 않는다", async () => {
    const controller = new AbortController();
    const { analyze, calls } = analyzerWith([
      (model, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve(new AiCallError("UPSTREAM_ERROR", "retry", "aborted")));
          setTimeout(() => controller.abort(), 10);
        }),
    ]);
    await assert.rejects(analyze("오늘", { signal: controller.signal }), (err) => err.cancelled === true);
    assert.equal(calls.length, 1);
  });
});

describe("createChat (fetch 모의)", () => {
  const response = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  test("정상 응답을 content·model로 바꾸고, 키를 Authorization 헤더로만 보낸다", async () => {
    let seen;
    const chat = createChat({
      apiKey: "sk-test",
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return response(200, { model: "a:free", choices: [{ message: { content: GOOD }, finish_reason: "stop" }] });
      },
    });
    const r = await chat({ model: "a:free", messages: [], temperature: 0.4, maxTokens: 800, timeoutMs: 1000 });
    assert.deepEqual(r, { content: GOOD, finishReason: "stop", model: "a:free" });
    assert.equal(seen.init.headers.Authorization, "Bearer sk-test");
    const body = JSON.parse(seen.init.body);
    assert.equal(body.reasoning, undefined);
    assert.equal(body.temperature, 0.4);
    assert.equal(body.max_tokens, 800);
    assert.equal(seen.init.body.includes("sk-test"), false);
  });
  test("reasoningEffort를 주면 reasoning.effort로 보낸다", async () => {
    let body;
    const chat = createChat({
      apiKey: "k",
      fetchImpl: async (url, init) => ((body = JSON.parse(init.body)), response(200, { choices: [{ message: { content: "x" } }] })),
    });
    const r = await chat({ model: "m", messages: [], reasoningEffort: "none", timeoutMs: 1000 });
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(r.model, "m"); // 응답에 model이 없으면 요청한 모델
  });
  test("HTTP 200 안의 error 객체도 오류로 분류", async () => {
    const chat = createChat({ apiKey: "k", fetchImpl: async () => response(200, { error: { code: 429, message: "Provider returned error" } }) });
    await assert.rejects(chat({ model: "m", messages: [], timeoutMs: 1000 }), { code: "RATE_LIMITED", action: "next" });
  });
  test("HTTP 402·404·JSON 아닌 503 분류", async () => {
    const run = (status, body) => createChat({ apiKey: "k", fetchImpl: async () => response(status, body) })({ model: "m", messages: [], timeoutMs: 1000 });
    await assert.rejects(run(402, { error: { code: 402, message: "credits" } }), { code: "AI_AUTH_ERROR", action: "fatal" });
    await assert.rejects(run(404, { error: { code: 404, message: "unavailable" } }), { code: "UPSTREAM_ERROR", action: "next" });
    await assert.rejects(run(503, "<html>bad gateway</html>"), { code: "UPSTREAM_ERROR", action: "retry" });
  });
  test("타임아웃 → AI_TIMEOUT, 네트워크 오류 → 재시도 대상", async () => {
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    await assert.rejects(createChat({ apiKey: "k", fetchImpl: hang })({ model: "m", messages: [], timeoutMs: 20 }), { code: "AI_TIMEOUT" });
    const broken = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(createChat({ apiKey: "k", fetchImpl: broken })({ model: "m", messages: [], timeoutMs: 1000 }), { action: "retry" });
  });
});

describe("5xx 재시도와 호출 예산 (B-06)", () => {
  test("모든 모델 500이면 a,a,b,c 순서로 불러 다른 공급자 모델까지 간다", async () => {
    const { analyze, calls } = analyzerWith([fail(500), fail(500), fail(502), ok()]);
    const r = await analyze("오늘");
    assert.equal(r.model, "c:free");
    assert.deepEqual(calls, ["a:free", "a:free", "b:free", "c:free"]);
  });
  test("예산이 모델 수만큼뿐이면 같은 모델 재시도 없이 바로 다음 모델", async () => {
    const { analyze, calls } = analyzerWith([fail(503), fail(503), ok()], { ...AI, maxCalls: 3 });
    assert.equal((await analyze("오늘")).model, "c:free");
    assert.deepEqual(calls, MODELS);
  });
});

describe("오류 메시지 구분", () => {
  test("401·402·403(검열 아님)은 AI_AUTH_ERROR 이지만 원인별 메시지", () => {
    const m401 = classifyHttpError(401, "No auth credentials").message;
    const m402 = classifyHttpError(402, "Insufficient credits").message;
    const m403 = classifyHttpError(403, "Forbidden").message;
    assert.match(m401, /키/);
    assert.match(m402, /크레딧/);
    assert.equal(new Set([m401, m402, m403]).size, 3);
  });
  test("하루 한도는 DAILY_LIMIT(내일 안내), 일시적 429는 RATE_LIMITED", () => {
    const daily = classifyHttpError(429, "Rate limit exceeded: free-models-per-day. Add 10 credits");
    assert.equal(daily.code, "DAILY_LIMIT");
    assert.equal(daily.status, 429);
    assert.match(daily.message, /내일/);
    assert.equal(classifyHttpError(429, "temporarily rate-limited upstream").code, "RATE_LIMITED");
  });
});

describe("말투(반말) 후처리", () => {
  const banmal = JSON.stringify({
    primary: "anger", intensity: 4, keywords: ["배신감"],
    empathy: "팀장님이 네가 한 일을 가로채서 정말 속상했겠어요.", comfort: "네가 한 노력은 사라지지 않아요.",
  });
  const polite = JSON.stringify({
    primary: "anger", intensity: 4, keywords: ["배신감"],
    empathy: "애써 하신 일을 팀장님이 자기 것처럼 보고해서 정말 화가 나셨겠어요.", comfort: "들인 노력은 사라지지 않아요.",
  });
  test("반말이 섞이면 1회 다시 요청해 존댓말 답을 쓴다", async () => {
    const { analyze, calls } = analyzerWith([ok(banmal), ok(polite)]);
    const r = await analyze("팀장이 내가 한 일을 자기가 한 것처럼 보고해서 너무 화가 나");
    assert.equal(calls.length, 2);
    assert.doesNotMatch(r.empathy + r.comfort, /네가/);
    assert.equal(r.style, "banmal fixed");
  });
  test("다시 받은 답도 반말이거나 재요청이 실패하면 서버가 2인칭을 지워 쓴다(실패시키지 않음, B-04)", async () => {
    const twice = analyzerWith([ok(banmal), ok(banmal)]);
    const r1 = await twice.analyze("화가 나");
    assert.doesNotMatch(r1.empathy + r1.comfort, /네가/);
    assert.equal(r1.style, "banmal patched");
    const failed = analyzerWith([ok(banmal), fail(429), fail(429), fail(429)]);
    const r = await failed.analyze("화가 나");
    assert.equal(r.emotion.primary, "anger");
    assert.doesNotMatch(r.empathy + r.comfort, /네가/);
    assert.equal(r.style, "banmal patched");
  });
  test("일기 원문에 같은 말이 있으면(인용) 다시 요청하지 않는다", async () => {
    const { analyze, calls } = analyzerWith([ok(banmal)]);
    await analyze("친구가 '네가 뭘 알아'라고 해서 화가 나");
    assert.equal(calls.length, 1);
  });
});

describe("위기 여부(crisis)", () => {
  const withCrisis = (crisis) =>
    JSON.stringify({ primary: "sadness", intensity: 4, keywords: ["절망"], empathy: "많이 힘드셨겠어요.", comfort: "곁에 있을게요.", crisis });
  test("서버 패턴에 걸리면 모델이 false라도 crisis: true + 109 안내", async () => {
    const { analyze } = analyzerWith([ok(withCrisis(false))]);
    const r = await analyze("살 이유가 없어");
    assert.equal(r.crisis, true);
    assert.match(r.comfort, /109/);
  });
  test("패턴에 없어도 모델이 crisis: true 면 true + 109 안내", async () => {
    const { analyze } = analyzerWith([ok(withCrisis(true))]);
    const r = await analyze("모든 게 무너졌어. 내일이 무서워");
    assert.equal(r.crisis, true);
    assert.match(r.comfort, /109/);
  });
  test("둘 다 아니면 false, 안내 없음", async () => {
    const { analyze } = analyzerWith([ok(withCrisis("maybe"))]);
    const r = await analyze("배고파 죽겠다");
    assert.equal(r.crisis, false);
    assert.doesNotMatch(r.comfort, /109/);
  });
});

describe("createChat: 200인데 본문이 JSON이 아님", () => {
  test("형식 재요청 대신 다음 모델로 넘긴다", async () => {
    const chat = createChat({ apiKey: "k", fetchImpl: async () => new Response("<html>oops</html>", { status: 200 }) });
    await assert.rejects(chat({ model: "m", messages: [], timeoutMs: 1000 }), { code: "UPSTREAM_ERROR", action: "next" });
  });
});
