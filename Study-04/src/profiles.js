// 작성일시: 2026-10-26 15:35
// 3단계: 프로필 CRUD와 프로필별 저장 레시피 관리
import { randomUUID } from "node:crypto";
import { readDb, writeDb } from "./store.js";

export class ApiError extends Error {
  // extra: 응답 error 객체에 덧붙일 값 (예: 중복 저장 시 기존 레시피 id)
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const MAX_PROFILES = 10;
const MAX_MEMO = 500;
// 프로필당 저장 레시피 수 상한 (db.json 하나에 모두 들어가므로 파일이 한없이 커지지 않게)
export const MAX_SAVED_RECIPES = 100;

// 화면의 프로필 폼도 이 목록으로 만든다 (GET /api/profile-options)
export const PROFILE_OPTIONS = {
  allergies: ["달걀", "우유", "밀가루", "대두", "땅콩", "견과류", "새우", "게", "생선", "조개", "복숭아", "토마토"],
  dietaryRestrictions: ["채식", "비건", "저염", "저당", "저탄수화물", "글루텐 프리"],
  preferredCuisines: ["한식", "양식", "중식", "일식", "동남아식"],
  spiceLevels: ["안 매움", "약간 매움", "보통", "아주 매움"],
};

// 알레르기 항목이 레시피 재료 이름으로는 다르게 나오는 경우 (예: 대두 → 두부, 간장)
const ALLERGEN_KEYWORDS = {
  달걀: ["달걀", "계란", "마요네즈"],
  우유: ["우유", "치즈", "버터", "요거트", "요구르트", "생크림", "크림"],
  밀가루: ["밀가루", "부침가루", "튀김가루", "빵", "면", "국수", "파스타", "만두피"],
  대두: ["대두", "콩", "두부", "두유", "간장", "된장", "고추장"],
  땅콩: ["땅콩"],
  견과류: ["견과", "호두", "아몬드", "잣", "캐슈넛", "피스타치오", "땅콩"],
  새우: ["새우"],
  게: ["게살", "게맛살", "꽃게", "대게"],
  생선: ["생선", "고등어", "연어", "참치", "멸치", "어묵", "갈치", "꽁치", "명태", "북어"],
  조개: ["조개", "바지락", "홍합", "굴", "가리비", "전복"],
  복숭아: ["복숭아"],
  토마토: ["토마토", "케첩"],
};

// 알레르기 이름 → 레시피 재료에서 찾을 단어 목록 (직접 입력한 알레르기는 그 이름 그대로)
export const allergenKeywords = (allergy) => ALLERGEN_KEYWORDS[allergy] ?? [allergy];

const invalid = (message) => new ApiError(400, "VALIDATION_ERROR", message);
const notFound = (what) => new ApiError(404, "NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`);
const normalize = (s) => s.replace(/\s+/g, "").toLowerCase();

function stringList(value, field, { allowed, maxItems = 20, maxLength = 20 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw invalid(`${field}은(는) 목록이어야 합니다.`);
  const items = [...new Set(value.filter((s) => typeof s === "string").map((s) => s.trim()).filter(Boolean))];
  if (items.length > maxItems || items.some((s) => s.length > maxLength)) throw invalid(`${field} 항목이 너무 많거나 깁니다.`);
  const unknown = allowed ? items.filter((s) => !allowed.includes(s)) : [];
  if (unknown.length) throw invalid(`${field}에 알 수 없는 값이 있습니다: ${unknown.join(", ")}`);
  return items;
}

function intInRange(value, field, min, max, fallback) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${field}은(는) ${min}~${max} 사이여야 합니다.`);
  return n;
}

// 요청 본문 → 저장할 프로필 필드 (알레르기는 직접 입력도 허용)
function parseProfileInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 20) throw invalid("이름은 1~20자로 입력해 주세요.");
  return {
    name,
    allergies: stringList(body.allergies, "알레르기"),
    dietaryRestrictions: stringList(body.dietaryRestrictions, "식단 제한", { allowed: PROFILE_OPTIONS.dietaryRestrictions }),
    preferredCuisines: stringList(body.preferredCuisines, "선호 요리", { allowed: PROFILE_OPTIONS.preferredCuisines }),
    spiceLevel: intInRange(body.spiceLevel, "매운맛 선호", 0, 3, 1),
    defaultServings: intInRange(body.defaultServings, "기본 인분", 1, 4, 2),
  };
}

function assertUniqueName(profiles, name, exceptId) {
  if (profiles.some((p) => p.id !== exceptId && normalize(p.name) === normalize(name))) {
    throw new ApiError(409, "DUPLICATE", `'${name}' 프로필이 이미 있습니다.`);
  }
}

const findProfile = (db, id) => db.profiles.find((p) => p.id === id);

export function listProfiles() {
  return readDb().profiles;
}

export function getProfile(id) {
  const profile = findProfile(readDb(), id);
  if (!profile) throw notFound("프로필");
  return profile;
}

export function createProfile(body) {
  const fields = parseProfileInput(body);
  return writeDb((db) => {
    if (db.profiles.length >= MAX_PROFILES) throw new ApiError(400, "LIMIT_EXCEEDED", `프로필은 최대 ${MAX_PROFILES}개까지 만들 수 있습니다.`);
    assertUniqueName(db.profiles, fields.name);
    const now = new Date().toISOString();
    const profile = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
    db.profiles.push(profile);
    return profile;
  });
}

export function updateProfile(id, body) {
  const fields = parseProfileInput(body);
  return writeDb((db) => {
    const profile = findProfile(db, id);
    if (!profile) throw notFound("프로필");
    assertUniqueName(db.profiles, fields.name, id);
    Object.assign(profile, fields, { updatedAt: new Date().toISOString() });
    return profile;
  });
}

// 프로필과 그 프로필의 저장 레시피를 함께 지운다. 지운 레시피 수를 돌려준다.
export function deleteProfile(id) {
  return writeDb((db) => {
    if (!findProfile(db, id)) throw notFound("프로필");
    const before = db.savedRecipes.length;
    db.profiles = db.profiles.filter((p) => p.id !== id);
    db.savedRecipes = db.savedRecipes.filter((r) => r.profileId !== id);
    return { deletedRecipes: before - db.savedRecipes.length };
  });
}

// ---- 저장 레시피 ----

const isText = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

// 클라이언트가 보낸 레시피(2단계 응답 형식)에서 필요한 필드만 검증해 꺼낸다
function parseRecipe(recipe) {
  const r = recipe ?? {};
  const bad = () => invalid("레시피 형식이 올바르지 않습니다.");
  if (!isText(r.title, 100) || !isText(r.summary, 300)) throw bad();
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0 || r.ingredients.length > 50) throw bad();
  if (!Array.isArray(r.steps) || r.steps.length === 0 || r.steps.length > 50) throw bad();
  // 알레르기 표시는 저장 후에도 보이도록 문자열 배열만 걸러 함께 저장한다
  const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.length <= 20).slice(0, 20) : []);
  const ingredients = r.ingredients.map((g) => {
    if (!isText(g?.name, 50) || typeof g.amount !== "string" || g.amount.length > 50) throw bad();
    return { name: g.name.trim(), amount: g.amount.trim(), owned: g.owned === true, allergens: strings(g.allergens) };
  });
  const steps = r.steps.map((s) => {
    if (!isText(s, 500)) throw bad();
    return s.trim();
  });
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  return {
    title: r.title.trim(),
    summary: r.summary.trim(),
    cookTimeMinutes: num(r.cookTimeMinutes),
    difficulty: ["easy", "medium", "hard"].includes(r.difficulty) ? r.difficulty : "medium",
    servings: num(r.servings),
    caloriesPerServing: num(r.caloriesPerServing),
    ingredients,
    steps,
    tips: typeof r.tips === "string" ? r.tips.trim().slice(0, 500) : "",
    allergyWarning: strings(r.allergyWarning),
  };
}

// 같은 제목 + 같은 재료 구성이면 같은 레시피로 본다
const recipeKey = (recipe) =>
  `${normalize(recipe.title)}|${recipe.ingredients.map((g) => normalize(g.name)).sort().join(",")}`;

export function listSavedRecipes(profileId, query = "") {
  const db = readDb();
  if (!findProfile(db, profileId)) throw notFound("프로필");
  const q = normalize(query);
  return db.savedRecipes
    .filter((r) => r.profileId === profileId && (!q || normalize(r.recipe.title).includes(q)))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveRecipe(profileId, body) {
  const recipe = parseRecipe(body?.recipe);
  const sourceIngredients = stringList(body?.sourceIngredients, "재료", { maxItems: 30, maxLength: 30 });
  return writeDb((db) => {
    if (!findProfile(db, profileId)) throw notFound("프로필");
    const key = recipeKey(recipe);
    const existing = db.savedRecipes.find((r) => r.profileId === profileId && recipeKey(r.recipe) === key);
    if (existing) throw new ApiError(409, "DUPLICATE", "이미 저장된 레시피입니다.", { existingId: existing.id });
    const count = db.savedRecipes.filter((r) => r.profileId === profileId).length;
    if (count >= MAX_SAVED_RECIPES) {
      throw new ApiError(400, "LIMIT_EXCEEDED", `레시피는 프로필당 최대 ${MAX_SAVED_RECIPES}개까지 저장할 수 있습니다. 안 쓰는 레시피를 삭제한 뒤 저장해 주세요.`);
    }
    const saved = { id: randomUUID(), profileId, recipe, sourceIngredients, memo: "", savedAt: new Date().toISOString() };
    db.savedRecipes.push(saved);
    return saved;
  });
}

export function updateSavedRecipeMemo(profileId, recipeId, body) {
  const memo = typeof body?.memo === "string" ? body.memo.trim() : null;
  if (memo === null) throw invalid("메모가 필요합니다.");
  if (memo.length > MAX_MEMO) throw invalid(`메모는 ${MAX_MEMO}자까지 쓸 수 있습니다.`);
  return writeDb((db) => {
    const saved = db.savedRecipes.find((r) => r.id === recipeId && r.profileId === profileId);
    if (!saved) throw notFound("저장된 레시피");
    saved.memo = memo;
    return saved;
  });
}

export function deleteSavedRecipe(profileId, recipeId) {
  return writeDb((db) => {
    const before = db.savedRecipes.length;
    db.savedRecipes = db.savedRecipes.filter((r) => !(r.id === recipeId && r.profileId === profileId));
    if (db.savedRecipes.length === before) throw notFound("저장된 레시피");
    return { deleted: true };
  });
}
