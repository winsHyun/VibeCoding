// 작성일시: 2026-10-26 14:39
// 이미지 → 조각 분할 → 임베딩 → 후보 재료와의 유사도로 재료 추정
import { createHash } from "node:crypto";
import sharp from "sharp";
import { config } from "./config.js";
import { OpenRouterError, RequestBudget, embed, imageInput, withModelFallback } from "./openrouter.js";
import { normalize, getIngredientVectors, loadCachedVectors, hasCachedVectors } from "./ingredients.js";

// 이 크기(px)보다 작은 사진은 조각을 만들 수 없으므로 거절한다
export const MIN_IMAGE_SIDE = 32;

// 사진 자체의 문제(읽을 수 없음·너무 작음·픽셀 수 초과). 서버가 400 INVALID_IMAGE로 응답한다
export class InvalidImageError extends Error {
  constructor(message, detail = "") {
    super(message);
    this.code = "INVALID_IMAGE";
    this.detail = detail;
  }
}
// sharp가 입력 사진 때문에 내는 오류 (형식 불명, 손상, 픽셀 수 제한 초과)
const SHARP_INPUT_ERROR = /unsupported image format|Input buffer|pixel limit|corrupt|premature end/i;

// 원본 전체 + grid×grid 겹치는 조각을 JPEG 버퍼로 만든다.
// 이미지는 한 번만 디코딩(회전·축소)해 원시 픽셀로 두고, 모든 조각을 거기서 병렬로 잘라 압축한다.
export async function makeTiles(imageBuffer) {
  const { maxSide, grid, overlap } = config.recognition;
  let meta, pixels, info;
  try {
    [meta, { data: pixels, info }] = await Promise.all([
      sharp(imageBuffer).metadata(),
      sharp(imageBuffer)
        .rotate() // EXIF 회전 반영
        .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);
  } catch (err) {
    if (SHARP_INPUT_ERROR.test(err.message)) throw new InvalidImageError("이미지를 읽을 수 없습니다. 다른 사진으로 시도해 주세요.", err.message);
    throw err;
  }
  // 너무 작으면 조각 폭이 0이 되어 sharp가 실패한다
  if (Math.min(info.width, info.height) < MIN_IMAGE_SIDE) {
    throw new InvalidImageError(`사진이 너무 작습니다. 가로세로 ${MIN_IMAGE_SIDE}px 이상인 사진을 올려 주세요.`, `image too small: ${info.width}x${info.height}`);
  }
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };
  const encode = (pipeline) => pipeline.jpeg({ quality: 85 }).toBuffer();

  // 브라우저가 이미 긴 변 maxSide 이하 JPEG로 줄여 보낸 사진(회전 정보 없음)은 다시 압축하지 않는다
  const reusable = meta.format === "jpeg" && (meta.orientation ?? 1) === 1 && Math.max(meta.width, meta.height) <= maxSide;
  const jobs = [reusable ? imageBuffer : encode(sharp(pixels, raw))];

  // grid개 조각이 overlap 비율만큼 겹치며 전체 폭을 덮도록 조각 크기 계산
  const span = grid - (grid - 1) * overlap;
  const tileW = Math.floor(info.width / span);
  const tileH = Math.floor(info.height / span);
  const stepX = tileW * (1 - overlap);
  const stepY = tileH * (1 - overlap);
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const left = Math.min(Math.round(col * stepX), info.width - tileW);
      const top = Math.min(Math.round(row * stepY), info.height - tileH);
      jobs.push(encode(sharp(pixels, raw).extract({ left, top, width: tileW, height: tileH })));
    }
  }
  return Promise.all(jobs);
}

// 모든 후보 재료의 점수(조각별 최고 유사도)를 높은 순으로 돌려준다.
// 이미지와 재료 벡터는 반드시 같은 모델로 만든 것끼리 비교한다.
// 첫 번째 모델은 재료 벡터가 없으면 만들지만(요청 4회), 대체 모델은 재료 벡터 캐시가 있을 때만 시도한다.
// 모든 호출은 budget(요청 1건의 호출 수·시간 상한)을 함께 쓴다.
// usage는 실제 OpenRouter 호출 수와 대체 모델로 넘어간 이유 (로그용). 실패하면 오류의 usage에 담는다
export async function scoreImage(imageBuffer, list, { budget = new RequestBudget(), models = config.embedModels } = {}) {
  try {
    const { scores, model } = await scoreWithModels(imageBuffer, list, budget, models);
    return { scores, model, usage: budget.usage() };
  } catch (err) {
    err.usage ??= budget.usage();
    throw err;
  }
}

async function scoreWithModels(imageBuffer, list, budget, models) {
  const inputs = (await makeTiles(imageBuffer)).map((tile) => imageInput(tile));
  const [primary, ...fallbacks] = models;
  const usable = [primary, ...fallbacks.filter(hasCachedVectors)];
  const { result: scores, model } = await withModelFallback(
    usable,
    async (model) => {
      const ingredientVectors = model === primary ? await getIngredientVectors(model, list, { budget }) : await loadCachedVectors(model, list);
      // 캐시 파일은 있지만 재료 목록이 바뀐 경우: 벡터를 새로 만들지 않고 이 모델을 건너뛴다
      if (!ingredientVectors) throw new OpenRouterError("UPSTREAM_ERROR", "재료 벡터가 없습니다.", 0, `${model}: ingredient cache is stale`);
      const tileVectors = (await embed(inputs, model, { budget })).map(normalize);
      return list
        .map((item, i) => {
          let best = -1;
          for (const tv of tileVectors) {
            let dot = 0;
            for (let d = 0; d < tv.length; d++) dot += tv[d] * ingredientVectors[i][d];
            if (dot > best) best = dot;
          }
          return { id: item.id, name: item.ko, score: best };
        })
        .sort((a, b) => b.score - a.score);
    },
    { label: "embed", budget },
  );
  return { scores, model };
}

const RESULT_CACHE_SIZE = 20;
// "이미지 sha256|모델 순서" → { job: Promise<{ scores, model, usage }>, controller, waiters, settled } (Map의 삽입 순서로 LRU)
const resultCache = new Map();

// 진행 중인 작업을 기다리는 요청 하나를 등록한다. signal이 abort되면 빠지고,
// 기다리는 요청이 모두 빠졌을 때만 작업을 멈춘다 (같은 사진을 기다리는 다른 요청의 작업은 죽이지 않음)
function joinJob(key, entry, signal) {
  entry.waiters++;
  if (!signal) return; // 취소 신호가 없는 호출(평가 스크립트 등)은 끝까지 기다린다
  const leave = () => {
    entry.waiters--;
    if (entry.waiters > 0 || entry.settled) return;
    // 멈추는 작업은 캐시에서 먼저 빼서, 곧이어 온 같은 사진 요청이 취소될 작업에 붙지 않게 한다
    if (resultCache.get(key) === entry) resultCache.delete(key);
    entry.controller.abort();
  };
  if (signal.aborted) return leave();
  signal.addEventListener("abort", leave, { once: true });
  const detach = () => signal.removeEventListener("abort", leave);
  entry.job.then(detach, detach);
}

// 임베딩은 결정적이라 같은 사진·같은 모델 순서면 결과가 같다. 최근 결과(와 진행 중인 요청)를 재사용해 API 요청을 아낀다.
// signal: 이 요청의 취소 신호 (클라이언트 연결 끊김). 돌려주는 값의 cached는 캐시에서 꺼냈는지 여부이고,
// usage는 이 요청이 실제로 쓴 호출 수다 (캐시·공유면 0회)
export async function scoreImageCached(imageBuffer, list, { signal = null, ...options } = {}) {
  const models = options.models ?? config.embedModels;
  const key = `${createHash("sha256").update(imageBuffer).digest("hex")}|${models.join(",")}`;
  let entry = resultCache.get(key);
  const cached = Boolean(entry);
  if (entry) {
    resultCache.delete(key);
    resultCache.set(key, entry);
  } else {
    const controller = new AbortController();
    const budget = new RequestBudget({ signal: controller.signal });
    entry = { job: scoreImage(imageBuffer, list, { models, budget }), controller, waiters: 0, settled: false };
    const done = entry;
    // 실패한 결과는 캐시하지 않는다
    done.job.then(
      () => (done.settled = true),
      () => {
        done.settled = true;
        if (resultCache.get(key) === done) resultCache.delete(key);
      },
    );
    resultCache.set(key, entry);
    if (resultCache.size > RESULT_CACHE_SIZE) resultCache.delete(resultCache.keys().next().value);
  }
  if (!entry.settled) joinJob(key, entry, signal);
  const result = await entry.job;
  return { ...result, usage: cached ? { ...result.usage, calls: 0, fallbacks: [] } : result.usage, cached };
}

// 테스트용: 인식 결과 캐시 비우기
export const clearRecognitionCache = () => resultCache.clear();

// scores는 높은 순으로 정렬되어 있어야 한다
export function selectIngredients(scores, { threshold, topK, highMargin } = config.recognition) {
  const best = scores[0]?.score ?? 0;
  return scores
    .filter((s) => s.score >= threshold)
    .slice(0, topK)
    .map((s) => ({
      ...s,
      score: Number(s.score.toFixed(4)),
      confidence: s.score >= best - highMargin ? "high" : "normal",
    }));
}
