// 게임 기록 저장, 순위표, 통계 계산 (localStorage 기반)
// storage를 주입받으므로 Node에서도 가짜 저장소로 테스트 가능

class LocalDataManager {
    static HISTORY_KEY = 'gameHistory';
    static SETTINGS_KEY = 'quizSettings';
    static MAX_HISTORY = 500; // 오래된 기록부터 삭제
    static DEFAULT_SETTINGS = {
        playerName: '플레이어',
        difficulty: 'all',
        theme: null, // null이면 시스템 설정을 따름
        sound: false
    };

    constructor(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
        this.storage = storage;
    }

    // 저장소 접근은 시크릿 모드·용량 초과 등으로 실패할 수 있으므로 항상 감싼다
    readJSON(key, fallback) {
        try {
            const raw = this.storage ? this.storage.getItem(key) : null;
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    writeJSON(key, value) {
        try {
            if (!this.storage) return false;
            this.storage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    // ===== 게임 기록 =====

    getGameHistory() {
        const history = this.readJSON(LocalDataManager.HISTORY_KEY, []);
        if (!Array.isArray(history)) return [];
        return history.filter(h => h && typeof h.totalScore === 'number' && h.timestamp);
    }

    // 저장된 기록을 반환 (저장 실패 시에도 기록 객체는 반환하고 saved로 알림)
    saveGameResult(result, now = new Date()) {
        const history = this.getGameHistory();
        const record = {
            ...result,
            id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: now.toISOString()
        };
        history.push(record);
        const trimmed = history.slice(-LocalDataManager.MAX_HISTORY);
        const saved = this.writeJSON(LocalDataManager.HISTORY_KEY, trimmed);
        return { record, saved };
    }

    // playerName이 있으면 그 플레이어 기록만, 없으면 전체 삭제
    clearHistory(playerName = null) {
        const remaining = playerName === null
            ? []
            : this.getGameHistory().filter(h => h.playerName !== playerName);
        return this.writeJSON(LocalDataManager.HISTORY_KEY, remaining);
    }

    // filter: { playerName, mode, category, difficulty, since(Date) } - 빈 값은 조건 없음
    filterHistory(filter = {}, history = this.getGameHistory()) {
        const { playerName, mode, category, difficulty, since } = filter;
        return history.filter(h =>
            (!playerName || h.playerName === playerName)
            && (!mode || h.mode === mode)
            && (!category || h.category === category)
            && (!difficulty || h.difficulty === difficulty)
            && (!since || new Date(h.timestamp) >= since)
        );
    }

    getBestScore(filter = {}) {
        const scores = this.filterHistory(filter).map(h => h.totalScore);
        return scores.length > 0 ? Math.max(...scores) : 0;
    }

    // ===== 순위표 =====

    // 기간 시작 시각 (로컬 시간 기준). daily: 오늘 0시, weekly: 이번 주 월요일 0시
    static periodStart(period, now = new Date()) {
        if (period === 'daily') {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        if (period === 'weekly') {
            const daysSinceMonday = (now.getDay() + 6) % 7;
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
        }
        return null;
    }

    // 점수 높은 순 → 정답률 높은 순 → 먼저 달성한 순
    static compareRecords(a, b) {
        return b.totalScore - a.totalScore
            || b.accuracy - a.accuracy
            || new Date(a.timestamp) - new Date(b.timestamp);
    }

    // 플레이어마다 가장 좋은 기록 1개만 남겨 순위를 매긴다 (상위 limit명)
    getLeaderboard({ period = 'allTime', mode, category, difficulty, limit = 10, now = new Date() } = {}) {
        const since = LocalDataManager.periodStart(period, now);
        const sorted = this.filterHistory({ mode, category, difficulty, since })
            .sort(LocalDataManager.compareRecords);

        const seen = new Set();
        const ranked = [];
        for (const record of sorted) {
            if (seen.has(record.playerName)) continue;
            seen.add(record.playerName);
            ranked.push({ rank: ranked.length + 1, ...record });
        }
        return limit ? ranked.slice(0, limit) : ranked;
    }

    getLeaderboards(categories, now = new Date()) {
        const byCategory = {};
        for (const category of categories) {
            byCategory[category] = this.getLeaderboard({ mode: 'category', category, now });
        }
        return {
            daily: this.getLeaderboard({ period: 'daily', now }),
            weekly: this.getLeaderboard({ period: 'weekly', now }),
            allTime: this.getLeaderboard({ now }),
            byCategory
        };
    }

    // 기록이 순위표(전체 기간, 같은 모드·카테고리·난이도)에서 몇 위인지. 순위권 밖이면 null
    getRank(record) {
        const board = this.getLeaderboard({
            mode: record.mode,
            category: record.category,
            difficulty: record.difficulty,
            limit: 0
        });
        const entry = board.find(r => r.id === record.id);
        return entry ? { rank: entry.rank, total: board.length } : null;
    }

    // ===== 통계 =====

    getStats(playerName) {
        const history = this.filterHistory({ playerName })
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const categoryAccuracy = {};
        let totalCorrect = 0;
        let totalQuestions = 0;

        for (const game of history) {
            totalCorrect += game.correctAnswers;
            totalQuestions += game.totalQuestions;
            for (const [category, stats] of Object.entries(game.categoryStats || {})) {
                if (!categoryAccuracy[category]) categoryAccuracy[category] = { correct: 0, total: 0 };
                categoryAccuracy[category].correct += stats.correct;
                categoryAccuracy[category].total += stats.total;
            }
        }
        for (const stats of Object.values(categoryAccuracy)) {
            stats.accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        }

        return {
            playCount: history.length,
            bestScore: history.length > 0 ? Math.max(...history.map(h => h.totalScore)) : 0,
            averageAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
            totalCorrect,
            totalQuestions,
            categoryAccuracy,
            history // 오래된 순
        };
    }

    // ===== 설정 =====

    getSettings() {
        const saved = this.readJSON(LocalDataManager.SETTINGS_KEY, {});
        return { ...LocalDataManager.DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
    }

    saveSettings(partial) {
        const settings = { ...this.getSettings(), ...partial };
        this.writeJSON(LocalDataManager.SETTINGS_KEY, settings);
        return settings;
    }
}

if (typeof module !== 'undefined') {
    module.exports = { LocalDataManager };
}
