// 작성일시: 2026-10-26 14:39
// 후보 재료 목록 로드 및 모델별 텍스트 임베딩 캐시 관리
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, rename } from "node:fs/promises";
import { embed } from "./openrouter.js";

const LIST_PATH = new URL("../data/ingredients.json", import.meta.url);
const EMBED_BATCH_SIZE = 20;
// 모델마다 벡터 공간이 달라 서로 비교할 수 없으므로 캐시 파일도 모델별로 둔다
let cacheDir = new URL("../data/", import.meta.url);
const cacheUrl = (model) => new URL(`ingredient-embeddings.${model.replace(/[^a-z0-9.-]+/gi, "_")}.json`, cacheDir);
const pending = new Map(); // 모델 → { job: 벡터 준비 Promise, budget: 그 작업이 쓰는 예산 } (동시 요청이 같은 작업을 중복하지 않게)
const ready = new Map(); // 모델 → { hash, vectors } 메모리에 올라온 완성 벡터
const partial = new Map(); // 모델 → { hash, vectors } 중간에 실패한 작업에서 이미 성공한 배치 (다음 시도 때 이어서 진행)

// 테스트용: 캐시 파일 위치를 임시 폴더로 바꾸고 메모리 상태를 비운다 (dirUrl은 '/'로 끝나는 file URL)
export function setIngredientCacheDir(dirUrl) {
  cacheDir = dirUrl;
  pending.clear();
  ready.clear();
  partial.clear();
}

// 단위 벡터로 바꿔 두면 코사인 유사도 = 내적
export function normalize(vector) {
  const length = Math.hypot(...vector);
  return vector.map((v) => v / length);
}

export async function loadIngredientList() {
  return JSON.parse(await readFile(LIST_PATH, "utf8"));
}

const listHash = (model, list) =>
  createHash("sha256")
    .update(model + "\n" + list.map((item) => item.prompt).join("\n"))
    .digest("hex");

// API를 부르지 않고 메모리·캐시 파일에서만 찾는다. 없거나 재료 목록이 바뀌었으면 null
export async function loadCachedVectors(model, list) {
  const hash = listHash(model, list);
  if (ready.get(model)?.hash === hash) return ready.get(model).vectors;
  try {
    const cache = JSON.parse(await readFile(cacheUrl(model), "utf8"));
    if (cache.hash === hash) {
      ready.set(model, { hash, vectors: cache.vectors });
      return cache.vectors;
    }
  } catch {
    // 캐시가 없거나 손상됨
  }
  return null;
}

// 벡터 캐시가 있을 가능성이 있는지 (파일 존재만 확인, 내용 검증은 loadCachedVectors)
export const hasCachedVectors = (model) => ready.has(model) || existsSync(cacheUrl(model));

async function buildVectors(model, list, budget) {
  const cached = await loadCachedVectors(model, list);
  if (cached) return cached;

  const hash = listHash(model, list);
  let progress = partial.get(model);
  if (progress?.hash !== hash) {
    progress = { hash, vectors: [] };
    partial.set(model, progress);
  }
  console.log(`[ingredients] embedding ${list.length} ingredient prompts with ${model}${progress.vectors.length ? ` (resuming from ${progress.vectors.length})` : ""}...`);
  // 성공한 배치는 progress에 쌓아 두므로, 중간에 실패해도 다음 시도는 남은 배치부터 이어서 한다
  for (let i = progress.vectors.length; i < list.length; i += EMBED_BATCH_SIZE) {
    const batch = list.slice(i, i + EMBED_BATCH_SIZE).map((item) => item.prompt);
    progress.vectors.push(...(await embed(batch, model, { budget })).map(normalize));
  }
  const path = cacheUrl(model);
  const tmpPath = new URL(path.href + ".tmp");
  await writeFile(tmpPath, JSON.stringify({ hash, model, vectors: progress.vectors }));
  await rename(tmpPath, path);
  partial.delete(model);
  ready.set(model, { hash, vectors: progress.vectors });
  return progress.vectors;
}

// 공유한 작업이 먼저 시작한 요청의 예산 때문에 실패한 경우 (호출 수·시간 소진, 그 요청의 취소)
const BORROWED_BUDGET_ERRORS = new Set(["BUDGET_EXCEEDED", "CLIENT_CLOSED"]);

// list 순서대로 재료 벡터 배열을 돌려준다. 캐시가 없으면 만든다(배치당 요청 1회, budget을 씀).
// 실패하면 다음 호출 때 남은 배치부터 다시 시도한다.
// 동시에 온 요청은 먼저 시작한 작업(과 그 요청의 budget)을 공유한다. 그 작업이 먼저 요청의 예산 소진·취소로
// 실패하면, 기다리던 요청은 성공한 배치에 이어 자기 budget으로 한 번 더 시도한다.
export async function getIngredientVectors(model, list, { budget = null } = {}) {
  const shared = pending.get(model);
  if (shared && shared.budget !== budget) {
    try {
      return await shared.job;
    } catch (err) {
      if (!BORROWED_BUDGET_ERRORS.has(err.code)) throw err;
    }
  }
  if (!pending.has(model)) {
    const entry = { job: buildVectors(model, list, budget), budget };
    pending.set(model, entry);
    entry.job.catch(() => pending.get(model) === entry && pending.delete(model));
  }
  return pending.get(model).job;
}
