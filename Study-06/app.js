// 작성일시: 2026-10-30 11:07

// Supabase 프로젝트 정보 (publishable 키는 브라우저 공개용이며, 접근 권한은 RLS 정책으로 제어)
const SUPABASE_URL = "https://txjsdtqzqbftyasbcksa.supabase.co";
const SUPABASE_KEY = "sb_publishable_KYpi1g8cG_1Z8-r23pFfyw_ciAIbqcY";
const TABLE = "shopping_items";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById("add-form");
const input = document.getElementById("item-input");
const list = document.getElementById("item-list");
const emptyMessage = document.getElementById("empty-message");
const summary = document.getElementById("summary");
const clearCheckedButton = document.getElementById("clear-checked");

let items = [];

// DB에서 목록을 불러옴 (생성 순서대로)
async function loadItems() {
  const { data, error } = await db
    .from(TABLE)
    .select("id, name, checked")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    alert("목록을 불러오지 못했습니다: " + error.message);
    return;
  }
  items = data;
  render();
}

// DB 요청 실패 시 사용자에게 알리고 화면을 DB 상태로 되돌림
async function handleError(error) {
  console.error(error);
  alert("데이터베이스 요청에 실패했습니다: " + error.message);
  await loadItems();
}

function createItemElement(item) {
  const li = document.createElement("li");
  li.className = "item" + (item.checked ? " checked" : "");
  li.dataset.id = item.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.checked;
  checkbox.id = `item-${item.id}`;

  // label로 감싸서 이름을 클릭해도 체크되도록 함
  const name = document.createElement("label");
  name.className = "item-name";
  name.htmlFor = checkbox.id;
  name.textContent = item.name;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "×";
  deleteButton.title = "삭제";
  deleteButton.setAttribute("aria-label", `${item.name} 삭제`);

  li.append(checkbox, name, deleteButton);
  return li;
}

function render() {
  list.replaceChildren(...items.map(createItemElement));

  const checkedCount = items.filter((item) => item.checked).length;
  emptyMessage.hidden = items.length > 0;
  summary.textContent = items.length
    ? `전체 ${items.length}개 · 완료 ${checkedCount}개`
    : "";
  clearCheckedButton.disabled = checkedCount === 0;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return;

  input.value = "";
  input.focus();
  const { data, error } = await db
    .from(TABLE)
    .insert({ name })
    .select("id, name, checked")
    .single();
  if (error) return handleError(error);
  items.push(data);
  render();
});

// 체크/삭제는 목록에 이벤트 위임으로 처리 (화면을 먼저 갱신한 뒤 DB에 반영)
list.addEventListener("change", async (event) => {
  if (event.target.type !== "checkbox") return;
  const id = event.target.closest(".item").dataset.id;
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.checked = event.target.checked;
  render();
  const { error } = await db.from(TABLE).update({ checked: item.checked }).eq("id", id);
  if (error) handleError(error);
});

list.addEventListener("click", async (event) => {
  if (!event.target.classList.contains("delete-button")) return;
  const id = event.target.closest(".item").dataset.id;
  items = items.filter((entry) => entry.id !== id);
  render();
  const { error } = await db.from(TABLE).delete().eq("id", id);
  if (error) handleError(error);
});

clearCheckedButton.addEventListener("click", async () => {
  const checkedIds = items.filter((item) => item.checked).map((item) => item.id);
  if (!checkedIds.length) return;
  items = items.filter((item) => !item.checked);
  render();
  const { error } = await db.from(TABLE).delete().in("id", checkedIds);
  if (error) handleError(error);
});

render();
loadItems();
