// 작성일시: 2026-10-27 14:59
// .env를 process.env로 읽는다. ES 모듈은 import한 모듈을 본문보다 먼저 실행하므로,
// 진입점(server.js)에서 config.js보다 먼저 이 파일을 첫 번째로 import해야 설정값에 반영된다.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch (err) {
  // .env가 없으면 이미 설정된 환경 변수를 쓴다. 그 밖의 오류(형식 오류 등)는 숨기지 않는다
  if (err.code !== "ENOENT") throw err;
}
