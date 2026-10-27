---
description: 선생님 모드 1단계 - 학생들이 내보낸 플레이 기록 파일을 하나로 합치고 검사해 학급 데이터를 만듦
argument-hint: "[기록 파일 또는 폴더] (비어 있으면 teacher-data/raw/)"
---
<!-- 작성일시: 2026-10-25 12:46 -->

학생들이 내보낸 퀴즈 플레이 기록을 모아 하나의 학급 데이터로 만들어줘.

## 입력값
- 입력 경로: `$0` (앞뒤 공백과 따옴표를 제거한 뒤 사용한다. 비어 있으면 `teacher-data/raw/`)
- 경로가 파일이면 그 파일 하나만, 폴더면 폴더 안의 `.json` 파일을 모두 읽는다. (하위 폴더는 읽지 않는다)
- 경로가 없거나 `.json` 파일이 하나도 없으면 실행하지 말고, 아래 "학생 기록 내보내는 방법"을 보여준 뒤 멈춘다.

## 학생 기록 내보내는 방법 (안내용)
1. 학생이 퀴즈 게임 페이지에서 개발자 도구(F12) → Console을 연다.
2. `copy(localStorage.getItem('gameHistory'))`를 입력하면 기록이 클립보드에 복사된다.
3. 메모장에 붙여 넣어 `학생이름.json`으로 저장한다. (예: `김민수.json`)
4. 선생님이 파일을 모두 `teacher-data/raw/` 폴더에 넣고 `/teacher-collect`를 실행한다.
- 여러 학생이 한 컴퓨터·한 브라우저에서 닉네임만 바꿔 플레이했다면 파일 하나에 여러 학생 기록이 들어 있다. 이 경우도 그대로 처리한다.
- (선택) `teacher-data/roster.txt`에 학급 학생 이름을 한 줄에 하나씩 적어 두면, 기록이 없는 학생을 찾아 준다.

## 공통 기준 (모든 teacher-* 명령이 따른다)
### 데이터
- 학급 데이터: `teacher-data/class-history.json` (이 명령이 만든다. 다른 teacher-* 명령은 이 파일만 읽는다)
- 기록 한 개의 필드는 `localDataManager.js`의 `saveGameResult`가 저장하는 형식과 같다: `id`, `playerName`, `mode`(full/category/speed), `category`, `difficulty`(all/easy/medium/hard), `totalScore`, `correctAnswers`, `totalQuestions`, `accuracy`, `categoryStats`, `averageResponseTime`, `longestStreak`, `hintsUsed`, `timestamp`
- 이 명령은 학생 이름이 정리된 `playerName`을 덮어쓰고, 원래 값은 `originalPlayerName`, 읽어 온 파일 이름은 `sourceFile`에 남긴다.
- 숫자가 앱과 똑같이 나오도록, 계산할 때는 **`localDataManager.js`의 `LocalDataManager`를 그대로 불러와** 쓴다. 메모리 저장소 객체(`getItem`/`setItem`)에 학급 데이터를 `gameHistory`로 넣고 `getStats`, `filterHistory`, `getLeaderboard`를 호출한다. (`tests/localDataManager.test.js`의 `MemoryStorage` 참고)

### 지표 정의
| 지표 | 계산 방법 |
|------|-----------|
| 평균 정답률 | 누적 정답 수 ÷ 누적 문제 수 × 100, 반올림 (`getStats.averageAccuracy`와 같음. 게임별 정답률의 평균이 아님) |
| 카테고리 정답률 | 모든 게임의 `categoryStats`를 카테고리별로 합산한 정답 ÷ 문제 (`getStats.categoryAccuracy`) |
| 난이도 정답률 | `difficulty`가 easy/medium/hard인 게임만 합산. `all`로 플레이한 게임은 난이도별로 나눌 수 없어 제외 |
| 추세 | 학생마다 처음 5게임과 최근 5게임의 평균 정답률 차이(%p). 10게임 미만이면 앞뒤 절반씩 비교하고, 4게임 미만이면 "판단 보류" |
| 힌트 사용률 | 누적 `hintsUsed` ÷ (게임 수 × 3) × 100 (게임당 힌트 3개, `script.js`의 `HINTS_PER_GAME`) |
| 점수 | 모드마다 문제 수가 달라(전체 40, 카테고리 10, 스피드 20) **같은 모드·카테고리·난이도끼리만** 비교한다. 학생 간 실력 비교의 기본 지표는 정답률이다 |

### 표본 기준
- 문제 수 합계가 10문제 미만인 카테고리·난이도 정답률에는 "(표본 적음)"을 붙이고, 약점 판단에 쓰지 않는다.
- 플레이 수가 3회 미만인 학생은 순위·비교 표에는 넣되 "(기록 적음)"을 붙인다.

### 기간 값 (overview, compare, weakness, report, mode에서 공통)
- `all`(기본값): 전체 기간
- `week`: 이번 주 월요일 0시부터 (`LocalDataManager.periodStart('weekly')`)
- `today`: 오늘 0시부터
- `YYYY-MM-DD~YYYY-MM-DD`: 시작일 0시부터 종료일 24시 전까지 (로컬 시간)
- 위 형식이 아니면 실행하지 말고 사용 예를 보여준다.

## 작업 순서
1. **읽기**: 파일마다 JSON을 읽는다. 배열이 아니거나 JSON이 깨진 파일은 건너뛰고 파일 이름과 오류 메시지를 적는다.
2. **학생 이름 정리** (기록마다)
   - `playerName`의 앞뒤 공백을 제거한다.
   - `playerName`이 비어 있거나 기본값 `플레이어`(`LocalDataManager.DEFAULT_SETTINGS.playerName`)이면, 파일 이름(확장자 제외)을 학생 이름으로 쓴다. 이 경우 바꾼 기록 수를 보고한다.
   - 대소문자만 다르거나 공백만 다른 이름(예: `민수`와 `민 수`)은 **자동으로 합치지 않고** "확인 필요"로 보고한다.
3. **중복 제거**: `id`가 같은 기록은 하나만 남긴다. `id`가 없으면 `playerName`+`timestamp`+`totalScore`가 같은 기록을 중복으로 본다. (같은 파일을 두 번 넣었거나 한 브라우저 기록을 두 학생이 각각 내보낸 경우)
4. **이상 기록 검사**: 아래에 해당하는 기록은 학급 데이터에서 빼고, 이유와 함께 `teacher-data/excluded.json`에 저장한다.
   - 필수 필드 누락 (`playerName`, `mode`, `totalScore`, `correctAnswers`, `totalQuestions`, `timestamp`)
   - `mode`나 `difficulty`가 정해진 값이 아님
   - 점수가 음수, 정답 수 > 문제 수, 문제 수가 0
   - `accuracy`가 `Math.round(correctAnswers / totalQuestions * 100)`과 다름
   - `timestamp`를 날짜로 읽을 수 없거나 현재 시각보다 미래
5. **저장**
   - `teacher-data/class-history.json`에 시각 순으로 정렬해 들여쓰기 2칸 JSON으로 저장한다. 파일이 이미 있으면 덮어쓰기 전에 기존 기록 수를 읽어 보고에 "이전 → 이번" 으로 적는다. (원본은 `raw/` 파일이므로 다시 만들 수 있다)
   - `teacher-data/raw/`의 원본 파일은 절대 수정하지 않는다.
6. **개인정보 보호**: 프로젝트 폴더의 `.gitignore`에 `teacher-data/`가 없으면 줄을 추가하고, 추가했다고 보고한다. (`.gitignore`가 없으면 새로 만든다)
7. **검증**: 저장한 파일을 `JSON.parse`로 다시 읽고, `LocalDataManager`에 넣었을 때 `getGameHistory()`의 개수가 저장한 기록 수와 같은지 확인한다. 다르면 원인을 보고하고 멈춘다.

## 출력 형식
1. 파일별 결과

| 파일 | 읽은 기록 | 학생 | 중복 제거 | 제외 | 반영 |
|------|-----------|------|-----------|------|------|

2. 학급 데이터 요약: 학생 수, 총 기록 수(이전 → 이번), 기간(첫 기록 ~ 마지막 기록)
3. 학생 목록: 학생 | 기록 수 | 마지막 플레이 (기록 수 많은 순)
4. 확인 필요: 비슷한 이름, 이름을 파일 이름으로 바꾼 기록, 제외한 기록(이유별 개수)
5. `roster.txt`가 있으면: 기록이 없는 학생, 명단에 없는데 기록이 있는 이름
6. 다음 단계 안내: `/teacher-overview` 또는 `/teacher-mode`

## 주의
- 소스 코드, `questions.js`, `raw/` 원본 파일은 수정하지 않는다. 만들거나 바꾸는 파일은 `teacher-data/class-history.json`, `teacher-data/excluded.json`, `.gitignore`뿐이다.
- 계산에 쓴 임시 스크립트는 프로젝트 폴더가 아니라 스크래치패드에 만든다.
