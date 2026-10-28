// 작성일시: 2026-10-27 15:19
// QA에서 찾은 빈 경로 테스트. 처음엔 고쳐지지 않은 동작을 { todo } 로 두었고, 모두 고친 뒤 회귀 테스트가 되었다.
// OpenRouter는 가짜 chat 으로 대신한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import vm from "node:vm";
import { createApp } from "../src/app.js";
import { CRISIS_LINE_MESSAGE, createAnalyzer } from "../src/diary.js";
import { classifyHttpError, resetModelCooldown } from "../src/openrouter.js";
import { createStore } from "../src/store.js";

const quiet = { log() {}, warn() {}, error() {} };
const MODELS = ["a:free", "b:free", "c:free"];
const AI = { temperature: 0.4, maxTokens: 800, callTimeoutMs: 30000, maxCalls: 4, totalTimeoutMs: 60000, retryDelayMs: 0, modelCooldownMs: 0 };
const reply = (comfort) =>
  JSON.stringify({ primary: "tired", intensity: 4, keywords: ["지침"], empathy: "많이 지치셨군요. 그 마음이 느껴져요.", comfort });

// 호출 순서대로 결과(문자열) 또는 오류를 돌려주는 가짜 chat
function fakeChat(steps) {
  const calls = [];
  const chat = async ({ model }) => {
    calls.push(model);
    const out = steps[calls.length - 1];
    if (out instanceof Error) throw out;
    return { content: out, finishReason: "stop", model };
  };
  return { chat, calls };
}

beforeEach(() => resetModelCooldown());

describe("QA: 위기 표현 109 안내 (분석기 전체 경로)", () => {
  test("모델 답에 109가 없으면 comfort 끝에 안내가 붙는다", async () => {
    const { chat } = fakeChat([reply("조금 쉬어 가도 괜찮아요.")]);
    const analyze = createAnalyzer({ chat, models: MODELS, ai: AI });
    const result = await analyze("요즘 너무 지쳐서 그냥 사라지고 싶어");
    // 모델 답에 crisis 필드가 없어(=false) 위기 재요청 → 가짜 chat이 더 답하지 않아 서버 고정 안전 문구(109 안내 포함)
    assert.ok(result.comfort.includes(CRISIS_LINE_MESSAGE));
    assert.equal(result.crisisReply, "fallback");
  });
  test("모델 답에 이미 109가 있으면 중복으로 붙이지 않는다", async () => {
    const { chat } = fakeChat([reply("힘들면 109에 전화해 보세요.")]);
    const analyze = createAnalyzer({ chat, models: MODELS, ai: AI });
    const result = await analyze("죽고 싶다는 생각이 들어");
    assert.equal(result.comfort.match(/109/g).length, 1);
  });
  test("위기 표현이 없으면 안내를 붙이지 않는다", async () => {
    const { chat } = fakeChat([reply("푹 쉬세요.")]);
    const analyze = createAnalyzer({ chat, models: MODELS, ai: AI });
    const result = await analyze("야근 3일째라 몸이 무거워");
    assert.equal(result.comfort, "푹 쉬세요.");
  });
});

describe("QA: 실제 OpenRouter 429 문구 분류", () => {
  test("'temporarily rate-limited upstream' 429 는 다음 모델로 넘어간다", async () => {
    const upstream = classifyHttpError(429, "a:free: Provider returned error | a:free is temporarily rate-limited upstream. Please retry shortly");
    const { chat, calls } = fakeChat([upstream, reply("쉬어 가요.")]);
    const analyze = createAnalyzer({ chat, models: MODELS, ai: AI });
    const result = await analyze("피곤해");
    assert.deepEqual(calls, ["a:free", "b:free"]);
    assert.equal(result.model, "b:free");
  });
});

// ---------- HTTP ----------
let dir;
let server;
let base;
let analyzeImpl;
const errorLogs = []; // 서버 오류 로그(스택 남김 여부 확인용)

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "diary-qa-"));
  const app = createApp({
    store: createStore(join(dir, "entries.json"), { logger: quiet }),
    analyze: (text, opts) => analyzeImpl(text, opts),
    hasApiKey: () => true,
    primaryModel: "a:free",
    indexPath: join(dir, "missing-index.html"),
    logger: { ...quiet, error: (...args) => errorLogs.push(args) },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

// fetch 는 Host 헤더를 바꿀 수 없어 node:http 로 보낸다
function rawRequest({ method = "GET", path, headers = {}, body }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("QA: HTTP 경계", () => {
  test("하루 무료 한도 429 는 DAILY_LIMIT 와 안내 문구(내일 다시)로 전달된다 (B-01)", async () => {
    const { chat } = fakeChat([classifyHttpError(429, "Rate limit exceeded: free-models-per-day")]);
    analyzeImpl = createAnalyzer({ chat, models: MODELS, ai: AI });
    const res = await fetch(`${base}/api/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "오늘" }) });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.error.code, "DAILY_LIMIT");
    assert.match(body.error.message, /내일/);
  });

  test("잘못된 Content-Encoding(gzip 아님) 본문은 400 INVALID_INPUT, 스택 로그 없음 (B-05)", async () => {
    errorLogs.length = 0;
    const res = await rawRequest({ method: "POST", path: "/api/entries", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: '{"text":"hi"}' });
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.body).error.code, "INVALID_INPUT");
    assert.equal(errorLogs.length, 0);
  });

  test("로컬이 아닌 Host 헤더(DNS 리바인딩)는 일기 목록을 주지 않는다 (B-02)", async () => {
    const res = await rawRequest({ path: "/api/entries", headers: { Host: "attacker.example:3000" } });
    assert.equal(res.status, 403);
    assert.equal(JSON.parse(res.body).error.code, "FORBIDDEN_ORIGIN");
  });
});

// ---------- 화면(index.html) 정적 검사 ----------
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));

// 인라인 스크립트에서 함수 하나를 꺼내 DOM 없이 실행한다
function loadFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found in index.html`);
  let depth = 0;
  let end = script.indexOf("{", start);
  for (let i = end; i < script.length; i++) {
    if (script[i] === "{") depth++;
    else if (script[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  return vm.runInNewContext(`(${script.slice(start, end)})`);
}

describe("QA: index.html", () => {
  test("서버 데이터를 HTML 로 해석하는 API(innerHTML 등)를 쓰지 않는다", () => {
    assert.doesNotMatch(script, /\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write\(/);
  });

  test("API 키·OpenRouter 주소가 화면 코드에 없다", () => {
    assert.doesNotMatch(html, /sk-or-|openrouter\.ai/i);
  });

  test("하루 한도 DAILY_LIMIT 는 서버 안내(내일 다시)를 보여 주고 '다시 전하기'를 권하지 않는다 (B-01)", () => {
    const describeError = loadFunction("describeError");
    const info = describeError({ code: "DAILY_LIMIT", serverMessage: "오늘 일기 친구가 들을 수 있는 이야기를 모두 들었어요. 내일 다시 찾아와 주세요." });
    assert.match(info.message, /내일/);
    assert.equal(info.retry, false);
  });

  test("일반 RATE_LIMITED 는 잠시 후 다시 시도 안내와 재시도 버튼", () => {
    const describeError = loadFunction("describeError");
    const info = describeError({ code: "RATE_LIMITED", serverMessage: "지금은 AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." });
    assert.equal(info.retry, true);
  });
});
