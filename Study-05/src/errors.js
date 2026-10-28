// 작성일시: 2026-10-27 14:59
// API 오류 코드 → HTTP 상태·기본 메시지. 모든 오류 응답은 { error: { code, message } } 형식이다.

export const ERRORS = {
  INVALID_INPUT: { status: 400, message: "입력값이 올바르지 않습니다." },
  // 다른 출처(Origin)나 로컬이 아닌 Host로 온 요청 (다른 사이트·DNS 리바인딩 차단).
  // 실제 응답 문구는 security.js가 서버의 실제 포트를 넣어 만든다. 아래는 기본값
  FORBIDDEN_ORIGIN: { status: 403, message: "이 주소에서는 일기장을 열 수 없어요. 서버를 켠 주소(기본 http://127.0.0.1:3000)에서 열어 주세요." },
  NOT_FOUND: { status: 404, message: "요청한 항목을 찾을 수 없습니다." },
  // 입력이 AI 공급자의 검열(moderation)에 걸림: 같은 글로 다시 보내도 똑같다
  CONTENT_BLOCKED: { status: 422, message: "이 내용은 AI가 답하기 어려워요. 표현을 조금 바꿔 다시 써 주세요." },
  CONFIG_ERROR: { status: 500, message: "서버에 AI API 키가 설정되지 않았습니다. 관리자에게 문의해 주세요." },
  // 401(키)·402(크레딧)·403(권한). 원인별 메시지는 openrouter.js의 AUTH_MESSAGES
  AI_AUTH_ERROR: { status: 502, message: "AI 서비스 인증에 문제가 있습니다. 관리자에게 문의해 주세요." },
  // 일시적 한도(공급자 쪽 429 등): 잠시 후 다시 시도하면 된다
  RATE_LIMITED: { status: 429, message: "지금은 AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." },
  // 계정 하루 무료 한도 소진: 오늘은 다시 시도해도 실패하고, 실패한 요청도 한도에 들어간다
  DAILY_LIMIT: { status: 429, message: "오늘 일기 친구가 들을 수 있는 이야기를 모두 들었어요. 내일 다시 찾아와 주세요." },
  AI_TIMEOUT: { status: 504, message: "AI 응답이 너무 늦어지고 있어요. 잠시 후 다시 시도해 주세요." },
  AI_BAD_RESPONSE: { status: 502, message: "AI가 올바른 답을 만들지 못했어요. 다시 시도해 주세요." },
  UPSTREAM_ERROR: { status: 502, message: "AI 서비스에 문제가 생겼어요. 잠시 후 다시 시도해 주세요." },
  INTERNAL_ERROR: { status: 500, message: "서버에서 오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
};

// 응답으로 바뀌는 오류. detail은 로그 전용(응답에 넣지 않음)
export class ApiError extends Error {
  constructor(code, message, detail = "") {
    const known = Object.hasOwn(ERRORS, code) ? code : "INTERNAL_ERROR";
    super(message || ERRORS[known].message);
    this.code = known;
    this.status = ERRORS[known].status;
    this.detail = detail;
  }
}
