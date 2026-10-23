// 게임 모드 설정 (timeLimit: 문제당 제한 시간(초), null이면 제한 없음)
const GAME_MODES = {
    full: { label: '전체 도전', questions: 40, timeLimit: null },
    category: { label: '카테고리별 도전', questions: 10, timeLimit: null },
    speed: { label: '스피드 퀴즈', questions: 20, timeLimit: 15 }
};
const CATEGORIES = ["한국사", "세계지리", "과학", "예술과 문화"];
const HINTS_PER_GAME = 3;
const PINNED_GEOGRAPHY_ID = 12;

const scoreManager = new ScoreManager();

// 게임 상태 관리
let activeQuestions = [];
let gameState = createGameState('category', null);

// 문제별 타이머 (일시정지 시간을 제외하고 경과 시간을 계산)
const timer = {
    startedAt: 0,
    pausedAt: null,
    pausedTotal: 0,
    intervalId: null
};
let feedbackTimeoutId = null;

// DOM 요소들
const startScreen = document.getElementById('startScreen');
const quizScreen = document.getElementById('quizScreen');
const resultScreen = document.getElementById('resultScreen');
const modeButtons = document.querySelectorAll('.mode-card[data-mode]');
const categoryButtons = document.querySelectorAll('.category-chip[data-category]');
const nextBtn = document.getElementById('nextBtn');
const restartBtn = document.getElementById('restartBtn');
const retryBtn = document.getElementById('retryBtn');
const hintBtn = document.getElementById('hintBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const feedbackModal = document.getElementById('feedbackModal');
const timerDisplay = document.getElementById('timerDisplay');
const timeFill = document.getElementById('timeFill');

function createGameState(mode, category) {
    return {
        mode: mode,
        selectedCategory: category,
        currentQuestionIndex: 0,
        score: 0,
        streak: 0,
        hintsLeft: HINTS_PER_GAME,
        hintUsedThisQuestion: false,
        answers: [],
        isAnswered: false,
        isPaused: false,
        result: null
    };
}

// Fisher-Yates 셔플
function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// 모드에 맞게 문제 추출 (랜덤)
function pickQuestions(mode, category) {
    const count = GAME_MODES[mode].questions;

    if (mode === 'full') {
        // 카테고리마다 같은 수만큼 뽑은 뒤 섞음
        const perCategory = count / CATEGORIES.length;
        const picked = CATEGORIES.flatMap(cat =>
            shuffle(quizQuestions.filter(q => q.category === cat)).slice(0, perCategory)
        );
        return shuffle(picked);
    }

    if (mode === 'speed') {
        return shuffle(quizQuestions).slice(0, count);
    }

    const pool = quizQuestions.filter(q => q.category === category);
    const picked = shuffle(pool).slice(0, count);

    // 세계지리는 "가장 긴 강" 문제(id: 12)를 항상 첫 문제로 고정
    if (category === "세계지리") {
        const pinned = pool.find(q => q.id === PINNED_GEOGRAPHY_ID);
        if (pinned) {
            const rest = picked.filter(q => q.id !== pinned.id);
            return [pinned, ...rest].slice(0, count);
        }
    }

    return picked;
}

// 게임 초기화
function initGame(mode, category = null) {
    activeQuestions = pickQuestions(mode, category);
    gameState = createGameState(mode, category);

    // 화면 전환
    startScreen.classList.remove('active');
    quizScreen.classList.add('active');
    resultScreen.classList.remove('active');
    feedbackModal.classList.remove('show');
    pauseOverlay.classList.remove('show');

    quizScreen.classList.toggle('speed-mode', GAME_MODES[mode].timeLimit !== null);

    // 첫 문제 로드
    loadQuestion();
}

// 문제 로드 및 표시
function loadQuestion() {
    const question = activeQuestions[gameState.currentQuestionIndex];

    // 진행률 업데이트
    updateProgress();
    updateCombo();

    // 카테고리 배지 업데이트
    document.getElementById('categoryBadge').textContent = question.category;

    // 문제 텍스트 표시
    document.getElementById('questionText').textContent = question.question;

    // 선택지 생성
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => handleAnswer(index);
        optionsContainer.appendChild(button);
    });

    // 상태 초기화
    gameState.isAnswered = false;
    gameState.hintUsedThisQuestion = false;
    updateToolButtons();

    startTimer();
}

// ===== 타이머 =====

function startTimer() {
    timer.startedAt = performance.now();
    timer.pausedAt = null;
    timer.pausedTotal = 0;
    runTimer();
}

function runTimer() {
    clearInterval(timer.intervalId);
    timer.intervalId = setInterval(tickTimer, 100);
    tickTimer();
}

function stopTimer() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
}

// 일시정지 시간을 뺀 현재 문제의 경과 시간(초)
function getElapsedSeconds() {
    const now = timer.pausedAt ?? performance.now();
    return (now - timer.startedAt - timer.pausedTotal) / 1000;
}

function tickTimer() {
    const elapsed = getElapsedSeconds();
    const timeLimit = GAME_MODES[gameState.mode].timeLimit;

    if (timeLimit === null) {
        timerDisplay.textContent = `⏱ ${elapsed.toFixed(1)}초`;
        timerDisplay.classList.remove('warning');
        return;
    }

    const remaining = Math.max(0, timeLimit - elapsed);
    timerDisplay.textContent = `⏱ ${remaining.toFixed(1)}초`;
    timerDisplay.classList.toggle('warning', remaining <= 5);
    timeFill.style.width = `${(remaining / timeLimit) * 100}%`;
    timeFill.classList.toggle('warning', remaining <= 5);

    if (remaining <= 0) {
        handleAnswer(-1); // 시간 초과는 오답 처리
    }
}

// ===== 일시정지 =====

function pauseGame() {
    if (!quizScreen.classList.contains('active')) return;
    if (gameState.isAnswered || gameState.isPaused) return;

    gameState.isPaused = true;
    timer.pausedAt = performance.now();
    stopTimer();
    pauseOverlay.classList.add('show');
    updateToolButtons();
}

function resumeGame() {
    if (!gameState.isPaused) return;

    gameState.isPaused = false;
    timer.pausedTotal += performance.now() - timer.pausedAt;
    timer.pausedAt = null;
    pauseOverlay.classList.remove('show');
    updateToolButtons();
    runTimer();
}

function togglePause() {
    if (gameState.isPaused) {
        resumeGame();
    } else {
        pauseGame();
    }
}

// ===== 힌트 =====

// 오답 2개를 무작위로 제거
function useHint() {
    if (gameState.isAnswered || gameState.isPaused) return;
    if (gameState.hintsLeft <= 0 || gameState.hintUsedThisQuestion) return;

    const question = activeQuestions[gameState.currentQuestionIndex];
    const wrongIndexes = question.options
        .map((_, index) => index)
        .filter(index => index !== question.correctAnswer);
    const buttons = document.querySelectorAll('.option-btn');

    shuffle(wrongIndexes).slice(0, 2).forEach(index => {
        buttons[index].classList.add('eliminated');
        buttons[index].disabled = true;
    });

    gameState.hintsLeft--;
    gameState.hintUsedThisQuestion = true;
    updateToolButtons();
}

function updateToolButtons() {
    document.getElementById('hintCount').textContent = gameState.hintsLeft;
    hintBtn.disabled = gameState.hintsLeft <= 0
        || gameState.hintUsedThisQuestion
        || gameState.isAnswered
        || gameState.isPaused;
    pauseBtn.disabled = gameState.isAnswered;
}

// ===== 답변 처리 =====

// selectedIndex가 -1이면 시간 초과
function handleAnswer(selectedIndex) {
    if (gameState.isAnswered || gameState.isPaused) return;

    gameState.isAnswered = true;
    stopTimer();

    const question = activeQuestions[gameState.currentQuestionIndex];
    const timeLimit = GAME_MODES[gameState.mode].timeLimit;
    const timedOut = selectedIndex === -1;
    const elapsed = timeLimit === null ? getElapsedSeconds() : Math.min(getElapsedSeconds(), timeLimit);
    const timeSpent = Math.round(elapsed * 10) / 10;
    const isCorrect = selectedIndex === question.correctAnswer;

    gameState.streak = isCorrect ? gameState.streak + 1 : 0;

    const breakdown = scoreManager.getScoreBreakdown(
        isCorrect, timeSpent, gameState.streak, gameState.hintUsedThisQuestion
    );
    gameState.score += breakdown.total;

    // 답변 저장
    gameState.answers.push({
        questionId: question.id,
        category: question.category,
        selected: selectedIndex,
        correct: question.correctAnswer,
        isCorrect: isCorrect,
        timedOut: timedOut,
        timeSpent: timeSpent,
        hintUsed: gameState.hintUsedThisQuestion,
        points: breakdown.total
    });

    updateProgress();
    updateCombo();
    updateToolButtons();

    // UI 피드백
    showAnswerFeedback(selectedIndex, question.correctAnswer, isCorrect);

    // 피드백 모달 표시
    feedbackTimeoutId = setTimeout(() => {
        showFeedback(isCorrect, timedOut, question.explanation, breakdown);
    }, 1000);
}

// 답변 피드백 UI
function showAnswerFeedback(selectedIndex, correctIndex, isCorrect) {
    const buttons = document.querySelectorAll('.option-btn');

    // 모든 버튼 비활성화
    buttons.forEach(btn => btn.classList.add('disabled'));

    // 선택한 답변 표시 (시간 초과면 정답만 표시)
    if (!isCorrect && selectedIndex >= 0) {
        buttons[selectedIndex].classList.add('incorrect');
    }
    buttons[correctIndex].classList.add('correct');
}

// 피드백 모달 표시
function showFeedback(isCorrect, timedOut, explanation, breakdown) {
    const feedbackIcon = document.getElementById('feedbackIcon');
    const feedbackTitle = document.getElementById('feedbackTitle');
    const feedbackExplanation = document.getElementById('feedbackExplanation');
    const feedbackScore = document.getElementById('feedbackScore');

    feedbackIcon.className = `feedback-icon ${isCorrect ? 'correct' : timedOut ? 'timeout' : 'incorrect'}`;
    feedbackTitle.textContent = isCorrect ? '정답입니다!' : timedOut ? '시간 초과!' : '틀렸습니다';
    feedbackExplanation.textContent = explanation;

    if (isCorrect) {
        const parts = [`기본 ${breakdown.base}`];
        if (breakdown.time) parts.push(`시간 +${breakdown.time}`);
        if (breakdown.noHint) parts.push(`노힌트 +${breakdown.noHint}`);
        if (breakdown.combo) parts.push(`${gameState.streak}콤보 +${breakdown.combo}`);
        feedbackScore.textContent = `+${breakdown.total}점 (${parts.join(' · ')})`;
    } else {
        feedbackScore.textContent = '+0점 · 콤보 초기화';
    }

    const isLast = gameState.currentQuestionIndex === activeQuestions.length - 1;
    nextBtn.textContent = isLast ? '결과 보기' : '다음 문제';

    feedbackModal.classList.add('show');
}

// 다음 문제로 이동
function nextQuestion() {
    feedbackModal.classList.remove('show');
    gameState.currentQuestionIndex++;

    if (gameState.currentQuestionIndex < activeQuestions.length) {
        loadQuestion();
    } else {
        endGame();
    }
}

// 게임 종료
function endGame() {
    stopTimer();

    // 화면 전환
    quizScreen.classList.remove('active');
    resultScreen.classList.add('active');

    // 결과 표시
    gameState.result = scoreManager.summarize(gameState.answers, activeQuestions.length);
    displayResults(gameState.result);
}

// 결과 표시
function displayResults(result) {
    const modeLabel = GAME_MODES[gameState.mode].label;
    document.getElementById('resultMode').textContent = gameState.selectedCategory
        ? `${modeLabel} · ${gameState.selectedCategory}`
        : modeLabel;

    document.getElementById('finalScore').textContent = result.totalScore;
    document.getElementById('correctCount').textContent =
        `${result.correctAnswers} / ${result.totalQuestions}`;
    document.getElementById('accuracyRate').textContent = `${result.accuracy}%`;
    document.getElementById('avgTime').textContent = `${result.averageResponseTime}초`;
    document.getElementById('longestStreak').textContent = result.longestStreak;
    document.getElementById('hintsUsed').textContent =
        `${HINTS_PER_GAME - gameState.hintsLeft} / ${HINTS_PER_GAME}`;

    // 카테고리별 결과
    const categoryResults = document.getElementById('categoryResults');
    categoryResults.innerHTML = '';

    for (const [category, stats] of Object.entries(result.categoryStats)) {
        const percent = Math.round((stats.correct / stats.total) * 100);

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-result';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-name';
        nameSpan.textContent = category;

        const bar = document.createElement('div');
        bar.className = 'category-bar';
        const barFill = document.createElement('div');
        barFill.className = 'category-bar-fill';
        barFill.style.width = `${percent}%`;
        bar.appendChild(barFill);

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'category-score';
        scoreSpan.textContent = `${stats.correct} / ${stats.total} (${percent}%)`;

        categoryDiv.appendChild(nameSpan);
        categoryDiv.appendChild(bar);
        categoryDiv.appendChild(scoreSpan);
        categoryResults.appendChild(categoryDiv);
    }
}

// 진행률 업데이트
function updateProgress() {
    const current = gameState.currentQuestionIndex + 1;
    const total = activeQuestions.length;

    document.getElementById('currentQuestion').textContent = current;
    document.getElementById('totalQuestions').textContent = total;
    document.getElementById('currentScore').textContent = gameState.score;

    // 진행률 바 업데이트
    const progressPercent = (current / total) * 100;
    document.getElementById('progressFill').style.width = `${progressPercent}%`;
}

// 연속 정답 콤보 표시 (2연속부터)
function updateCombo() {
    const comboDisplay = document.getElementById('comboDisplay');
    comboDisplay.textContent = gameState.streak >= 2 ? `🔥 ${gameState.streak}연속` : '';
}

// 시작 화면으로 돌아가기 (진행 중인 게임은 폐기)
function restartGame() {
    stopTimer();
    clearTimeout(feedbackTimeoutId);
    gameState.isPaused = false;
    pauseOverlay.classList.remove('show');
    feedbackModal.classList.remove('show');

    quizScreen.classList.remove('active');
    resultScreen.classList.remove('active');
    startScreen.classList.add('active');
}

// 이벤트 리스너
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => initGame(btn.dataset.mode));
});

categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => initGame('category', btn.dataset.category));
});

nextBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', restartGame);
retryBtn.addEventListener('click', () => initGame(gameState.mode, gameState.selectedCategory));
hintBtn.addEventListener('click', useHint);
pauseBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', resumeGame);
quitBtn.addEventListener('click', restartGame);

// 다른 탭으로 이동하면 자동 일시정지
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
});

// 키보드 단축키 지원 (한글 입력 상태에서도 동작하도록 e.code 사용)
document.addEventListener('keydown', (e) => {
    if (!quizScreen.classList.contains('active')) return;

    if (feedbackModal.classList.contains('show')) {
        // Enter 키로 다음 문제
        if (e.key === 'Enter') {
            e.preventDefault();
            nextQuestion();
        }
        return;
    }

    if (e.code === 'KeyP' || e.key === 'Escape') {
        togglePause();
        return;
    }

    if (gameState.isAnswered || gameState.isPaused) return;

    if (e.code === 'KeyH') {
        useHint();
    } else if (e.key >= '1' && e.key <= '4') {
        // 1-4 숫자키로 답변 선택 (힌트로 제거된 선택지는 무시)
        const index = parseInt(e.key) - 1;
        const button = document.querySelectorAll('.option-btn')[index];
        if (button && !button.disabled) {
            handleAnswer(index);
        }
    }
});
