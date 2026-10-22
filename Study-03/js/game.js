// ===== 상태 관리 =====
const POINTS_PER_QUESTION = 10;

const state = {
  category: "all",   // 선택한 카테고리 ("all" 또는 CATEGORIES 중 하나)
  questions: [],     // 이번 게임에 출제할 문제 목록
  currentIndex: 0,   // 현재 문제 인덱스
  correctCount: 0,   // 맞힌 문제 수
  answered: false    // 현재 문제에 답했는지 여부 (중복 클릭 방지)
};

// ===== DOM 참조 =====
const $ = (id) => document.getElementById(id);

const screens = {
  start: $("start-screen"),
  quiz: $("quiz-screen"),
  result: $("result-screen")
};

const DIFFICULTY_LABELS = { easy: "쉬움", medium: "보통", hard: "어려움" };

// ===== 문제 관리 =====
function getQuestionsByCategory(category) {
  if (category === "all") return [...QUESTIONS];
  return QUESTIONS.filter((q) => q.category === category);
}

// ===== 화면 전환 =====
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
}

// ===== 게임 진행 로직 =====
function initGame() {
  state.questions = getQuestionsByCategory(state.category);
  state.currentIndex = 0;
  state.correctCount = 0;
  state.answered = false;

  showScreen("quiz");
  loadQuestion();
}

function loadQuestion() {
  const q = state.questions[state.currentIndex];
  const total = state.questions.length;

  state.answered = false;

  // 진행률
  $("progress-text").textContent = `${state.currentIndex + 1} / ${total}`;
  $("progress-fill").style.width = `${(state.currentIndex / total) * 100}%`;
  $("score-text").textContent = `${state.correctCount * POINTS_PER_QUESTION}점`;

  // 문제
  $("question-category").textContent = q.category;
  $("question-difficulty").textContent = DIFFICULTY_LABELS[q.difficulty];
  $("question-difficulty").dataset.level = q.difficulty;
  $("question-text").textContent = q.question;

  // 선택지
  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  q.options.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerHTML = `<span class="option-key">${i + 1}</span><span class="option-text"></span>`;
    btn.querySelector(".option-text").textContent = text;
    btn.addEventListener("click", () => handleAnswer(i));
    optionsEl.appendChild(btn);
  });

  $("feedback").hidden = true;
}

function handleAnswer(selectedIndex) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.currentIndex];
  const isCorrect = selectedIndex === q.correctAnswer;
  if (isCorrect) state.correctCount++;

  showFeedback(isCorrect, selectedIndex);
}

function showFeedback(isCorrect, selectedIndex) {
  const q = state.questions[state.currentIndex];

  // 선택지 표시: 정답은 초록, 고른 오답은 빨강
  const buttons = $("options").querySelectorAll(".option");
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctAnswer) btn.classList.add("correct");
    else if (i === selectedIndex) btn.classList.add("wrong");
  });

  const feedback = $("feedback");
  feedback.className = `feedback ${isCorrect ? "is-correct" : "is-wrong"}`;
  $("feedback-title").textContent = isCorrect
    ? "정답입니다!"
    : `오답입니다. 정답: ${q.options[q.correctAnswer]}`;
  $("feedback-explanation").textContent = q.explanation;

  const isLast = state.currentIndex === state.questions.length - 1;
  $("next-btn").textContent = isLast ? "결과 보기" : "다음 문제";

  $("score-text").textContent = `${state.correctCount * POINTS_PER_QUESTION}점`;
  $("progress-fill").style.width =
    `${((state.currentIndex + 1) / state.questions.length) * 100}%`;

  feedback.hidden = false;
  $("next-btn").focus();
}

function nextQuestion() {
  if (!state.answered) return;

  state.currentIndex++;
  if (state.currentIndex >= state.questions.length) {
    endGame();
  } else {
    loadQuestion();
  }
}

function endGame() {
  const total = state.questions.length;
  const correct = state.correctCount;
  const rate = Math.round((correct / total) * 100);

  $("result-score").textContent = correct * POINTS_PER_QUESTION;
  $("result-max").textContent = `/ ${total * POINTS_PER_QUESTION}점`;
  $("result-correct").textContent = `${correct} / ${total}`;
  $("result-rate").textContent = `${rate}%`;

  let message;
  if (rate === 100) message = "완벽해요! 퀴즈 마스터!";
  else if (rate >= 80) message = "훌륭해요!";
  else if (rate >= 50) message = "잘했어요! 조금만 더!";
  else message = "다시 도전해 보세요!";
  $("result-message").textContent = message;

  showScreen("result");
}

// ===== 시작 화면: 카테고리 선택 =====
function renderCategoryOptions() {
  const container = $("category-select");
  const choices = [
    { value: "all", label: "전체", count: QUESTIONS.length },
    ...CATEGORIES.map((c) => ({
      value: c,
      label: c,
      count: getQuestionsByCategory(c).length
    }))
  ];

  choices.forEach(({ value, label, count }) => {
    const btn = document.createElement("button");
    btn.className = "category" + (value === state.category ? " selected" : "");
    btn.dataset.value = value;
    btn.innerHTML = `<span class="category-label"></span><span class="category-count">${count}문제</span>`;
    btn.querySelector(".category-label").textContent = label;
    btn.addEventListener("click", () => {
      state.category = value;
      container.querySelectorAll(".category").forEach((el) => {
        el.classList.toggle("selected", el.dataset.value === value);
      });
    });
    container.appendChild(btn);
  });
}

// ===== 이벤트 바인딩 =====
$("start-btn").addEventListener("click", initGame);
$("next-btn").addEventListener("click", nextQuestion);
$("retry-btn").addEventListener("click", initGame);
$("home-btn").addEventListener("click", () => showScreen("start"));

// 키보드: 1~4로 선택, Enter로 다음 문제
document.addEventListener("keydown", (e) => {
  if (!screens.quiz.classList.contains("active")) return;

  const num = Number(e.key);
  if (!state.answered && num >= 1 && num <= 4) {
    handleAnswer(num - 1);
  } else if (state.answered && e.key === "Enter" && document.activeElement !== $("next-btn")) {
    nextQuestion();
  }
});

renderCategoryOptions();
