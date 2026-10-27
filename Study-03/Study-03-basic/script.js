// 게임 모드 설정 (timeLimit: 문제당 제한 시간(초), null이면 제한 없음)
const GAME_MODES = {
    full: { label: '전체 도전', questions: 40, timeLimit: null },
    category: { label: '카테고리별 도전', questions: 10, timeLimit: null },
    speed: { label: '스피드 퀴즈', questions: 20, timeLimit: 15 }
};
const DIFFICULTY_LABELS = { all: '전체', easy: '쉬움', medium: '보통', hard: '어려움' };
const CATEGORIES = ["한국사", "세계지리", "과학", "예술과 문화"];
const HINTS_PER_GAME = 3;
const PINNED_GEOGRAPHY_ID = 12;
const DEFAULT_PLAYER_NAME = LocalDataManager.DEFAULT_SETTINGS.playerName;
const CHART_GAMES = 20;

const scoreManager = new ScoreManager();
const dataManager = new LocalDataManager();
let settings = dataManager.getSettings();

// 게임 상태 관리
let activeQuestions = [];
let gameState = createGameState('category', null, settings.difficulty);

// 문제별 타이머 (일시정지 시간을 제외하고 경과 시간을 계산)
const timer = {
    startedAt: 0,
    pausedAt: null,
    pausedTotal: 0,
    intervalId: null
};
let feedbackTimeoutId = null;
let toastTimeoutId = null;
let returnScreen = 'startScreen'; // 순위표·대시보드에서 돌아갈 화면
let boardPeriod = 'allTime';
let chartMetric = 'totalScore';

// DOM 요소들
const app = document.getElementById('app');
const screens = document.querySelectorAll('.screen');
const quizScreen = document.getElementById('quizScreen');
const modeButtons = document.querySelectorAll('.mode-card[data-mode]');
const categoryButtons = document.querySelectorAll('.category-chip[data-category]');
const difficultyInputs = document.querySelectorAll('input[name="difficulty"]');
const playerNameInput = document.getElementById('playerName');
const nextBtn = document.getElementById('nextBtn');
const restartBtn = document.getElementById('restartBtn');
const retryBtn = document.getElementById('retryBtn');
const shareBtn = document.getElementById('shareBtn');
const hintBtn = document.getElementById('hintBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const feedbackModal = document.getElementById('feedbackModal');
const timerDisplay = document.getElementById('timerDisplay');
const timeFill = document.getElementById('timeFill');
const themeToggle = document.getElementById('themeToggle');
const soundToggle = document.getElementById('soundToggle');
const boardTabs = document.querySelectorAll('.tab[data-period]');
const boardModeSelect = document.getElementById('boardMode');
const boardDifficultySelect = document.getElementById('boardDifficulty');
const metricButtons = document.querySelectorAll('.seg-btn[data-metric]');

function createGameState(mode, category, difficulty) {
    return {
        mode: mode,
        selectedCategory: category,
        difficulty: difficulty,
        currentQuestionIndex: 0,
        score: 0,
        streak: 0,
        hintsLeft: HINTS_PER_GAME,
        hintUsedThisQuestion: false,
        answers: [],
        isAnswered: false,
        isPaused: false,
        result: null,
        record: null
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

function getQuestionPool(difficulty) {
    return difficulty === 'all'
        ? quizQuestions
        : quizQuestions.filter(q => q.difficulty === difficulty);
}

// 모드에 맞게 문제 추출 (랜덤). 난이도 필터로 문제가 부족하면 있는 만큼만 출제
function pickQuestions(mode, category, difficulty) {
    const count = GAME_MODES[mode].questions;
    const questions = getQuestionPool(difficulty);

    if (mode === 'full') {
        // 카테고리마다 같은 수만큼 뽑은 뒤 섞음
        const perCategory = count / CATEGORIES.length;
        const picked = CATEGORIES.flatMap(cat =>
            shuffle(questions.filter(q => q.category === cat)).slice(0, perCategory)
        );
        return shuffle(picked);
    }

    if (mode === 'speed') {
        return shuffle(questions).slice(0, count);
    }

    const pool = questions.filter(q => q.category === category);
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

// 선택한 난이도에서 실제로 출제되는 문제 수를 모드 설명에 반영
function updateModeAvailability() {
    const pool = getQuestionPool(settings.difficulty);
    const perCategory = GAME_MODES.full.questions / CATEGORIES.length;
    const countIn = cat => pool.filter(q => q.category === cat).length;

    const fullCount = CATEGORIES.reduce((sum, cat) => sum + Math.min(perCategory, countIn(cat)), 0);
    const speedCount = Math.min(GAME_MODES.speed.questions, pool.length);

    document.querySelector('[data-desc="full"]').textContent = `${CATEGORIES.length}개 카테고리 · ${fullCount}문제`;
    document.querySelector('[data-desc="speed"]').textContent =
        `${speedCount}문제 · 문제당 ${GAME_MODES.speed.timeLimit}초`;
    document.querySelector('.mode-card[data-mode="full"]').disabled = fullCount === 0;
    document.querySelector('.mode-card[data-mode="speed"]').disabled = speedCount === 0;

    categoryButtons.forEach(btn => {
        const count = Math.min(GAME_MODES.category.questions, countIn(btn.dataset.category));
        btn.disabled = count === 0;
        btn.title = `${count}문제`;
    });
}

// ===== 화면 전환 =====

function showScreen(screenId, { focus = true } = {}) {
    screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
    app.classList.toggle('in-quiz', screenId === 'quizScreen');
    window.scrollTo(0, 0);

    if (focus) {
        // 화면이 바뀌면 제목으로 포커스를 옮겨 스크린 리더와 키보드 사용자가 위치를 알 수 있게 함
        const heading = document.querySelector(`#${screenId} [tabindex="-1"]`);
        if (heading) heading.focus({ preventScroll: true });
    }
}

function getActiveScreenId() {
    return document.querySelector('.screen.active').id;
}

function announce(message) {
    const announcer = document.getElementById('srAnnouncer');
    announcer.textContent = '';
    // 같은 문구도 다시 읽히도록 비운 뒤 다음 프레임에 설정
    requestAnimationFrame(() => { announcer.textContent = message; });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => toast.classList.remove('show'), 2500);
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ===== 게임 진행 =====

// 게임 초기화
function initGame(mode, category = null, difficulty = settings.difficulty) {
    activeQuestions = pickQuestions(mode, category, difficulty);
    if (activeQuestions.length === 0) {
        showToast('선택한 난이도에 해당하는 문제가 없습니다.');
        return;
    }
    gameState = createGameState(mode, category, difficulty);
    sound.unlock();

    feedbackModal.classList.remove('show');
    pauseOverlay.classList.remove('show');
    quizScreen.classList.toggle('speed-mode', GAME_MODES[mode].timeLimit !== null);
    showScreen('quizScreen', { focus: false });

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
    const questionText = document.getElementById('questionText');
    questionText.textContent = question.question;

    // 선택지 생성
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'option-btn';
        button.style.setProperty('--i', index);
        button.dataset.key = index + 1;
        button.textContent = option;
        button.setAttribute('aria-label', `${index + 1}번: ${option}`);
        button.onclick = () => handleAnswer(index);
        optionsContainer.appendChild(button);
    });

    // 상태 초기화
    gameState.isAnswered = false;
    gameState.hintUsedThisQuestion = false;
    updateToolButtons();

    // 새 문제를 스크린 리더가 읽도록 문제 제목에 포커스
    questionText.focus({ preventScroll: true });

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
    resumeBtn.focus();
}

function resumeGame() {
    if (!gameState.isPaused) return;

    gameState.isPaused = false;
    timer.pausedTotal += performance.now() - timer.pausedAt;
    timer.pausedAt = null;
    pauseOverlay.classList.remove('show');
    updateToolButtons();
    runTimer();
    document.getElementById('questionText').focus({ preventScroll: true });
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
    announce('힌트: 오답 2개를 제거했습니다.');

    // 포커스가 제거된 보기에 있었다면 남은 보기로 이동
    if (document.activeElement && document.activeElement.disabled) {
        document.querySelector('.option-btn:not(:disabled)').focus();
    }
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
    if (breakdown.total > 0) bumpScore();

    // UI 피드백
    showAnswerFeedback(selectedIndex, question.correctAnswer, isCorrect);
    sound.play(isCorrect ? 'correct' : 'incorrect');

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
    nextBtn.focus();
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

// 게임 종료: 결과 계산 → 기록 저장 → 결과 화면
function endGame() {
    stopTimer();

    gameState.result = scoreManager.summarize(gameState.answers, activeQuestions.length);
    const recordFilter = {
        playerName: settings.playerName,
        mode: gameState.mode,
        category: gameState.selectedCategory,
        difficulty: gameState.difficulty
    };
    const previousGames = dataManager.filterHistory(recordFilter).length;
    const previousBest = dataManager.getBestScore(recordFilter);

    const { record, saved } = dataManager.saveGameResult({
        playerName: settings.playerName,
        mode: gameState.mode,
        category: gameState.selectedCategory,
        difficulty: gameState.difficulty,
        hintsUsed: HINTS_PER_GAME - gameState.hintsLeft,
        ...gameState.result
    });
    gameState.record = record;

    showScreen('resultScreen');
    displayResults(gameState.result);
    displayRecordBanner({ record, saved, previousGames, previousBest });
}

function getModeText(mode, category, difficulty) {
    const modeLabel = GAME_MODES[mode].label;
    const base = category ? `${modeLabel} · ${category}` : modeLabel;
    return `${base} · 난이도 ${DIFFICULTY_LABELS[difficulty]}`;
}

// 결과 표시
function displayResults(result) {
    document.getElementById('resultMode').textContent =
        `${settings.playerName} · ${getModeText(gameState.mode, gameState.selectedCategory, gameState.difficulty)}`;

    countUp(document.getElementById('finalScore'), result.totalScore);
    document.getElementById('correctCount').textContent =
        `${result.correctAnswers} / ${result.totalQuestions}`;
    document.getElementById('accuracyRate').textContent = `${result.accuracy}%`;
    document.getElementById('avgTime').textContent = `${result.averageResponseTime}초`;
    document.getElementById('longestStreak').textContent = result.longestStreak;
    document.getElementById('hintsUsed').textContent =
        `${HINTS_PER_GAME - gameState.hintsLeft} / ${HINTS_PER_GAME}`;

    renderCategoryBars(document.getElementById('categoryResults'), result.categoryStats);
}

// 개인 최고 기록 갱신 여부와 순위 표시
function displayRecordBanner({ record, saved, previousGames, previousBest }) {
    const banner = document.getElementById('recordBanner');
    banner.className = 'record-banner';

    if (!saved) {
        banner.textContent = '⚠️ 브라우저 저장소를 사용할 수 없어 기록이 저장되지 않았습니다.';
        banner.classList.add('warning');
        return;
    }

    const parts = [];
    if (previousGames === 0) {
        parts.push('📝 이 모드의 첫 기록이 저장되었습니다');
    } else if (record.totalScore > previousBest) {
        parts.push(`🎉 새 개인 최고 기록! (이전 ${previousBest}점)`);
        banner.classList.add('new-record');
        sound.play('record');
    } else {
        parts.push(`개인 최고 기록 ${previousBest}점`);
    }

    const rank = dataManager.getRank(record);
    if (rank) parts.push(`순위 ${rank.rank}위 / ${rank.total}명`);

    banner.textContent = parts.join(' · ');
}

function renderCategoryBars(container, categoryStats) {
    container.innerHTML = '';

    for (const [category, stats] of Object.entries(categoryStats)) {
        const percent = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-result';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-name';
        nameSpan.textContent = category;

        const bar = document.createElement('div');
        bar.className = 'category-bar';
        bar.setAttribute('aria-hidden', 'true');
        const barFill = document.createElement('div');
        barFill.className = 'category-bar-fill';
        bar.appendChild(barFill);
        // 다음 프레임에 너비를 지정해 막대가 차오르는 애니메이션 적용
        requestAnimationFrame(() => { barFill.style.width = `${percent}%`; });

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'category-score';
        scoreSpan.textContent = `${stats.correct} / ${stats.total} (${percent}%)`;

        categoryDiv.appendChild(nameSpan);
        categoryDiv.appendChild(bar);
        categoryDiv.appendChild(scoreSpan);
        container.appendChild(categoryDiv);
    }
}

// 숫자가 0부터 목표값까지 올라가는 애니메이션
function countUp(element, target) {
    if (prefersReducedMotion() || target <= 0) {
        element.textContent = target;
        return;
    }
    const duration = 800;
    const start = performance.now();
    const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function bumpScore() {
    const scoreEl = document.getElementById('currentScore');
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth; // 애니메이션 재시작
    scoreEl.classList.add('bump');
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
    showScreen('startScreen');
}

// ===== 결과 공유 =====

function buildShareText() {
    const result = gameState.result;
    return [
        '🎯 퀴즈 게임 결과',
        `👤 ${settings.playerName}`,
        `🎮 ${getModeText(gameState.mode, gameState.selectedCategory, gameState.difficulty)}`,
        `🏆 ${result.totalScore}점 · 정답 ${result.correctAnswers}/${result.totalQuestions} (${result.accuracy}%)`,
        `🔥 최장 연속 정답 ${result.longestStreak} · ⏱ 평균 ${result.averageResponseTime}초`
    ].join('\n');
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // file:// 등 Clipboard API를 쓸 수 없는 환경용 대체 방법
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }
        textarea.remove();
        return copied;
    }
}

async function shareResult() {
    if (!gameState.result) return;
    const copied = await copyToClipboard(buildShareText());
    showToast(copied ? '📋 결과를 클립보드에 복사했습니다' : '복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
}

// ===== 순위표 =====

function openLeaderboard() {
    returnScreen = getActiveScreenId();
    // 결과 화면에서 열면 방금 플레이한 모드·난이도 순위를 보여줌
    if (returnScreen === 'resultScreen' && gameState.record) {
        boardModeSelect.value = gameState.mode === 'category'
            ? `category:${gameState.selectedCategory}`
            : gameState.mode;
        boardDifficultySelect.value = gameState.difficulty;
    }
    renderLeaderboard();
    showScreen('leaderboardScreen');
}

function setBoardPeriod(period, { focusTab = false } = {}) {
    boardPeriod = period;
    boardTabs.forEach(tab => {
        const selected = tab.dataset.period === period;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focusTab) tab.focus();
    });
    renderLeaderboard();
}

function renderLeaderboard() {
    const [mode, category] = boardModeSelect.value.split(':');
    const board = dataManager.getLeaderboard({
        period: boardPeriod,
        mode: mode || null,
        category: category || null,
        difficulty: boardDifficultySelect.value || null
    });

    const list = document.getElementById('leaderboardList');
    const empty = document.getElementById('leaderboardEmpty');
    const activeTab = document.querySelector(`.tab[data-period="${boardPeriod}"]`);
    document.getElementById('leaderboardPanel').setAttribute('aria-labelledby', activeTab.id || 'leaderboardTitle');

    list.innerHTML = '';
    empty.hidden = board.length > 0;

    const medals = ['🥇', '🥈', '🥉'];
    board.forEach((entry, index) => {
        const item = document.createElement('li');
        item.className = 'leaderboard-row';
        item.style.setProperty('--i', index);
        if (entry.playerName === settings.playerName) item.classList.add('me');
        if (gameState.record && entry.id === gameState.record.id) item.classList.add('latest');

        const rank = document.createElement('span');
        rank.className = 'lb-rank';
        rank.textContent = medals[entry.rank - 1] || `${entry.rank}`;
        rank.setAttribute('aria-label', `${entry.rank}위`);

        const info = document.createElement('div');
        info.className = 'lb-info';
        const name = document.createElement('span');
        name.className = 'lb-name';
        name.textContent = entry.playerName;
        const meta = document.createElement('span');
        meta.className = 'lb-meta';
        meta.textContent = `${getModeText(entry.mode, entry.category, entry.difficulty)} · ${formatDate(entry.timestamp)}`;
        info.appendChild(name);
        info.appendChild(meta);

        const score = document.createElement('div');
        score.className = 'lb-score';
        const points = document.createElement('strong');
        points.textContent = `${entry.totalScore}점`;
        const accuracy = document.createElement('span');
        accuracy.textContent = `정답률 ${entry.accuracy}%`;
        score.appendChild(points);
        score.appendChild(accuracy);

        item.appendChild(rank);
        item.appendChild(info);
        item.appendChild(score);
        list.appendChild(item);
    });
}

function formatDate(timestamp, withTime = true) {
    const date = new Date(timestamp);
    const pad = n => String(n).padStart(2, '0');
    const day = `${date.getMonth() + 1}/${date.getDate()}`;
    return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

// ===== 개인 대시보드 =====

function openDashboard() {
    returnScreen = getActiveScreenId();
    renderDashboard();
    showScreen('dashboardScreen');
}

function renderDashboard() {
    const stats = dataManager.getStats(settings.playerName);
    const hasData = stats.playCount > 0;

    document.getElementById('dashboardPlayer').textContent = `플레이어: ${settings.playerName}`;
    document.getElementById('statPlayCount').textContent = `${stats.playCount}회`;
    document.getElementById('statBestScore').textContent = `${stats.bestScore}점`;
    document.getElementById('statAccuracy').textContent = `${stats.averageAccuracy}%`;
    document.getElementById('statCorrect').textContent = `${stats.totalCorrect} / ${stats.totalQuestions}`;

    document.getElementById('dashboardBody').hidden = !hasData;
    document.getElementById('dashboardEmpty').hidden = hasData;
    document.getElementById('clearHistoryBtn').disabled = !hasData;
    if (!hasData) return;

    // 카테고리 순서를 고정해 매번 같은 위치에 표시
    const orderedStats = {};
    CATEGORIES.forEach(cat => {
        if (stats.categoryAccuracy[cat]) orderedStats[cat] = stats.categoryAccuracy[cat];
    });
    renderCategoryBars(document.getElementById('dashboardCategories'), orderedStats);

    const recent = stats.history.slice(-CHART_GAMES);
    renderGrowthChart(recent);
    renderHistoryTable(recent.slice().reverse());
}

function renderHistoryTable(games) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    games.forEach(game => {
        const row = document.createElement('tr');
        const modeLabel = game.category ? `${GAME_MODES[game.mode].label} · ${game.category}` : GAME_MODES[game.mode].label;
        [formatDate(game.timestamp), modeLabel, DIFFICULTY_LABELS[game.difficulty], `${game.totalScore}점`, `${game.accuracy}%`]
            .forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });
        tbody.appendChild(row);
    });
}

// 시간순 점수/정답률 꺾은선 그래프 (SVG). 마우스·터치·키보드로 각 게임 값을 확인할 수 있음
function renderGrowthChart(games) {
    const container = document.getElementById('growthChart');
    container.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const width = 640;
    const height = 240;
    const pad = { top: 16, right: 16, bottom: 28, left: 44 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const isAccuracy = chartMetric === 'accuracy';
    const values = games.map(g => g[chartMetric]);
    const unit = isAccuracy ? '%' : '점';
    const maxValue = isAccuracy ? 100 : niceMax(Math.max(...values, 10));

    const x = i => pad.left + (games.length === 1 ? plotW / 2 : (i / (games.length - 1)) * plotW);
    const y = v => pad.top + plotH - (v / maxValue) * plotH;

    const make = (tag, attrs = {}) => {
        const el = document.createElementNS(svgNS, tag);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        return el;
    };

    const svg = make('svg', {
        viewBox: `0 0 ${width} ${height}`,
        class: 'growth-chart',
        role: 'img',
        'aria-label': `최근 ${games.length}게임 ${isAccuracy ? '정답률' : '점수'} 추이. `
            + `처음 ${values[0]}${unit}, 마지막 ${values[values.length - 1]}${unit}, 최고 ${Math.max(...values)}${unit}`
    });

    // 격자와 y축 눈금 (4등분)
    for (let i = 0; i <= 4; i++) {
        const value = (maxValue / 4) * i;
        svg.appendChild(make('line', {
            x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value),
            class: i === 0 ? 'chart-baseline' : 'chart-grid'
        }));
        const label = make('text', { x: pad.left - 8, y: y(value) + 4, class: 'chart-axis', 'text-anchor': 'end' });
        label.textContent = `${Math.round(value)}${isAccuracy ? '%' : ''}`;
        svg.appendChild(label);
    }

    // x축: 처음과 마지막 게임 날짜
    [[0, 'start'], [games.length - 1, 'end']].forEach(([index, anchor]) => {
        if (games.length === 1 && anchor === 'end') return;
        const label = make('text', {
            x: x(index), y: height - 8, class: 'chart-axis',
            'text-anchor': games.length === 1 ? 'middle' : anchor
        });
        label.textContent = formatDate(games[index].timestamp, false);
        svg.appendChild(label);
    });

    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.appendChild(make('polyline', { points, class: 'chart-line' }));

    const crosshair = make('line', { y1: pad.top, y2: pad.top + plotH, class: 'chart-crosshair' });
    svg.appendChild(crosshair);

    const dots = values.map((v, i) => {
        const dot = make('circle', { cx: x(i), cy: y(v), r: 4, class: 'chart-dot' });
        svg.appendChild(dot);
        return dot;
    });

    // 툴팁
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');

    const showPoint = (index) => {
        const game = games[index];
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        crosshair.setAttribute('x1', x(index));
        crosshair.setAttribute('x2', x(index));
        crosshair.classList.add('show');

        tooltip.innerHTML = '';
        const value = document.createElement('strong');
        value.textContent = `${values[index]}${unit}`;
        const detail = document.createElement('span');
        const modeLabel = game.category ? game.category : GAME_MODES[game.mode].label;
        detail.textContent = `${formatDate(game.timestamp)} · ${modeLabel} · ${DIFFICULTY_LABELS[game.difficulty]}`;
        tooltip.appendChild(value);
        tooltip.appendChild(detail);

        const rect = svg.getBoundingClientRect();
        const left = (x(index) / width) * rect.width;
        const top = (y(values[index]) / height) * rect.height;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.classList.toggle('flip', left > rect.width * 0.6);
        tooltip.classList.add('show');
    };
    const hidePoint = () => {
        tooltip.classList.remove('show');
        crosshair.classList.remove('show');
        dots.forEach(dot => dot.classList.remove('active'));
    };
    // 포인터 위치에서 가장 가까운 게임으로 맞춤
    const nearestIndex = (clientX) => {
        const rect = svg.getBoundingClientRect();
        const svgX = ((clientX - rect.left) / rect.width) * width;
        let best = 0;
        values.forEach((_, i) => {
            if (Math.abs(x(i) - svgX) < Math.abs(x(best) - svgX)) best = i;
        });
        return best;
    };

    let focusedIndex = values.length - 1;
    svg.addEventListener('pointermove', e => showPoint(nearestIndex(e.clientX)));
    svg.addEventListener('pointerleave', hidePoint);

    // 키보드: 그래프에 포커스 후 ←→로 게임 이동
    const chartFocus = document.createElement('div');
    chartFocus.className = 'chart-focus';
    chartFocus.tabIndex = 0;
    chartFocus.setAttribute('aria-label', '성장 그래프. 좌우 화살표로 게임별 값을 확인합니다');
    chartFocus.addEventListener('focus', () => showPoint(focusedIndex));
    chartFocus.addEventListener('blur', hidePoint);
    chartFocus.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        focusedIndex = Math.max(0, Math.min(values.length - 1, focusedIndex + (e.key === 'ArrowRight' ? 1 : -1)));
        showPoint(focusedIndex);
        const game = games[focusedIndex];
        announce(`${formatDate(game.timestamp)} ${values[focusedIndex]}${unit}`);
    });

    chartFocus.appendChild(svg);
    container.appendChild(chartFocus);
    container.appendChild(tooltip);
}

// 축 최댓값을 보기 좋은 수(1, 2, 2.5, 5 × 10ⁿ의 4배수)로 올림
function niceMax(value) {
    const raw = value / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= raw);
    return step * 4;
}

function setChartMetric(metric) {
    chartMetric = metric;
    metricButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.metric === metric)));
    renderDashboard();
}

function clearMyHistory() {
    if (!confirm(`'${settings.playerName}'의 기록을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    dataManager.clearHistory(settings.playerName);
    renderDashboard();
    showToast('기록을 삭제했습니다');
}

function goBack() {
    showScreen(returnScreen === 'resultScreen' && gameState.result ? 'resultScreen' : 'startScreen');
}

// ===== 설정 (닉네임·난이도·테마·효과음) =====

function savePlayerName() {
    const name = playerNameInput.value.trim() || DEFAULT_PLAYER_NAME;
    playerNameInput.value = name === DEFAULT_PLAYER_NAME ? '' : name;
    settings = dataManager.saveSettings({ playerName: name });
}

function getEffectiveTheme() {
    if (settings.theme) return settings.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
    const theme = getEffectiveTheme();
    if (settings.theme) {
        document.documentElement.dataset.theme = settings.theme;
    } else {
        delete document.documentElement.dataset.theme;
    }
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.title = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
}

function toggleTheme() {
    settings = dataManager.saveSettings({ theme: getEffectiveTheme() === 'dark' ? 'light' : 'dark' });
    applyTheme();
}

function applySound() {
    soundToggle.textContent = settings.sound ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-pressed', String(settings.sound));
    soundToggle.title = settings.sound ? '효과음 끄기' : '효과음 켜기';
}

function toggleSound() {
    settings = dataManager.saveSettings({ sound: !settings.sound });
    applySound();
    if (settings.sound) {
        sound.unlock();
        sound.play('correct');
    }
}

// Web Audio로 만든 짧은 효과음 (파일 없이 동작)
const sound = {
    context: null,

    // 브라우저 자동재생 정책 때문에 사용자 조작 시점에 AudioContext를 생성
    unlock() {
        if (!settings.sound || this.context) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) this.context = new AudioContextClass();
    },

    play(name) {
        if (!settings.sound) return;
        this.unlock();
        if (!this.context) return;
        const tones = {
            correct: [[660, 0], [880, 0.09]],
            incorrect: [[220, 0], [180, 0.12]],
            record: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]]
        }[name];
        tones.forEach(([frequency, delay]) => this.tone(frequency, delay, name === 'incorrect' ? 'square' : 'sine'));
    },

    tone(frequency, delay, type) {
        const ctx = this.context;
        const start = ctx.currentTime + delay;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(type === 'square' ? 0.06 : 0.15, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
    }
};

function initSettings() {
    playerNameInput.value = settings.playerName === DEFAULT_PLAYER_NAME ? '' : settings.playerName;
    difficultyInputs.forEach(input => { input.checked = input.value === settings.difficulty; });
    applyTheme();
    applySound();
    updateModeAvailability();
}

// ===== 이벤트 리스너 =====

// 닉네임 입력 직후 바로 시작해도 이름이 반영되도록 시작 전에 저장
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        savePlayerName();
        initGame(btn.dataset.mode);
    });
});

categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        savePlayerName();
        initGame('category', btn.dataset.category);
    });
});

difficultyInputs.forEach(input => {
    input.addEventListener('change', () => {
        settings = dataManager.saveSettings({ difficulty: input.value });
        updateModeAvailability();
    });
});

playerNameInput.addEventListener('change', savePlayerName);
playerNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') playerNameInput.blur();
});

nextBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', restartGame);
retryBtn.addEventListener('click', () => initGame(gameState.mode, gameState.selectedCategory, gameState.difficulty));
shareBtn.addEventListener('click', shareResult);
hintBtn.addEventListener('click', useHint);
pauseBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', resumeGame);
quitBtn.addEventListener('click', restartGame);

themeToggle.addEventListener('click', toggleTheme);
soundToggle.addEventListener('click', toggleSound);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

document.getElementById('leaderboardBtn').addEventListener('click', openLeaderboard);
document.getElementById('resultLeaderboardBtn').addEventListener('click', openLeaderboard);
document.getElementById('dashboardBtn').addEventListener('click', openDashboard);
document.getElementById('clearHistoryBtn').addEventListener('click', clearMyHistory);
document.querySelectorAll('.back-btn').forEach(btn => btn.addEventListener('click', goBack));

boardTabs.forEach((tab, index) => {
    tab.id = `tab-${tab.dataset.period}`;
    tab.addEventListener('click', () => setBoardPeriod(tab.dataset.period));
    // 탭 목록: ←→/Home/End로 이동 (WAI-ARIA 탭 패턴)
    tab.addEventListener('keydown', e => {
        const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: boardTabs.length - 1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        const next = (keys[e.key] + boardTabs.length) % boardTabs.length;
        setBoardPeriod(boardTabs[next].dataset.period, { focusTab: true });
    });
});
boardModeSelect.addEventListener('change', renderLeaderboard);
boardDifficultySelect.addEventListener('change', renderLeaderboard);
metricButtons.forEach(btn => btn.addEventListener('click', () => setChartMetric(btn.dataset.metric)));

// 다른 탭으로 이동하면 자동 일시정지
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
});

// 보기 사이를 ↑↓(←→)로 이동 (제거된 보기는 건너뜀)
function moveOptionFocus(direction) {
    const buttons = [...document.querySelectorAll('.option-btn:not(:disabled)')];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement);
    const next = current === -1
        ? (direction > 0 ? 0 : buttons.length - 1)
        : (current + direction + buttons.length) % buttons.length;
    buttons[next].focus();
}

// 키보드 단축키 지원 (한글 입력 상태에서도 동작하도록 e.code 사용)
document.addEventListener('keydown', (e) => {
    const activeScreen = getActiveScreenId();

    // 순위표·대시보드에서 Esc로 돌아가기
    if (activeScreen === 'leaderboardScreen' || activeScreen === 'dashboardScreen') {
        if (e.key === 'Escape') goBack();
        return;
    }

    if (activeScreen !== 'quizScreen') return;

    if (feedbackModal.classList.contains('show')) {
        // Enter 키로 다음 문제
        if (e.key === 'Enter') {
            e.preventDefault();
            nextQuestion();
        } else if (e.key === 'Tab') {
            e.preventDefault(); // 모달 안에 포커스 유지
            nextBtn.focus();
        }
        return;
    }

    if (e.code === 'KeyP' || e.key === 'Escape') {
        togglePause();
        return;
    }

    if (gameState.isPaused) {
        // 일시정지 대화상자 안에서만 Tab 이동
        if (e.key === 'Tab') {
            e.preventDefault();
            (document.activeElement === resumeBtn ? quitBtn : resumeBtn).focus();
        }
        return;
    }

    if (gameState.isAnswered) return;

    if (e.code === 'KeyH') {
        useHint();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        moveOptionFocus(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveOptionFocus(-1);
    } else if (e.key >= '1' && e.key <= '4') {
        // 1-4 숫자키로 답변 선택 (힌트로 제거된 선택지는 무시)
        const index = parseInt(e.key) - 1;
        const button = document.querySelectorAll('.option-btn')[index];
        if (button && !button.disabled) {
            handleAnswer(index);
        }
    }
});

initSettings();
