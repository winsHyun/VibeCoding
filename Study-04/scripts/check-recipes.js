// 작성일시: 2026-10-26 14:55
// 실제 모델로 레시피 생성을 여러 번 돌려 JSON 실패율·응답 시간을 측정 (PRD_step2 수용 기준 확인용)
// 사용법: npm run check:recipes -- 20   (기본 5회. 1회당 모델 요청 1~3회, 최대 REQUEST_MAX_CALLS(기본 6)회를 쓰므로 하루 무료 한도에 주의)
// .env는 config.js보다 먼저 읽어야 하므로 첫 번째 import로 둔다
import "../src/env.js";
import { generateRecipes, RecipeError } from "../src/recipes.js";
import { OpenRouterError, RequestBudget, formatUsage } from "../src/openrouter.js";

const runs = Number(process.argv[2]) || 5;
const request = {
  ingredients: ["달걀", "양파", "두부", "김치", "우유"],
  options: { maxCookTimeMinutes: 30, difficulty: "easy", servings: 2 },
  excludeTitles: [],
};

let ok = 0;
let formatFailures = 0;
let retried = 0;
let totalCalls = 0; // 실제 OpenRouter 호출 수 합계 (재시도·대체 모델·재생성 포함, 하루 한도 소모량)
const times = [];
for (let i = 1; i <= runs; i++) {
  const started = Date.now();
  const budget = new RequestBudget();
  try {
    const { recipes, attempts, model } = await generateRecipes(request, { budget });
    const secs = (Date.now() - started) / 1000;
    times.push(secs);
    ok++;
    if (attempts > 1) retried++;
    // calls는 실제 OpenRouter 호출 수, stages는 생성 단계 수
    console.log(`#${i} OK ${secs.toFixed(1)}s [${model}] ${formatUsage(budget.usage())}, stages ${attempts}: ${recipes.map((r) => `${r.title}(보유 ${r.ownedUsed})`).join(" / ")}`);
  } catch (err) {
    if (err instanceof RecipeError) {
      formatFailures++;
      console.log(`#${i} JSON 형식 실패 (${err.code}, ${formatUsage(budget.usage())})`);
    } else if (err instanceof OpenRouterError) {
      console.log(`#${i} API 오류 ${err.code}: ${err.message} (${formatUsage(budget.usage())}) ${err.detail}`);
      if (err.code === "DAILY_LIMIT" || err.code === "AUTH_ERROR" || err.code === "INSUFFICIENT_CREDITS") break;
    } else {
      throw err;
    }
  } finally {
    totalCalls += budget.calls;
  }
}

const tried = ok + formatFailures;
console.log(`\nOpenRouter 호출 합계 ${totalCalls}회 (재시도·대체 모델·재생성 포함)`);
console.log(`성공 ${ok}/${tried}, JSON 최종 실패율 ${tried ? ((100 * formatFailures) / tried).toFixed(0) : "-"}% (기준 < 5%)`);
if (times.length) {
  const avg = times.reduce((a, b) => a + b) / times.length;
  console.log(`응답 시간 평균 ${avg.toFixed(1)}s, 최대 ${Math.max(...times).toFixed(1)}s (기준 30초 이내), 재요청 발생 ${retried}회`);
}
