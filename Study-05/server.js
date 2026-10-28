// 작성일시: 2026-10-27 15:16
// AI 공감 다이어리 서버 진입점. .env 로딩(src/env.js)은 반드시 첫 번째 import로 둔다.
import "./src/env.js";
import { join } from "node:path";
import { createApp } from "./src/app.js";
import { config, hasApiKey } from "./src/config.js";
import { createAnalyzer } from "./src/diary.js";
import { createChat } from "./src/openrouter.js";
import { createStore } from "./src/store.js";

const chat = createChat({ apiKey: process.env.OPENROUTER_API_KEY?.trim() });
const analyze = createAnalyzer({ chat, models: config.models, ai: config.ai });
const store = createStore(config.dataFile);

const app = createApp({
  store,
  analyze,
  hasApiKey,
  primaryModel: config.models[0],
  // Host·Origin 검사에 쓸 이 서버의 주소 (HOST로 다른 주소에 바인딩하면 그 값도 허용)
  hostNames: ["127.0.0.1", "localhost", config.host],
  indexPath: join(config.rootDir, "index.html"),
});

// 설정한 모델이 OpenRouter 모델 목록에 있는지 확인한다 (목록 조회는 무료 한도를 쓰지 않음). 실패해도 서버는 계속 뜬다
async function checkModels() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000) });
    const ids = new Set(((await res.json()).data ?? []).map((m) => m.id));
    const missing = config.models.filter((m) => !ids.has(m));
    if (missing.length) console.warn(`[startup] models not listed on OpenRouter (may fail and fall back): ${missing.join(", ")}`);
  } catch (err) {
    console.warn(`[startup] could not check OpenRouter model list: ${err.message}`);
  }
}

const server = app.listen(config.port, config.host, (err) => {
  if (err) {
    console.error(`[startup] failed to listen on ${config.host}:${config.port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`AI Empathy Diary server: http://${config.host}:${config.port}`);
  console.log(`[startup] models: ${config.models.join(" -> ")}`);
  if (!hasApiKey()) console.warn("[startup] OPENROUTER_API_KEY is not set; POST /api/entries will return CONFIG_ERROR");
  checkModels();
});

// Ctrl+C·종료 신호에 정상 종료
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
