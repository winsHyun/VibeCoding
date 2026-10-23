// 작성일시: 2026-10-23 16:33
// 점수 계산 및 결과 분석 로직 (DOM에 의존하지 않으므로 Node에서도 테스트 가능)

class ScoreManager {
    static BASE_SCORE = 10;
    static TIME_BONUS = 3;
    static TIME_BONUS_LIMIT = 10; // 이 시간(초) 미만에 맞히면 시간 보너스
    static NO_HINT_BONUS = 2;

    // 연속 정답 콤보 보너스 (현재 문제를 포함한 연속 정답 수 기준)
    // 3~4연속: +3, 5~9연속: +5, 10연속 이상: +10
    getConsecutiveBonus(consecutiveCorrect) {
        if (consecutiveCorrect >= 10) return 10;
        if (consecutiveCorrect >= 5) return 5;
        if (consecutiveCorrect >= 3) return 3;
        return 0;
    }

    // 항목별 점수 내역 (피드백 화면 표시용)
    getScoreBreakdown(isCorrect, timeSpent, consecutiveCorrect, hintUsed) {
        const breakdown = { base: 0, time: 0, noHint: 0, combo: 0, total: 0 };
        if (!isCorrect) return breakdown;

        breakdown.base = ScoreManager.BASE_SCORE;
        if (timeSpent < ScoreManager.TIME_BONUS_LIMIT) breakdown.time = ScoreManager.TIME_BONUS;
        if (!hintUsed) breakdown.noHint = ScoreManager.NO_HINT_BONUS;
        breakdown.combo = this.getConsecutiveBonus(consecutiveCorrect);
        breakdown.total = breakdown.base + breakdown.time + breakdown.noHint + breakdown.combo;
        return breakdown;
    }

    calculateScore(isCorrect, timeSpent, consecutiveCorrect, hintUsed) {
        return this.getScoreBreakdown(isCorrect, timeSpent, consecutiveCorrect, hintUsed).total;
    }

    // 답변 기록으로 상세 결과 데이터 생성
    // answers: [{ category, isCorrect, timeSpent, points }]
    summarize(answers, totalQuestions = answers.length) {
        const categoryStats = {};
        let totalScore = 0;
        let correctAnswers = 0;
        let totalTime = 0;
        let streak = 0;
        let longestStreak = 0;

        for (const answer of answers) {
            if (!categoryStats[answer.category]) {
                categoryStats[answer.category] = { correct: 0, total: 0 };
            }
            categoryStats[answer.category].total++;
            totalScore += answer.points;
            totalTime += answer.timeSpent;

            if (answer.isCorrect) {
                correctAnswers++;
                categoryStats[answer.category].correct++;
                streak++;
                longestStreak = Math.max(longestStreak, streak);
            } else {
                streak = 0;
            }
        }

        const accuracy = totalQuestions > 0
            ? Math.round((correctAnswers / totalQuestions) * 100)
            : 0;
        const averageResponseTime = answers.length > 0
            ? Math.round((totalTime / answers.length) * 10) / 10
            : 0;

        return {
            totalScore,
            correctAnswers,
            totalQuestions,
            accuracy,
            categoryStats,
            averageResponseTime,
            longestStreak
        };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { ScoreManager };
}
