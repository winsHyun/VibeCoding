// 작성일시: 2026-10-27 15:50
// 요청 출처 검사. 화면은 서버가 주는 같은 출처(http://127.0.0.1:<PORT>/)에서만 API를 부르므로 CORS는 열지 않는다.
// - Host 검사(모든 요청): 이 서버의 주소(127.0.0.1·localhost·HOST 값 + 실제 포트)가 아니면 403 → DNS 리바인딩 차단
// - Origin 검사(/api/*): Origin 헤더가 있는데 자기 출처가 아니면 403. Origin: null(file://·sandbox iframe)도 거부.
//   Origin이 없는 요청(curl, 같은 출처 GET)은 허용한다.
import { ApiError } from "./errors.js";

export const DEFAULT_HOST_NAMES = ["127.0.0.1", "localhost"];

// IPv6 주소는 Host 헤더에서 대괄호로 감싸진다 ([::1]:3000)
const formatHostName = (name) => (name.includes(":") ? `[${name}]` : name).toLowerCase();

// hostNames: 허용할 호스트 이름(포트 제외). 포트는 요청이 들어온 소켓의 실제 포트를 쓴다
export function createOriginGuard({ hostNames = DEFAULT_HOST_NAMES } = {}) {
  const names = [...new Set(hostNames.filter(Boolean).map(formatHostName))];
  const allowedHosts = (port) => names.map((name) => `${name}:${port}`);
  // 안내 문구에 넣을 이 서버 주소 (PORT를 바꿔도 실제 포트로 안내한다)
  const forbiddenMessage = (port) => `이 주소에서는 일기장을 열 수 없어요. http://${names[0] ?? "127.0.0.1"}:${port} 에서 열어 주세요.`;

  function checkHost(req, res, next) {
    const host = String(req.headers.host ?? "").toLowerCase();
    if (!allowedHosts(req.socket.localPort).includes(host)) {
      return next(new ApiError("FORBIDDEN_ORIGIN", forbiddenMessage(req.socket.localPort), `host not allowed: ${host.slice(0, 100)}`));
    }
    next();
  }

  function checkOrigin(req, res, next) {
    const origin = req.headers.origin;
    if (origin === undefined) return next();
    const allowed = allowedHosts(req.socket.localPort).map((h) => `http://${h}`);
    if (!allowed.includes(String(origin).toLowerCase())) {
      return next(new ApiError("FORBIDDEN_ORIGIN", forbiddenMessage(req.socket.localPort), `origin not allowed: ${String(origin).slice(0, 100)}`));
    }
    next();
  }

  return { checkHost, checkOrigin };
}
