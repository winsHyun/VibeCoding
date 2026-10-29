// 작성일시: 2026-10-28 14:55
// PDF 업로드 HTTP 계약 테스트 (PDF_PRD M1): POST /api/pdf/summarize 검사 순서·오류 코드, GET /pdf, health, 출처 검사,
// 동시 1건 제한, 연결 끊김 취소, 디스크 미저장. 요약기는 가짜를 주입하고 OpenRouter는 부르지 않는다
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { after, before, beforeEach, describe, test } from "node:test";
import { createApp, parseFileName } from "../src/app.js";
import { ApiError, ERRORS, PDF_MESSAGES } from "../src/errors.js";
import { createPdfExtractor } from "../src/pdf.js";
import { createPdfSummarizer } from "../src/pdf-summary.js";
import { createStore } from "../src/store.js";
import { buildPdf, lines } from "./fixtures/pdf-builder.js";

const KO_LINES = ["전기차 충전 시장 보고서입니다.", "올해 충전기 설치 수는 전년보다 42% 늘었어요.", "지방 충전소 부족이 가장 큰 과제입니다."];
const EN_TEXT = "Large language models summarize long documents for busy readers.";
const KO_PDF = buildPdf([{ items: lines(KO_LINES) }], { title: "충전 시장 보고서" });

const FAKE_RESULT = {
  oneLine: "전기차 충전 시장이 커졌다는 보고서예요.",
  overview: "충전기 설치가 늘었지만 지방 충전소가 부족해요.",
  keyPoints: [{ text: "충전기 설치 수가 42% 늘었어요.", pages: [1] }],
  sections: [],
  keywords: ["전기차", "충전"],
  coverage: { method: "full", usedCharacters: 10, totalCharacters: 10, selectedChunks: 0, totalChunks: 0, truncated: false },
  notices: [],
  model: "fake:free",
  rerankModel: null,
  usage: { calls: 1, maxCalls: 4, fallbacks: [] },
};

// 실제 요약기 테스트용 설정 (config.pdf와 같은 이름)
const PDF_SUMMARY_SETTINGS = { rerankModel: null, contextChars: 20000, maxCalls: 4, totalTimeoutMs: 90000, callTimeoutMs: 35000, rerankTimeoutMs: 15000, summaryMaxTokens: 3000, maxPages: 200, maxTextChars: 200000 };

const logs = [];
const logger = { log: (m) => logs.push(m), warn: (m) => logs.push(m), error: (...a) => logs.push(a.join(" ")) };
let dir;
let server;
let base;
let hasKey;
let summarizeImpl;
let summarizeCalls;
let extractCalls;

const MAX_BYTES = 200 * 1024; // 테스트용 업로드 상한 200KB (21MB 본문 테스트는 기본 상한 앱으로 따로 한다)

function startApp(options) {
  const app = createApp({
    store: createStore(join(dir, "entries.json"), { logger }),
    analyze: async () => {
      throw new Error("diary analyze must not be called");
    },
    hasApiKey: () => hasKey,
    primaryModel: "fake:free",
    indexPath: join(dir, "missing-index.html"),
    pdfIndexPath: join(dir, "missing-index_pdf.html"),
    logger,
    ...options,
  });
  const srv = app.listen(0, "127.0.0.1");
  return new Promise((resolve) => srv.once("listening", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "diary-pdfapp-"));
  const realExtract = createPdfExtractor({ maxPages: 200, maxChars: 200000, timeoutMs: 15000 });
  ({ srv: server, url: base } = await startApp({
    pdf: { maxBytes: MAX_BYTES, maxPages: 200, maxTextChars: 200000, extractTimeoutMs: 15000, maxCalls: 4, rerankModel: "rr:free" },
    extractPdf: (buf, opts) => {
      extractCalls++;
      return realExtract(buf, opts);
    },
    summarizePdf: (extracted, opts) => {
      summarizeCalls.push({ extracted, opts });
      return summarizeImpl(extracted, opts);
    },
  }));
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  hasKey = true;
  summarizeImpl = async () => FAKE_RESULT;
  summarizeCalls = [];
  extractCalls = 0;
  logs.length = 0;
});

const upload = (body, headers = {}, url = base) =>
  fetch(`${url}/api/pdf/summarize`, { method: "POST", headers: { "Content-Type": "application/pdf", ...headers }, body });

async function expectError(res, status, code, message) {
  assert.equal(res.status, status);
  const body = await res.json();
  assert.equal(body.error.code, code);
  assert.ok(body.error.message.length > 0);
  if (message) assert.equal(body.error.message, message);
  return body.error.message;
}

// http 모듈로 직접 보낸다 (Content-Length 없이 chunked로 보내기, 헤더 값을 그대로 넣기)
function rawRequest(path, { method = "POST", headers = {}, chunks = [] } = {}, url = base) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${url}${path}`, { method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on("error", reject);
    for (const c of chunks) req.write(c);
    req.end();
  });
}

describe("health·화면", () => {
  test("GET /api/health 에 pdf 정보가 붙고 기존 필드는 그대로", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.deepEqual(await res.json(), { ok: true, model: "fake:free", hasApiKey: true, pdf: { maxBytes: MAX_BYTES, maxPages: 200, rerankModel: "rr:free" } });
  });
  test("GET /pdf: index_pdf.html이 없으면 404 NOT_FOUND (안내 문구)", async () => {
    const res = await fetch(`${base}/pdf`);
    await expectError(res, 404, "NOT_FOUND", "index_pdf.html 파일이 아직 없습니다.");
  });
  test("GET /pdf: 파일이 있으면 그 파일만, iframe 차단 헤더와 함께 제공", async () => {
    const pageDir = await mkdtemp(join(tmpdir(), "diary-pdfpage-"));
    try {
      const pagePath = join(pageDir, "index_pdf.html");
      await writeFile(pagePath, "<!doctype html><title>PDF</title>");
      const { srv, url } = await startApp({ pdfIndexPath: pagePath });
      try {
        const res = await fetch(`${url}/pdf`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("x-frame-options"), "DENY");
        assert.equal(res.headers.get("content-security-policy"), "frame-ancestors 'none'");
        assert.match(await res.text(), /<title>PDF<\/title>/);
        assert.equal((await fetch(`${url}/index_pdf.html`)).status, 404);
      } finally {
        srv.close();
      }
    } finally {
      await rm(pageDir, { recursive: true, force: true });
    }
  });
  test("GET /api/pdf/summarize 는 공통 404", async () => {
    await expectError(await fetch(`${base}/api/pdf/summarize`), 404, "NOT_FOUND");
  });
});

describe("성공", () => {
  test("한글 1쪽 PDF → 요약기에 쪽 텍스트가 전달되고 200 { summary }", async () => {
    const res = await upload(KO_PDF, { "X-File-Name": encodeURIComponent("보고서 (최종).pdf") });
    assert.equal(res.status, 200);
    const { summary } = await res.json();
    assert.equal(summary.fileName, "보고서 (최종).pdf");
    assert.match(summary.generatedAt, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(summary.document, {
      pages: 1,
      processedPages: 1,
      pagesWithoutText: 0,
      characters: [...KO_LINES.join("\n")].length,
      language: "ko",
      title: "충전 시장 보고서",
    });
    assert.equal(summary.oneLine, FAKE_RESULT.oneLine);
    assert.deepEqual(summary.keyPoints, FAKE_RESULT.keyPoints);
    assert.equal(summary.model, "fake:free");
    assert.equal(summary.rerankModel, null);
    assert.equal(summary.usage, undefined, "usage는 로그 전용");

    assert.equal(summarizeCalls.length, 1);
    const { extracted, opts } = summarizeCalls[0];
    assert.deepEqual(extracted.pageTexts, [{ page: 1, text: KO_LINES.join("\n") }]);
    assert.equal(opts.fileName, "보고서 (최종).pdf");
    assert.ok(opts.signal instanceof AbortSignal);

    const ok = logs.find((l) => l.startsWith("[pdf] OK 200"));
    assert.match(ok, /bytes: \d+, pages: 1\/1, chars: \d+, method: full, model: fake:free, calls: 1\/4\)$/);
    assert.ok(!logs.join("\n").includes("보고서"), "파일 이름·본문은 로그에 남기지 않는다");
  });

  test("201쪽 PDF → processedPages 200, pages 201", async () => {
    const pdf = buildPdf(Array.from({ length: 201 }, (_, i) => ({ items: lines([`Page ${i + 1}. ${EN_TEXT}`]) })));
    assert.ok(pdf.length < MAX_BYTES);
    const res = await upload(pdf);
    assert.equal(res.status, 200);
    const { summary } = await res.json();
    assert.equal(summary.document.pages, 201);
    assert.equal(summary.document.processedPages, 200);
    assert.equal(summary.document.language, "en");
    assert.equal(summarizeCalls[0].extracted.truncatedPages, true);
  });

  test("Content-Type 매개변수(charset)는 무시한다, 파일 이름 헤더가 없거나 깨지면 null", async () => {
    let res = await upload(KO_PDF, { "Content-Type": "application/pdf; charset=binary" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).summary.fileName, null);
    res = await upload(KO_PDF, { "X-File-Name": "%E0%A4%A" });
    assert.equal((await res.json()).summary.fileName, null);
  });

  test("요약기를 주입하지 않으면 INTERNAL_ERROR (임시 요약기는 M2에서 지움)", async () => {
    const { srv, url } = await startApp({ hasApiKey: () => true });
    try {
      await expectError(await upload(KO_PDF, {}, url), 500, "INTERNAL_ERROR");
    } finally {
      srv.close();
    }
  });

  test("실제 요약기(createPdfSummarizer) + 가짜 chat: 실제 추출부터 응답·로그까지", async () => {
    const chatCalls = [];
    const chat = async (args) => {
      chatCalls.push(args);
      const content = JSON.stringify({
        oneLine: "전기차 충전 시장이 커졌다는 보고서예요.",
        overview: "충전기 설치가 늘었지만 지방 충전소가 부족해요.",
        keyPoints: [{ text: "충전기 설치 수가 42% 늘었어요.", pages: [1, 99] }],
        sections: [],
        keywords: ["전기차", "충전"],
      });
      return { content, finishReason: "stop", model: "a:free", usage: { prompt_tokens: 321, completion_tokens: 45 } };
    };
    const summarizePdf = createPdfSummarizer({ chat, models: ["a:free"], pdf: { ...PDF_SUMMARY_SETTINGS }, ai: { retryDelayMs: 0 } });
    const { srv, url } = await startApp({ hasApiKey: () => true, summarizePdf, pdf: { maxBytes: MAX_BYTES, maxCalls: 4 } });
    try {
      const res = await upload(buildPdf([{ items: lines(KO_LINES) }, { items: [], rect: true }], { title: "충전 시장 보고서" }), {}, url);
      assert.equal(res.status, 200);
      const { summary } = await res.json();
      assert.equal(chatCalls.length, 1);
      const user = chatCalls[0].messages[1].content;
      assert.ok(user.includes('<document_title>"충전 시장 보고서"</document_title>\n<document>'));
      assert.ok(user.includes("<document>\n[p.1]\n전기차 충전 시장 보고서입니다"));
      assert.deepEqual(summary.keyPoints, [{ text: "충전기 설치 수가 42% 늘었어요.", pages: [1] }]);
      assert.equal(summary.coverage.method, "full");
      assert.deepEqual(summary.notices, ["글자가 없는 페이지 1쪽(스캔 이미지 등)은 요약에서 빠졌어요."]);
      assert.equal(summary.model, "a:free");
      assert.equal(summary.rerankModel, null);
      assert.equal(summary.usage, undefined, "usage is log-only");
      const line = logs.find((l) => l.startsWith("[pdf] OK 200"));
      assert.ok(line.endsWith("method: full, model: a:free, calls: 1/4, tokens: 321/45)"), line);
      assert.doesNotMatch(line, /전기차/);
    } finally {
      srv.close();
    }
  });

  test("parseFileName: 제어 문자 제거·200자 자름·디코딩 실패는 null", () => {
    assert.equal(parseFileName(encodeURIComponent("a\u0000b\nc.pdf")), "a b c.pdf");
    assert.equal([...parseFileName(encodeURIComponent("가".repeat(300)))].length, 200);
    assert.equal(parseFileName("%ZZ"), null);
    assert.equal(parseFileName(undefined), null);
    assert.equal(parseFileName(encodeURIComponent("   ")), null);
  });
});

describe("검사 순서별 오류 (PRD 8.4)", () => {
  test("Content-Type이 PDF가 아님 → 415 NOT_PDF", async () => {
    await expectError(await upload(KO_PDF, { "Content-Type": "application/octet-stream" }), 415, "NOT_PDF", ERRORS.NOT_PDF.message);
    await expectError(await upload(KO_PDF, { "Content-Type": "multipart/form-data; boundary=x" }), 415, "NOT_PDF");
    assert.equal(extractCalls, 0);
  });
  test("이름만 .pdf인 텍스트·PNG(시그니처 없음) → 415 NOT_PDF", async () => {
    await expectError(await upload(Buffer.from("이건 텍스트 파일이에요. ".repeat(20)), { "X-File-Name": "a.pdf" }), 415, "NOT_PDF");
    await expectError(await upload(Buffer.from("89504E470D0A1A0A0000000D49484452", "hex")), 415, "NOT_PDF");
    assert.equal(extractCalls, 0);
  });
  test("Content-Length가 상한 초과 → 413 PDF_TOO_LARGE (상한을 MB로 안내)", async () => {
    const big = Buffer.concat([KO_PDF, Buffer.alloc(MAX_BYTES)]);
    const message = await expectError(await upload(big), 413, "PDF_TOO_LARGE");
    assert.equal(message, "파일이 너무 커요. 0.2MB 이하 PDF만 올릴 수 있어요.");
    assert.equal(extractCalls, 0);
  });
  test("Content-Length 없이(chunked) 실제 본문이 상한 초과 → 413 PDF_TOO_LARGE", async () => {
    const chunks = [KO_PDF, ...Array.from({ length: 5 }, () => Buffer.alloc(64 * 1024))];
    const res = await rawRequest("/api/pdf/summarize", { headers: { "Content-Type": "application/pdf", "Transfer-Encoding": "chunked" }, chunks });
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, "PDF_TOO_LARGE");
  });
  test("빈 본문 → 400 INVALID_INPUT '파일이 비어 있어요.'", async () => {
    await expectError(await upload(Buffer.alloc(0)), 400, "INVALID_INPUT", PDF_MESSAGES.EMPTY_FILE);
    const res = await rawRequest("/api/pdf/summarize", { headers: { "Content-Type": "application/pdf" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, PDF_MESSAGES.EMPTY_FILE);
  });
  test("Content-Encoding(gzip) 본문 → 400 INVALID_INPUT", async () => {
    await expectError(await upload(KO_PDF, { "Content-Encoding": "gzip" }), 400, "INVALID_INPUT", PDF_MESSAGES.UNREADABLE_BODY);
  });
  test("API 키 없음 → 500 CONFIG_ERROR, 추출 전에 멈춘다", async () => {
    hasKey = false;
    await expectError(await upload(KO_PDF), 500, "CONFIG_ERROR");
    assert.equal(extractCalls, 0);
  });
  test("시그니처 검사가 키 검사보다 먼저 (키가 없어도 비PDF는 415)", async () => {
    hasKey = false;
    await expectError(await upload(Buffer.from("not a pdf at all")), 415, "NOT_PDF");
  });
  test("열기 암호 PDF → 422 PDF_ENCRYPTED, 요약기를 부르지 않는다", async () => {
    const pdf = buildPdf([{ items: lines([EN_TEXT]) }], { encrypt: { userPassword: "pw", ownerPassword: "owner" } });
    await expectError(await upload(pdf), 422, "PDF_ENCRYPTED", ERRORS.PDF_ENCRYPTED.message);
    assert.equal(summarizeCalls.length, 0);
  });
  test("권한 암호만 있는 PDF → 200", async () => {
    const pdf = buildPdf([{ items: lines(KO_LINES) }], { encrypt: { userPassword: "", ownerPassword: "owner" } });
    assert.equal((await upload(pdf)).status, 200);
  });
  test("손상된 PDF → 422 PDF_CORRUPTED", async () => {
    const pdf = buildPdf([{ items: lines(KO_LINES) }, { items: lines(KO_LINES) }]);
    await expectError(await upload(pdf.subarray(0, Math.floor(pdf.length / 2))), 422, "PDF_CORRUPTED", ERRORS.PDF_CORRUPTED.message);
  });
  test("텍스트 없는 PDF(도형만) → 422 PDF_NO_TEXT", async () => {
    await expectError(await upload(buildPdf([{ items: [], rect: true }])), 422, "PDF_NO_TEXT", ERRORS.PDF_NO_TEXT.message);
  });
  test("추출이 시간 상한을 넘으면 → 422 PDF_TOO_COMPLEX", async () => {
    const hanging = async () => ({ getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => {} }) });
    const { srv, url } = await startApp({ hasApiKey: () => true, extractPdf: createPdfExtractor({ timeoutMs: 50, loadPdfjs: hanging }) });
    try {
      await expectError(await upload(KO_PDF, {}, url), 422, "PDF_TOO_COMPLEX", ERRORS.PDF_TOO_COMPLEX.message);
      // 자리를 놓았으므로 다음 요청도 받는다
      await expectError(await upload(KO_PDF, {}, url), 422, "PDF_TOO_COMPLEX");
    } finally {
      srv.close();
    }
  });
  test("실패 로그: 코드·바이트·호출 수만, 파일 이름은 없음", async () => {
    await upload(buildPdf([{ items: [], rect: true }]), { "X-File-Name": encodeURIComponent("비밀문서.pdf") });
    const line = logs.find((l) => l.startsWith("[pdf] FAILED"));
    assert.match(line, /^\[pdf\] FAILED in \d+ms \(bytes: \d+, pages: -, calls: 0\/4\): PDF_NO_TEXT /);
    assert.ok(!logs.join("\n").includes("비밀문서"));
  });
});

describe("동시 1건 제한", () => {
  test("처리 중에 또 오면 503 PDF_BUSY, 끝나면 다시 받는다", async () => {
    let release;
    summarizeImpl = () => new Promise((resolve) => (release = () => resolve(FAKE_RESULT)));
    const first = upload(KO_PDF);
    while (!release) await new Promise((r) => setTimeout(r, 5));
    await expectError(await upload(KO_PDF), 503, "PDF_BUSY", ERRORS.PDF_BUSY.message);
    // 크기·형식 검사보다 먼저 (PRD 8.4 순서)
    await expectError(await upload(Buffer.from("x"), { "Content-Type": "text/plain" }), 503, "PDF_BUSY");
    // 다이어리 API는 막지 않는다
    assert.equal((await fetch(`${base}/api/entries`)).status, 200);
    release();
    assert.equal((await first).status, 200);
    summarizeImpl = async () => FAKE_RESULT;
    assert.equal((await upload(KO_PDF)).status, 200);
  });
  test("검사에서 실패한 요청도 자리를 놓는다", async () => {
    await expectError(await upload(KO_PDF, { "Content-Type": "text/plain" }), 415, "NOT_PDF");
    await expectError(await upload(Buffer.concat([KO_PDF, Buffer.alloc(MAX_BYTES)])), 413, "PDF_TOO_LARGE");
    await expectError(await upload(Buffer.alloc(0)), 400, "INVALID_INPUT");
    assert.equal((await upload(KO_PDF)).status, 200);
  });
});

describe("AI 오류 문구 (PDF용으로 바꿈)", () => {
  for (const code of ["DAILY_LIMIT", "AI_TIMEOUT", "AI_BAD_RESPONSE", "CONTENT_BLOCKED"]) {
    test(`${code} 기본 문구 → PDF 문구`, async () => {
      summarizeImpl = async () => {
        const err = new ApiError(code, undefined, "last: test");
        err.usage = { calls: 2, maxCalls: 4, fallbacks: [] };
        throw err;
      };
      await expectError(await upload(KO_PDF), ERRORS[code].status, code, PDF_MESSAGES[code]);
      assert.match(logs.find((l) => l.startsWith("[pdf] FAILED")), new RegExp(`pages: 1/1, calls: 2/4\\): ${code} last: test`));
    });
  }
  test("원인별 문구가 있는 오류(AI_AUTH_ERROR)는 그대로", async () => {
    summarizeImpl = async () => {
      throw new ApiError("AI_AUTH_ERROR", "키 문구", "401");
    };
    await expectError(await upload(KO_PDF), 502, "AI_AUTH_ERROR", "키 문구");
  });
  test("예상 못한 예외 → 500 INTERNAL_ERROR", async () => {
    summarizeImpl = async () => {
      throw new TypeError("boom");
    };
    await expectError(await upload(KO_PDF), 500, "INTERNAL_ERROR");
  });
});

describe("출처 검사 (기존 Host/Origin 검사가 그대로 적용)", () => {
  test("다른 출처 Origin → 403 FORBIDDEN_ORIGIN, PDF 화면 주소로 안내", async () => {
    const message = await expectError(await upload(KO_PDF, { Origin: "http://evil.example" }), 403, "FORBIDDEN_ORIGIN");
    assert.equal(message, `이 주소에서는 PDF 요약을 쓸 수 없어요. http://127.0.0.1:${server.address().port}/pdf 에서 열어 주세요.`);
    assert.equal(extractCalls, 0);
  });
  test("Origin: null → 403", async () => {
    await expectError(await upload(KO_PDF, { Origin: "null" }), 403, "FORBIDDEN_ORIGIN");
  });
  test("같은 출처 Origin은 허용", async () => {
    assert.equal((await upload(KO_PDF, { Origin: base })).status, 200);
  });
  test("로컬 아닌 Host(DNS 리바인딩) → API·화면 모두 403", async () => {
    const port = server.address().port;
    const res = await rawRequest("/api/pdf/summarize", { headers: { Host: `evil.example:${port}`, "Content-Type": "application/pdf" }, chunks: [KO_PDF] });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN_ORIGIN");
    const page = await rawRequest("/pdf", { method: "GET", headers: { Host: `evil.example:${port}` } });
    assert.equal(page.status, 403);
    assert.match(page.body.error.message, /\/pdf 에서 열어 주세요/);
  });
  test("다이어리 경로의 403 문구는 그대로", async () => {
    const res = await fetch(`${base}/api/entries`, { headers: { Origin: "http://evil.example" } });
    assert.match((await res.json()).error.message, /^이 주소에서는 일기장을 열 수 없어요/);
  });
});

describe("raw 파서가 다른 라우트에 새지 않음", () => {
  test("기본 상한(20MB) 앱에서 /api/entries 에 21MB JSON → 400 INVALID_INPUT", async () => {
    const { srv, url } = await startApp({ hasApiKey: () => true });
    try {
      const body = JSON.stringify({ text: "가".repeat(7 * 1024 * 1024) }); // 약 21MB (UTF-8 3바이트)
      const res = await fetch(`${url}/api/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      await expectError(res, 400, "INVALID_INPUT");
      const res2 = await fetch(`${url}/api/entries`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: KO_PDF });
      await expectError(res2, 400, "INVALID_INPUT");
    } finally {
      srv.close();
    }
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("연결 끊김", () => {
  test("요약 중에 클라이언트가 끊으면 signal이 abort되고 CANCELLED 로그, 자리를 놓는다", async () => {
    let seenSignal;
    summarizeImpl = (extracted, { signal }) =>
      new Promise((resolve, reject) => {
        seenSignal = signal;
        signal.addEventListener("abort", () => {
          const err = new Error("cancelled");
          err.cancelled = true;
          err.usage = { calls: 1, maxCalls: 4 };
          reject(err);
        }, { once: true });
      });
    const controller = new AbortController();
    const req = fetch(`${base}/api/pdf/summarize`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: KO_PDF, signal: controller.signal });
    while (!seenSignal) await sleep(5);
    controller.abort();
    await assert.rejects(req);
    for (let i = 0; i < 200 && !logs.some((l) => l.startsWith("[pdf] CANCELLED")); i++) await sleep(10);
    assert.equal(seenSignal.aborted, true);
    assert.match(logs.find((l) => l.startsWith("[pdf] CANCELLED")), /^\[pdf\] CANCELLED by client after \d+ms \(calls: 1\/4\)$/);
    summarizeImpl = async () => FAKE_RESULT;
    assert.equal((await upload(KO_PDF)).status, 200);
  });
});

// 폴더 아래 모든 파일·폴더 목록 (node_modules·.git 제외)
async function listTree(root) {
  const files = new Set();
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = join(d, e.name);
      files.add(full);
      if (e.isDirectory()) await walk(full);
    }
  }
  await walk(root);
  return files;
}

describe("디스크 미저장", () => {
  // OS 전역 %TEMP%는 다른 프로그램이 수시로 바꿔 비교가 불안정하다(QA B-10). 이 테스트 동안만 TEMP·TMP·TMPDIR를
  // 새 빈 폴더로 돌려 os.tmpdir()가 그 폴더를 가리키게 하고(Node는 호출할 때마다 환경 변수를 읽음), 그 폴더와 프로젝트 폴더만 비교한다.
  // 우리 코드(src/)는 os.tmpdir()를 쓰지 않으므로 임시 파일을 만드는 코드가 생기면(라이브러리 포함) 이 폴더에 나타난다.
  // 추출 워커도 요청마다 새로 떠서 바뀐 환경 변수를 물려받는다(아래에서 확인).
  test("업로드·추출·실패 처리 전후로 프로젝트·임시 폴더에 새 파일이 없다", async () => {
    const isolatedTmp = await mkdtemp(join(tmpdir(), "diary-pdftmp-"));
    const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
    for (const k of Object.keys(saved)) process.env[k] = isolatedTmp;
    try {
      assert.equal(tmpdir(), isolatedTmp);
      const workerTmp = await new Promise((resolve, reject) => {
        const w = new Worker("require('node:worker_threads').parentPort.postMessage(require('node:os').tmpdir())", { eval: true });
        w.once("message", resolve);
        w.once("error", reject);
      });
      assert.equal(workerTmp, isolatedTmp, "워커도 바뀐 임시 폴더를 쓴다");

      const root = fileURLToPath(new URL("..", import.meta.url));
      const snapshot = async () => new Set([...(await listTree(root)), ...(await listTree(isolatedTmp))]);
      const beforeFiles = await snapshot();
      assert.equal((await upload(KO_PDF)).status, 200);
      await upload(buildPdf([{ items: lines([EN_TEXT]) }], { encrypt: { userPassword: "pw" } }));
      await upload(Buffer.from("%PDF-1.4 broken"));
      await upload(Buffer.concat([KO_PDF, Buffer.alloc(MAX_BYTES)]));
      const added = [...(await snapshot())].filter((f) => !beforeFiles.has(f));
      assert.deepEqual(added, []);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await rm(isolatedTmp, { recursive: true, force: true });
    }
  });
});

// QA B-1: 무거운 쪽 하나가 서버 전체를 멈추지 않는다 (추출은 worker_threads 워커에서)
describe("무거운 PDF (QA B-1)", () => {
  const heavyPage = (n) => buildPdf([{ items: Array.from({ length: n }, () => ({ text: "Hello bomb text here", x: 72, y: 720 })) }]);

  test("추출 중에도 다른 요청은 바로 응답하고, 시간 상한이면 422 PDF_TOO_COMPLEX, 그 뒤 자리를 놓는다", async () => {
    const { srv, url } = await startApp({
      hasApiKey: () => true,
      summarizePdf: async () => FAKE_RESULT,
      extractPdf: createPdfExtractor({ timeoutMs: 700, maxChars: 1e9, maxItemsPerPage: 1e9 }),
    });
    try {
      const started = Date.now();
      const pending = upload(heavyPage(80000), {}, url);
      await sleep(150);
      const t = Date.now();
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
      assert.equal((await fetch(`${url}/api/entries`)).status, 200);
      assert.ok(Date.now() - t < 1000, `health took ${Date.now() - t}ms`);
      await expectError(await pending, 422, "PDF_TOO_COMPLEX");
      assert.ok(Date.now() - started < 3000, `${Date.now() - started}ms`);
      assert.equal((await upload(KO_PDF, {}, url)).status, 200);
    } finally {
      srv.close();
    }
  });

  test("기본 상한이면 같은 PDF가 빨리 200 (글자 상한에서 멈춤)", async () => {
    const { srv, url } = await startApp({ hasApiKey: () => true, summarizePdf: async () => FAKE_RESULT });
    try {
      const t = Date.now();
      const res = await upload(heavyPage(80000), {}, url);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).summary.document.characters, 200000);
      assert.ok(Date.now() - t < 5000, `${Date.now() - t}ms`);
    } finally {
      srv.close();
    }
  });
});
