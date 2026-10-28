// 작성일시: 2026-10-27 15:30
// HTTP 계약 테스트: 입력 검증, 오류 형식·상태 코드, 목록·삭제, 출처(Host·Origin) 검사, 연결 끊김 취소. 분석기는 가짜를 주입한다
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { ApiError } from "../src/errors.js";
import { createStore } from "../src/store.js";

const quiet = { log() {}, warn() {}, error() {} };
const ANALYSIS = {
  emotion: { primary: "joy", label: "기쁨", intensity: 4, keywords: ["뿌듯함"] },
  empathy: "발표를 잘 끝내셨군요. 정말 뿌듯하셨겠어요.",
  comfort: "오늘의 기쁨을 오래 간직하세요.",
  model: "a:free",
  usage: { calls: 1, maxCalls: 4, fallbacks: [] },
};

let dir;
let server;
let base;
let hasKey = true;
let analyzeImpl = async () => ANALYSIS;
let lastSignal;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "diary-app-"));
  const app = createApp({
    store: createStore(join(dir, "entries.json"), { logger: quiet }),
    analyze: (text, opts) => {
      lastSignal = opts.signal;
      return analyzeImpl(text, opts);
    },
    hasApiKey: () => hasKey,
    primaryModel: "a:free",
    indexPath: join(dir, "missing-index.html"),
    logger: quiet,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const post = (body, headers = {}) =>
  fetch(`${base}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function expectError(res, status, code) {
  assert.equal(res.status, status);
  const body = await res.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, "string");
  assert.ok(body.error.message.length > 0);
}

describe("기본", () => {
  test("GET /api/health", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.deepEqual(await res.json(), { ok: true, model: "a:free", hasApiKey: true });
  });
  test("GET / 는 index.html이 없으면 404", async () => {
    await expectError(await fetch(`${base}/`), 404, "NOT_FOUND");
  });
  test("모르는 API 경로는 404 NOT_FOUND", async () => {
    await expectError(await fetch(`${base}/api/nope`), 404, "NOT_FOUND");
  });
  test(".env 등 루트 파일은 제공하지 않는다", async () => {
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  });
});

describe("POST /api/entries 입력 검증", () => {
  for (const [name, body] of [
    ["text 없음", {}],
    ["빈 문자열", { text: "" }],
    ["공백만", { text: "   " }],
    ["숫자", { text: 12 }],
    ["301자", { text: "가".repeat(301) }],
    ["JSON 깨짐", "{ text: "],
    ["배열 본문", "[]"],
  ]) {
    test(`${name} → 400 INVALID_INPUT`, async () => {
      await expectError(await post(body), 400, "INVALID_INPUT");
    });
  }
  test("10kb 넘는 본문 → 400 INVALID_INPUT", async () => {
    await expectError(await post({ text: "a", pad: "x".repeat(11 * 1024) }), 400, "INVALID_INPUT");
  });
  test("API 키 없음 → 500 CONFIG_ERROR (검증은 먼저)", async () => {
    hasKey = false;
    try {
      await expectError(await post({ text: "오늘" }), 500, "CONFIG_ERROR");
      await expectError(await post({ text: "" }), 400, "INVALID_INPUT");
    } finally {
      hasKey = true;
    }
  });
});

describe("일기 저장·목록·삭제", () => {
  test("201로 Entry를 돌려주고, 목록은 최신순, 삭제는 204/404", async () => {
    let received;
    analyzeImpl = async (text) => ((received = text), ANALYSIS);
    const res1 = await post({ text: "  첫 번째 일기  " });
    assert.equal(res1.status, 201);
    const { entry } = await res1.json();
    assert.equal(received, "첫 번째 일기");
    assert.equal(entry.text, "첫 번째 일기");
    assert.equal(typeof entry.id, "string");
    assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
    assert.deepEqual(entry.emotion, ANALYSIS.emotion);
    assert.equal(entry.empathy, ANALYSIS.empathy);
    assert.equal(entry.comfort, ANALYSIS.comfort);
    assert.equal(entry.model, "a:free");
    assert.equal(entry.crisis, false); // 분석 결과에 crisis가 없으면 false
    assert.equal("usage" in entry, false);

    await new Promise((r) => setTimeout(r, 5));
    const { entry: second } = await (await post({ text: "두 번째" })).json();
    const { entries } = await (await fetch(`${base}/api/entries`)).json();
    assert.deepEqual(entries.slice(0, 2).map((e) => e.id), [second.id, entry.id]);

    assert.equal((await fetch(`${base}/api/entries/${entry.id}`, { method: "DELETE" })).status, 204);
    await expectError(await fetch(`${base}/api/entries/${entry.id}`, { method: "DELETE" }), 404, "NOT_FOUND");
    const after = await (await fetch(`${base}/api/entries`)).json();
    assert.equal(after.entries.some((e) => e.id === entry.id), false);
  });
});

describe("AI 오류 → 응답 매핑", () => {
  for (const [code, status] of [
    ["AI_AUTH_ERROR", 502],
    ["DAILY_LIMIT", 429],
    ["CONTENT_BLOCKED", 422],
    ["RATE_LIMITED", 429],
    ["AI_TIMEOUT", 504],
    ["AI_BAD_RESPONSE", 502],
    ["UPSTREAM_ERROR", 502],
  ]) {
    test(`${code} → ${status}`, async () => {
      analyzeImpl = async () => {
        throw new ApiError(code, undefined, "secret detail");
      };
      const res = await post({ text: "오늘" });
      const text = await res.text();
      assert.equal(res.status, status);
      assert.equal(JSON.parse(text).error.code, code);
      assert.equal(text.includes("secret detail"), false); // 내부 상세는 응답에 넣지 않는다
    });
  }
  test("예상 못한 예외 → 500 INTERNAL_ERROR", async () => {
    analyzeImpl = async () => {
      throw new TypeError("boom");
    };
    await expectError(await post({ text: "오늘" }), 500, "INTERNAL_ERROR");
    analyzeImpl = async () => ANALYSIS;
  });
});

// fetch 는 Host 헤더를 바꿀 수 없어 node:http 로 보낸다
function rawRequest({ method = "GET", path, headers = {}, body }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("출처 검사 (CORS 없음, Host·Origin)", () => {
  const port = () => server.address().port;
  test("Origin 없는 요청(curl 등)과 같은 출처 Origin은 허용, CORS 헤더는 주지 않는다", async () => {
    const plain = await fetch(`${base}/api/entries`);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers.get("access-control-allow-origin"), null);
    await plain.body.cancel();
    for (const origin of [`http://127.0.0.1:${port()}`, `http://localhost:${port()}`]) {
      const res = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
      assert.equal(res.status, 200, origin);
      assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
      await res.body.cancel();
    }
    analyzeImpl = async () => ANALYSIS;
    const created = await post({ text: "같은 출처" }, { Origin: `http://127.0.0.1:${port()}` });
    assert.equal(created.status, 201);
    const { entry } = await created.json();
    const del = await fetch(`${base}/api/entries/${entry.id}`, { method: "DELETE", headers: { Origin: `http://127.0.0.1:${port()}` } });
    assert.equal(del.status, 204);
  });
  test("Origin: null(file://·sandbox iframe)은 읽기·쓰기·삭제 모두 403 FORBIDDEN_ORIGIN", async () => {
    await expectError(await fetch(`${base}/api/entries`, { headers: { Origin: "null" } }), 403, "FORBIDDEN_ORIGIN");
    await expectError(await post({ text: "오늘" }, { Origin: "null" }), 403, "FORBIDDEN_ORIGIN");
    await expectError(await fetch(`${base}/api/entries/x`, { method: "DELETE", headers: { Origin: "null" } }), 403, "FORBIDDEN_ORIGIN");
    const pre = await fetch(`${base}/api/entries`, {
      method: "OPTIONS",
      headers: { Origin: "null", "Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true" },
    });
    assert.equal(pre.status, 403);
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
    assert.equal(pre.headers.get("access-control-allow-private-network"), null);
    await pre.body.cancel();
  });
  test("다른 출처(다른 포트·외부·비슷한 이름)는 403 FORBIDDEN_ORIGIN, 메시지는 한국어", async () => {
    for (const origin of [
      "http://localhost:5173",
      `https://127.0.0.1:${port()}`,
      "https://evil.example",
      `http://127.0.0.1.nip.io:${port()}`,
      `http://localhost.evil.com:${port()}`,
      "file://",
    ]) {
      const res = await fetch(`${base}/api/entries`, { headers: { Origin: origin } });
      assert.equal(res.status, 403, origin);
      const body = await res.json();
      assert.equal(body.error.code, "FORBIDDEN_ORIGIN");
      assert.match(body.error.message, /[가-힣]/);
      assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
    }
  });
  test("로컬이 아닌 Host(DNS 리바인딩)는 API와 화면 모두 403", async () => {
    for (const path of ["/api/entries", "/api/health", "/"]) {
      for (const host of [`attacker.example:${port()}`, "attacker.example", `127.0.0.1:${port() + 1}`, `localhost.attacker.example:${port()}`]) {
        const res = await rawRequest({ path, headers: { Host: host } });
        assert.equal(res.status, 403, `${path} ${host}`);
        assert.equal(JSON.parse(res.body).error.code, "FORBIDDEN_ORIGIN");
      }
    }
    // 허용된 Host (대소문자 무시)
    assert.equal((await rawRequest({ path: "/api/health", headers: { Host: `LOCALHOST:${port()}` } })).status, 200);
  });
  test("hostNames로 HOST 값을 추가 허용할 수 있다", async () => {
    const app = createApp({ store: { list: async () => [] }, analyze: async () => ANALYSIS, hasApiKey: () => true, primaryModel: "a", indexPath: "x", hostNames: ["127.0.0.1", "localhost", "myhost.local"], logger: quiet });
    const s = app.listen(0, "127.0.0.1");
    await new Promise((r) => s.once("listening", r));
    try {
      const p = s.address().port;
      const get = (headers) =>
        new Promise((resolve, reject) => {
          httpRequest({ host: "127.0.0.1", port: p, path: "/api/entries", headers }, (res) => {
            res.resume();
            resolve(res.statusCode);
          }).on("error", reject).end();
        });
      assert.equal(await get({ Host: `myhost.local:${p}` }), 200);
      assert.equal(await get({ Host: `myhost.local:${p}`, Origin: `http://myhost.local:${p}` }), 200);
      assert.equal(await get({ Host: `other.local:${p}` }), 403);
    } finally {
      s.close();
    }
  });
  test("POST는 Content-Type: application/json 이 아니면 400 INVALID_INPUT", async () => {
    const res = await fetch(`${base}/api/entries`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: '{"text":"hi"}' });
    await expectError(res, 400, "INVALID_INPUT");
  });
  test("/favicon.ico 는 204", async () => {
    const res = await fetch(`${base}/favicon.ico`);
    assert.equal(res.status, 204);
  });
});

describe("연결 끊김", () => {
  test("응답 전에 클라이언트가 끊으면 분석 signal이 abort된다", async () => {
    let started;
    const startedP = new Promise((r) => (started = r));
    analyzeImpl = (text, { signal }) =>
      new Promise((resolve, reject) => {
        started();
        signal.addEventListener("abort", () => {
          const err = new Error("cancelled");
          err.cancelled = true;
          reject(err);
        });
      });
    const body = JSON.stringify({ text: "오늘" });
    const req = httpRequest(`${base}/api/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.on("error", () => {});
    req.end(body);
    await startedP;
    req.destroy();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(lastSignal.aborted, true);
    analyzeImpl = async () => ANALYSIS;
  });
  test("분석이 끝나기 직전에 끊겼으면(abort 후 분석 성공) 저장하지 않는다", async () => {
    const marker = `끊김-${Date.now()}`;
    let started;
    const startedP = new Promise((r) => (started = r));
    // abort 신호를 무시하고 결과를 돌려주는 분석기 (응답 직전 끊김 상황)
    analyzeImpl = (text, { signal }) =>
      new Promise((resolve) => {
        started();
        signal.addEventListener("abort", () => setTimeout(() => resolve(ANALYSIS), 10));
      });
    const body = JSON.stringify({ text: marker });
    const req = httpRequest(`${base}/api/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.on("error", () => {});
    req.end(body);
    await startedP;
    req.destroy();
    await new Promise((r) => setTimeout(r, 150));
    const { entries } = await (await fetch(`${base}/api/entries`)).json();
    assert.equal(entries.some((e) => e.text === marker), false);
    analyzeImpl = async () => ANALYSIS;
  });
});

describe("예전 저장 일기", () => {
  test("crisis 필드가 없던 일기는 crisis: false 로 돌려준다", async () => {
    const legacyDir = await mkdtemp(join(tmpdir(), "diary-legacy-"));
    const file = join(legacyDir, "entries.json");
    await writeFile(file, JSON.stringify({ version: 1, entries: [{ id: "old", text: "예전", createdAt: "2026-10-01T00:00:00.000Z", emotion: ANALYSIS.emotion, empathy: "e", comfort: "c", model: "m" }] }));
    const app = createApp({ store: createStore(file, { logger: quiet }), analyze: async () => ANALYSIS, hasApiKey: () => true, primaryModel: "a", indexPath: "x", logger: quiet });
    const s = app.listen(0, "127.0.0.1");
    await new Promise((r) => s.once("listening", r));
    try {
      const { entries } = await (await fetch(`http://127.0.0.1:${s.address().port}/api/entries`)).json();
      assert.equal(entries[0].crisis, false);
    } finally {
      s.close();
      await rm(legacyDir, { recursive: true, force: true });
    }
  });
});

describe("file:// 화면과의 약속", () => {
  test("Origin: null 인 /api/health 생존 확인에도 연결을 끊지 않고 HTTP 403 응답을 돌려준다", async () => {
    const res = await rawRequest({ path: "/api/health", headers: { Origin: "null" } });
    assert.equal(res.status, 403);
    assert.equal(JSON.parse(res.body).error.code, "FORBIDDEN_ORIGIN");
  });
  test("GET / 는 Origin 검사 없이 Host만 맞으면 200 (location.replace 로 오는 최상위 요청)", async () => {
    const indexDir = await mkdtemp(join(tmpdir(), "diary-index-"));
    const indexPath = join(indexDir, "index.html");
    await writeFile(indexPath, "<!doctype html><title>t</title>");
    const app = createApp({ store: { list: async () => [] }, analyze: async () => ANALYSIS, hasApiKey: () => true, primaryModel: "a", indexPath, logger: quiet });
    const s = app.listen(0, "127.0.0.1");
    await new Promise((r) => s.once("listening", r));
    try {
      const p = s.address().port;
      for (const origin of [undefined, "null", "https://evil.example"]) {
        const res = await fetch(`http://127.0.0.1:${p}/`, { headers: origin ? { Origin: origin } : {} });
        assert.equal(res.status, 200, String(origin));
        assert.match(await res.text(), /<title>t<\/title>/);
      }
    } finally {
      s.close();
      await rm(indexDir, { recursive: true, force: true });
    }
  });
});
