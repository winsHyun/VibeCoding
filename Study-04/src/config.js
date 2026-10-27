// 작성일시: 2026-10-26 14:39
// 앱 설정값. 환경 변수로 덮어쓸 수 있다. (.env는 진입점에서 src/env.js를 먼저 import해 읽는다)

// 숫자 환경 변수. 값이 있는데 숫자가 아니면 엉뚱한 설정(NaN)으로 돌지 않도록 시작할 때 멈춘다
function num(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`환경 변수 ${name}의 값이 숫자가 아닙니다: "${value}"`);
  return n;
}
const list = (value, fallback) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback);

export const config = {
  port: num("PORT", 3000),
  // 기본은 이 컴퓨터에서만 접속 가능(127.0.0.1). 같은 네트워크의 다른 기기에서 쓰려면 HOST=0.0.0.0
  // (API 키로 AI를 대신 호출하는 서버라, 열어 두면 다른 사람이 하루 한도를 쓸 수 있다)
  host: process.env.HOST?.trim() || "127.0.0.1",
  // `node server.js --demo`: AI를 호출하지 않고 예시 결과를 돌려준다 (하루 한도 소진 시 화면 테스트용)
  demo: process.argv.includes("--demo"),
  // 모델은 앞에서부터 시도하고, 모델 쪽 장애(과부하·공유 사용량 초과·서비스 중단)면 다음 모델로 넘어간다.
  // 계정의 하루 무료 요청 한도는 모든 무료 모델이 공유하므로 이때는 넘어가지 않는다.
  // 후보는 2026-10-26 OpenRouter 가동률 기준으로 고른 무료 모델이다.
  embedModels: list(process.env.EMBED_MODELS, [
    "nvidia/nemotron-3.5-embed-1b:free",
    "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "nvidia/nemotron-3.5-embed-8b:free",
  ]),
  chatModels: list(process.env.CHAT_MODELS, [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-26b-a4b-it:free",
  ]),
  // 실패한 모델은 이 시간 동안 순서를 뒤로 미룬다 (실패한 요청도 하루 한도를 쓰므로)
  modelCooldownMs: 5 * 60 * 1000,
  // 사용자 요청 1건(재료 인식 1회, 레시피 추천 1회)이 쓸 수 있는 OpenRouter 호출 수와 전체 시간.
  // 재시도·대체 모델·재료 벡터 생성을 모두 합친 상한이다 (실패한 요청도 하루 한도를 쓰므로)
  requestBudget: {
    maxCalls: num("REQUEST_MAX_CALLS", 6),
    timeMs: num("REQUEST_TIME_BUDGET_MS", 90000),
  },
  recipe: {
    // 추론 토큰도 출력 토큰에 포함되므로 넉넉히 잡는다. 답이 잘리면(finish_reason=length) retryMaxTokens로 1회 재요청
    maxTokens: 4000,
    retryMaxTokens: 8000,
    temperature: 0.7,
    timeoutMs: 60000,
    // 따로 없어도 가진 것으로 보는 기본 양념
    pantryStaples: ["소금", "후추", "식용유", "간장", "설탕", "물"],
    // 레시피가 최소한 써야 하는 보유 재료 수 (못 미치면 목록 아래로 정렬)
    minOwnedUsed: 2,
  },
  maxImageBytes: 10 * 1024 * 1024,
  recognition: {
    // 실제 냉장고 사진은 모든 재료가 0.4~0.6에 몰려 절대 임계값으로는 거를 수 없다(2026-10-26 평가).
    // 그래서 threshold는 명백한 비식품 이미지만 거르는 하한으로 두고, 상위 topK개를 후보로 보여 준다.
    threshold: num("RECOGNITION_THRESHOLD", 0.3),
    topK: num("RECOGNITION_TOP_K", 5),
    // 그 사진의 1위 점수와 highMargin 이내면 신뢰도 "high"
    highMargin: 0.02,
    // 원본 1장 + grid×grid 조각, 조각끼리 overlap 비율만큼 겹침
    grid: 3,
    overlap: 0.2,
    // 서버에서 정규화하는 이미지의 긴 변 길이(px)
    maxSide: 1024,
  },
};
