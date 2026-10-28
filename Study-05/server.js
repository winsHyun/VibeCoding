// 작성일시: 2026-10-27 15:16
// AI 공감 다이어리 서버 진입점. .env 로딩(src/env.js)은 반드시 첫 번째 import로 둔다.
import "./src/env.js";
import { join } from "node:path";
import { createApp } from "./src/app.js";
import { config, hasApiKey } from "./src/config.js";
import { createAnalyzer } from "./src/diary.js";
import { createChat, createRerank } from "./src/openrouter.js";
import { createPdfSummarizer } from "./src/pdf-summary.js";
import { createStore } from "./src/store.js";

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const chat = createChat({ apiKey });
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
  pdfIndexPath: join(config.rootDir, "index_pdf.html"),
  pdf: config.pdf,
  // PDF 요약: 긴 문서는 rerank 모델로 핵심 조각을 고르고, 요약문은 다이어리와 같은 채팅 모델 순서가 쓴다 (src/pdf-summary.js)
  summarizePdf: createPdfSummarizer({ chat, rerank: createRerank({ apiKey }), models: config.models, pdf: config.pdf, ai: config.ai }),
});

// 설정한 모델이 OpenRouter 모델 목록에 있는지 확인한다 (목록 조회는 무료 한도를 쓰지 않음). 실패해도 서버는 계속 뜬다
async function checkModels() {
  try {
    // rerank 모델은 기본 목록(텍스트 출력 모델)에 없어 output_modalities=all로 조회한다
    const res = await fetch("https://openrouter.ai/api/v1/models?output_modalities=all", { signal: AbortSignal.timeout(10000) });
    const ids = new Set(((await res.json()).data ?? []).map((m) => m.id));
    const missing = [...config.models, ...(config.pdf.rerankModel ? [config.pdf.rerankModel] : [])].filter((m) => !ids.has(m));
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
  if (!hasApiKey()) console.warn("[startup] OPENROUTER_API_KEY is not set; POST /api/entries and /api/pdf/summarize will return CONFIG_ERROR");
  // 서버 전체 시간이 화면 요청 타임아웃(120초) 이상이면 화면이 먼저 포기해 서버 오류 문구를 못 받는다
  if (config.pdf.totalTimeoutMs >= 120000) console.warn(`[startup] PDF_TOTAL_TIMEOUT_MS=${config.pdf.totalTimeoutMs} should be below the page timeout (120000ms)`);
  checkModels();
});

// Ctrl+C·종료 신호에 정상 종료
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
