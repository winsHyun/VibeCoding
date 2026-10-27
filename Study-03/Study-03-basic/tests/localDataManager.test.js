// 실행: node tests/localDataManager.test.js
const assert = require('node:assert/strict');
const { LocalDataManager } = require('../localDataManager.js');

// 브라우저 localStorage를 흉내 내는 메모리 저장소 (새로고침 = 같은 저장소로 새 인스턴스 생성)
class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}

function game(overrides = {}) {
    return {
        playerName: '민수',
        mode: 'category',
        category: '과학',
        difficulty: 'all',
        totalScore: 100,
        correctAnswers: 7,
        totalQuestions: 10,
        accuracy: 70,
        categoryStats: { '과학': { correct: 7, total: 10 } },
        ...overrides
    };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('게임 결과를 저장하고 timestamp·id를 붙인다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    const now = new Date('2026-10-25T10:00:00');
    const { record, saved } = dm.saveGameResult(game(), now);
    assert.equal(saved, true);
    assert.equal(record.timestamp, now.toISOString());
    assert.ok(record.id);
    assert.equal(dm.getGameHistory().length, 1);
});

test('새로고침(새 인스턴스) 후에도 기록이 유지된다', () => {
    const storage = new MemoryStorage();
    new LocalDataManager(storage).saveGameResult(game({ totalScore: 80 }));
    const reloaded = new LocalDataManager(storage);
    assert.equal(reloaded.getGameHistory()[0].totalScore, 80);
});

test('기록이 없으면 최고 점수는 0 (-Infinity가 아님)', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    assert.equal(dm.getBestScore(), 0);
});

test('최고 점수는 조건(플레이어·모드)별로 계산된다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    dm.saveGameResult(game({ totalScore: 90 }));
    dm.saveGameResult(game({ totalScore: 150 }));
    dm.saveGameResult(game({ totalScore: 400, mode: 'full', category: null }));
    dm.saveGameResult(game({ totalScore: 999, playerName: '지영' }));
    assert.equal(dm.getBestScore({ playerName: '민수', mode: 'category' }), 150);
    assert.equal(dm.getBestScore({ playerName: '민수' }), 400);
    assert.equal(dm.getBestScore(), 999);
});

test('순위: 점수 → 정답률 → 먼저 달성한 순, 플레이어당 최고 기록 1개', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    dm.saveGameResult(game({ playerName: 'A', totalScore: 100, accuracy: 60 }), new Date('2026-10-20T09:00:00'));
    dm.saveGameResult(game({ playerName: 'B', totalScore: 100, accuracy: 80 }), new Date('2026-10-20T10:00:00'));
    dm.saveGameResult(game({ playerName: 'C', totalScore: 100, accuracy: 60 }), new Date('2026-10-20T11:00:00'));
    dm.saveGameResult(game({ playerName: 'A', totalScore: 50, accuracy: 90 }), new Date('2026-10-20T12:00:00'));
    dm.saveGameResult(game({ playerName: 'D', totalScore: 120, accuracy: 50 }), new Date('2026-10-20T13:00:00'));

    const board = dm.getLeaderboard();
    assert.deepEqual(board.map(r => [r.rank, r.playerName, r.totalScore]), [
        [1, 'D', 120], [2, 'B', 100], [3, 'A', 100], [4, 'C', 100]
    ]);
});

test('순위표는 상위 10명만 보여준다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    for (let i = 1; i <= 15; i++) dm.saveGameResult(game({ playerName: `P${i}`, totalScore: i * 10 }));
    const board = dm.getLeaderboard();
    assert.equal(board.length, 10);
    assert.equal(board[0].playerName, 'P15');
    assert.equal(board[9].playerName, 'P6');
});

test('오늘·이번 주(월요일 시작)·카테고리별 순위표를 구분한다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    const now = new Date('2026-10-25T15:00:00'); // 일요일
    dm.saveGameResult(game({ playerName: '오늘', category: '과학' }), new Date('2026-10-25T08:00:00'));
    dm.saveGameResult(game({ playerName: '월요일', category: '한국사' }), new Date('2026-10-19T00:30:00'));
    dm.saveGameResult(game({ playerName: '지난주', category: '과학' }), new Date('2026-10-18T23:00:00'));

    const boards = dm.getLeaderboards(['한국사', '과학'], now);
    assert.deepEqual(boards.daily.map(r => r.playerName), ['오늘']);
    assert.deepEqual(boards.weekly.map(r => r.playerName).sort(), ['오늘', '월요일'].sort());
    assert.equal(boards.allTime.length, 3);
    assert.deepEqual(boards.byCategory['과학'].map(r => r.playerName).sort(), ['오늘', '지난주'].sort());
    assert.deepEqual(boards.byCategory['한국사'].map(r => r.playerName), ['월요일']);
});

test('getRank는 같은 모드·카테고리·난이도 안에서 순위를 돌려준다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    dm.saveGameResult(game({ playerName: 'A', totalScore: 200 }));
    dm.saveGameResult(game({ playerName: 'B', totalScore: 500, difficulty: 'hard' }));
    const { record } = dm.saveGameResult(game({ playerName: 'C', totalScore: 150 }));
    assert.deepEqual(dm.getRank(record), { rank: 2, total: 2 });

    // 자기 최고 기록이 아닌 기록은 순위표에 없음
    const { record: worse } = dm.saveGameResult(game({ playerName: 'C', totalScore: 10 }));
    assert.equal(dm.getRank(worse), null);
});

test('통계: 플레이 횟수, 평균·카테고리별 정답률, 시간순 기록', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    dm.saveGameResult(game({
        totalScore: 300, correctAnswers: 6, totalQuestions: 8, mode: 'full', category: null,
        categoryStats: { '과학': { correct: 3, total: 4 }, '한국사': { correct: 3, total: 4 } }
    }), new Date('2026-10-24T10:00:00'));
    dm.saveGameResult(game({
        totalScore: 100, correctAnswers: 1, totalQuestions: 4,
        categoryStats: { '과학': { correct: 1, total: 4 } }
    }), new Date('2026-10-23T10:00:00'));
    dm.saveGameResult(game({ playerName: '남' }));

    const stats = dm.getStats('민수');
    assert.equal(stats.playCount, 2);
    assert.equal(stats.bestScore, 300);
    assert.equal(stats.averageAccuracy, 58); // 7 / 12
    assert.deepEqual(stats.categoryAccuracy['과학'], { correct: 4, total: 8, accuracy: 50 });
    assert.deepEqual(stats.categoryAccuracy['한국사'], { correct: 3, total: 4, accuracy: 75 });
    assert.deepEqual(stats.history.map(h => h.totalScore), [100, 300]);
});

test('손상된 데이터나 저장소 오류가 있어도 앱이 멈추지 않는다', () => {
    const storage = new MemoryStorage();
    storage.setItem('gameHistory', '{깨진 JSON');
    const dm = new LocalDataManager(storage);
    assert.deepEqual(dm.getGameHistory(), []);

    const broken = new LocalDataManager({
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('QuotaExceededError'); }
    });
    assert.deepEqual(broken.getGameHistory(), []);
    assert.equal(broken.saveGameResult(game()).saved, false);
    assert.equal(broken.getSettings().playerName, '플레이어');
});

test('기록은 최대 500개까지 보관한다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    for (let i = 0; i < 505; i++) dm.saveGameResult(game({ totalScore: i }));
    const history = dm.getGameHistory();
    assert.equal(history.length, 500);
    assert.equal(history[0].totalScore, 5);
});

test('특정 플레이어 기록만 초기화할 수 있다', () => {
    const dm = new LocalDataManager(new MemoryStorage());
    dm.saveGameResult(game({ playerName: 'A' }));
    dm.saveGameResult(game({ playerName: 'B' }));
    dm.clearHistory('A');
    assert.deepEqual(dm.getGameHistory().map(h => h.playerName), ['B']);
});

test('설정은 기본값과 합쳐서 저장·복원된다', () => {
    const storage = new MemoryStorage();
    new LocalDataManager(storage).saveSettings({ playerName: '지영', theme: 'dark' });
    const settings = new LocalDataManager(storage).getSettings();
    assert.equal(settings.playerName, '지영');
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.difficulty, 'all');
});

let failed = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (error) {
        failed++;
        console.log(`❌ ${name}\n   ${error.message}`);
    }
}
console.log(`\n${tests.length - failed} / ${tests.length} 통과`);
process.exit(failed > 0 ? 1 : 0);
