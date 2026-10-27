// 작성일시: 2026-10-26 15:35
// 3단계: 프로필 선택·만들기·편집·삭제, 헤더의 현재 프로필 표시
import { $, el, api, showView, showStatus, hideStatus, setBusy, friendlyError, storage } from "./dom.js";

const STORAGE_KEY = "currentProfileId";
// 서버(src/profiles.js stringList 기본값)와 같은 알레르기 제한
const MAX_ALLERGIES = 20;
const MAX_ALLERGY_LENGTH = 20;

const els = {
  bar: $("profile-bar"),
  currentName: $("current-profile-name"),
  list: $("profile-list"),
  newBtn: $("new-profile-btn"),
  form: $("profile-form"),
  formTitle: $("profile-form-title"),
  allergyOptions: $("allergy-options"),
  dietOptions: $("diet-options"),
  cuisineOptions: $("cuisine-options"),
  spiceSelect: $("spice-select"),
  cancelBtn: $("profile-cancel-btn"),
  deleteBtn: $("profile-delete-btn"),
  editBtn: $("edit-profile-btn"),
  switchBtn: $("switch-profile-btn"),
  submitBtn: $("profile-submit-btn"),
  nameError: $("profile-name-error"),
  allergyError: $("custom-allergy-error"),
};

let options = null; // 서버의 PROFILE_OPTIONS
let profiles = [];
let current = null;
let editing = null; // 편집 중인 프로필 (새로 만들 때는 null)
let saving = false; // 저장 요청 중 (두 번 눌러 같은 프로필이 두 번 만들어지는 것을 막음)
let eventsBound = false;
const listeners = [];

export const getCurrentProfile = () => current;
export const onProfileChange = (fn) => listeners.push(fn);

// 같은 프로필을 다시 골랐고 내용도 그대로면 알리지 않는다 (진행 중인 레시피 요청·결과를 지우지 않게)
// (진행 중인 요청의 로딩 표시는 메인 화면으로 돌아올 때 app.js가 onViewChange로 다시 띄운다)
function setCurrent(profile) {
  const unchanged = Boolean(profile && current && profile.id === current.id && JSON.stringify(profile) === JSON.stringify(current));
  current = profile;
  storage.set(STORAGE_KEY, profile?.id ?? null);
  els.bar.hidden = !profile;
  els.currentName.textContent = profile?.name ?? "";
  if (!unchanged) listeners.forEach((fn) => fn(profile));
}

// 다른 창에서 지운 프로필 등으로 요청이 실패했을 때: 서버의 프로필 목록을 다시 받아 프로필 선택 화면으로 간다
export async function reselectProfile() {
  try {
    profiles = (await api("/api/profiles")).profiles;
  } catch (err) {
    return showStatus(friendlyError(err).message, "error", { actions: [{ label: "다시 시도", onClick: reselectProfile, primary: true }] });
  }
  if (current && !profiles.some((p) => p.id === current.id)) setCurrent(null);
  showProfileList();
}

function profileSummary(p) {
  const parts = [];
  if (p.allergies.length) parts.push(`알레르기: ${p.allergies.join(", ")}`);
  if (p.dietaryRestrictions.length) parts.push(p.dietaryRestrictions.join(", "));
  if (p.preferredCuisines.length) parts.push(`선호: ${p.preferredCuisines.join(", ")}`);
  return parts.join(" · ") || "식단 정보 없음";
}

export function showProfileList() {
  if (profiles.length === 0) return openForm(null);
  els.list.replaceChildren(
    ...profiles.map((p) => {
      const li = el("li");
      const button = el("button", "profile-item");
      button.type = "button";
      button.append(el("strong", "", p.name), el("span", "help", profileSummary(p)));
      if (p.id === current?.id) button.append(el("span", "tag owned", "사용 중"));
      button.addEventListener("click", () => {
        setCurrent(p);
        hideStatus();
        showView("main");
      });
      li.append(button);
      return li;
    }),
  );
  showView("profiles");
}

function checkboxGroup(container, name, values) {
  container.replaceChildren(
    ...values.map((value) => {
      const label = el("label", "check");
      const input = el("input");
      input.type = "checkbox";
      input.name = name;
      input.value = value;
      label.append(input, el("span", "", value));
      return label;
    }),
  );
}

function setChecked(name, values) {
  for (const input of els.form.querySelectorAll(`input[name="${name}"]`)) input.checked = values.includes(input.value);
}

const checkedValues = (name) => [...els.form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

function openForm(profile) {
  editing = profile;
  const p = profile ?? { name: "", allergies: [], dietaryRestrictions: [], preferredCuisines: [], spiceLevel: 1, defaultServings: 2 };
  els.formTitle.textContent = profile ? `'${profile.name}' 프로필 편집` : profiles.length ? "새 프로필 만들기" : "처음 오셨네요! 프로필을 만들어 주세요";
  els.form.elements.name.value = p.name;
  showNameError("");
  showAllergyError("");
  setChecked("allergies", p.allergies);
  // 목록에 없는 알레르기는 직접 입력 칸으로
  els.form.elements.customAllergies.value = p.allergies.filter((a) => !options.allergies.includes(a)).join(", ");
  setChecked("dietaryRestrictions", p.dietaryRestrictions);
  setChecked("preferredCuisines", p.preferredCuisines);
  els.form.elements.spiceLevel.value = String(p.spiceLevel);
  els.form.elements.defaultServings.value = String(p.defaultServings);
  els.deleteBtn.hidden = !profile;
  // 프로필이 하나도 없으면 만들기를 건너뛸 수 없다
  els.cancelBtn.hidden = profiles.length === 0;
  showView("profile-form");
  els.form.elements.name.focus();
}

// 입력 칸 바로 아래에 오류를 보여 준다 (빈 문자열이면 숨김)
function showFieldError(input, errorEl, message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}
const showNameError = (message) => showFieldError(els.form.elements.name, els.nameError, message);
const showAllergyError = (message) => showFieldError(els.form.elements.customAllergies, els.allergyError, message);

// 직접 입력한 알레르기를 서버와 같은 기준(합계 MAX_ALLERGIES개, 각 MAX_ALLERGY_LENGTH자)으로 먼저 검사한다.
// 문제가 없으면 { allergies }, 있으면 { error }
function readAllergies() {
  const custom = els.form.elements.customAllergies.value.split(",").map((s) => s.trim()).filter(Boolean);
  const tooLong = custom.find((s) => s.length > MAX_ALLERGY_LENGTH);
  if (tooLong) return { error: `'${tooLong.slice(0, 10)}…'이(가) 너무 길어요. 알레르기 이름은 ${MAX_ALLERGY_LENGTH}자 이내로 써 주세요.` };
  const allergies = [...new Set([...checkedValues("allergies"), ...custom])];
  if (allergies.length > MAX_ALLERGIES) return { error: `알레르기는 고른 것과 직접 입력한 것을 합쳐 ${MAX_ALLERGIES}개까지 넣을 수 있어요. (지금 ${allergies.length}개)` };
  return { allergies };
}

async function submitForm(event) {
  event.preventDefault();
  if (saving) return;
  if (!els.form.elements.name.value.trim()) {
    showNameError("이름을 입력해 주세요.");
    els.form.elements.name.focus();
    return;
  }
  showNameError("");
  const { allergies, error } = readAllergies();
  showAllergyError(error ?? "");
  if (error) {
    els.form.elements.customAllergies.focus();
    return;
  }
  const body = {
    name: els.form.elements.name.value,
    allergies,
    dietaryRestrictions: checkedValues("dietaryRestrictions"),
    preferredCuisines: checkedValues("preferredCuisines"),
    spiceLevel: Number(els.form.elements.spiceLevel.value),
    defaultServings: Number(els.form.elements.defaultServings.value),
  };
  saving = true;
  setBusy(els.submitBtn, true, "저장 중…");
  try {
    if (editing) {
      const { profile } = await api(`/api/profiles/${editing.id}`, { method: "PUT", body });
      profiles = profiles.map((p) => (p.id === profile.id ? profile : p));
      setCurrent(profile);
    } else {
      const { profile } = await api("/api/profiles", { method: "POST", body });
      profiles.push(profile);
      setCurrent(profile);
    }
    showView("main");
    showStatus(`'${body.name.trim()}' 프로필을 저장했어요. 이제 냉장고 사진을 올려 보세요.`);
  } catch (err) {
    // 같은 이름이면 이름 칸에 바로 알려 준다. 입력한 내용은 그대로 둔다
    if (err.code === "DUPLICATE") {
      showNameError("같은 이름의 프로필이 이미 있어요. 다른 이름을 써 주세요.");
      els.form.elements.name.focus();
    } else {
      showStatus(friendlyError(err).message, "error");
    }
  } finally {
    saving = false;
    setBusy(els.submitBtn, false);
  }
}

async function deleteEditing() {
  const target = editing;
  if (!target) return;
  if (!confirm(`'${target.name}' 프로필을 삭제할까요?\n이 프로필에 저장한 레시피도 모두 함께 삭제되고 되돌릴 수 없어요.`)) return;
  try {
    const { deletedRecipes } = await api(`/api/profiles/${target.id}`, { method: "DELETE" });
    profiles = profiles.filter((p) => p.id !== target.id);
    if (current?.id === target.id) setCurrent(null);
    showProfileList();
    showStatus(`'${target.name}' 프로필과 저장한 레시피 ${deletedRecipes}개를 삭제했어요.`);
  } catch (err) {
    showStatus(friendlyError(err).message, "error");
  }
}

function cancelForm() {
  hideStatus();
  if (editing && current) showView("main");
  else showProfileList();
}

// 첫 화면: 기억해 둔 프로필이 있으면 바로 메인, 없으면 프로필 선택(또는 만들기)
export async function initProfiles() {
  options = await api("/api/profile-options");
  checkboxGroup(els.allergyOptions, "allergies", options.allergies);
  checkboxGroup(els.dietOptions, "dietaryRestrictions", options.dietaryRestrictions);
  checkboxGroup(els.cuisineOptions, "preferredCuisines", options.preferredCuisines);
  els.spiceSelect.replaceChildren(...options.spiceLevels.map((label, i) => new Option(label, String(i))));
  bindEvents();

  profiles = (await api("/api/profiles")).profiles;
  const remembered = profiles.find((p) => p.id === storage.get(STORAGE_KEY));
  if (remembered) {
    setCurrent(remembered);
    showView("main");
  } else {
    showProfileList();
  }
}

// 이벤트는 한 번만 붙인다 (시작 실패 후 '다시 시도'로 initProfiles를 다시 불러도 중복되지 않게)
function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  els.form.addEventListener("submit", submitForm);
  els.form.elements.name.addEventListener("input", () => showNameError(""));
  els.form.elements.customAllergies.addEventListener("input", () => showAllergyError(""));
  els.cancelBtn.addEventListener("click", cancelForm);
  els.deleteBtn.addEventListener("click", deleteEditing);
  els.newBtn.addEventListener("click", () => openForm(null));
  els.editBtn.addEventListener("click", () => current && openForm(current));
  els.switchBtn.addEventListener("click", () => {
    hideStatus();
    showProfileList();
  });
}
