// 작성일시: 2026-10-22 14:17

/*
 * My Tasks - 할 일 관리 앱
 *
 * 파일 구성
 *   1. 상수/설정
 *   2. DOM 참조
 *   3. 유틸리티 (디바운스, 안전한 저장소, ID 생성 등)
 *   4. 데이터 검증 / 불러오기 / 저장
 *   5. 앱 상태
 *   6. 피드백 (토스트, 스크린 리더 안내, 다이얼로그)
 *   7. 할 일 조작 (추가 / 수정 / 삭제 / 완료 / 복구 / 순서 변경)
 *   8. 내보내기 / 가져오기
 *   9. 렌더링 (id 기반 DOM 재사용)
 *  10. 드래그 앤 드롭 정렬
 *  11. 테마 / 격언
 *  12. 이벤트 연결
 *  13. 초기화
 *
 * 데이터 구조: 각 할 일은 { id, text, completed, createdAt, category }
 * tasks 배열의 순서 자체가 "수동 정렬" 순서이며, 다른 정렬은 화면 표시용으로만 적용한다.
 */

// ===================================================================
// 1. 상수 / 설정
// ===================================================================

// localStorage 키
const STORAGE_KEY = 'my-tasks';
const FILTER_KEY = 'my-tasks-filter';
const SORT_KEY = 'my-tasks-sort';
const THEME_KEY = 'my-tasks-theme';
const QUOTE_KEY = 'my-tasks-last-quote';
const CORRUPTED_BACKUP_KEY = 'my-tasks-corrupted-backup';

const CATEGORIES = {
  work: '업무',
  personal: '개인',
  study: '공부',
};
const CATEGORY_ORDER = Object.keys(CATEGORIES);
const DEFAULT_CATEGORY = 'personal';
const FILTER_LABELS = { all: '전체', ...CATEGORIES };

// 정렬 방식별 비교 함수 (null = tasks 배열 순서 그대로 = 수동 정렬)
// Array.prototype.sort는 안정 정렬이므로, 같은 값끼리는 수동 정렬 순서가 유지됨
const SORT_COMPARATORS = {
  status: (a, b) => Number(a.completed) - Number(b.completed),
  manual: null,
  'created-desc': (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  'created-asc': (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  category: (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
};
const SORT_LABELS = {
  status: '완료 상태순',
  manual: '수동 정렬',
  'created-desc': '최신순',
  'created-asc': '오래된순',
  category: '카테고리순',
};
const DEFAULT_SORT = 'status';

// Alt+1~4 → 필터 (한글 입력 상태에서도 동작하도록 event.key 대신 event.code 사용)
const FILTER_SHORTCUTS = {
  Digit1: 'all', Digit2: 'work', Digit3: 'personal', Digit4: 'study',
  Numpad1: 'all', Numpad2: 'work', Numpad3: 'personal', Numpad4: 'study',
};

// 제한값
const MAX_TEXT_LENGTH = 200;              // 할 일 한 개의 최대 글자 수 (input의 maxlength와 동일)
const MAX_TASKS = 5000;                   // 전체 할 일 개수 상한 (localStorage 용량 보호)
const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 가져오기 파일 최대 크기 5MB
const MAX_UNDO = 20;                      // 복구 가능한 최근 삭제 작업 수

// 타이밍 (ms)
const SAVE_DELAY = 300;          // 저장 디바운스
const SEARCH_DELAY = 200;        // 검색 디바운스
const TOAST_DURATION = 2500;     // 일반 토스트 표시 시간
const UNDO_TOAST_DURATION = 6000; // "실행 취소" 버튼이 있는 토스트 표시 시간
const MAX_TOASTS = 3;            // 동시에 보이는 토스트 최대 개수
const DRAG_THRESHOLD = 4;        // 이만큼(px) 움직여야 드래그로 인정 (단순 클릭과 구분)
const AUTO_SCROLL_EDGE = 60;     // 화면 위/아래 가장자리 이 범위에서 드래그 시 자동 스크롤

// 오늘의 격언 (새로고침할 때마다 직전과 다른 것을 무작위로 표시)
const QUOTES = [
  { text: '천 리 길도 한 걸음부터.', author: '노자' },
  { text: '시작이 반이다.', author: '아리스토텔레스' },
  { text: '오늘 할 수 있는 일을 내일로 미루지 마라.', author: '벤저민 프랭클린' },
  { text: '성공은 매일 반복한 작은 노력들의 합이다.', author: '로버트 콜리어' },
  { text: '할 수 있다고 믿든 할 수 없다고 믿든, 당신이 옳다.', author: '헨리 포드' },
  { text: '미래를 예측하는 가장 좋은 방법은 미래를 발명하는 것이다.', author: '앨런 케이' },
  { text: '우리가 반복적으로 하는 일이 우리 자신이다. 그러므로 탁월함은 행동이 아니라 습관이다.', author: '윌 듀랜트' },
  { text: '소중한 것을 먼저 하라.', author: '스티븐 코비' },
  { text: '작은 기회로부터 종종 위대한 업적이 시작된다.', author: '데모스테네스' },
  { text: '늦었다고 생각할 때가 가장 빠를 때다.', author: '속담' },
  { text: '티끌 모아 태산.', author: '속담' },
  { text: '완벽함보다 완료가 낫다.', author: '실리콘밸리 격언' },
];

// ===================================================================
// 2. DOM 참조
// ===================================================================

const root = document.documentElement;
const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const categorySelect = document.getElementById('category-select');
const filterBar = document.getElementById('filter-bar');
const filterButtons = [...filterBar.querySelectorAll('.filter-button')];
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const list = document.getElementById('task-list');
const emptyMessage = document.getElementById('empty-message');
const overallText = document.getElementById('overall-text');
const overallProgress = document.getElementById('overall-progress');
const overallBar = document.getElementById('overall-bar');
const cheerMessage = document.getElementById('cheer-message');
const categoryStatElements = [...document.querySelectorAll('.category-stat')];
const todayCount = document.getElementById('today-count');
const remainingBadge = document.getElementById('remaining-badge');
const clearButton = document.getElementById('clear-completed');
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file');
const themeToggle = document.getElementById('theme-toggle');
const quoteText = document.getElementById('quote-text');
const quoteAuthor = document.getElementById('quote-author');
const quoteRefresh = document.getElementById('quote-refresh');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOk = document.getElementById('confirm-ok');
const importDialog = document.getElementById('import-dialog');
const importSummary = document.getElementById('import-summary');
const importBackup = document.getElementById('import-backup');
const toastContainer = document.getElementById('toast-container');
const announcer = document.getElementById('sr-announcer');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

// 구형 브라우저처럼 <dialog>가 없으면 window.confirm으로 대체
const supportsDialog = typeof confirmDialog.showModal === 'function';

// ===================================================================
// 3. 유틸리티
// ===================================================================

/**
 * 마지막 호출 후 wait(ms) 동안 추가 호출이 없을 때 한 번만 실행.
 * - flush(): 대기 중인 실행을 즉시 수행 (페이지를 떠날 때 저장 누락 방지)
 * - cancel(): 대기 중인 실행 취소
 * - isPending(): 대기 중인 실행이 있는지
 */
function debounce(fn, wait) {
  let timer = null;
  let lastArgs = [];

  function debounced(...args) {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, wait);
  }

  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  debounced.isPending = () => timer !== null;

  return debounced;
}

// 저장소 오류 토스트를 한 번만 띄우기 위한 플래그 (저장에 성공하면 다시 초기화)
let storageErrorShown = false;

/**
 * localStorage를 안전하게 감싼 객체.
 * 사생활 보호 모드, 저장소 차단, 용량 초과 등에서 예외가 나도 앱이 멈추지 않게 한다.
 */
const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      reportStorageError(error);
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      storageErrorShown = false;
      return true;
    } catch (error) {
      reportStorageError(error);
      return false;
    }
  },
};

function reportStorageError(error) {
  console.error('[storage]', error);
  if (storageErrorShown) return;
  storageErrorShown = true;

  // 브라우저마다 용량 초과 오류의 이름/코드가 다름
  const isQuotaError = error?.name === 'QuotaExceededError'
    || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error?.code === 22;
  showToast(
    isQuotaError
      ? '저장 공간이 부족해 변경 사항을 저장하지 못했습니다. 데이터를 내보내 백업해주세요.'
      : '브라우저 저장소를 사용할 수 없어 변경 사항이 저장되지 않습니다.',
    'danger',
    { duration: 6000 }
  );
}

// 충돌 가능성이 매우 낮은 고유 ID (crypto.randomUUID가 없는 환경은 시간+난수로 대체)
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 'toString' 같은 프로토타입 속성이 카테고리로 인정되지 않도록 hasOwnProperty로 확인
function isCategory(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, value);
}

function isFilter(value) {
  return value === 'all' || isCategory(value);
}

function isSortMode(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SORT_COMPARATORS, value);
}

// 중복 비교용: 앞뒤 공백 제거, 연속 공백을 하나로, 대소문자 무시
function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// 토스트/안내 문구에 넣을 때 긴 텍스트 줄이기
function truncate(text, maxLength = 20) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function percent(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// 텍스트 입력 중인지 (Ctrl+Z를 입력창의 기본 되돌리기에 양보하기 위함)
function isTextField(element) {
  return element instanceof HTMLElement && element.matches(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable="true"]'
  );
}

// 파일 이름용 날짜: 2026-10-22-1325
function formatFileDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// "방금 전", "5분 전", "2시간 전", "3일 전", 30일 이상은 날짜
function formatRelativeTime(isoString) {
  const time = Date.parse(isoString);
  if (Number.isNaN(time)) return '';

  // 다른 기기와 시계가 어긋나 미래 시각이면 음수가 되므로 "방금 전"으로 처리
  const diffSeconds = Math.floor((Date.now() - time) / 1000);
  if (diffSeconds < 60) return '방금 전';

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;

  return new Date(time).toLocaleDateString('ko-KR');
}

// ===================================================================
// 4. 데이터 검증 / 불러오기 / 저장
// ===================================================================

/**
 * 외부에서 들어온 값(localStorage, 가져오기 파일)을 올바른 할 일 객체로 정리.
 * 텍스트가 없으면 null을 반환하고, 나머지 필드는 기본값으로 보정한다.
 */
function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  if (!text) return null;

  const createdTime = Date.parse(raw.createdAt);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : generateId(),
    text,
    completed: raw.completed === true,
    createdAt: Number.isNaN(createdTime) ? new Date().toISOString() : new Date(createdTime).toISOString(),
    // 카테고리 기능 이전 데이터나 잘못된 값은 기본 카테고리로
    category: isCategory(raw.category) ? raw.category : DEFAULT_CATEGORY,
  };
}

// 배열 전체를 정리. 같은 id가 여러 번 나오면 뒤의 것에 새 id를 부여
function sanitizeTasks(rawList) {
  const seenIds = new Set();
  const valid = [];
  let skipped = 0;

  for (const raw of rawList) {
    const task = sanitizeTask(raw);
    if (!task) {
      skipped += 1;
      continue;
    }
    if (seenIds.has(task.id)) task.id = generateId();
    seenIds.add(task.id);
    valid.push(task);
  }
  return { tasks: valid, skipped };
}

/**
 * localStorage에서 할 일 목록 불러오기.
 * JSON이 깨졌으면 원본 문자열을 별도 키에 보관한 뒤 빈 목록으로 시작한다 (데이터 유실 방지).
 */
function loadTasks() {
  const raw = storage.get(STORAGE_KEY);
  if (raw === null) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new TypeError('저장된 데이터가 배열이 아닙니다.');

    const { tasks: valid, skipped } = sanitizeTasks(parsed);
    if (skipped > 0) {
      showToast(`손상된 할 일 ${skipped}개를 제외하고 불러왔습니다.`, 'danger', { duration: 5000 });
    }
    return valid;
  } catch (error) {
    console.error('[load]', error);
    storage.set(CORRUPTED_BACKUP_KEY, raw);
    showToast('저장된 데이터가 손상되어 빈 목록으로 시작합니다. (원본은 별도 보관됨)', 'danger', { duration: 6000 });
    return [];
  }
}

function writeTasks() {
  storage.set(STORAGE_KEY, JSON.stringify(tasks));
}

// 빠르게 연속으로 바뀌어도(체크 여러 번, 드래그 등) 저장은 마지막에 한 번만
const saveTasks = debounce(writeTasks, SAVE_DELAY);

function loadFilter() {
  const saved = storage.get(FILTER_KEY);
  return isFilter(saved) ? saved : 'all';
}

function loadSortMode() {
  const saved = storage.get(SORT_KEY);
  return isSortMode(saved) ? saved : DEFAULT_SORT;
}

// ===================================================================
// 5. 앱 상태
// ===================================================================

let tasks = loadTasks();
let currentFilter = loadFilter();
let sortMode = loadSortMode();
let searchQuery = '';            // 정규화(소문자)된 검색어

// 렌더링된 항목 캐시: id → { element, signature }
// 내용이 바뀌지 않은 항목은 DOM을 새로 만들지 않고 재사용한다.
let elementCache = new Map();

// 다음 render에서 특정 항목에 붙일 등장 애니메이션: id → className
const pendingAnimations = new Map();

// 애니메이션 진행 중인 항목 id (중복 클릭으로 같은 작업이 두 번 실행되는 것 방지)
const busyIds = new Set();

// 최근 삭제 작업 스택. 각 항목은 { entries: [{ task, index }] }
const undoStack = [];

// 직전 렌더링 시점에 "모두 완료" 상태였는지 (null = 아직 첫 렌더링 전)
let lastAllDone = null;

// 진행 중인 드래그 정보 (드래그 중이 아니면 null)
let dragState = null;

// 할 일 추가 중복 실행 방지 (중복 확인 다이얼로그가 열려 있는 동안)
let isSubmitting = false;

// ===================================================================
// 6. 피드백 (토스트 / 스크린 리더 안내 / 다이얼로그)
// ===================================================================

/**
 * 화면 하단에 잠깐 나타나는 알림.
 * @param {string} message
 * @param {'info'|'success'|'danger'} type
 * @param {{ action?: { label: string, onClick: () => void }, duration?: number }} options
 *   action이 있으면 버튼("실행 취소" 등)을 함께 표시하고 더 오래 보여준다.
 * @returns {() => void} 토스트를 즉시 닫는 함수
 */
function showToast(message, type = 'info', { action, duration } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  toast.append(text);

  const visibleFor = duration ?? (action ? UNDO_TOAST_DURATION : TOAST_DURATION);
  let timer = null;
  let dismissed = false;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    playExitAnimation(toast, 'hiding').then(() => toast.remove());
  };

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      dismiss();
    });
    toast.append(button);
  }

  // 마우스를 올리거나 버튼에 포커스가 있으면 사라지지 않도록 타이머 일시정지
  const startTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(dismiss, visibleFor);
  };
  const pauseTimer = () => clearTimeout(timer);
  toast.addEventListener('pointerenter', pauseTimer);
  toast.addEventListener('pointerleave', startTimer);
  toast.addEventListener('focusin', pauseTimer);
  toast.addEventListener('focusout', startTimer);

  toastContainer.append(toast);
  while (toastContainer.children.length > MAX_TOASTS) {
    toastContainer.firstElementChild.remove();
  }
  startTimer();
  return dismiss;
}

/**
 * 화면에는 보이지 않고 스크린 리더만 읽는 안내 (드래그 이동, 검색 결과 수 등).
 * 같은 문구를 연속으로 보내도 다시 읽히도록 한 번 비운 뒤 다음 프레임에 채운다.
 */
function announce(message) {
  announcer.textContent = '';
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/**
 * 애니메이션 클래스를 붙이고 끝날 때까지 기다림.
 * 모션 줄이기 설정이면 바로 진행하고, animationend가 오지 않는 경우(요소가 DOM에서
 * 빠짐 등)를 대비해 타임아웃으로도 끝낸다.
 */
function playExitAnimation(element, className) {
  if (reducedMotion.matches) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    element.addEventListener('animationend', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    element.classList.add(className);
  });
}

// 같은 애니메이션을 처음부터 다시 재생 (클래스 제거 → 리플로우 → 다시 추가)
function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/**
 * 모달 다이얼로그를 열고, 닫힐 때 눌린 버튼의 value를 반환.
 * 닫힌 뒤에는 다이얼로그를 열기 전에 포커스가 있던 요소로 포커스를 되돌린다.
 */
function showDialog(dialog) {
  if (dialog.open) return Promise.resolve('');
  const opener = document.activeElement;

  // ESC로 닫으면 returnValue가 이전 값 그대로 남으므로 먼저 비움
  dialog.returnValue = '';
  dialog.showModal();

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
      resolve(dialog.returnValue);
    }, { once: true });
  });
}

/**
 * 확인/취소를 묻는 다이얼로그. 확인을 누르면 true.
 * danger=true면 확인 버튼이 빨간색(삭제 등), false면 기본색.
 */
function confirmAction({ title, message, confirmText = '확인', danger = true }) {
  if (!supportsDialog) return Promise.resolve(window.confirm(`${title}\n\n${message}`));

  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOk.textContent = confirmText;
  confirmOk.classList.toggle('primary', !danger);
  return showDialog(confirmDialog).then((value) => value === 'confirm');
}

// 완료율에 따른 응원 메시지
function getCheerMessage(done, total) {
  if (total === 0) return '첫 할 일을 추가해보세요! ✏️';
  const ratio = done / total;
  if (ratio === 1) return '모두 완료! 오늘 정말 멋져요 🎉';
  if (ratio >= 0.75) return '거의 다 왔어요! 조금만 더 힘내요 💪';
  if (ratio >= 0.5) return '절반을 넘었어요! 좋은 흐름이에요 🔥';
  if (ratio >= 0.25) return '좋은 출발이에요! 계속 가볼까요? 🚀';
  if (done > 0) return '첫 걸음을 내디뎠어요! 👏';
  return '시작이 반! 하나씩 완료해봐요 🌱';
}

// ===================================================================
// 7. 할 일 조작
// ===================================================================

function findTask(id) {
  return tasks.find((task) => task.id === id);
}

// 같은 내용(공백/대소문자 무시)의 할 일 찾기. excludeId는 수정 중인 자기 자신 제외용
function findDuplicate(text, excludeId = null) {
  const normalized = normalizeText(text);
  return tasks.find((task) => task.id !== excludeId && normalizeText(task.text) === normalized);
}

/**
 * 렌더링된 항목 안의 특정 컨트롤로 포커스 이동.
 * 항목이 필터 등으로 보이지 않으면 false.
 */
function focusTask(id, selector, preventScroll = false) {
  const target = elementCache.get(id)?.element.querySelector(selector);
  if (!target) return false;
  target.focus({ preventScroll });
  return true;
}

function addTask(text, category) {
  if (tasks.length >= MAX_TASKS) {
    showToast(`할 일은 최대 ${MAX_TASKS.toLocaleString()}개까지 저장할 수 있습니다.`, 'danger');
    return false;
  }

  const task = {
    id: generateId(),
    text: text.slice(0, MAX_TEXT_LENGTH),
    completed: false,
    createdAt: new Date().toISOString(),
    category,
  };
  tasks.push(task);
  saveTasks();
  pendingAnimations.set(task.id, 'entering');
  render();

  // 현재 필터/검색 때문에 새 항목이 안 보이면 그 사실을 알려줌
  if (elementCache.has(task.id)) {
    showToast('할 일이 추가되었습니다', 'success');
  } else {
    showToast('추가되었습니다 (현재 필터/검색에서는 보이지 않음)');
  }
  return true;
}

// 입력창 제출 처리: 빈 값 → 흔들기, 중복 → 확인 다이얼로그, 통과 → 추가
async function handleSubmit() {
  if (isSubmitting) return;

  const text = input.value.trim();
  if (!text) {
    restartAnimation(input, 'shake');
    announce('할 일을 입력하세요');
    input.focus();
    return;
  }

  const duplicate = findDuplicate(text);
  if (duplicate) {
    isSubmitting = true;
    const state = duplicate.completed ? '완료된 항목으로 ' : '';
    const confirmed = await confirmAction({
      title: '중복된 할 일',
      message: `"${truncate(duplicate.text, 40)}"이(가) 이미 ${state}있습니다. 그래도 추가할까요?`,
      confirmText: '추가',
      danger: false,
    });
    isSubmitting = false;
    if (!confirmed) {
      input.focus();
      input.select();
      return;
    }
  }

  if (addTask(text, categorySelect.value)) input.value = '';
  input.focus();
}

/**
 * 삭제된 항목들을 복구 스택에 기록. 원래 위치(index)도 함께 저장해
 * 복구 시 가능한 한 제자리로 돌려놓는다.
 */
function pushUndo(entries) {
  const batch = { entries };
  undoStack.push(batch);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  return batch;
}

// 특정 삭제 작업을 되돌림 (토스트의 "실행 취소" 버튼은 자기 작업을 정확히 복구)
function restoreBatch(batch) {
  const stackIndex = undoStack.indexOf(batch);
  if (stackIndex === -1) {
    showToast('이미 복구되었거나 더 이상 복구할 수 없습니다');
    return;
  }
  undoStack.splice(stackIndex, 1);

  // 다른 탭 동기화 등으로 이미 같은 id가 있으면 건너뜀
  const existingIds = new Set(tasks.map((task) => task.id));
  const entries = [...batch.entries].sort((a, b) => a.index - b.index);
  let restored = 0;

  for (const { task, index } of entries) {
    if (existingIds.has(task.id)) continue;
    // 그 사이 목록이 줄었을 수 있으므로 위치를 범위 안으로 제한
    tasks.splice(Math.min(index, tasks.length), 0, task);
    pendingAnimations.set(task.id, 'entering');
    restored += 1;
  }

  if (restored === 0) {
    showToast('복구할 항목이 이미 목록에 있습니다');
    return;
  }
  saveTasks();
  render();
  showToast(`${restored}개 항목을 복구했습니다`, 'success');
}

// Ctrl+Z: 가장 최근 삭제 작업 복구
function undoLastDelete() {
  const batch = undoStack.at(-1);
  if (!batch) {
    showToast('되돌릴 삭제 작업이 없습니다');
    return;
  }
  restoreBatch(batch);
}

async function deleteTask(id, element) {
  if (busyIds.has(id)) return;
  busyIds.add(id);

  try {
    // 삭제 후 포커스를 옮길 이웃 항목을 미리 기억 (키보드 사용자가 위치를 잃지 않도록)
    const siblings = [...list.children];
    const position = siblings.indexOf(element);
    const neighborId = (siblings[position + 1] ?? siblings[position - 1])?.dataset.id;

    await playExitAnimation(element, 'leaving');

    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return; // 애니메이션 도중 다른 탭에서 이미 삭제됨
    const [removed] = tasks.splice(index, 1);
    const batch = pushUndo([{ task: removed, index }]);

    saveTasks();
    render();
    if (!(neighborId && focusTask(neighborId, '.delete-button', true))) input.focus();

    showToast(`"${truncate(removed.text)}" 삭제됨`, 'danger', {
      action: { label: '실행 취소', onClick: () => restoreBatch(batch) },
    });
  } finally {
    busyIds.delete(id);
  }
}

// 슬라이드 아웃 → 상태 변경 → 새 위치(완료 상태순이면 하단)에서 슬라이드 인
async function toggleTask(id, element) {
  if (busyIds.has(id)) return;
  busyIds.add(id);

  try {
    await playExitAnimation(element, 'sliding-out');
    const task = findTask(id);
    if (!task) return;

    task.completed = !task.completed;
    saveTasks();
    pendingAnimations.set(id, 'sliding-in');
    render();

    // 항목이 목록 하단으로 이동해도 화면이 따라 스크롤되지 않게 preventScroll
    focusTask(id, '.task-checkbox', true);
    announce(task.completed ? `"${task.text}" 완료` : `"${task.text}" 미완료로 변경`);
  } finally {
    busyIds.delete(id);
  }
}

async function clearCompleted() {
  const count = tasks.filter((task) => task.completed).length;
  if (count === 0) return;

  const confirmed = await confirmAction({
    title: '완료된 항목 삭제',
    message: `완료된 할 일 ${count}개를 삭제할까요? 삭제 직후에는 "실행 취소"로 되돌릴 수 있습니다.`,
    confirmText: '삭제',
  });
  if (!confirmed) return;

  // 화면에 보이는 완료 항목만 페이드 아웃 (안 보이는 항목은 바로 삭제)
  const visibleCompleted = [...list.querySelectorAll('.task-item.completed')];
  await Promise.all(visibleCompleted.map((item) => playExitAnimation(item, 'leaving')));

  // 다이얼로그가 열려 있는 동안 바뀌었을 수 있으므로 이 시점에 다시 계산
  const entries = [];
  tasks.forEach((task, index) => {
    if (task.completed) entries.push({ task, index });
  });
  if (entries.length === 0) return;

  tasks = tasks.filter((task) => !task.completed);
  const batch = pushUndo(entries);
  saveTasks();
  render();
  input.focus();

  showToast(`완료된 항목 ${entries.length}개를 삭제했습니다`, 'danger', {
    action: { label: '실행 취소', onClick: () => restoreBatch(batch) },
  });
}

/**
 * tasks 배열(수동 정렬 순서)에서 movedId를 targetId 앞 또는 뒤로 옮김.
 * 필터/검색으로 일부만 보이는 상태에서도 보이는 항목 기준으로 자연스럽게 동작한다.
 */
function reorderTask(movedId, targetId, placeAfter) {
  const from = tasks.findIndex((task) => task.id === movedId);
  if (from === -1 || movedId === targetId) return false;
  const [moved] = tasks.splice(from, 1);

  let to = tasks.findIndex((task) => task.id === targetId);
  if (to === -1) {
    tasks.splice(from, 0, moved); // 대상이 사라졌으면 원래대로
    return false;
  }
  if (placeAfter) to += 1;
  tasks.splice(to, 0, moved);
  return true;
}

// 키보드(드래그 핸들에서 ↑/↓)로 한 칸씩 이동
function moveTaskByKeyboard(item, direction) {
  const items = [...list.children];
  const from = items.indexOf(item);
  const to = from + direction;
  if (to < 0 || to >= items.length) {
    announce(direction < 0 ? '맨 위 항목입니다' : '맨 아래 항목입니다');
    return;
  }

  const id = item.dataset.id;
  if (!reorderTask(id, items[to].dataset.id, direction > 0)) return;
  saveTasks();
  render();
  focusTask(id, '.drag-handle');
  announce(`${items.length}개 중 ${to + 1}번째로 이동`);
}

// 텍스트 + 카테고리 인라인 편집
// Enter 또는 바깥 클릭 → 저장, ESC → 취소, 빈 텍스트 → 취소
function startEdit(item, task) {
  if (item.classList.contains('editing') || busyIds.has(task.id)) return;
  item.classList.add('editing');

  const body = item.querySelector('.task-body');

  const editor = document.createElement('div');
  editor.className = 'task-editor';

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit-input';
  editInput.value = task.text;
  editInput.maxLength = MAX_TEXT_LENGTH;
  editInput.setAttribute('aria-label', '할 일 내용 수정 (Enter 저장, ESC 취소)');

  const editSelect = document.createElement('select');
  editSelect.className = 'edit-select';
  editSelect.setAttribute('aria-label', '카테고리 수정');
  for (const [value, label] of Object.entries(CATEGORIES)) {
    editSelect.add(new Option(label, value, false, value === task.category));
  }

  editor.append(editInput, editSelect);
  body.replaceWith(editor);
  editInput.focus();
  editInput.select();

  let finished = false;

  // restoreFocus: 키보드로 끝냈을 때만 항목으로 포커스를 돌려줌 (마우스로 다른 곳을 클릭한 경우엔 방해하지 않음)
  function finish(shouldSave, restoreFocus) {
    if (finished) return;
    finished = true;

    // 캐시를 지워야 render에서 편집기가 들어간 DOM을 재사용하지 않고 새로 그림
    elementCache.delete(task.id);

    const current = findTask(task.id);
    const text = editInput.value.trim().slice(0, MAX_TEXT_LENGTH);
    const category = editSelect.value;

    if (!current) {
      // 편집하는 동안 다른 탭에서 삭제된 경우
      render();
      showToast('이 할 일은 이미 삭제되었습니다', 'danger');
      return;
    }

    const changed = text !== current.text || category !== current.category;
    if (shouldSave && !text) {
      showToast('내용이 비어 있어 수정을 취소했습니다');
    }

    if (shouldSave && text && changed) {
      current.text = text;
      current.category = category;
      saveTasks();
      render();
      if (findDuplicate(text, current.id)) {
        showToast('수정되었습니다 (같은 내용의 할 일이 이미 있습니다)');
      } else {
        showToast('수정되었습니다', 'success');
      }
    } else {
      render();
    }

    if (restoreFocus && !focusTask(task.id, '.task-text')) input.focus();
  }

  editor.addEventListener('keydown', (event) => {
    // 한글 조합 중 Enter: 브라우저/OS마다 keydown이 한 번 또는 두 번 오므로,
    // 조합이 끝나는 시점에 저장한다 (두 번째 호출은 finished 플래그로 무시됨)
    if (event.isComposing) {
      if (event.key === 'Enter') {
        editInput.addEventListener('compositionend', () => finish(true, true), { once: true });
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false, true);
    }
  });

  // input ↔ select 사이 이동은 무시하고, 편집 영역 밖으로 포커스가 나가면 저장
  editor.addEventListener('focusout', (event) => {
    if (!editor.contains(event.relatedTarget)) finish(true, false);
  });
}

// ===================================================================
// 8. 내보내기 / 가져오기
// ===================================================================

/**
 * 현재 할 일을 JSON 파일로 다운로드. 성공하면 true.
 * prefix로 일반 내보내기('my-tasks')와 가져오기 전 백업('my-tasks-backup')을 구분.
 */
function exportTasks(prefix = 'my-tasks') {
  saveTasks.flush(); // 대기 중인 저장을 먼저 반영

  const payload = {
    app: 'my-tasks',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: tasks.length,
    tasks,
  };

  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${formatFileDate(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // 다운로드가 시작될 시간을 준 뒤 메모리 해제
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.error('[export]', error);
    showToast('파일을 만들지 못했습니다. 다시 시도해주세요.', 'danger');
    return false;
  }
}

function handleExportClick() {
  if (tasks.length === 0) {
    showToast('내보낼 할 일이 없습니다');
    return;
  }
  if (exportTasks()) showToast(`할 일 ${tasks.length}개를 파일로 내보냈습니다`, 'success');
}

/**
 * 파일을 읽고 검증 → 가져오기 다이얼로그(방식/백업 선택) → 적용.
 * 실패하는 모든 경우에 원인을 토스트로 알려주고 현재 데이터는 건드리지 않는다.
 */
async function importFromFile(file) {
  if (!file) return;

  // --- 1) 파일 자체 검사 ---
  if (file.size === 0) {
    showToast('빈 파일입니다', 'danger');
    return;
  }
  if (file.size > MAX_IMPORT_BYTES) {
    showToast('파일이 너무 큽니다 (최대 5MB)', 'danger');
    return;
  }
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    showToast('JSON 파일(.json)만 가져올 수 있습니다', 'danger');
    return;
  }

  // --- 2) 읽기 + JSON 파싱 ---
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    console.error('[import]', error);
    showToast('파일을 읽을 수 없거나 JSON 형식이 올바르지 않습니다', 'danger');
    return;
  }

  // 이 앱이 내보낸 형식({ tasks: [...] })과 배열만 있는 형식 모두 허용
  const rawTasks = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(rawTasks)) {
    showToast('파일에서 할 일 목록을 찾을 수 없습니다', 'danger');
    return;
  }
  if (rawTasks.length > MAX_TASKS) {
    showToast(`한 번에 최대 ${MAX_TASKS.toLocaleString()}개까지 가져올 수 있습니다`, 'danger');
    return;
  }

  // --- 3) 항목 검증 ---
  const { tasks: incoming, skipped } = sanitizeTasks(rawTasks);
  if (incoming.length === 0) {
    showToast('가져올 수 있는 할 일이 없습니다', 'danger');
    return;
  }

  // --- 4) 방식/백업 선택 ---
  let mode = 'merge';
  let backup = tasks.length > 0;

  const summary = `"${file.name}"에서 할 일 ${incoming.length}개를 찾았습니다.`
    + (skipped > 0 ? ` (형식이 잘못된 ${skipped}개는 제외)` : '')
    + ` 현재 할 일은 ${tasks.length}개입니다.`;

  if (supportsDialog) {
    importSummary.textContent = summary;
    importDialog.querySelector('input[value="merge"]').checked = true;
    // 현재 데이터가 없으면 백업할 것도 없음
    importBackup.checked = tasks.length > 0;
    importBackup.disabled = tasks.length === 0;

    const result = await showDialog(importDialog);
    if (result !== 'confirm') {
      showToast('가져오기를 취소했습니다');
      return;
    }
    mode = importDialog.querySelector('input[name="import-mode"]:checked')?.value ?? 'merge';
    backup = importBackup.checked;
  } else {
    if (!window.confirm(`${summary}\n\n기존 할 일에 추가할까요?`)) return;
    backup = tasks.length > 0 && window.confirm('가져오기 전에 현재 데이터를 백업 파일로 저장할까요?');
  }

  // --- 5) 백업 ---
  if (backup && !exportTasks('my-tasks-backup')) {
    const proceed = await confirmAction({
      title: '백업 실패',
      message: '백업 파일을 만들지 못했습니다. 백업 없이 계속 가져올까요?',
      confirmText: '계속',
    });
    if (!proceed) return;
  }

  // --- 6) 적용 ---
  let added;
  let duplicates = 0;
  if (mode === 'replace') {
    tasks = incoming;
    added = incoming.length;
    // 이전 데이터 기준의 복구 정보는 더 이상 의미가 없음
    undoStack.length = 0;
  } else {
    // 같은 id 또는 같은 내용+카테고리인 항목은 중복으로 보고 건너뜀
    const existingIds = new Set(tasks.map((task) => task.id));
    const existingKeys = new Set(tasks.map((task) => `${task.category}:${normalizeText(task.text)}`));
    const toAdd = incoming.filter((task) => {
      const key = `${task.category}:${normalizeText(task.text)}`;
      if (existingIds.has(task.id) || existingKeys.has(key)) {
        duplicates += 1;
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    const room = MAX_TASKS - tasks.length;
    if (toAdd.length > room) {
      showToast(`최대 개수를 넘어 ${toAdd.length - room}개는 가져오지 못했습니다`, 'danger');
      toAdd.length = Math.max(0, room);
    }
    tasks = tasks.concat(toAdd);
    added = toAdd.length;
  }

  // 가져오기는 중요한 변경이므로 디바운스 없이 즉시 저장
  saveTasks.cancel();
  writeTasks();
  render();

  const parts = [`${added}개를 가져왔습니다`];
  if (duplicates > 0) parts.push(`중복 ${duplicates}개 건너뜀`);
  showToast(parts.join(', '), added > 0 ? 'success' : 'info');
}

// ===================================================================
// 9. 렌더링
// ===================================================================

// 카테고리 필터 + 검색 + 정렬 적용한 화면 표시용 목록 (tasks 원본은 건드리지 않음)
function getVisibleTasks() {
  const filtered = tasks.filter((task) =>
    (currentFilter === 'all' || task.category === currentFilter)
    && (!searchQuery || task.text.toLowerCase().includes(searchQuery))
  );
  const comparator = SORT_COMPARATORS[sortMode];
  return comparator ? filtered.sort(comparator) : filtered;
}

// 항목 DOM에 영향을 주는 값의 묶음. 이 값이 같으면 기존 DOM을 그대로 재사용
function getSignature(task) {
  return `${task.text}\u0000${task.completed}\u0000${task.category}\u0000${searchQuery}`;
}

/**
 * 검색어와 일치하는 부분을 <mark>로 감싸서 표시.
 * innerHTML을 쓰지 않고 텍스트 노드로만 조립해 사용자 입력이 HTML로 해석되지 않게 한다.
 */
function renderHighlightedText(element, text, query) {
  if (!query) {
    element.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let start = 0;
  let index;
  while ((index = lower.indexOf(query, start)) !== -1) {
    element.append(text.slice(start, index));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(index, index + query.length);
    element.append(mark);
    start = index + query.length;
  }
  element.append(text.slice(start));
}

// 드래그 핸들 아이콘 (고정 문자열이므로 innerHTML 사용 안전)
const GRIP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>'
  + '<circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>'
  + '<circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.id = task.id;

  // 수동 정렬 모드에서만 CSS로 표시됨
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'drag-handle';
  handle.innerHTML = GRIP_ICON;
  handle.setAttribute('aria-label', `"${task.text}" 순서 변경`);
  handle.setAttribute('aria-describedby', 'drag-hint');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `"${task.text}" 완료`);

  const body = document.createElement('div');
  body.className = 'task-body';

  // 키보드로도 수정할 수 있도록 포커스 가능한 버튼 역할 부여 (Enter/Space/F2)
  const text = document.createElement('span');
  text.className = 'task-text';
  text.tabIndex = 0;
  text.setAttribute('role', 'button');
  text.setAttribute('aria-describedby', 'edit-hint');
  text.title = '더블클릭하여 수정';
  renderHighlightedText(text, task.text, searchQuery);

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const tag = document.createElement('span');
  tag.className = `category-tag ${task.category}`;
  tag.textContent = CATEGORIES[task.category];

  const time = document.createElement('time');
  time.className = 'task-time';
  time.dateTime = task.createdAt;
  time.title = new Date(task.createdAt).toLocaleString('ko-KR');
  time.textContent = formatRelativeTime(task.createdAt);

  meta.append(tag, time);
  body.append(text, meta);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete-button';
  deleteButton.textContent = '×';
  deleteButton.setAttribute('aria-label', `"${task.text}" 삭제`);

  li.append(handle, checkbox, body, deleteButton);
  return li;
}

function getEmptyMessage() {
  if (tasks.length === 0) return '할 일이 없습니다. 추가해보세요!';
  if (searchQuery) return `"${searchInput.value.trim()}"에 대한 검색 결과가 없습니다.`;
  if (isCategory(currentFilter)) return `${CATEGORIES[currentFilter]} 카테고리에 할 일이 없습니다. 추가해보세요!`;
  return '';
}

/**
 * 목록 렌더링 (id 기반 재사용 방식).
 * - 내용이 그대로인 항목은 기존 DOM 노드를 재사용하고 위치만 맞춘다.
 * - 바뀐 항목만 새로 만들고, 사라진 항목은 끝에서 제거한다.
 * 항목이 수백 개여도 매번 전체를 다시 만드는 것보다 훨씬 가볍다.
 */
function render() {
  // 드래그 도중 외부 요인(다른 탭 동기화 등)으로 다시 그려야 하면 드래그는 취소
  if (dragState) endDrag(true);

  const visible = getVisibleTasks();
  const nextCache = new Map();

  visible.forEach((task, index) => {
    const signature = getSignature(task);
    const cached = elementCache.get(task.id);
    // 퇴장 애니메이션 중인 노드는 투명 상태이므로 재사용하지 않음
    const reusable = cached
      && cached.signature === signature
      && !cached.element.matches('.leaving, .sliding-out');
    const element = reusable ? cached.element : createTaskElement(task);

    const animation = pendingAnimations.get(task.id);
    if (animation) element.classList.add(animation);

    nextCache.set(task.id, { element, signature });

    // index 위치에 이미 같은 노드가 있으면 아무것도 하지 않음 (불필요한 DOM 이동 방지)
    const current = list.children[index];
    if (current !== element) list.insertBefore(element, current ?? null);
  });

  // 앞쪽 visible.length개가 모두 제자리에 놓였으므로 나머지는 더 이상 보이지 않는 항목
  while (list.children.length > visible.length) list.lastElementChild.remove();

  elementCache = nextCache;
  pendingAnimations.clear();

  list.classList.toggle('sortable', sortMode === 'manual');
  emptyMessage.hidden = visible.length > 0;
  emptyMessage.textContent = getEmptyMessage();

  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === currentFilter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  updateDashboard();
}

/**
 * 대시보드/배지/버튼 상태 갱신. 필터·검색과 무관하게 전체 할 일 기준으로
 * 한 번의 순회로 모든 통계를 계산한다.
 */
function updateDashboard() {
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((key) => [key, { total: 0, done: 0 }]));
  const todayKey = new Date().toDateString();
  let done = 0;
  let today = 0;

  for (const task of tasks) {
    const stat = byCategory[task.category];
    stat.total += 1;
    if (task.completed) {
      done += 1;
      stat.done += 1;
    }
    if (new Date(task.createdAt).toDateString() === todayKey) today += 1;
  }

  const total = tasks.length;
  const overall = percent(done, total);
  overallText.textContent = `${done}/${total} 완료 (${overall}%)`;
  overallBar.style.width = `${overall}%`;
  overallProgress.setAttribute('aria-valuenow', String(overall));
  overallProgress.setAttribute('aria-valuetext', `${total}개 중 ${done}개 완료, ${overall}%`);

  for (const element of categoryStatElements) {
    const stat = byCategory[element.dataset.category];
    const value = percent(stat.done, stat.total);
    const progress = element.querySelector('.progress');
    element.querySelector('.category-stat-count').textContent = `${stat.done}/${stat.total}`;
    element.querySelector('.progress-fill').style.width = `${value}%`;
    progress.setAttribute('aria-valuenow', String(value));
    progress.setAttribute('aria-valuetext', `${stat.total}개 중 ${stat.done}개 완료`);
  }

  todayCount.textContent = today;
  cheerMessage.textContent = getCheerMessage(done, total);

  // 남은 할 일 배지 (값이 바뀔 때만 튀는 애니메이션)
  const remaining = total - done;
  const allDone = total > 0 && remaining === 0;
  const badgeText = allDone ? '모두 완료!' : `${remaining}개 남음`;
  if (remainingBadge.textContent !== badgeText) {
    remainingBadge.textContent = badgeText;
    restartAnimation(remainingBadge, 'pop');
  }
  remainingBadge.classList.toggle('all-done', allDone);

  // 방금 모든 할 일을 끝낸 순간에만 축하 (첫 로딩 때는 제외)
  if (lastAllDone === false && allDone) {
    showToast('🎉 모든 할 일을 완료했어요!', 'success');
  }
  lastAllDone = allDone;

  clearButton.disabled = done === 0;
  clearButton.textContent = done > 0 ? `완료된 항목 모두 삭제 (${done})` : '완료된 항목 모두 삭제';
}

// 1분마다 상대 시간 표시만 갱신 (바뀐 경우에만 DOM 수정) + "오늘" 집계 갱신
function refreshTimes() {
  for (const time of list.querySelectorAll('.task-time')) {
    const label = formatRelativeTime(time.dateTime);
    if (time.textContent !== label) time.textContent = label;
  }
  updateDashboard();
}

// ===================================================================
// 10. 드래그 앤 드롭 정렬 (Pointer Events: 마우스와 터치 모두 지원)
// ===================================================================

/*
 * 동작 방식
 *  - 드래그 시작 시 모든 항목의 위치를 한 번만 측정해 둔다 (이동 중 레이아웃 계산 최소화).
 *  - 드래그 중에는 DOM 순서를 바꾸지 않고 transform만 바꾼다
 *    (끌고 있는 항목은 포인터를 따라가고, 다른 항목은 빈자리를 만들며 비켜준다).
 *  - 놓는 순간 데이터 순서를 바꾸고 한 번만 다시 렌더링한다.
 *  - 화면 가장자리 근처로 끌면 자동 스크롤 (항목이 많을 때 필요).
 *  - ESC 또는 포인터 취소 시 원래 자리로 복귀.
 */

function startDrag(item, handle, event) {
  const items = [...list.children];
  const index = items.indexOf(item);
  if (index === -1) return;

  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  // 스크롤해도 변하지 않도록 문서 기준 좌표로 저장
  const rects = items.map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: rect.height };
  });

  dragState = {
    item,
    handle,
    items,
    index,
    targetIndex: index,
    rects,
    shift: rects[index].height + gap, // 다른 항목이 비켜줄 거리
    startPageY: event.clientY + window.scrollY,
    clientY: event.clientY,
    pointerId: event.pointerId,
    moved: false,
    scrollFrame: 0,
  };
  handle.setPointerCapture(event.pointerId);
}

function updateDrag() {
  const state = dragState;
  const dy = state.clientY + window.scrollY - state.startPageY;

  // 일정 거리 이상 움직여야 드래그 시작 (단순 클릭/탭과 구분)
  if (!state.moved) {
    if (Math.abs(dy) < DRAG_THRESHOLD) return;
    state.moved = true;
    state.item.classList.add('dragging');
    list.classList.add('is-dragging');
    document.body.classList.add('dragging-active');
    state.scrollFrame = requestAnimationFrame(autoScrollStep);
  }

  state.item.style.transform = `translateY(${dy}px)`;

  // 끌고 있는 항목의 중심이 다른 항목의 중간선을 넘으면 그 자리가 목표 위치
  const own = state.rects[state.index];
  const center = own.top + own.height / 2 + dy;
  let target = state.index;
  state.rects.forEach((rect, i) => {
    const middle = rect.top + rect.height / 2;
    if (i < state.index && center < middle) target = Math.min(target, i);
    if (i > state.index && center > middle) target = Math.max(target, i);
  });
  state.targetIndex = target;

  // 원래 위치와 목표 위치 사이의 항목들을 한 칸씩 밀어 빈자리 표시
  state.items.forEach((element, i) => {
    if (i === state.index) return;
    let offset = 0;
    if (state.index < target && i > state.index && i <= target) offset = -state.shift;
    else if (target < state.index && i >= target && i < state.index) offset = state.shift;
    element.style.transform = offset ? `translateY(${offset}px)` : '';
  });
}

// 포인터가 화면 위/아래 가장자리에 있으면 가까울수록 빠르게 스크롤
function autoScrollStep() {
  if (!dragState) return;
  const { clientY } = dragState;
  let speed = 0;
  if (clientY < AUTO_SCROLL_EDGE) {
    speed = -Math.ceil((AUTO_SCROLL_EDGE - clientY) / 4);
  } else if (clientY > window.innerHeight - AUTO_SCROLL_EDGE) {
    speed = Math.ceil((clientY - (window.innerHeight - AUTO_SCROLL_EDGE)) / 4);
  }
  if (speed !== 0) {
    window.scrollBy(0, speed);
    updateDrag();
  }
  dragState.scrollFrame = requestAnimationFrame(autoScrollStep);
}

/**
 * 드래그 종료.
 * cancel=true면 원래 자리로 되돌리고, 아니면 목표 위치로 순서를 확정한다.
 */
function endDrag(cancel) {
  const state = dragState;
  if (!state) return;
  dragState = null;

  cancelAnimationFrame(state.scrollFrame);
  if (state.handle.hasPointerCapture?.(state.pointerId)) {
    state.handle.releasePointerCapture(state.pointerId);
  }
  document.body.classList.remove('dragging-active');

  const commit = !cancel && state.moved && state.targetIndex !== state.index;

  // 확정 시에는 트랜지션 없이 즉시 원위치 후 재배치해야 항목이 튀지 않음
  if (commit) list.classList.add('no-transition');
  state.item.classList.remove('dragging');
  state.items.forEach((element) => { element.style.transform = ''; });
  list.classList.remove('is-dragging');

  if (!commit) {
    if (state.moved && cancel) announce('순서 변경을 취소했습니다');
    return;
  }

  const movedId = state.item.dataset.id;
  const targetId = state.items[state.targetIndex].dataset.id;
  if (reorderTask(movedId, targetId, state.targetIndex > state.index)) {
    saveTasks();
    render();
    announce(`${state.items.length}개 중 ${state.targetIndex + 1}번째로 이동`);
  }
  void list.offsetHeight; // 리플로우를 강제해 트랜지션 없는 상태를 먼저 반영
  list.classList.remove('no-transition');
  focusTask(movedId, '.drag-handle', true);
}

// ===================================================================
// 11. 테마 / 격언
// ===================================================================

// 초기 테마는 index.html의 인라인 스크립트가 이미 적용함
let themeTransitionTimer = null;

function applyTheme(theme, animate) {
  if (animate && !reducedMotion.matches) {
    // 테마 전환 순간에만 색상 트랜지션을 켬 (평소 다른 트랜지션과 충돌 방지)
    root.classList.add('theme-transition');
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 400);
  }
  root.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
}

function toggleTheme() {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next, true);
  storage.set(THEME_KEY, next);
  showToast(next === 'dark' ? '다크 모드' : '라이트 모드');
}

// 직전에 보여준 격언과 겹치지 않게 무작위 선택
function showRandomQuote() {
  const last = Number.parseInt(storage.get(QUOTE_KEY) ?? '', 10);
  let index;
  do {
    index = Math.floor(Math.random() * QUOTES.length);
  } while (QUOTES.length > 1 && index === last);

  storage.set(QUOTE_KEY, String(index));
  quoteText.textContent = QUOTES[index].text;
  quoteAuthor.textContent = `— ${QUOTES[index].author}`;
}

// ===================================================================
// 12. 이벤트 연결
// ===================================================================

// --- 입력 ---

// form submit으로 Enter 키와 버튼 클릭을 모두 처리
form.addEventListener('submit', (event) => {
  event.preventDefault();
  handleSubmit();
});

input.addEventListener('animationend', () => input.classList.remove('shake'));

// --- 필터 / 정렬 / 검색 ---

function setFilter(filter, fromShortcut = false) {
  currentFilter = filter;
  storage.set(FILTER_KEY, filter);
  // 카테고리 필터를 고르면 새 할 일의 기본 카테고리도 맞춰줌
  if (isCategory(filter)) categorySelect.value = filter;
  render();

  const message = `${FILTER_LABELS[filter]} 필터, ${list.children.length}개 표시`;
  if (fromShortcut) showToast(message);
  else announce(message);
}

filterBar.addEventListener('click', (event) => {
  const button = event.target.closest('.filter-button');
  if (button) setFilter(button.dataset.filter);
});

sortSelect.addEventListener('change', () => {
  if (!isSortMode(sortSelect.value)) return;
  sortMode = sortSelect.value;
  storage.set(SORT_KEY, sortMode);
  render();
  announce(sortMode === 'manual'
    ? '수동 정렬: 핸들을 끌거나 화살표 키로 순서를 바꿀 수 있습니다'
    : `${SORT_LABELS[sortMode]}으로 정렬했습니다`);
});

// 실시간 검색 (타이핑이 멈추면 반영)
const applySearch = debounce(() => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
  if (searchQuery) announce(`검색 결과 ${list.children.length}개`);
}, SEARCH_DELAY);

searchInput.addEventListener('input', applySearch);

// ESC로 검색어 지우기 (즉시 반영)
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && searchInput.value) {
    event.preventDefault();
    applySearch.cancel();
    searchInput.value = '';
    searchQuery = '';
    render();
    announce('검색어를 지웠습니다');
  }
});

// --- 목록 (이벤트 위임: 항목이 수백 개여도 리스너는 목록에 하나씩만) ---

list.addEventListener('click', (event) => {
  const item = event.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;

  if (event.target.matches('.task-checkbox')) {
    // 애니메이션 중 다시 누르면 체크 표시만 바뀌고 데이터는 안 바뀌므로 클릭 자체를 취소
    if (busyIds.has(id)) {
      event.preventDefault();
      return;
    }
    toggleTask(id, item);
  } else if (event.target.closest('.delete-button')) {
    deleteTask(id, item);
  }
});

list.addEventListener('dblclick', (event) => {
  const text = event.target.closest('.task-text');
  if (!text) return;
  const item = text.closest('.task-item');
  const task = findTask(item.dataset.id);
  if (task) startEdit(item, task);
});

list.addEventListener('keydown', (event) => {
  // 텍스트에서 Enter / Space / F2 → 편집
  const text = event.target.closest('.task-text');
  if (text && (event.key === 'Enter' || event.key === ' ' || event.key === 'F2')) {
    event.preventDefault();
    const item = text.closest('.task-item');
    const task = findTask(item.dataset.id);
    if (task) startEdit(item, task);
    return;
  }

  // 드래그 핸들에서 ↑ / ↓ → 순서 이동
  const handle = event.target.closest('.drag-handle');
  if (handle && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    moveTaskByKeyboard(handle.closest('.task-item'), event.key === 'ArrowUp' ? -1 : 1);
  }
});

// 등장 애니메이션이 끝나면 클래스 제거 (재사용된 노드에서 hover 효과 등이 정상 동작하도록)
list.addEventListener('animationend', (event) => {
  if (event.target.classList.contains('task-item')) {
    event.target.classList.remove('entering', 'sliding-in');
  }
});

// --- 드래그 ---

list.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.drag-handle');
  if (!handle || sortMode !== 'manual' || event.button !== 0 || dragState) return;
  const item = handle.closest('.task-item');
  if (busyIds.has(item.dataset.id) || item.classList.contains('editing')) return;

  event.preventDefault(); // 텍스트 선택, 터치 스크롤 방지
  startDrag(item, handle, event);
});

list.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.clientY = event.clientY;
  updateDrag();
});

list.addEventListener('pointerup', (event) => {
  if (dragState && event.pointerId === dragState.pointerId) endDrag(false);
});

list.addEventListener('pointercancel', (event) => {
  if (dragState && event.pointerId === dragState.pointerId) endDrag(true);
});

// --- 하단 버튼 / 데이터 ---

clearButton.addEventListener('click', clearCompleted);
exportButton.addEventListener('click', handleExportClick);
importButton.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  // 같은 파일을 다시 선택해도 change가 발생하도록 비움
  importFileInput.value = '';
  importFromFile(file).catch((error) => {
    console.error('[import]', error);
    showToast('가져오는 중 오류가 발생했습니다. 현재 데이터는 변경되지 않았습니다.', 'danger');
  });
});

// --- 테마 / 격언 ---

themeToggle.addEventListener('click', toggleTheme);
quoteRefresh.addEventListener('click', showRandomQuote);

// 사용자가 테마를 직접 고르지 않았다면 OS 설정 변경을 따라감
systemDark.addEventListener('change', (event) => {
  if (!storage.get(THEME_KEY)) applyTheme(event.matches ? 'dark' : 'light', true);
});

// --- 다이얼로그 ---

// 다이얼로그 바깥(배경) 클릭 시 취소. 폼이 다이얼로그 전체를 채우므로 target이
// 다이얼로그 자신이면 배경을 클릭한 것
for (const dialog of [confirmDialog, importDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
}

// --- 키보드 단축키 ---

document.addEventListener('keydown', (event) => {
  // 드래그 중 ESC → 원위치
  if (dragState && event.key === 'Escape') {
    event.preventDefault();
    endDrag(true);
    return;
  }
  // 다이얼로그가 열려 있으면 단축키 비활성화
  if (document.querySelector('dialog[open]')) return;

  // Ctrl+Z (Mac은 Cmd+Z): 최근 삭제 복구. 입력창 안에서는 기본 되돌리기를 그대로 둠
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyZ') {
    if (isTextField(document.activeElement)) return;
    event.preventDefault();
    undoLastDelete();
    return;
  }

  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  if (event.code === 'KeyN') {
    event.preventDefault();
    input.focus();
  } else if (Object.prototype.hasOwnProperty.call(FILTER_SHORTCUTS, event.code)) {
    event.preventDefault();
    setFilter(FILTER_SHORTCUTS[event.code], true);
  } else if (event.code === 'KeyD') {
    event.preventDefault();
    toggleTheme();
  }
});

// --- 저장 / 동기화 ---

// 탭을 닫거나 다른 앱으로 전환할 때 디바운스 대기 중인 저장을 즉시 실행
window.addEventListener('pagehide', () => saveTasks.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveTasks.flush();
});

// 다른 탭에서 데이터/테마가 바뀌면 반영
window.addEventListener('storage', (event) => {
  if (event.key === THEME_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
    applyTheme(event.newValue, true);
    return;
  }
  // key === null은 다른 탭에서 localStorage.clear()를 호출한 경우
  if (event.key !== STORAGE_KEY && event.key !== null) return;

  // 이 탭에 아직 저장 안 된 변경이 있으면 그것을 우선 (곧 저장되며 다른 탭에 전파됨)
  if (saveTasks.isPending()) return;

  tasks = loadTasks();
  render();
  showToast('다른 탭에서 변경된 내용을 반영했습니다');
});

// --- 전역 오류 처리 ---

// 예상하지 못한 오류가 나도 사용자에게 알리고, 상세 내용은 콘솔에 남김
window.addEventListener('error', (event) => {
  console.error('[unexpected]', event.error ?? event.message);
  showToast('예기치 않은 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.', 'danger');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unexpected]', event.reason);
  showToast('예기치 않은 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.', 'danger');
});

// ===================================================================
// 13. 초기화
// ===================================================================

applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light', false);
sortSelect.value = sortMode;
if (isCategory(currentFilter)) categorySelect.value = currentFilter;
showRandomQuote();
render();
setInterval(refreshTimes, 60 * 1000);
