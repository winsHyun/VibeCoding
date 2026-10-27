<!-- 작성일시: 2026-10-26 14:08 -->
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

`Study-04`는 냉장고 사진에서 재료를 인식해 레시피를 추천하는 웹 앱입니다. PRD 3단계(프로필·레시피 저장)까지 모두 구현되어 있습니다.

- 요구사항은 `PRD_step1.md`(재료 인식) → `PRD_step2.md`(레시피 생성) → `PRD_step3.md`(프로필·레시피 저장) 순서로 구현합니다. 구현 전에 해당 단계 PRD를 먼저 읽습니다.
- 1단계 모델 `nvidia/nemotron-3.5-embed-1b:free`는 임베딩 모델이라 이미지를 글로 설명하지 못합니다. 재료 인식은 후보 재료 목록과의 코사인 유사도 비교로 하며, 실제 냉장고 사진에서 정확도가 낮습니다(`PRD_step1.md` 10장 평가 결과).

## 명령어

- `npm install` → `npm start` (또는 `npm run dev`로 파일 변경 시 자동 재시작) → http://localhost:3000. 서버는 기본으로 `127.0.0.1`에서만 받습니다(같은 네트워크의 다른 기기에서 쓰려면 `HOST=0.0.0.0`).
- `npm run demo` (또는 `start-demo.bat`): AI를 호출하지 않고 고정 예시 결과를 돌려주는 데모 모드. 하루 한도가 소진됐을 때 화면 흐름 테스트용입니다. `start.bat`은 실제 모드로 실행합니다.
- `npm run evaluate`: `data/eval/`의 사진과 `labels.json`(정답 재료 id)으로 인식 정밀도·재현율을 측정합니다. 사진 1장당 API 요청 1~2회(최대 `REQUEST_MAX_CALLS`)를 씁니다. 사진별 점수는 `data/eval/.score-cache.json`(사진 해시 + 재료 프롬프트·모델 순서·조각 설정 기준)에 저장되어 다시 돌리면 바뀐 사진만 요청하고, `DAILY_LIMIT`로 멈춰도 그때까지의 결과를 출력합니다. 저장할 때 현재 설정이 아닌 항목은 지웁니다.
- `npm test`: Node 내장 테스트 러너(`node --test`)로 `tests/*.test.js`를 실행합니다. API를 호출하지 않습니다. 파일 하나만 돌리려면 `node --test tests/recipes.test.js`, 테스트 하나만 돌리려면 `node --test --test-name-pattern="보유 여부" tests/recipes.test.js`.
- `npm run check:recipes -- 20`: 실제 모델로 레시피를 N회(기본 5) 생성해 JSON 실패율과 응답 시간을 잽니다. 1회당 모델 요청을 1~3회(최대 `REQUEST_MAX_CALLS`) 씁니다. 회차마다 실제 호출 수(`calls: N/max`)·생성 단계 수(`stages`)·대체 모델 이유를, 끝에 호출 합계를 출력합니다.
- 화면 확인: 브라우저 도구가 없으면 헤드리스 Edge(`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe --headless=new --remote-debugging-port=...`)를 DevTools 프로토콜로 조작해 클릭 흐름과 스크린샷을 확인할 수 있습니다. Windows 창은 폭 약 500px 미만으로 줄어들지 않아, 그보다 좁은 스크린샷은 오른쪽이 잘립니다.
- Windows Git Bash에서 `curl -d`로 한글 JSON을 보내면 UTF-8이 아니게 전달됩니다. API를 손으로 테스트할 때는 Node `fetch`나 `curl -d @파일`을 씁니다.

## 구조

- `server.js`: Express 서버. `public/`(프런트엔드, 빌드 도구 없음)을 제공하고 `/api/*`에서 OpenRouter를 대신 호출합니다.
  - `.env`는 `src/env.js`가 읽습니다. ES 모듈은 import한 모듈을 먼저 실행하므로, 진입점(`server.js`, `scripts/*.js`)에서 `import "./src/env.js"`를 **첫 번째 import**로 둬야 `config.js`에 반영됩니다.
  - JSON 본문은 `/api/recognize`만 15MB, 나머지는 1MB까지 받습니다. OpenRouter 오류는 `DAILY_LIMIT`/`RATE_LIMITED` → 429, `UPSTREAM_ERROR`/`REQUEST_ERROR` → 502, `AUTH_ERROR` → 500, `INSUFFICIENT_CREDITS`·`BUDGET_EXCEEDED` 등 → 503으로 응답합니다. 읽을 수 없거나 너무 작은(32px 미만) 사진, sharp 픽셀 수 제한을 넘는 사진은 `INVALID_IMAGE` 400입니다(`recognizer.js`의 `InvalidImageError`).
  - `/api/recognize`·`/api/recipes`는 응답 전에 클라이언트 연결이 끊기면(`res.on("close")`) `AbortController`로 그 요청의 `RequestBudget`을 취소해, 버려진 요청이 재시도·대체 모델·재생성으로 한도를 더 쓰지 않게 합니다. 로그는 `CANCELLED by client`로 남습니다.
  - 요청 로그 형식: `[recognize] OK 5 ingredients in 9ms (model: …, calls: 1/6[, fallback: 모델 코드 상태 (상세); …][, cached])`, `[recipes] OK 3 recipes in …ms (model: …, calls: 2/6[, fallback: …], stages: 1)`. `calls`는 재시도·대체 모델·재생성·재료 벡터 생성을 모두 합친 실제 OpenRouter 호출 수/상한이고(캐시·공유한 인식은 0), `stages`는 레시피 생성 단계 수입니다. 실패는 `FAILED in …ms (calls: …, fallback: …): 코드 상세`.
  - `config.host`(`HOST`, 기본 `127.0.0.1`)에서만 접속을 받습니다.
  - 데모 모드는 API 키 확인과 `getKeyStatus` 호출을 건너뜁니다.
- `src/openrouter.js`: OpenRouter 공통 클라이언트.
  - 같은 모델 재시도는 502/503·네트워크 오류만 1회 합니다. 429는 재시도하지 않고 바로 다음 모델로 넘기며(`Retry-After`가 3초 이하일 때만 1회 기다림), 타임아웃도 재시도하지 않습니다. `withModelFallback`이 `config.embedModels`/`config.chatModels` 순서대로 대체 모델로 넘어갑니다(404 포함). 실패한 모델은 5분간 순서 맨 뒤로 밀립니다.
  - 400/413/422는 요청 자체 문제라 `REQUEST_ERROR`로 대체 모델 없이 바로 실패합니다.
  - `RequestBudget`: 사용자 요청 1건(인식 1회, 레시피 추천 1회)의 OpenRouter 호출 수(`REQUEST_MAX_CALLS`, 기본 6)와 전체 시간(`REQUEST_TIME_BUDGET_MS`, 기본 90초) 상한입니다. 재시도·대체 모델·재생성·재료 벡터 생성을 모두 합쳐 세고, 넘으면 `BUDGET_EXCEEDED`로 중단합니다. 호출 타임아웃도 남은 시간으로 줄어듭니다. `generateRecipes`·`scoreImage`는 인자로 받지 않으면 새로 만듭니다.
  - `RequestBudget({ signal })`: 신호가 abort되면 `take()`가 `CLIENT_CLOSED`를 던지고 진행 중인 fetch도 멈춥니다(`fetchSignal()` = 호출 타임아웃 + 취소). `CLIENT_CLOSED`는 재시도·대체 모델로 이어지지 않고 모델 쿨다운에도 넣지 않습니다. `budget.usage()`는 `{ calls, maxCalls, fallbacks }`(대체 모델로 넘어간 이유)이고 `formatUsage()`가 로그 문자열로 바꿉니다. `withModelFallback`에 `budget`을 넘겨야 `fallbacks`가 쌓입니다.
  - 계정 하루 한도(`DAILY_LIMIT`, `error.message`와 `metadata.raw` 둘 다에서 `per-day` 검사), 크레딧 부족(402 → `INSUFFICIENT_CREDITS`), 키 오류(401/403 → `AUTH_ERROR`)는 모든 무료 모델에 공통이라 넘어가지 않고 바로 실패합니다.
  - `getKeyStatus()`는 남은 하루 무료 요청 수를 조회합니다(한도를 쓰지 않음). 서버 시작 로그에 출력됩니다.
- `src/ingredients.js`: `data/ingredients.json`의 프롬프트를 임베딩해 모델별 캐시 파일 `data/ingredient-embeddings.<모델>.json`에 저장합니다. 모델마다 벡터 공간이 달라 섞어 쓸 수 없습니다. 캐시 준비에 실패해도 서버는 뜨고, 재료 인식 요청 때 다시 시도합니다. 배치(20개) 중간에 실패하면 성공한 배치는 메모리에 남겨 두고 다음 시도에서 남은 배치부터 이어 갑니다(프로세스를 다시 시작하면 처음부터). 동시에 온 요청은 먼저 시작한 작업과 그 요청의 예산을 공유하고, 그 작업이 먼저 요청의 예산 소진·취소(`BUDGET_EXCEEDED`/`CLIENT_CLOSED`)로 실패하면 기다리던 요청이 자기 예산으로 이어서 합니다. 테스트는 `setIngredientCacheDir(임시폴더)`로 실제 캐시를 건드리지 않습니다.
- `src/recognizer.js`: 원본 + 3×3 조각을 임베딩해 재료별 최고 유사도로 순위를 매깁니다. 이미지와 재료 벡터는 같은 모델로 만든 것끼리만 비교합니다. 판정 기준값은 `src/config.js`에 있습니다.
  - 사진은 한 번만 디코딩해 조각을 병렬로 만들고, 이미 긴 변 1024px 이하·회전 정보 없는 JPEG(브라우저가 줄여 보낸 사진)는 원본을 다시 압축하지 않습니다.
  - 첫 번째 임베딩 모델만 재료 벡터가 없을 때 새로 만들고(요청 4회), 대체 모델은 재료 벡터 캐시 파일이 있을 때만 시도합니다.
  - `scoreImageCached`: 이미지 sha256 + 모델 순서를 키로 최근 20건을 메모리에 캐시합니다(진행 중인 같은 요청도 공유, 실패는 캐시 안 함). 서버 로그에 `cached`로 표시됩니다. 작업마다 자체 `AbortController`를 두고, 기다리는 요청(`signal` 인자)이 **모두** 끊겼을 때만 작업을 멈추고 캐시에서 뺍니다(한 요청이 끊겨도 같은 사진을 기다리는 다른 요청은 계속). `signal` 없이 부르면 끝까지 기다립니다.
- API 응답의 `model` 필드와 서버 로그(`[recognize]`, `[recipes]`, `[fallback]`)로 실제 응답한 모델과 실패 원인을 확인합니다.
- `src/recipes.js`: 2단계. 요청 검증 → 프롬프트 → 응답에서 JSON만 잘라 검증 → 보유 재료(`owned`)를 서버에서 다시 판정. 생성 단계는 최대 3회(기본 + 답 잘림 + JSON 오류)이고, 단계마다 붙는 재시도·대체 모델까지 합친 실제 호출 수는 `RequestBudget`으로 묶입니다. 프롬프트에 넣는 `excludeTitles`는 제목 100자·최대 30개로 자릅니다. `generateRecipes`의 `chatFn` 인자로 테스트에서 가짜 모델을 넣습니다.
- `src/demo.js`: `--demo` 모드의 고정 인식 결과와 예시 레시피. 레시피 보유 판정은 실제 `finalizeRecipes`를 씁니다.
- `src/store.js`: 3단계 사용자 데이터를 `data/user/db.json`(git 제외)에 저장합니다. 쓰기는 `writeDb(mutate)`로만 하며, 순서대로 하나씩 처리하고 복사본을 고쳐 임시 파일 → 이름 바꾸기로 저장합니다. 파일이 깨져 있거나 구조가 틀리면(`profiles`/`savedRecipes`가 객체 배열이 아님) 덮어쓰지 않고 서버 시작을 멈춥니다. 테스트는 `openStore(임시경로)`로 실제 데이터를 건드리지 않습니다.
- `src/profiles.js`: 프로필·저장 레시피 로직과 검증. 오류는 `ApiError(status, code)`로 던지고 `server.js`의 공통 오류 처리기가 응답으로 바꿉니다. 프로필 선택지(`PROFILE_OPTIONS`)와 알레르기 → 재료 키워드(`ALLERGEN_KEYWORDS`)도 여기 있고, 화면은 `GET /api/profile-options`로 같은 선택지를 씁니다. 저장 레시피는 프로필당 `MAX_SAVED_RECIPES`(100)개까지입니다(`LIMIT_EXCEEDED`).
- 레시피 요청에 `profileId`가 있으면 프로필의 알레르기·식단·선호·매운맛을 프롬프트에 넣고, `finalizeRecipes`가 알레르기 재료에 `allergens`, 레시피에 `allergyWarning`을 붙입니다.
- 프런트엔드는 빌드 도구 없는 ES 모듈입니다. `index.html`의 `data-view` 화면(profiles / profile-form / main / saved) 중 하나만 보입니다(`dom.js`의 `showView`).
  - `app.js`: 사진 → 재료 → 레시피 흐름과 레시피 저장 버튼. 인식·레시피 요청은 순번(`recognizeSeq`/`recipeSeq`)을 두고, 응답이 왔을 때 새 사진·재료 수정·프로필 변경으로 순번(또는 프로필)이 바뀌었으면 버립니다. 같은 사진으로 '재료 인식'을 다시 누르면 요청 없이 직전 결과를 씁니다. 요청을 버릴 때(`cancelRecognizeRequest`/`cancelRecipeRequest`, 새 레시피 요청)는 `AbortController`로 실제로 끊어 서버도 AI 호출을 멈춥니다. 재료 결과를 보여 줄 때(`showRecognition`)도 진행 중인 레시피 요청을 끊습니다. 사진 줄이기는 `fileSeq`로 늦게 끝난 이전 사진을 버립니다.
    - '다른 레시피 추천'을 받으면 앞 묶음 카드(저장 상태 포함)를 접힌 '이전 추천'(`#previous-recipes`)으로 옮깁니다. 새 추천·프로필 변경 때 비웁니다.
    - 재료는 30개·이름 30자까지(서버 `parseRecipeRequest`와 같은 값, `MAX_INGREDIENTS`/`MAX_INGREDIENT_LENGTH`). 추가 입력칸 오류(빈 값·중복·초과)는 상태 줄이 아니라 입력칸 아래(`#add-error`)에 보이고 입력한 글자는 남깁니다. 칩을 빼면 같은 자리 → 앞 칩 → 입력칸 순서로 포커스를 옮깁니다.
    - 가로세로 32px 미만 사진은 서버에 보내기 전에 막습니다(`MIN_IMAGE_SIDE`, 서버 `recognizer.js`와 같은 값).
    - `showView`가 상태 줄을 지우므로, 메인으로 돌아왔을 때 인식·레시피 요청이 진행 중이면 `onViewChange`로 로딩 표시를 경과 시간을 이어서 다시 띄웁니다(같은 프로필 재선택 포함).
  - `profile.js`: 프로필 선택·편집. 현재 프로필은 `localStorage`의 `currentProfileId`. 같은 프로필을 내용 변경 없이 다시 고르면 `onProfileChange`를 알리지 않습니다(레시피 결과·요청 유지). 직접 입력한 알레르기는 서버와 같은 기준(합계 20개·각 20자)으로 먼저 검사해 입력칸 아래에 오류를 보입니다. `reselectProfile()`은 프로필 목록을 다시 받아 선택 화면으로 갑니다(다른 창에서 지운 프로필로 요청해 `NOT_FOUND`가 났을 때 상태 줄 버튼으로 씀).
  - `saved.js`: 내 레시피. 열 때 이전 목록을 먼저 비우고 '불러오는 중'을 보여 줍니다. 검색도 요청 순번으로 늦게 온 이전 결과를 버리고, 삭제하면 그 카드만 뺍니다.
  - `dom.js`: API 호출, 상태 줄, 레시피 카드 렌더링. `api()`는 기본 30초, AI 요청은 `AI_TIMEOUT_MS`(120초, 서버의 요청당 시간 상한보다 길게) 뒤 `TIMEOUT` 오류를 냅니다. `signal`을 넘기면 타임아웃과 합쳐(`AbortSignal.any`) 쓰고, 그 신호로 끊기면 `ABORTED` 오류를 내며 화면에는 띄우지 않습니다.
    - `showStatus(message, type)`: type은 info / warning(성공했지만 알레르기 재료 등 확인 필요, 노랑) / error / loading. error일 때만 `role="alert"`·`aria-live="assertive"`로 바꿉니다.
    - `friendlyError`: `INVALID_IMAGE`는 서버가 준 이유(너무 작음 등)를 그대로 보여 주고, `NOT_FOUND`는 context가 recipes/save/saved면 `profileMissing: true`를 돌려줍니다.
    - `renderRecipeCard`: `<article class="recipe-card">` 안에 `<details>`(요약·본문)와 그 아래 버튼 줄(`actions`, `<summary>` 밖). 요약 줄에 붙일 글은 `notes`. '펼치기/접기' 표시는 `aria-hidden` 요소입니다.
- AI 응답과 사용자 입력은 항상 `textContent`로 넣습니다. CSS에서 `[hidden]`에 `!important`를 걸어 두었으므로, 요소를 숨길 때는 `hidden` 속성을 씁니다.

## 주의 사항

- OpenRouter 무료 모델은 **계정 전체**에 하루 요청 수 제한이 있습니다(크레딧 없을 때 50회, 한국 시간 오전 9시 초기화). 모든 무료 모델이 이 한도를 공유하므로 대체 모델로 피할 수 없고, 실패한 요청도 한도에 포함됩니다. 재시도 루프나 대량 평가를 돌리기 전에 요청 수를 따져 봅니다.
- 백그라운드에서 `npm start`로 띄운 서버를 멈춰도 자식 `node` 프로세스가 남아 포트 3000을 잡고 있을 수 있습니다. 재시작 전에 포트를 확인합니다.

## 저장소 구조

- git 루트는 상위 폴더 `D:/study/inflearn/VibeCoding`이고, `Study-01` ~ `Study-04`가 각각 독립된 학습 프로젝트입니다. 작업은 이 폴더 안에서만 하고 다른 Study 폴더는 건드리지 않습니다.
- 기존 Study 프로젝트들은 빌드 도구 없이 순수 HTML/CSS/JS(`index.html` + `css/`, `js/`)로 구성되어 있습니다. 별도 지시가 없으면 같은 방식을 따릅니다.

## LLM 연동 (OpenRouter)

- `.env`에는 `OPENROUTER_API_KEY`가 있습니다. 모델 순서와 판정 기준값은 `src/config.js`에 있고 환경 변수(`EMBED_MODELS`, `CHAT_MODELS`(쉼표 구분), `RECOGNITION_TOP_K`, `REQUEST_MAX_CALLS`, 서버 주소 `HOST` 등)로 바꿀 수 있습니다. 숫자 환경 변수가 숫자가 아니면 시작할 때 오류로 멈춥니다.
- `.env`는 `Study-04/.gitignore`로 제외되어 있고, 필요한 변수 목록은 `.env.example`(커밋 대상)에 둡니다. 새 환경 변수를 추가하면 `.env.example`에도 자리표시자 값으로 함께 추가합니다.
- API 키는 서버 측 코드에서만 읽습니다. 브라우저용 JS(`index.html`에서 로드되는 스크립트)에 키를 넣거나 브라우저에서 OpenRouter를 직접 호출하면 키가 노출되므로, LLM 호출은 로컬 서버(프록시)를 거치게 합니다.

## 작성 규칙

- 코드(식별자, 문자열 등)는 영어로, 주석과 CLAUDE.md는 한국어로 작성합니다.
- 새 파일 상단에는 `작성일시: YYYY-MM-DD HH:MM` 주석을 넣습니다.
- `.bat` 파일은 CRLF 줄바꿈 + CP949 인코딩으로 저장합니다.

OpenRouter API 를 이용해서 질제 AI 모델이 이미지를 인식하고 레시피를 생성하게 해줘.
매번 실행할때 마다 API가 정확히 작동했는지, AI 모델이 문제없이 실행되었는지를 파악하고, 
문제가 있다면 어떤 문제가 있는지를 보고해.