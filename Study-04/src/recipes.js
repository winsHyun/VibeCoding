// 작성일시: 2026-10-26 14:55
// 2단계: 확정 재료 → 레시피 3개 생성 (프롬프트, JSON 추출/검증, 보유 재료 재판정)
import { config } from "./config.js";
import { RequestBudget, chat, withModelFallback } from "./openrouter.js";
import { PROFILE_OPTIONS, allergenKeywords } from "./profiles.js";

// config.chatModels를 순서대로 시도해 처음 응답한 모델의 결과를 돌려준다 (options.budget을 모든 시도가 함께 쓰고, 대체 이유도 거기에 남김)
async function chatWithFallback(messages, options) {
  const { result } = await withModelFallback(config.chatModels, (model) => chat(messages, { ...options, model }), { label: "chat", budget: options.budget });
  return result;
}

const RECIPE_COUNT = 3;
const DIFFICULTIES = ["easy", "medium", "hard"];
const DIFFICULTY_KO = { easy: "쉬움", medium: "보통", hard: "어려움" };
const COOK_TIMES = [15, 30, 60];
// 프롬프트에 넣는 "이미 추천한 레시피" 제목의 최대 개수와 길이 (프롬프트가 한없이 길어지지 않게)
const MAX_EXCLUDE_TITLES = 30;
const MAX_TITLE_LENGTH = 100;

export class RecipeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalid = (message) => new RecipeError("INVALID_INPUT", message);

// 요청 본문 검증 → { ingredients, options, excludeTitles, profileId }
export function parseRecipeRequest(body) {
  const raw = body?.ingredients;
  if (!Array.isArray(raw)) throw invalid("재료 목록이 필요합니다.");
  const ingredients = [...new Set(raw.filter((s) => typeof s === "string").map((s) => s.trim()).filter(Boolean))];
  if (ingredients.length === 0) throw invalid("재료를 하나 이상 넣어 주세요.");
  if (ingredients.length > 30 || ingredients.some((s) => s.length > 30)) throw invalid("재료 목록이 너무 깁니다.");

  const opts = body.options ?? {};
  const maxCookTimeMinutes = opts.maxCookTimeMinutes == null ? null : Number(opts.maxCookTimeMinutes);
  if (maxCookTimeMinutes !== null && !COOK_TIMES.includes(maxCookTimeMinutes)) throw invalid("조리 시간 값이 올바르지 않습니다.");
  const difficulty = opts.difficulty ?? null;
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty)) throw invalid("난이도 값이 올바르지 않습니다.");
  const servings = opts.servings == null ? 2 : Number(opts.servings);
  if (!Number.isInteger(servings) || servings < 1 || servings > 4) throw invalid("인분은 1~4 사이여야 합니다.");

  const excludeTitles = Array.isArray(body.excludeTitles)
    ? body.excludeTitles
        .filter((s) => typeof s === "string")
        .map((s) => s.trim().slice(0, MAX_TITLE_LENGTH))
        .filter(Boolean)
        .slice(-MAX_EXCLUDE_TITLES)
    : [];
  const profileId = typeof body.profileId === "string" && body.profileId ? body.profileId : null;
  return { ingredients, options: { maxCookTimeMinutes, difficulty, servings }, excludeTitles, profileId };
}

const EXAMPLE_JSON = `{
  "recipes": [
    {
      "title": "달걀 양파 볶음밥",
      "summary": "남은 밥과 달걀로 10분 만에 만드는 한 그릇 요리",
      "cookTimeMinutes": 15,
      "difficulty": "easy",
      "servings": 2,
      "caloriesPerServing": 520,
      "ingredients": [
        { "name": "달걀", "amount": "2개" },
        { "name": "대파", "amount": "1/2대" }
      ],
      "steps": ["양파를 잘게 썬다.", "팬에 기름을 두르고 달걀을 스크램블한다."],
      "tips": "찬밥을 쓰면 더 고슬고슬하다."
    }
  ]
}`;

const SYSTEM_PROMPT = `너는 한국 가정 요리 전문가다. 사용자가 가진 재료를 최대한 활용하는 현실적인 레시피를 추천한다.
반드시 지정된 JSON 형식으로만 답하고, JSON 밖에 다른 글을 쓰지 마라. 코드 블록 표시(\`\`\`)도 쓰지 마라.
모든 텍스트는 한국어로 쓴다.`;

// 3단계 프로필의 식단 정보를 프롬프트 문장으로 (없으면 빈 배열)
function profileLines(profile) {
  if (!profile) return [];
  const lines = [];
  if (profile.allergies.length) {
    lines.push(`알레르기: ${profile.allergies.join(", ")} (이 재료와 이 재료가 들어간 가공품은 절대 쓰지 마라)`);
  }
  if (profile.dietaryRestrictions.length) lines.push(`식단 제한: ${profile.dietaryRestrictions.join(", ")} (반드시 지켜라)`);
  if (profile.preferredCuisines.length) lines.push(`선호 요리: ${profile.preferredCuisines.join(", ")}`);
  lines.push(`매운맛 선호: ${PROFILE_OPTIONS.spiceLevels[profile.spiceLevel]}`);
  return lines;
}

export function buildMessages({ ingredients, options, excludeTitles, profile = null }) {
  const time = options.maxCookTimeMinutes ? `${options.maxCookTimeMinutes}분 이내` : "제한 없음";
  const level = options.difficulty ? DIFFICULTY_KO[options.difficulty] : "상관없음";
  const lines = [
    `가진 재료: ${ingredients.join(", ")}`,
    `조건: 조리 시간 ${time}, 난이도 ${level}, ${options.servings}인분`,
    ...profileLines(profile),
  ];
  if (excludeTitles.length) lines.push(`제외할 레시피(이미 추천함): ${excludeTitles.join(", ")}`);
  lines.push(
    `가진 재료를 최대한 많이 쓰고, 추가 재료는 최소화한 서로 다른 레시피 ${RECIPE_COUNT}개를 아래 JSON 형식으로 답해라.`,
    `각 레시피는 가진 재료를 ${config.recipe.minOwnedUsed}개 이상 써야 한다. difficulty는 easy, medium, hard 중 하나로 쓴다.`,
    EXAMPLE_JSON,
  );
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

// 응답에서 첫 '{'부터 마지막 '}'까지 잘라 파싱 (앞뒤 설명문·코드 블록 표시 제거)
export function extractJson(content) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("JSON 객체를 찾을 수 없음");
  return JSON.parse(content.slice(start, end + 1));
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const isPositive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// 스키마 위반 내용을 문자열로 돌려준다 (문제없으면 null)
export function findSchemaError(data) {
  if (!Array.isArray(data?.recipes)) return "recipes 배열이 없음";
  if (data.recipes.length !== RECIPE_COUNT) return `recipes가 ${RECIPE_COUNT}개가 아님 (${data.recipes.length}개)`;
  for (const [i, r] of data.recipes.entries()) {
    const at = `recipes[${i}]`;
    if (!isText(r.title)) return `${at}.title 누락`;
    if (!isText(r.summary)) return `${at}.summary 누락`;
    if (!isPositive(r.cookTimeMinutes)) return `${at}.cookTimeMinutes는 양수여야 함`;
    if (!DIFFICULTIES.includes(r.difficulty)) return `${at}.difficulty는 easy/medium/hard 중 하나여야 함`;
    if (!isPositive(r.servings)) return `${at}.servings는 양수여야 함`;
    if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) return `${at}.ingredients 배열 누락`;
    if (r.ingredients.some((g) => !isText(g?.name) || typeof g.amount !== "string")) return `${at}.ingredients 항목은 name, amount 문자열이어야 함`;
    if (!Array.isArray(r.steps) || r.steps.length === 0 || !r.steps.every(isText)) return `${at}.steps는 문자열 배열이어야 함`;
  }
  return null;
}

const normalizeName = (s) => s.replace(/\s+/g, "").toLowerCase();

// 레시피 재료가 보유 재료에 해당하는지. 한 글자 이름(무, 배 등)은 "배추"처럼 엉뚱하게 겹치므로 정확히 같을 때만 인정
function matchesOwned(name, owned) {
  const n = normalizeName(name);
  return owned.some((o) => {
    const m = normalizeName(o);
    if (n.length === 1 || m.length === 1) return n === m;
    return n.includes(m) || m.includes(n);
  });
}

// 재료 이름에 들어 있는 알레르기 항목들 (안전 경고라 놓치지 않도록 단순 포함 관계로 넓게 잡는다)
function matchAllergies(name, allergies) {
  const n = normalizeName(name);
  return allergies.filter((allergy) => allergenKeywords(allergy).some((k) => n.includes(normalizeName(k))));
}

// 모델의 판단 대신 서버에서 보유 여부(owned)를 다시 계산하고, 보유 재료 활용도가 낮은 레시피를 뒤로 보낸다.
// allergies가 있으면 해당 재료에 allergens를, 레시피에 allergyWarning(걸린 알레르기 목록)을 붙인다.
export function finalizeRecipes(recipes, ingredients, allergies = []) {
  const staples = config.recipe.pantryStaples;
  const result = recipes.map((r) => {
    let ownedUsed = 0;
    const warnings = new Set();
    const items = r.ingredients.map((g) => {
      const fromFridge = matchesOwned(g.name, ingredients);
      if (fromFridge) ownedUsed++;
      const allergens = matchAllergies(g.name, allergies);
      allergens.forEach((a) => warnings.add(a));
      return { name: g.name.trim(), amount: g.amount.trim(), owned: fromFridge || matchesOwned(g.name, staples), allergens };
    });
    return {
      title: r.title.trim(),
      summary: r.summary.trim(),
      cookTimeMinutes: Math.round(r.cookTimeMinutes),
      difficulty: r.difficulty,
      servings: Math.round(r.servings),
      caloriesPerServing: isPositive(r.caloriesPerServing) ? Math.round(r.caloriesPerServing) : null,
      ingredients: items,
      steps: r.steps.map((s) => s.trim()),
      tips: isText(r.tips) ? r.tips.trim() : "",
      ownedUsed,
      allergyWarning: [...warnings],
    };
  });
  // sort는 안정 정렬이므로 기준을 만족하는 레시피끼리는 모델이 준 순서를 유지
  return result.sort((a, b) => Number(b.ownedUsed >= config.recipe.minOwnedUsed) - Number(a.ownedUsed >= config.recipe.minOwnedUsed));
}

// 생성 단계는 최대 3회: 기본 1회 + 답 잘림 시 1회 + JSON 오류 시 1회.
// 단계마다 재시도·대체 모델이 붙을 수 있으므로, 실제 OpenRouter 호출 수와 시간은 budget(요청 1건 상한)으로 묶는다.
// 돌려주는 attempts는 생성 단계 수이고, 실제 OpenRouter 호출 수는 budget.calls(budget.usage())로 본다.
// chatFn은 테스트에서 가짜 모델 응답을 넣기 위한 인자
export async function generateRecipes(request, { chatFn = chatWithFallback, budget = new RequestBudget() } = {}) {
  const { maxTokens, retryMaxTokens, temperature, timeoutMs } = config.recipe;
  const messages = buildMessages(request);
  let tokens = maxTokens;
  let lengthRetried = false;
  let formatRetried = false;
  let attempts = 0;

  while (true) {
    attempts++;
    const { content, finishReason, model } = await chatFn(messages, { maxTokens: tokens, temperature, timeoutMs, budget });

    if (finishReason === "length" && !lengthRetried) {
      lengthRetried = true;
      tokens = retryMaxTokens;
      continue;
    }

    let problem;
    try {
      const data = extractJson(content);
      problem = findSchemaError(data);
      if (!problem) {
        const allergies = request.profile?.allergies ?? [];
        return { recipes: finalizeRecipes(data.recipes, request.ingredients, allergies), attempts, model };
      }
    } catch (err) {
      problem = `JSON 파싱 실패: ${err.message}`;
    }

    console.warn(`[recipes] invalid model output (attempt ${attempts}): ${problem}`);
    if (formatRetried) {
      throw new RecipeError("INVALID_MODEL_OUTPUT", "레시피를 만드는 중 AI 응답 형식에 문제가 생겼습니다. 다시 시도해 주세요.");
    }
    formatRetried = true;
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `방금 응답의 JSON 형식이 잘못되었다 (${problem}). 설명 없이 지정된 형식의 JSON만 다시 출력해라.` },
    );
  }
}
