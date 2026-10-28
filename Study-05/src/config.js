// 작성일시: 2026-10-27 14:59
// 앱 설정값. 환경 변수로 덮어쓸 수 있다. (.env는 진입점에서 src/env.js를 먼저 import해 읽는다)
import { fileURLToPath } from "node:url";

// 숫자 환경 변수. 값이 있는데 숫자가 아니면 엉뚱한 설정(NaN)으로 돌지 않도록 시작할 때 멈춘다
function num(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} is not a number: "${value}"`);
  return n;
}
const list = (value) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

// 2026-10-27 OpenRouter /api/v1/models 조회 결과, meta-llama의 :free 모델은 목록에 없고
// (llama-3.3-70b-instruct:free 등은 엔드포인트 0개, 호출 시 404 "unavailable for free")
// 키도 무료 등급(크레딧 없음)이라 유료 llama는 402가 난다. 그래서 지금 동작하는 무료 모델을 기본값으로 둔다.
// 무료 llama가 다시 열리면 .env의 OPENROUTER_MODEL로 바꾼다.
// 2026-10-28 실측: gemma 무료 모델은 이틀간 거의 매번 "temporarily rate-limited upstream" 429였고,
// nemotron-3.5-lightning은 200 헤더 뒤 본문이 90초 넘게 오지 않았다(대기열 정체).
// 같은 프롬프트로 nemotron-3.5-super-vl 1.2~1.4초, nemotron-3-ultra 1.6~2.3초에 형식에 맞는 해요체 JSON을 돌려줘 앞에 둔다.
// thinkingmachines/inkling*:free는 "agentic harnesses 전용" 403이라 쓸 수 없다.
const DEFAULT_MODEL = "nvidia/nemotron-3.5-super-vl:free";
// 대체 모델: 다른 nvidia 엔드포인트 → 원래 쓰던 lightning → 공급자가 다른 gemma(구글) 순
// nvidia/nemotron-3-super-120b-a12b:free는 2026-10-27 404(공급자 함수 없음)로 제외했다.
const DEFAULT_FALLBACKS = ["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3.5-lightning:free", "google/gemma-4-31b-it:free"];

const primaryModel = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
const fallbackModels = process.env.OPENROUTER_FALLBACK_MODELS !== undefined ? list(process.env.OPENROUTER_FALLBACK_MODELS) : DEFAULT_FALLBACKS;

export const config = {
  port: num("PORT", 3000),
  // 기본은 이 컴퓨터에서만 접속 가능. API 키로 AI를 대신 호출하는 서버라 외부에 열지 않는다
  host: process.env.HOST?.trim() || "127.0.0.1",
  rootDir: fileURLToPath(new URL("..", import.meta.url)),
  dataFile: fileURLToPath(new URL("../data/entries.json", import.meta.url)),
  // 앞에서부터 시도하고 모델 쪽 문제(429·404·5xx·타임아웃)면 다음 모델로 넘어간다 (중복 제거)
  models: [...new Set([primaryModel, ...fallbackModels])],
  ai: {
    temperature: 0.4,
    maxTokens: num("AI_MAX_TOKENS", 1000),
    // 추론(reasoning) 토큰도 max_tokens에 포함되어 답이 잘릴 수 있어 기본은 끈다 ("none").
    // 추론이 필수인 모델(mandatory)을 쓸 때는 AI_REASONING_EFFORT=를 비워 이 값을 보내지 않는다
    reasoningEffort: process.env.AI_REASONING_EFFORT !== undefined ? process.env.AI_REASONING_EFFORT.trim() : "none",
    // 호출 1회 타임아웃. 정상 응답은 1~6초라, 한 모델이 멈춰도 전체 60초 안에 다른 모델 2개를 더 시도할 수 있게 20초로 둔다
    callTimeoutMs: num("AI_CALL_TIMEOUT_MS", 20000),
    // 일기 1건 분석이 쓸 수 있는 OpenRouter 호출 수와 전체 시간 (재시도·대체 모델·형식 오류 재요청 합계)
    maxCalls: num("AI_MAX_CALLS", 4),
    totalTimeoutMs: num("AI_TOTAL_TIMEOUT_MS", 60000),
    // 5xx·네트워크 오류 때 같은 모델 재시도 전 대기
    retryDelayMs: 1000,
    // 실패한 모델은 이 시간 동안 순서를 뒤로 미룬다 (실패한 요청도 하루 무료 한도를 쓴다)
    modelCooldownMs: 5 * 60 * 1000,
  },
};

export const hasApiKey = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());
