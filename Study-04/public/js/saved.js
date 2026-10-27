// 작성일시: 2026-10-26 15:35
// 3단계: 내 레시피 (현재 프로필의 저장 레시피 목록·검색·메모·삭제)
import { $, el, api, showView, showStatus, hideStatus, friendlyError, renderRecipeCard, formatDate } from "./dom.js";
import { getCurrentProfile, reselectProfile } from "./profile.js";

const els = {
  list: $("saved-list"),
  search: $("saved-search"),
  empty: $("saved-empty"),
  backBtn: $("saved-back-btn"),
};

let searchTimer = null;
let shownQuery = "";
// 요청 순번: 검색어를 빨리 바꾸면 늦게 도착한 이전 검색 결과가 새 결과를 덮어쓰지 않게 한다
let loadSeq = 0;

async function load() {
  const profile = getCurrentProfile();
  if (!profile) return;
  const seq = ++loadSeq;
  const q = els.search.value.trim();
  els.list.setAttribute("aria-busy", "true");
  try {
    const { recipes } = await api(`/api/profiles/${profile.id}/recipes?q=${encodeURIComponent(q)}`);
    if (seq === loadSeq) render(recipes, q);
  } catch (err) {
    if (seq !== loadSeq) return;
    const { message, profileMissing } = friendlyError(err, "saved");
    // 처음 열 때 실패하면 목록이 빈 채로 남으므로 안내 문구도 바꿔 둔다
    if (!els.list.children.length) showEmpty("저장한 레시피를 불러오지 못했어요.");
    const actions = profileMissing ? [{ label: "프로필 다시 고르기", onClick: reselectProfile, primary: true }] : [{ label: "다시 시도", onClick: load, primary: true }];
    showStatus(message, "error", { actions });
  } finally {
    if (seq === loadSeq) els.list.removeAttribute("aria-busy");
  }
}

// 목록 대신 보여 줄 안내 문구 (불러오는 중·불러오기 실패)
function showEmpty(message) {
  els.empty.textContent = message;
  els.empty.hidden = false;
}

// 목록이 비었을 때의 안내 문구
function updateEmpty() {
  els.empty.hidden = els.list.children.length > 0;
  els.empty.textContent = shownQuery ? `'${shownQuery}'(이)가 들어간 레시피가 없어요.` : "아직 저장한 레시피가 없어요. 레시피를 추천받은 뒤 마음에 드는 레시피의 '☆ 저장'을 눌러 보세요.";
}

// 요약 줄의 저장 날짜·메모 여부 문구
const savedInfo = (saved) => `${formatDate(saved.savedAt)} 저장${saved.memo ? " · 메모 있음" : ""}`;

// onMemoSaved: 메모를 저장한 뒤 요약 줄을 고치는 함수
function memoBlock(saved, onMemoSaved) {
  const wrap = el("div", "memo");
  const label = el("label", "field", "메모");
  const textarea = el("textarea", "text-input");
  textarea.maxLength = 500;
  textarea.rows = 3;
  textarea.placeholder = "예: 다음엔 간장을 조금 줄이기";
  textarea.value = saved.memo;
  label.append(textarea);
  const saveBtn = el("button", "btn small", "메모 저장");
  saveBtn.type = "button";
  saveBtn.addEventListener("click", async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      const { savedRecipe } = await api(`/api/profiles/${saved.profileId}/recipes/${saved.id}`, { method: "PATCH", body: { memo: textarea.value } });
      saved.memo = savedRecipe?.memo ?? textarea.value.trim();
      onMemoSaved();
      showStatus("메모를 저장했어요.");
    } catch (err) {
      showStatus(friendlyError(err).message, "error");
    } finally {
      saveBtn.disabled = false;
    }
  });
  const deleteBtn = el("button", "btn small danger push-end", "레시피 삭제");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`'${saved.recipe.title}' 레시피를 삭제할까요?`)) return;
    try {
      await api(`/api/profiles/${saved.profileId}/recipes/${saved.id}`, { method: "DELETE" });
      showStatus(`'${saved.recipe.title}' 레시피를 삭제했어요.`);
      // 목록 전체를 다시 받지 않고 그 카드만 뺀다
      wrap.closest(".recipe-card")?.remove();
      updateEmpty();
    } catch (err) {
      showStatus(friendlyError(err).message, "error");
    }
  });
  const actions = el("div", "form-actions");
  actions.append(saveBtn, deleteBtn);
  wrap.append(label, actions);
  return wrap;
}

function render(savedRecipes, query) {
  shownQuery = query;
  els.list.replaceChildren(
    ...savedRecipes.map((saved) => {
      const extras = [];
      if (saved.sourceIngredients.length) extras.push(el("p", "help", `추천받을 때 쓴 재료: ${saved.sourceIngredients.join(", ")}`));
      const savedAt = el("span", "help small", savedInfo(saved));
      extras.push(
        memoBlock(saved, () => {
          savedAt.textContent = savedInfo(saved);
        }),
      );
      return renderRecipeCard(saved.recipe, { notes: [savedAt], extras });
    }),
  );
  updateEmpty();
}

export async function openSaved() {
  els.search.value = "";
  // 응답이 오기 전까지 이전에 연 목록(다른 프로필일 수 있음)이 보이지 않게 먼저 비운다
  els.list.replaceChildren();
  shownQuery = "";
  showEmpty("저장한 레시피를 불러오는 중이에요…");
  showView("saved");
  await load();
}

export function initSaved() {
  els.backBtn.addEventListener("click", () => {
    hideStatus();
    showView("main");
  });
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  });
}
