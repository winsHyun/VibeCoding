// 작성일시: 2026-10-26 15:35
// 3단계 프로필·저장 레시피 테스트 (임시 폴더의 db.json 사용, API 호출 없음): npm test
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";
import {
  createProfile,
  updateProfile,
  deleteProfile,
  listProfiles,
  getProfile,
  saveRecipe,
  listSavedRecipes,
  updateSavedRecipeMemo,
  deleteSavedRecipe,
  MAX_SAVED_RECIPES,
} from "../src/profiles.js";
import { finalizeRecipes, buildMessages } from "../src/recipes.js";

let dir;
let dbPath;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fridge-recipe-"));
  dbPath = join(dir, "db.json");
  await openStore(dbPath);
});
// 테스트마다 만든 임시 폴더를 지운다
afterEach(() => rm(dir, { recursive: true, force: true }));

const rejectsWith = (promiseOrFn, code) =>
  assert.rejects(async () => (typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn), (err) => err.code === code);

const recipe = (title = "김치볶음밥", names = ["김치", "밥", "달걀"]) => ({
  title,
  summary: "요약",
  cookTimeMinutes: 15,
  difficulty: "easy",
  servings: 2,
  caloriesPerServing: 500,
  ingredients: names.map((name) => ({ name, amount: "1개", owned: true })),
  steps: ["볶는다."],
  tips: "",
});

test("프로필 생성: 기본값 채움, 저장 파일에 기록되고 다시 열어도 남아 있음", async () => {
  const p = await createProfile({ name: " 엄마 ", allergies: ["새우", "새우", "키위"] });
  assert.equal(p.name, "엄마");
  assert.deepEqual(p.allergies, ["새우", "키위"]); // 중복 제거, 직접 입력(키위) 허용
  assert.equal(p.spiceLevel, 1);
  assert.equal(p.defaultServings, 2);

  await openStore(dbPath); // 서버 재시작과 같은 상황
  assert.equal(getProfile(p.id).name, "엄마");
});

test("프로필 검증: 이름 길이·중복, 허용되지 않은 값, 범위", async () => {
  await createProfile({ name: "아빠" });
  await rejectsWith(() => createProfile({ name: "" }), "VALIDATION_ERROR");
  await rejectsWith(() => createProfile({ name: "가".repeat(21) }), "VALIDATION_ERROR");
  await rejectsWith(() => createProfile({ name: " 아 빠 " }), "DUPLICATE");
  await rejectsWith(() => createProfile({ name: "철수", dietaryRestrictions: ["키토"] }), "VALIDATION_ERROR");
  await rejectsWith(() => createProfile({ name: "철수", spiceLevel: 5 }), "VALIDATION_ERROR");
  await rejectsWith(() => createProfile({ name: "철수", defaultServings: 0 }), "VALIDATION_ERROR");
});

test("프로필은 최대 10개", async () => {
  for (let i = 0; i < 10; i++) await createProfile({ name: `사람${i}` });
  await rejectsWith(() => createProfile({ name: "열한번째" }), "LIMIT_EXCEEDED");
  assert.equal(listProfiles().length, 10);
});

test("프로필 수정: 자기 이름은 유지 가능, 다른 프로필 이름은 불가, 없는 프로필은 NOT_FOUND", async () => {
  const a = await createProfile({ name: "A" });
  await createProfile({ name: "B" });
  const updated = await updateProfile(a.id, { name: "A", spiceLevel: 3 });
  assert.equal(updated.spiceLevel, 3);
  await rejectsWith(() => updateProfile(a.id, { name: "B" }), "DUPLICATE");
  await rejectsWith(() => updateProfile("nope", { name: "C" }), "NOT_FOUND");
});

test("레시피 저장: 같은 제목·재료 구성은 중복 저장 안 됨 (기존 id 반환), 재료 순서는 무관", async () => {
  const p = await createProfile({ name: "나" });
  const saved = await saveRecipe(p.id, { recipe: recipe(), sourceIngredients: ["김치", "달걀"] });
  await assert.rejects(saveRecipe(p.id, { recipe: recipe("김치볶음밥", ["달걀", "밥", "김치"]) }), (err) => err.code === "DUPLICATE" && err.extra.existingId === saved.id);
  // 다른 프로필은 같은 레시피를 따로 저장할 수 있다
  const other = await createProfile({ name: "너" });
  await saveRecipe(other.id, { recipe: recipe() });
  assert.equal(listSavedRecipes(p.id).length, 1);
});

test("레시피 저장 검증: 형식이 틀리면 VALIDATION_ERROR, 없는 프로필은 NOT_FOUND", async () => {
  const p = await createProfile({ name: "나" });
  await rejectsWith(() => saveRecipe(p.id, { recipe: { title: "제목만" } }), "VALIDATION_ERROR");
  await rejectsWith(() => saveRecipe("nope", { recipe: recipe() }), "NOT_FOUND");
});

test("저장 레시피 목록: 최신순, 제목 검색 / 메모 수정 / 삭제", async () => {
  const p = await createProfile({ name: "나" });
  const first = await saveRecipe(p.id, { recipe: recipe("김치볶음밥") });
  await new Promise((r) => setTimeout(r, 5));
  await saveRecipe(p.id, { recipe: recipe("두부 부침", ["두부"]) });
  assert.deepEqual(listSavedRecipes(p.id).map((r) => r.recipe.title), ["두부 부침", "김치볶음밥"]);
  assert.deepEqual(listSavedRecipes(p.id, "김치 볶음").map((r) => r.recipe.title), ["김치볶음밥"]);

  const memo = await updateSavedRecipeMemo(p.id, first.id, { memo: "  다음엔 덜 짜게 " });
  assert.equal(memo.memo, "다음엔 덜 짜게");
  await rejectsWith(() => updateSavedRecipeMemo(p.id, first.id, { memo: "가".repeat(501) }), "VALIDATION_ERROR");

  await deleteSavedRecipe(p.id, first.id);
  assert.equal(listSavedRecipes(p.id).length, 1);
  await rejectsWith(() => deleteSavedRecipe(p.id, first.id), "NOT_FOUND");
});

test("프로필 삭제 시 그 프로필의 저장 레시피만 함께 삭제", async () => {
  const a = await createProfile({ name: "A" });
  const b = await createProfile({ name: "B" });
  await saveRecipe(a.id, { recipe: recipe() });
  await saveRecipe(b.id, { recipe: recipe() });
  assert.deepEqual(await deleteProfile(a.id), { deletedRecipes: 1 });
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  assert.equal(db.profiles.length, 1);
  assert.equal(db.savedRecipes.length, 1);
  assert.equal(db.savedRecipes[0].profileId, b.id);
});

test("동시에 저장해도 순서대로 기록되어 빠지는 데이터가 없음", async () => {
  await Promise.all(Array.from({ length: 8 }, (_, i) => createProfile({ name: `동시${i}` })));
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  assert.equal(db.profiles.length, 8);
});

test("손상된 데이터 파일은 덮어쓰지 않고 오류를 낸다", async () => {
  await writeFile(dbPath, "{ 깨진 파일");
  await assert.rejects(openStore(dbPath), /읽을 수 없습니다/);
  assert.equal(await readFile(dbPath, "utf8"), "{ 깨진 파일");
});

test("JSON은 맞지만 구조가 다른 데이터 파일도 덮어쓰지 않고 오류를 낸다", async () => {
  for (const content of ['{ "profiles": {}, "savedRecipes": [] }', '{ "profiles": [] }', "[]", '{ "profiles": [1], "savedRecipes": [] }']) {
    await writeFile(dbPath, content);
    await assert.rejects(openStore(dbPath), /읽을 수 없습니다/, content);
    assert.equal(await readFile(dbPath, "utf8"), content);
  }
});

test("알레르기 경고: 대두 알레르기면 두부·간장, 새우 알레르기면 새우젓에 경고", () => {
  const [r] = finalizeRecipes([recipe("찌개", ["두부", "간장", "새우젓", "양파"])], ["양파"], ["대두", "새우"]);
  assert.deepEqual(r.allergyWarning.sort(), ["대두", "새우"]);
  const byName = Object.fromEntries(r.ingredients.map((g) => [g.name, g.allergens]));
  assert.deepEqual(byName, { 두부: ["대두"], 간장: ["대두"], 새우젓: ["새우"], 양파: [] });
  const [safe] = finalizeRecipes([recipe("볶음", ["양파"])], ["양파"], ["대두"]);
  assert.deepEqual(safe.allergyWarning, []);
});

test("프로필 정보가 레시피 프롬프트에 들어감", () => {
  const profile = { allergies: ["땅콩"], dietaryRestrictions: ["저염"], preferredCuisines: ["한식"], spiceLevel: 0 };
  const [, user] = buildMessages({ ingredients: ["달걀"], options: { maxCookTimeMinutes: null, difficulty: null, servings: 2 }, excludeTitles: [], profile });
  assert.match(user.content, /알레르기: 땅콩/);
  assert.match(user.content, /식단 제한: 저염/);
  assert.match(user.content, /선호 요리: 한식/);
  assert.match(user.content, /매운맛 선호: 안 매움/);
  const [, plain] = buildMessages({ ingredients: ["달걀"], options: { maxCookTimeMinutes: null, difficulty: null, servings: 2 }, excludeTitles: [] });
  assert.doesNotMatch(plain.content, /알레르기/);
});

test("저장 레시피는 프로필당 최대 MAX_SAVED_RECIPES개, 다른 프로필은 따로 센다", async () => {
  const p = await createProfile({ name: "나" });
  const other = await createProfile({ name: "너" });
  for (let i = 0; i < MAX_SAVED_RECIPES; i++) await saveRecipe(p.id, { recipe: recipe(`요리${i}`) });
  await rejectsWith(() => saveRecipe(p.id, { recipe: recipe("하나 더") }), "LIMIT_EXCEEDED");
  await saveRecipe(other.id, { recipe: recipe("하나 더") });
  assert.equal(listSavedRecipes(p.id).length, MAX_SAVED_RECIPES);
});
