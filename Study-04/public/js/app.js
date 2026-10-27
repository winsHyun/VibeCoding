// 작성일시: 2026-10-26 14:39
// 1단계: 사진 업로드 → 재료 인식 → 사용자 확인/수정 → 확정
// 2단계: 확정 재료 + 조건(+ 프로필) → 레시피 3개 추천 → 다른 레시피 추천
// 3단계: 프로필 선택(profile.js), 레시피 저장, 내 레시피(saved.js)
import { $, el, api, AI_TIMEOUT_MS, showStatus, hideStatus, setBusy, friendlyError, modelNote, renderRecipeCard, cardButton, onViewChange } from "./dom.js";
import { initProfiles, getCurrentProfile, onProfileChange, reselectProfile } from "./profile.js";
import { initSaved, openSaved } from "./saved.js";

// 원본은 브라우저에서 긴 변 1024px로 줄여 보내므로 넉넉하게 둔다 (휴대폰 고화질 사진 허용)
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_SIDE = 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// 서버의 사진 최소 크기(src/recognizer.js MIN_IMAGE_SIDE)와 같다. 올리기 전에 먼저 알려 준다
const MIN_IMAGE_SIDE = 32;
// 레시피 요청 재료 제한 (src/recipes.js parseRecipeRequest와 같다)
const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_LENGTH = 30;

const els = {
  dropzone: $("dropzone"),
  fileInput: $("file-input"),
  preview: $("preview"),
  hint: $("dropzone-hint"),
  recognizeBtn: $("recognize-btn"),
  manualBtn: $("manual-btn"),
  resultSection: $("result-section"),
  chipList: $("chip-list"),
  emptyResult: $("empty-result"),
  addForm: $("add-form"),
  addInput: $("add-input"),
  options: $("ingredient-options"),
  confirmBtn: $("confirm-btn"),
  confirmedSection: $("confirmed-section"),
  confirmedList: $("confirmed-list"),
  profileNote: $("profile-note"),
  editBtn: $("edit-btn"),
  recipeForm: $("recipe-form"),
  servingsSelect: $("servings-select"),
  recipeBtn: $("recipe-btn"),
  recipeSection: $("recipe-section"),
  recipeList: $("recipe-list"),
  moreBtn: $("more-btn"),
  myRecipesBtn: $("my-recipes-btn"),
  photoNote: $("photo-note"),
  chipAnnounce: $("chip-announce"),
  addError: $("add-error"),
  chipCount: $("chip-count"),
  previousRecipes: $("previous-recipes"),
  previousSummary: $("previous-summary"),
  previousList: $("previous-list"),
};

const CONFIDENCE_KO = { high: "신뢰도 높음", normal: "신뢰도 보통", manual: "직접 추가" };

let imageDataUrl = null;
let candidates = []; // { id, name }
let selected = []; // { id, name, confidence: "high" | "normal" | "manual" }
let confirmedNames = [];
let shownTitles = []; // "다른 레시피 추천" 때 중복을 피하려고 보낼 이미 본 레시피 제목
let lastRecognition = null; // { image, data } 같은 사진으로 다시 누르면 요청 없이 재사용 (임베딩 결과는 같음)
// 요청 순번: 응답이 왔을 때 순번이 바뀌었으면(새 사진·새 요청·프로필 변경) 지난 응답이므로 버린다
let recognizeSeq = 0;
let recipeSeq = 0;
let fileSeq = 0; // 사진 줄이기 순번: 줄이는 동안 다른 사진을 고르면 이전 사진의 결과를 버린다
// 진행 중인 AI 요청을 실제로 끊는 컨트롤러 (끊으면 서버도 그 요청의 AI 호출을 멈춰 하루 한도를 아낀다)
let recognizeController = null;
let recipeController = null;
// 마지막으로 띄운 로딩 안내 { message, startedAt }. 다른 화면에 다녀오면 상태 줄이 지워지므로, 요청이 아직 진행 중이면 다시 띄운다
let loadingStatus = null;

function showLoading(message) {
  loadingStatus = { message, startedAt: Date.now() };
  showStatus(message, "loading");
}

// 긴 변 1024px로 줄이고 JPEG로 다시 압축 (업로드 용량 절감)
// 너무 작은 사진은 code "TOO_SMALL" 오류를 던진다 (서버에 보내 봐야 INVALID_IMAGE로 거절됨)
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (Math.min(bitmap.width, bitmap.height) < MIN_IMAGE_SIDE) {
    const size = `${bitmap.width}×${bitmap.height}px`;
    bitmap.close();
    throw Object.assign(new Error(size), { code: "TOO_SMALL" });
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function showOnly(...sections) {
  for (const s of [els.resultSection, els.confirmedSection, els.recipeSection]) s.hidden = !sections.includes(s);
}

// 진행 중인 재료 인식 요청을 끊고 응답을 버리게 한다 (새 사진을 골랐거나 직접 입력으로 넘어갔을 때)
// 순번을 먼저 올리므로 abort로 생긴 오류는 지난 요청으로 보고 화면에 띄우지 않는다
function cancelRecognizeRequest() {
  recognizeSeq++;
  recognizeController?.abort();
  recognizeController = null;
  setBusy(els.recognizeBtn, false);
  els.recognizeBtn.disabled = !imageDataUrl;
}

// 진행 중인 레시피 요청을 끊고 응답을 버리게 하고 버튼을 다시 쓸 수 있게 한다 (재료·프로필이 바뀌었을 때)
function cancelRecipeRequest() {
  recipeSeq++;
  recipeController?.abort();
  recipeController = null;
  setBusy(els.recipeBtn, false);
  setBusy(els.moreBtn, false);
}

// 새로 나타난 단계로 화면을 옮기고 제목에 포커스를 준다 (좁은 화면·키보드·화면 낭독기 사용자가 바뀐 곳을 알 수 있게)
function revealSection(section) {
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.querySelector("h2")?.focus({ preventScroll: true });
}

async function handleFile(file) {
  if (!file) return;
  // 줄이는 동안 다른 사진을 고르면 늦게 끝난 이전 사진이 새 사진을 덮어쓰지 않게 한다
  const seq = ++fileSeq;
  if (!ACCEPTED_TYPES.includes(file.type)) return showStatus("JPEG, PNG, WebP 사진만 올릴 수 있어요. 다른 사진을 골라 주세요.", "error");
  if (file.size > MAX_FILE_BYTES) return showStatus(`사진이 너무 커요(${Math.round(file.size / 1024 / 1024)}MB). 30MB 이하 사진을 골라 주세요.`, "error");
  let resized;
  try {
    resized = await resizeImage(file);
  } catch (err) {
    if (seq !== fileSeq) return;
    if (err.code === "TOO_SMALL") {
      return showStatus(`사진이 너무 작아요(${err.message}). 가로세로 ${MIN_IMAGE_SIDE}px 이상인 사진을 골라 주세요.`, "error", {
        actions: [{ label: "재료 직접 입력", onClick: startManual }],
      });
    }
    return showStatus("이미지를 읽을 수 없어요. 다른 사진으로 시도해 주세요.", "error");
  }
  if (seq !== fileSeq) return;
  imageDataUrl = resized;
  // 이전 사진의 인식·레시피 요청이 늦게 도착해도 새 사진 화면에 그리지 않는다
  cancelRecognizeRequest();
  cancelRecipeRequest();
  els.preview.src = imageDataUrl;
  els.preview.hidden = false;
  els.hint.hidden = true;
  els.photoNote.hidden = false;
  showOnly();
  showStatus("사진을 올렸어요. '재료 인식'을 눌러 주세요.");
}

function showRecognition(data) {
  // 레시피를 요청하는 중에 다시 '재료 인식'을 누르면, 늦게 온 이전 레시피가 재료 화면 아래에 뜨지 않게 끊는다
  cancelRecipeRequest();
  // 서버 제한(30개)을 넘는 결과가 와도 다음 단계에서 막히지 않게 자른다
  selected = data.ingredients.slice(0, MAX_INGREDIENTS).map(({ id, name, confidence }) => ({ id, name, confidence }));
  setAddError("");
  renderChips();
  showOnly(els.resultSection);
  if (selected.length === 0) {
    // 인식된 재료가 없으면 바로 직접 입력할 수 있게 입력 칸으로 보낸다
    showStatus("사진에서 재료를 찾지 못했어요. 아래 칸에 재료를 직접 넣거나, 더 밝고 가까이서 찍은 사진으로 다시 시도해 주세요.", "error");
    els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    els.addInput.focus({ preventScroll: true });
    return;
  }
  const demoNote = data.demo ? " · 데모 모드라 사진과 관계없는 예시 결과예요" : "";
  showStatus(`재료 ${selected.length}개를 찾았어요. 맞는지 확인한 뒤 '재료 확정'을 눌러 주세요. (${(data.elapsedMs / 1000).toFixed(1)}초${modelNote(data.model)})${demoNote}`);
  revealSection(els.resultSection);
}

async function recognize() {
  const image = imageDataUrl;
  if (lastRecognition?.image === image) return showRecognition(lastRecognition.data);
  const seq = ++recognizeSeq;
  recognizeController?.abort();
  const controller = (recognizeController = new AbortController());
  setBusy(els.recognizeBtn, true, "재료 찾는 중…");
  showLoading("재료를 찾는 중이에요. 보통 10~40초 걸려요.");
  try {
    const data = await api("/api/recognize", { method: "POST", body: { image }, timeoutMs: AI_TIMEOUT_MS, signal: controller.signal });
    if (seq !== recognizeSeq) return; // 그 사이 다른 사진을 골랐다
    lastRecognition = { image, data };
    showRecognition(data);
  } catch (err) {
    if (seq === recognizeSeq && err.code !== "ABORTED") {
      // 실패해도 재료 직접 입력으로 다음 단계에 갈 수 있게 버튼을 함께 보여 준다
      const { message, retry } = friendlyError(err, "recognize");
      const actions = [{ label: "재료 직접 입력", onClick: startManual, primary: true }];
      if (retry) actions.push({ label: "다시 시도", onClick: recognize });
      showStatus(message, "error", { actions });
    }
  } finally {
    if (recognizeController === controller) recognizeController = null;
    if (seq === recognizeSeq) setBusy(els.recognizeBtn, false);
  }
}

// 재료를 빼면 목록 전체를 다시 그리므로, 같은 자리의 칩 → 바로 앞 칩 → 추가 입력칸 순서로 포커스를 옮긴다
function removeChip(item) {
  const index = selected.indexOf(item);
  selected = selected.filter((s) => s !== item);
  renderChips();
  setAddError("");
  els.chipAnnounce.textContent = `${item.name}을(를) 뺐어요. 재료 ${selected.length}개 남음`;
  const buttons = els.chipList.querySelectorAll(".chip-remove");
  (buttons[index] ?? buttons[index - 1] ?? els.addInput).focus();
}

function renderChips() {
  els.chipList.replaceChildren(
    ...selected.map((item) => {
      const li = el("li", "chip");
      const remove = el("button", "chip-remove", "✕");
      remove.type = "button";
      remove.setAttribute("aria-label", `${item.name} 빼기`);
      remove.addEventListener("click", () => removeChip(item));
      // 신뢰도를 색 점만으로 알리지 않도록 화면 낭독기용 글자를 함께 둔다
      li.append(el("span", `dot ${item.confidence}`), el("span", "", item.name), el("span", "visually-hidden", `(${CONFIDENCE_KO[item.confidence] ?? ""})`), remove);
      return li;
    }),
  );
  els.emptyResult.hidden = selected.length > 0;
  els.chipCount.textContent = `(지금 ${selected.length}개)`;
}

// 추가 입력칸 바로 아래의 오류 (빈 문자열이면 숨김)
function setAddError(message) {
  els.addError.textContent = message;
  els.addError.hidden = !message;
  if (message) els.addInput.setAttribute("aria-invalid", "true");
  else els.addInput.removeAttribute("aria-invalid");
}

// 문제가 있으면 입력한 글자를 지우지 않고 입력칸 아래에 이유를 보여 준다
function addIngredient(event) {
  event.preventDefault();
  const name = els.addInput.value.trim();
  if (!name) {
    setAddError("추가할 재료 이름을 입력해 주세요.");
    return els.addInput.focus();
  }
  if (selected.some((s) => s.name === name)) {
    setAddError(`'${name}'은(는) 이미 목록에 있어요.`);
    return els.addInput.select();
  }
  if (selected.length >= MAX_INGREDIENTS) {
    return setAddError(`재료는 ${MAX_INGREDIENTS}개까지 넣을 수 있어요. 필요 없는 재료를 ✕로 뺀 뒤 추가해 주세요.`);
  }
  // maxlength가 있지만 붙여넣기·자동완성 등으로 넘칠 때를 대비해 한 번 더 확인한다
  if (name.length > MAX_INGREDIENT_LENGTH) {
    return setAddError(`재료 이름은 ${MAX_INGREDIENT_LENGTH}자 이내로 써 주세요.`);
  }
  // 후보 목록에 없는 이름도 그대로 추가 (레시피 생성에는 이름만 쓰임)
  const match = candidates.find((c) => c.name === name);
  selected.push({ id: match?.id ?? `custom:${name}`, name, confidence: "manual" });
  renderChips();
  setAddError("");
  els.chipAnnounce.textContent = `${name}을(를) 추가했어요. 재료 ${selected.length}개`;
  hideStatus();
  els.addInput.value = "";
}

function confirmIngredients() {
  if (selected.length === 0) {
    els.addInput.focus();
    return setAddError("재료를 하나 이상 넣어 주세요. 입력 칸에 재료 이름을 쓰고 '추가'를 누르면 돼요.");
  }
  confirmedNames = selected.map((s) => s.name);
  cancelRecipeRequest();
  els.confirmedList.textContent = confirmedNames.join(", ");
  showOnly(els.confirmedSection);
  shownTitles = [];
  hideStatus();
  revealSection(els.confirmedSection);
}

function readOptions() {
  const form = new FormData(els.recipeForm);
  const maxCookTimeMinutes = form.get("maxCookTimeMinutes");
  return {
    maxCookTimeMinutes: maxCookTimeMinutes ? Number(maxCookTimeMinutes) : null,
    difficulty: form.get("difficulty") || null,
    servings: Number(form.get("servings")),
  };
}

// more=true면 지금까지 본 레시피를 제외하고 새로 추천받는다
// 응답이 왔을 때 요청 순번이나 프로필이 바뀌었으면 이전 조건의 결과이므로 버린다
// (다른 프로필 화면에 알레르기 경고 없이 그려지거나 다른 프로필에 저장되는 것을 막음)
async function requestRecipes(more) {
  if (!more) shownTitles = [];
  const seq = ++recipeSeq;
  // 새 요청이 이전 요청을 대신하므로 이전 요청은 끊는다
  recipeController?.abort();
  const controller = (recipeController = new AbortController());
  const profileId = getCurrentProfile()?.id;
  const isStale = () => seq !== recipeSeq || getCurrentProfile()?.id !== profileId;
  setBusy(els.recipeBtn, true, "레시피 만드는 중…");
  setBusy(els.moreBtn, true, "레시피 만드는 중…");
  showLoading("레시피를 만드는 중이에요. 보통 20~60초 걸려요.");
  try {
    const data = await api("/api/recipes", {
      method: "POST",
      body: { ingredients: confirmedNames, options: readOptions(), excludeTitles: shownTitles, profileId },
      timeoutMs: AI_TIMEOUT_MS,
      signal: controller.signal,
    });
    if (isStale()) return;
    shownTitles.push(...data.recipes.map((r) => r.title));
    // '다른 레시피 추천'이면 지금 보던 카드(저장 상태 포함)를 접힌 '이전 추천'으로 옮기고, 새 추천이면 이전 추천을 비운다
    if (more) keepPreviousRecipes();
    else clearPreviousRecipes();
    renderRecipes(data.recipes);
    els.recipeSection.hidden = false;
    const warned = data.recipes.filter((r) => r.allergyWarning?.length).length;
    const warnNote = warned ? ` ⚠ 그중 ${warned}개에 알레르기 재료가 들어 있어요. 카드의 '알레르기 주의' 표시를 확인해 주세요.` : "";
    const demoNote = data.demo ? " · 데모 모드라 예시 레시피예요" : "";
    // 알레르기 경고는 실패가 아니므로 오류(빨강)가 아닌 주의(노랑) 모양으로 보여 준다
    showStatus(`레시피 ${data.recipes.length}개를 추천했어요.${warnNote} (${(data.elapsedMs / 1000).toFixed(1)}초${modelNote(data.model)})${demoNote}`, warned ? "warning" : "info");
    revealSection(els.recipeSection);
  } catch (err) {
    if (!isStale() && err.code !== "ABORTED") {
      const { message, retry, profileMissing } = friendlyError(err, "recipes");
      const actions = [];
      if (retry) actions.push({ label: "다시 시도", onClick: () => requestRecipes(more), primary: true });
      if (profileMissing) actions.push({ label: "프로필 다시 고르기", onClick: reselectProfile, primary: true });
      if (err.code === "DAILY_LIMIT") actions.push({ label: "내 레시피 보기", onClick: openMyRecipes });
      showStatus(message, "error", { actions });
    }
  } finally {
    if (recipeController === controller) recipeController = null;
    if (!isStale()) {
      setBusy(els.recipeBtn, false);
      setBusy(els.moreBtn, false);
    }
  }
}

async function saveRecipe(recipe, button) {
  const profile = getCurrentProfile();
  if (!profile) return showStatus("프로필을 먼저 골라 주세요.", "error");
  button.disabled = true;
  try {
    await api(`/api/profiles/${profile.id}/recipes`, { method: "POST", body: { recipe, sourceIngredients: confirmedNames } });
    markSaved(button, recipe);
    showStatus(`'${recipe.title}'을(를) ${profile.name}님의 레시피에 저장했어요.`, "info", { actions: [{ label: "내 레시피 보기", onClick: openMyRecipes }] });
  } catch (err) {
    if (err.code === "DUPLICATE") {
      markSaved(button, recipe);
      showStatus(`'${recipe.title}'은(는) 이미 저장된 레시피예요.`);
    } else {
      button.disabled = false;
      const { message, profileMissing } = friendlyError(err, "save");
      const actions = [];
      if (err.code === "LIMIT_EXCEEDED") actions.push({ label: "내 레시피 정리하기", onClick: openMyRecipes, primary: true });
      if (profileMissing) actions.push({ label: "프로필 다시 고르기", onClick: reselectProfile, primary: true });
      showStatus(message, "error", { actions });
    }
  }
}

function markSaved(button, recipe) {
  button.textContent = "★ 저장됨";
  button.setAttribute("aria-label", `${recipe.title} 저장됨`);
}

function renderRecipes(recipes) {
  els.recipeList.replaceChildren(
    ...recipes.map((recipe) => {
      const save = cardButton("☆ 저장", "save-btn", (button) => saveRecipe(recipe, button));
      // 화면 낭독기가 어느 레시피의 저장 버튼인지 알 수 있게 한다
      save.setAttribute("aria-label", `${recipe.title} 저장`);
      return renderRecipeCard(recipe, { actions: [save] });
    }),
  );
}

// 지금 보이는 추천 카드를 '이전 추천' 맨 위로 옮긴다 (DOM 노드를 옮기므로 저장 버튼·저장 상태가 그대로 남음)
function keepPreviousRecipes() {
  els.previousList.prepend(...els.recipeList.children);
  const count = els.previousList.children.length;
  els.previousSummary.textContent = `이전 추천 레시피 ${count}개 보기`;
  els.previousRecipes.hidden = count === 0;
}

function clearPreviousRecipes() {
  els.previousList.replaceChildren();
  els.previousRecipes.open = false;
  els.previousRecipes.hidden = true;
}

// 프로필이 바뀌면 기본 인분을 맞추고, 이전 프로필 기준으로 받은 레시피는 숨긴다
function applyProfile(profile) {
  if (!profile) return;
  cancelRecipeRequest();
  els.servingsSelect.value = String(profile.defaultServings);
  els.recipeSection.hidden = true;
  // 이전 프로필 기준의 추천(알레르기 경고 없음)이 남지 않게 '이전 추천'도 비운다
  clearPreviousRecipes();
  shownTitles = [];
  const notes = [];
  if (profile.allergies.length) notes.push(`알레르기(${profile.allergies.join(", ")})`);
  if (profile.dietaryRestrictions.length) notes.push(`식단 제한(${profile.dietaryRestrictions.join(", ")})`);
  els.profileNote.hidden = notes.length === 0;
  els.profileNote.textContent = `${profile.name}님의 ${notes.join(", ")}을 반영해 추천해요.`;
}

async function loadCandidates() {
  try {
    candidates = (await api("/api/ingredients")).ingredients;
    els.options.replaceChildren(...candidates.map((c) => new Option(c.name)));
  } catch {
    // 자동완성이 없어도 직접 입력은 가능
  }
}

// 처리 후 값을 비워 같은 파일을 다시 골라도 change가 일어나게 한다.
// 같은 사진이면 줄인 결과(imageDataUrl)가 같으므로 lastRecognition 캐시는 그대로 맞는다
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = "";
  handleFile(file);
});
els.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropzone.classList.add("dragover");
});
els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("dragover");
  handleFile(e.dataTransfer.files[0]);
});
els.recognizeBtn.addEventListener("click", recognize);
// 인식을 건너뛰고 빈 목록에서 재료를 직접 넣는다 (인식 실패·한도 소진 시에도 2단계로 갈 수 있게)
function startManual() {
  cancelRecognizeRequest();
  cancelRecipeRequest();
  selected = [];
  renderChips();
  setAddError("");
  showOnly(els.resultSection);
  hideStatus();
  els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  els.addInput.focus({ preventScroll: true });
}

function openMyRecipes() {
  hideStatus();
  openSaved();
}
els.manualBtn.addEventListener("click", startManual);
els.addForm.addEventListener("submit", addIngredient);
els.confirmBtn.addEventListener("click", confirmIngredients);
els.editBtn.addEventListener("click", () => {
  cancelRecipeRequest();
  hideStatus();
  showOnly(els.resultSection);
  revealSection(els.resultSection);
});
els.recipeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  requestRecipes(false);
});
els.moreBtn.addEventListener("click", () => requestRecipes(true));
els.myRecipesBtn.addEventListener("click", openMyRecipes);
els.addInput.addEventListener("input", () => setAddError(""));
// 다른 화면(내 레시피·프로필)에 다녀오는 동안 지워진 로딩 표시를, 요청이 아직 진행 중이면 경과 시간을 이어서 다시 띄운다
onViewChange((name) => {
  if (name === "main" && (recipeController || recognizeController) && loadingStatus) {
    showStatus(loadingStatus.message, "loading", { startedAt: loadingStatus.startedAt });
  }
});

onProfileChange(applyProfile);
initSaved();
loadCandidates();
// 서버가 꺼져 있는 등으로 첫 화면을 못 그리면 상태 줄만 남으므로 다시 시도 버튼을 준다
function startApp() {
  showStatus("불러오는 중이에요…", "loading");
  initProfiles()
    .then(() => {
      // 그 사이 다른 안내가 뜨지 않았으면 로딩 표시를 지운다
      if ($("status").classList.contains("loading")) hideStatus();
    })
    .catch((err) => {
      showStatus(`앱을 시작하지 못했어요. ${friendlyError(err).message}`, "error", {
        actions: [
          {
            label: "다시 시도",
            primary: true,
            onClick: () => {
              loadCandidates();
              startApp();
            },
          },
        ],
      });
    });
}
startApp();
