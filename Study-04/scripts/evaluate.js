// 작성일시: 2026-10-26 14:39
// 재료 인식 정확도 평가 및 임계값 보정
// 사용법: data/eval/에 사진과 labels.json을 두고 `npm run evaluate`
// labels.json 형식: [{ "file": "fridge1.jpg", "ingredients": ["egg", "milk"] }]  (ingredients.json의 id)
// 사진별 점수는 data/eval/.score-cache.json에 저장해, 다시 돌릴 때는 바뀐 사진만 API를 부른다.
// 중간에 하루 한도(DAILY_LIMIT) 등으로 멈춰도 그때까지의 결과로 평가를 출력한다.
// .env는 config.js보다 먼저 읽어야 하므로 첫 번째 import로 둔다
import "../src/env.js";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { config } from "../src/config.js";
import { loadIngredientList } from "../src/ingredients.js";
import { scoreImage, selectIngredients } from "../src/recognizer.js";

const EVAL_DIR = new URL("../data/eval/", import.meta.url);
const CACHE_PATH = new URL(".score-cache.json", EVAL_DIR);
const labels = JSON.parse(await readFile(new URL("labels.json", EVAL_DIR), "utf8"));
const ingredients = await loadIngredientList();
const knownIds = new Set(ingredients.map((i) => i.id));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// 점수가 달라지는 조건(재료 프롬프트, 모델 순서, 조각 설정)이 바뀌면 캐시 키도 바뀐다
const { maxSide, grid, overlap } = config.recognition;
const settingsKey = sha256(JSON.stringify([ingredients.map((i) => [i.id, i.prompt]), config.embedModels, maxSide, grid, overlap]));
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
} catch {
  // 캐시가 없거나 손상되면 새로 만든다
}
// 현재 설정(settingsKey)이 아닌 항목은 다시 쓰일 일이 없으므로 저장할 때 지운다 (파일이 한없이 커지지 않게)
async function saveCache() {
  for (const key of Object.keys(cache)) {
    if (!key.endsWith(`|${settingsKey}`)) delete cache[key];
  }
  const tmpPath = new URL(CACHE_PATH.href + ".tmp");
  await writeFile(tmpPath, JSON.stringify(cache));
  await rename(tmpPath, CACHE_PATH);
}

// 사진마다 전체 점수를 한 번만 구해 두고, 임계값만 바꿔 가며 평가
const results = [];
const failures = [];
let cachedCount = 0;
for (const { file, ingredients: truth } of labels) {
  const unknown = truth.filter((id) => !knownIds.has(id));
  if (unknown.length) console.warn(`[warn] ${file}: unknown ids ${unknown.join(", ")}`);
  try {
    const buffer = await readFile(new URL(file, EVAL_DIR));
    const key = `${sha256(buffer)}|${settingsKey}`;
    if (cache[key]) {
      cachedCount++;
    } else {
      const { scores, model } = await scoreImage(buffer, ingredients);
      cache[key] = { scores, model };
      await saveCache(); // 사진 하나 끝날 때마다 저장 (중간에 멈춰도 다음에 이어서)
    }
    results.push({ file, truth: new Set(truth), ...cache[key] });
  } catch (err) {
    failures.push(file);
    console.warn(`[fail] ${file}: ${err.code ?? ""} ${err.detail || err.message}`);
    // 하루 한도·키 오류는 다음 사진도 똑같이 실패하고 한도만 쓰므로 멈춘다
    if (err.code === "DAILY_LIMIT" || err.code === "AUTH_ERROR" || err.code === "INSUFFICIENT_CREDITS") break;
  }
}

const skipped = labels.length - results.length - failures.length;
console.log(`
평가한 사진 ${results.length}/${labels.length}장 (캐시 재사용 ${cachedCount}장, 실패 ${failures.length}장${skipped ? `, 중단으로 건너뜀 ${skipped}장` : ""})`);
if (results.length === 0) {
  console.log("평가할 결과가 없습니다.");
  process.exit(1);
}

function evaluate(threshold) {
  let hit = 0, predicted = 0, actual = 0;
  for (const r of results) {
    const picked = selectIngredients(r.scores, { ...config.recognition, threshold });
    hit += picked.filter((p) => r.truth.has(p.id)).length;
    predicted += picked.length;
    actual += r.truth.size;
  }
  return { precision: predicted ? hit / predicted : 0, recall: actual ? hit / actual : 0, predicted };
}

const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(4);

console.log(`\n사진별 결과 (threshold=${config.recognition.threshold})`);
for (const r of results) {
  const picked = selectIngredients(r.scores);
  const marks = picked.map((p) => `${p.name}${r.truth.has(p.id) ? "✓" : "✗"}(${p.score.toFixed(2)})`);
  const missed = [...r.truth].filter((id) => !picked.some((p) => p.id === id));
  console.log(`- ${r.file} [${r.model}]: ${marks.join(" ") || "(없음)"}`);
  if (missed.length) {
    const missedScores = missed.map((id) => {
      const s = r.scores.find((x) => x.id === id);
      return s ? `${s.name}(${s.score.toFixed(2)}, ${r.scores.indexOf(s) + 1}위)` : id;
    });
    console.log(`    놓친 재료: ${missedScores.join(" ")}`);
  }
}

console.log("\nthreshold | precision | recall | 평균 결과 수");
for (let t = 0.2; t <= 0.45001; t += 0.025) {
  const { precision, recall, predicted } = evaluate(t);
  console.log(`  ${t.toFixed(3)}   |   ${pct(precision)}    |  ${pct(recall)}  | ${(predicted / results.length).toFixed(1)}`);
}
