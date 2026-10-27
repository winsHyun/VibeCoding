// 작성일시: 2026-10-26 17:10
// 재료 인식 경로 테스트 (가짜 fetch + 임시 캐시 폴더, API 호출 없음): npm test
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { config } from "../src/config.js";
import { RequestBudget, resetModelCooldowns } from "../src/openrouter.js";
import { getIngredientVectors, setIngredientCacheDir } from "../src/ingredients.js";
import { makeTiles, scoreImage, scoreImageCached, clearRecognitionCache, InvalidImageError } from "../src/recognizer.js";

// 재료 50개 → 임베딩 배치 3개 (20, 20, 10)
const list = Array.from({ length: 50 }, (_, i) => ({ id: `item${i}`, ko: `재료${i}`, prompt: `a photo of item ${i}` }));
const [PRIMARY, FALLBACK] = ["p:free", "f:free"];
const MODELS = [PRIMARY, FALLBACK];

let dir;
let largeJpeg; // 1400×900 JPEG (서버에서 줄여야 함)
let smallJpeg; // 800×600 JPEG (브라우저가 줄여 보낸 것과 같음)
before(async () => {
  const image = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
  largeJpeg = await image(1400, 900);
  smallJpeg = await image(800, 600);
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fridge-embed-"));
  setIngredientCacheDir(pathToFileURL(dir + "/"));
  clearRecognitionCache();
  resetModelCooldowns();
});
const realFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = realFetch;
  await rm(dir, { recursive: true, force: true });
});
after(() => setIngredientCacheDir(new URL("../data/", import.meta.url)));

// 텍스트 입력은 성공(4차원 벡터), 이미지 입력은 imageReply로 응답하는 가짜 fetch
let calls;
function mockEmbeddings({ textReply, imageReply } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const isText = typeof body.input[0] === "string";
    calls.push({ model: body.model, kind: isText ? "text" : "image", size: body.input.length });
    const custom = isText ? textReply?.(body, calls.length) : imageReply?.(body, calls.length);
    if (custom) return custom;
    const data = body.input.map((_, index) => ({ index, embedding: [1, index % 3, 0.5, 0.1] }));
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
}
const fail = (status, message = "error") => new Response(JSON.stringify({ error: { code: status, message } }), { status });

test("makeTiles: 원본 1장 + 3×3 조각, 큰 사진은 긴 변 1024px로 줄인다", async () => {
  const tiles = await makeTiles(largeJpeg);
  assert.equal(tiles.length, 1 + config.recognition.grid ** 2);
  const base = await sharp(tiles[0]).metadata();
  assert.equal(Math.max(base.width, base.height), config.recognition.maxSide);
  const tile = await sharp(tiles[1]).metadata();
  assert.equal(tile.format, "jpeg");
  assert.ok(tile.width < base.width && tile.height < base.height);
});

test("makeTiles: 이미 1024px 이하 JPEG면 원본을 다시 압축하지 않고 그대로 쓴다", async () => {
  const tiles = await makeTiles(smallJpeg);
  assert.equal(tiles[0], smallJpeg);
  assert.equal(tiles.length, 10);
});

test("재료 벡터: 배치 하나가 실패해도 성공한 배치는 보관하고 다음 시도는 남은 배치부터", async () => {
  mockEmbeddings({ textReply: (_, n) => (n === 3 ? fail(400, "bad batch") : null) });
  await assert.rejects(getIngredientVectors(PRIMARY, list), (err) => err.code === "REQUEST_ERROR");
  assert.equal(calls.length, 3);

  mockEmbeddings();
  const vectors = await getIngredientVectors(PRIMARY, list);
  assert.equal(vectors.length, list.length);
  assert.deepEqual(calls.map((c) => c.size), [10]); // 마지막 배치(10개)만 다시 요청
  assert.equal((await readdir(dir)).filter((f) => f.endsWith(".json")).length, 1); // 캐시 파일 저장
});

test("인식: 대체 모델은 재료 벡터 캐시가 없으면 시도하지 않는다 (벡터 생성 요청 4회를 쓰지 않음)", async () => {
  mockEmbeddings({ imageReply: () => fail(429, "rate limited") });
  await assert.rejects(scoreImage(smallJpeg, list, { models: MODELS }), (err) => err.code === "RATE_LIMITED");
  assert.deepEqual(calls.map((c) => `${c.model}:${c.kind}`), ["p:free:text", "p:free:text", "p:free:text", "p:free:image"]);
  assert.ok(!calls.some((c) => c.model === FALLBACK));
});

test("인식: 대체 모델에 재료 벡터 캐시가 있으면 넘어가서 그 모델 결과를 돌려준다", async () => {
  mockEmbeddings();
  await getIngredientVectors(FALLBACK, list); // 대체 모델 캐시 준비
  mockEmbeddings({ imageReply: (body) => (body.model === PRIMARY ? fail(429, "rate limited") : null) });
  const { model, scores } = await scoreImage(smallJpeg, list, { models: MODELS });
  assert.equal(model, FALLBACK);
  assert.equal(scores.length, list.length);
  // 1차 모델 벡터 생성 3회 + 1차 이미지 1회 + 대체 이미지 1회
  assert.deepEqual(calls.map((c) => `${c.model}:${c.kind}`), ["p:free:text", "p:free:text", "p:free:text", "p:free:image", "f:free:image"]);
});

test("인식: 요청 1건의 호출 수는 예산을 넘지 않는다 (재료 벡터 생성 포함)", async () => {
  mockEmbeddings();
  await assert.rejects(scoreImage(smallJpeg, list, { models: MODELS, budget: new RequestBudget({ maxCalls: 2 }) }), (err) => err.code === "BUDGET_EXCEEDED");
  assert.equal(calls.length, 2);
});

test("인식 결과 캐시: 같은 사진은 다시 요청하지 않고, 동시에 온 같은 요청도 한 번만 처리한다", async () => {
  mockEmbeddings();
  const [a, b] = await Promise.all([scoreImageCached(smallJpeg, list, { models: [PRIMARY] }), scoreImageCached(smallJpeg, list, { models: [PRIMARY] })]);
  const first = calls.length; // 벡터 3배치 + 이미지 1회
  assert.equal(first, 4);
  assert.deepEqual(a.scores, b.scores);
  const again = await scoreImageCached(smallJpeg, list, { models: [PRIMARY] });
  assert.equal(again.cached, true);
  assert.equal(calls.length, first);
  // 다른 사진은 새로 요청
  await scoreImageCached(largeJpeg, list, { models: [PRIMARY] });
  assert.equal(calls.length, first + 1);
});

test("인식 결과 캐시: 실패한 결과는 캐시하지 않는다", async () => {
  mockEmbeddings({ imageReply: () => fail(429, "rate limited") });
  await assert.rejects(scoreImageCached(smallJpeg, list, { models: [PRIMARY] }));
  mockEmbeddings();
  const { cached } = await scoreImageCached(smallJpeg, list, { models: [PRIMARY] });
  assert.equal(cached, false);
});

test("makeTiles: 아주 작은 사진은 sharp 오류(500) 대신 INVALID_IMAGE로 거절한다", async () => {
  const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  await assert.rejects(makeTiles(tiny), (err) => err instanceof InvalidImageError && err.code === "INVALID_IMAGE");
  await assert.rejects(makeTiles(Buffer.from("not an image")), (err) => err instanceof InvalidImageError);
});

test("makeTiles: sharp의 픽셀 수 제한을 넘는 사진도 INVALID_IMAGE", async () => {
  // 머리글만 40000×10000(4억 픽셀, sharp 기본 한도 약 2.68억)인 작은 PNG. 실제로 만들면 메모리를 많이 쓰므로 직접 조립한다
  const chunk = (type, data) => {
    const typed = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(40000, 0);
  ihdr.writeUInt32BE(10000, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 2; // RGB
  const huge = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(10))), chunk("IEND", Buffer.alloc(0))]);
  await assert.rejects(makeTiles(huge), (err) => err instanceof InvalidImageError && /pixel limit/i.test(err.detail));
});

// 이미지 임베딩 요청은 release()를 부를 때까지 기다리고, fetch 신호가 abort되면 그 이유로 실패하는 가짜 fetch
function mockHangingImages() {
  calls = [];
  let release;
  let markStarted;
  const released = new Promise((resolve) => (release = resolve));
  const started = new Promise((resolve) => (markStarted = resolve));
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const isText = typeof body.input[0] === "string";
    calls.push({ model: body.model, kind: isText ? "text" : "image", size: body.input.length, signal: init.signal });
    const data = body.input.map((_, index) => ({ index, embedding: [1, index % 3, 0.5, 0.1] }));
    const reply = () => new Response(JSON.stringify({ data }), { status: 200 });
    if (isText) return reply();
    markStarted();
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
      released.then(() => resolve(reply()));
    });
  };
  return { release, started };
}

test("인식 결과 캐시: 같은 사진을 기다리던 요청 하나가 끊겨도 다른 요청의 공유 작업은 계속된다", async () => {
  const { release, started } = mockHangingImages();
  const [a, b] = [new AbortController(), new AbortController()];
  const first = scoreImageCached(smallJpeg, list, { models: [PRIMARY], signal: a.signal });
  const second = scoreImageCached(smallJpeg, list, { models: [PRIMARY], signal: b.signal });
  await started;
  a.abort();
  release();
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r2.scores.length, list.length);
  assert.deepEqual(r1.scores, r2.scores);
  assert.equal(calls.filter((c) => c.kind === "image").length, 1);
  assert.equal(calls.find((c) => c.kind === "image").signal.aborted, false);
  assert.equal(r1.usage.calls, 4); // 먼저 시작한 요청: 벡터 3배치 + 이미지 1회
  assert.equal(r2.usage.calls, 0); // 공유한 요청은 호출하지 않음
});

test("인식 결과 캐시: 기다리던 요청이 모두 끊기면 작업을 멈추고(CLIENT_CLOSED) 캐시에 남기지 않는다", async () => {
  const { started } = mockHangingImages();
  const [a, b] = [new AbortController(), new AbortController()];
  const first = scoreImageCached(smallJpeg, list, { models: [PRIMARY], signal: a.signal });
  const second = scoreImageCached(smallJpeg, list, { models: [PRIMARY], signal: b.signal });
  await started;
  a.abort();
  b.abort();
  await assert.rejects(first, (err) => err.code === "CLIENT_CLOSED");
  await assert.rejects(second, (err) => err.code === "CLIENT_CLOSED");
  assert.equal(calls.length, 4); // 재시도·대체 모델 없음

  mockEmbeddings();
  const again = await scoreImageCached(smallJpeg, list, { models: [PRIMARY] });
  assert.equal(again.cached, false);
});

test("재료 벡터: 먼저 시작한 요청의 예산이 바닥나도, 기다리던 요청은 자기 예산으로 이어서 만든다", async () => {
  mockEmbeddings();
  const small = getIngredientVectors(PRIMARY, list, { budget: new RequestBudget({ maxCalls: 1 }) });
  const other = getIngredientVectors(PRIMARY, list, { budget: new RequestBudget({ maxCalls: 6 }) });
  await assert.rejects(small, (err) => err.code === "BUDGET_EXCEEDED");
  const vectors = await other;
  assert.equal(vectors.length, list.length);
  assert.deepEqual(calls.map((c) => c.size), [20, 20, 10]); // 성공한 첫 배치는 다시 요청하지 않음
});
