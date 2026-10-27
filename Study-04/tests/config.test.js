// 작성일시: 2026-10-26 17:20
// 설정값 검증 테스트 (별도 프로세스에서 config.js를 읽음, API 호출 없음): npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONFIG_URL = new URL("../src/config.js", import.meta.url).href;

// env를 덮어쓴 새 node 프로세스에서 config를 읽고 결과(JSON) 또는 오류를 돌려준다
function loadConfig(env) {
  const script = `import(${JSON.stringify(CONFIG_URL)}).then(({ config }) => console.log(JSON.stringify(config)))`;
  const result = spawnSync(process.execPath, ["-e", script], {
    env: { ...process.env, PORT: "", RECOGNITION_THRESHOLD: "", RECOGNITION_TOP_K: "", REQUEST_MAX_CALLS: "", REQUEST_TIME_BUDGET_MS: "", ...env },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  return { status: result.status, config: result.status === 0 ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

test("숫자 환경 변수: 비어 있으면 기본값, 숫자면 그 값", () => {
  assert.equal(loadConfig({}).config.port, 3000);
  const { config } = loadConfig({ PORT: "4000", RECOGNITION_TOP_K: "8", REQUEST_MAX_CALLS: "4" });
  assert.equal(config.port, 4000);
  assert.equal(config.recognition.topK, 8);
  assert.equal(config.requestBudget.maxCalls, 4);
});

test("숫자 환경 변수가 숫자가 아니면 시작할 때 오류로 멈춘다 (NaN으로 돌지 않음)", () => {
  for (const [name, value] of [["PORT", "abc"], ["RECOGNITION_THRESHOLD", "0.3x"], ["RECOGNITION_TOP_K", "Infinity"]]) {
    const { status, stderr } = loadConfig({ [name]: value });
    assert.notEqual(status, 0, `${name}=${value}`);
    assert.match(stderr, new RegExp(`환경 변수 ${name}`));
  }
});
