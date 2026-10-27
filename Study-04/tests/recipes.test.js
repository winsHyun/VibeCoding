// 작성일시: 2026-10-26 14:55
// 레시피 응답 처리 로직 테스트 (API 호출 없음): npm test
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseRecipeRequest,
  extractJson,
  findSchemaError,
  finalizeRecipes,
  generateRecipes,
  RecipeError,
} from "../src/recipes.js";
import { demoRecipes } from "../src/demo.js";
import { config } from "../src/config.js";
import { resetModelCooldowns } from "../src/openrouter.js";

const recipe = (title, ingredientNames) => ({
  title,
  summary: "요약",
  cookTimeMinutes: 15,
  difficulty: "easy",
  servings: 2,
  caloriesPerServing: 300,
  ingredients: ingredientNames.map((name) => ({ name, amount: "1개" })),
  steps: ["썬다.", "볶는다."],
  tips: "팁",
});
const validResponse = () =>
  JSON.stringify({
    recipes: [recipe("A", ["달걀", "양파"]), recipe("B", ["두부", "김치"]), recipe("C", ["달걀", "두부"])],
  });
const request = { ingredients: ["달걀", "양파", "두부", "김치"], options: { maxCookTimeMinutes: null, difficulty: null, servings: 2 }, excludeTitles: [] };

test("parseRecipeRequest: 기본값과 중복 제거", () => {
  const r = parseRecipeRequest({ ingredients: [" 달걀 ", "달걀", "", "양파"] });
  assert.deepEqual(r.ingredients, ["달걀", "양파"]);
  assert.deepEqual(r.options, { maxCookTimeMinutes: null, difficulty: null, servings: 2 });
  assert.deepEqual(r.excludeTitles, []);
});

test("parseRecipeRequest: 잘못된 입력은 INVALID_INPUT", () => {
  for (const body of [{}, { ingredients: [] }, { ingredients: ["달걀"], options: { servings: 9 } }, { ingredients: ["달걀"], options: { difficulty: "x" } }, { ingredients: ["달걀"], options: { maxCookTimeMinutes: 45 } }]) {
    assert.throws(() => parseRecipeRequest(body), (err) => err instanceof RecipeError && err.code === "INVALID_INPUT");
  }
});

test("extractJson: 앞뒤 설명문과 코드 블록 표시를 무시", () => {
  const data = extractJson("다음은 레시피입니다.\n```json\n" + validResponse() + "\n```\n맛있게 드세요!");
  assert.equal(data.recipes.length, 3);
  assert.throws(() => extractJson("JSON이 없는 답변"));
});

test("findSchemaError: 개수와 필드 검증", () => {
  assert.equal(findSchemaError(JSON.parse(validResponse())), null);
  assert.match(findSchemaError({ recipes: [recipe("A", ["달걀"])] }), /3개가 아님/);
  const bad = JSON.parse(validResponse());
  bad.recipes[1].difficulty = "쉬움";
  assert.match(findSchemaError(bad), /recipes\[1\]\.difficulty/);
});

test("finalizeRecipes: 보유 여부를 서버에서 판정 (기본 양념 포함, 한 글자 이름은 정확히 일치만)", () => {
  const [r] = finalizeRecipes([recipe("A", ["달걀 2개", "대파", "소금", "배추"])], ["달걀", "파", "배"]);
  const owned = Object.fromEntries(r.ingredients.map((g) => [g.name, g.owned]));
  assert.deepEqual(owned, { "달걀 2개": true, 대파: false, 소금: true, 배추: false });
  assert.equal(r.ownedUsed, 1);
});

test("finalizeRecipes: 보유 재료를 2개 미만 쓰는 레시피는 뒤로", () => {
  const out = finalizeRecipes([recipe("적게", ["달걀", "소고기"]), recipe("많이", ["달걀", "양파"])], ["달걀", "양파"]);
  assert.deepEqual(out.map((r) => r.title), ["많이", "적게"]);
});

test("generateRecipes: 정상 응답은 1회 호출", async () => {
  let calls = 0;
  const result = await generateRecipes(request, { chatFn: async () => (calls++, { content: validResponse(), finishReason: "stop" }) });
  assert.equal(calls, 1);
  assert.equal(result.recipes.length, 3);
});

test("generateRecipes: JSON 오류 시 오류 내용을 알려 주고 1회 재요청", async () => {
  const seen = [];
  const replies = [{ content: "레시피를 추천할게요!", finishReason: "stop" }, { content: validResponse(), finishReason: "stop" }];
  const result = await generateRecipes(request, { chatFn: async (messages) => (seen.push(messages.length), replies.shift()) });
  assert.equal(result.attempts, 2);
  assert.deepEqual(seen, [2, 4]); // 두 번째 요청에 이전 답과 수정 요청이 붙음
});

test("generateRecipes: 두 번 연속 JSON 오류면 INVALID_MODEL_OUTPUT", async () => {
  await assert.rejects(
    generateRecipes(request, { chatFn: async () => ({ content: "{ 깨진 JSON", finishReason: "stop" }) }),
    (err) => err instanceof RecipeError && err.code === "INVALID_MODEL_OUTPUT",
  );
});

test("generateRecipes: 답이 잘리면(length) 토큰을 늘려 재요청", async () => {
  const tokens = [];
  const replies = [{ content: '{"recipes": [', finishReason: "length" }, { content: validResponse(), finishReason: "stop" }];
  const result = await generateRecipes(request, { chatFn: async (_, opts) => (tokens.push(opts.maxTokens), replies.shift()) });
  assert.deepEqual(tokens, [4000, 8000]);
  assert.equal(result.attempts, 2);
});

test("demoRecipes: 다시 추천하면 다른 레시피", () => {
  const first = demoRecipes({ ingredients: request.ingredients, excludeTitles: [] });
  const second = demoRecipes({ ingredients: request.ingredients, excludeTitles: first.map((r) => r.title) });
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.ok(second.every((r) => !first.some((f) => f.title === r.title)));
});

test("parseRecipeRequest: excludeTitles는 문자열만, 제목 100자·최대 30개로 자른다", () => {
  const titles = Array.from({ length: 40 }, (_, i) => `제목${i}`);
  const r = parseRecipeRequest({ ingredients: ["달걀"], excludeTitles: [...titles, 42, "  ", "가".repeat(5000)] });
  assert.equal(r.excludeTitles.length, 30);
  assert.equal(r.excludeTitles.at(-1).length, 100);
  assert.ok(!r.excludeTitles.includes("제목0"));
});

test("generateRecipes: 모든 모델 호출이 요청 예산(budget)을 함께 쓴다", async () => {
  const budgets = [];
  const replies = [{ content: "{", finishReason: "length" }, { content: validResponse(), finishReason: "stop" }];
  await generateRecipes(request, { chatFn: async (_, opts) => (budgets.push(opts.budget), replies.shift()) });
  assert.equal(budgets.length, 2);
  assert.ok(budgets[0], "budget이 전달되어야 함");
  assert.equal(budgets[0], budgets[1]); // 재생성도 같은 예산
});

// 실제 대체 모델 경로(chatWithFallback) + 가짜 fetch: 개선 전에는 최악 24회까지 호출하던 경로
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetModelCooldowns();
});

test("generateRecipes: 재시도·대체 모델·재생성을 합쳐도 OpenRouter 호출은 요청 예산(기본 6회)을 넘지 않는다", async () => {
  let calls = 0;
  let wins = 0;
  globalThis.fetch = async () => {
    calls++;
    // 모델 3개가 연달아 429를 내고 4번째만 응답하는데, 응답이 잘림(length) → 깨진 JSON 순서로 온다
    if (calls % 4 !== 0) return new Response(JSON.stringify({ error: { code: 429, message: "rate limited" } }), { status: 429 });
    wins++;
    const content = wins === 1 ? '{"recipes": [' : "not json";
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: wins === 1 ? "length" : "stop" }] }), { status: 200 });
  };
  await assert.rejects(generateRecipes(request), (err) => err.code === "BUDGET_EXCEEDED");
  assert.equal(calls, config.requestBudget.maxCalls);
});
