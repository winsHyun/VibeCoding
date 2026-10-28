// 작성일시: 2026-10-27 15:14
// Express 앱 구성 (라우팅·검증·오류 응답). 저장소·분석기는 주입받아 테스트에서 바꿔 끼울 수 있다.
import { randomUUID } from "node:crypto";
import express from "express";
import { validateText } from "./diary.js";
import { ApiError } from "./errors.js";
import { createOriginGuard, DEFAULT_HOST_NAMES } from "./security.js";

// usage → 로그 문자열 "calls: 2/4, fallback: ..."
function formatUsage(usage) {
  if (!usage) return "calls: 0";
  const fallback = usage.fallbacks?.length ? `, fallback: ${usage.fallbacks.join("; ")}` : "";
  return `calls: ${usage.calls}/${usage.maxCalls}${fallback}`;
}

// 응답용 Entry. crisis 필드가 없던 예전 저장 일기는 false로 돌려준다
const toEntryResponse = (entry) => ({ ...entry, crisis: entry.crisis === true });

// 상태를 바꾸는 POST는 JSON 본문만 받는다 (다른 사이트의 form/text 요청 차단을 겸함)
function requireJson(req, res, next) {
  if (!req.is("application/json")) {
    return next(new ApiError("INVALID_INPUT", "요청 본문은 Content-Type: application/json 으로 보내 주세요."));
  }
  next();
}

// deps: { store, analyze(text, { signal, entryId }), hasApiKey(), primaryModel, indexPath, hostNames, logger, now }
export function createApp({
  store,
  analyze,
  hasApiKey,
  primaryModel,
  indexPath,
  hostNames = DEFAULT_HOST_NAMES,
  logger = console,
  now = () => new Date(),
}) {
  const app = express();
  app.disable("x-powered-by");
  const guard = createOriginGuard({ hostNames });

  // 모든 요청: 이 서버 주소가 아닌 Host는 거부 (DNS 리바인딩)
  app.use(guard.checkHost);

  app.get("/", (req, res) => {
    // 다른 사이트가 iframe으로 띄워 클릭을 유도(삭제 확인 등)하지 못하게 한다.
    // CSP는 frame-ancestors만 둔다(다른 지시어를 넣으면 인라인 스크립트·Google Fonts가 막힌다)
    res.set({ "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" });
    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) sendError(res, new ApiError("NOT_FOUND", "index.html 파일이 아직 없습니다."));
    });
  });
  // 브라우저가 자동으로 찾는 아이콘. 콘솔 404 대신 빈 응답
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  // /api/*: 다른 출처 요청 거부(CORS 없음). 같은 출처 화면과 Origin 없는 도구(curl 등)만 통과
  app.use("/api", guard.checkOrigin);
  app.use("/api", express.json({ limit: "10kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, model: primaryModel, hasApiKey: hasApiKey() });
  });

  app.get("/api/entries", async (req, res) => {
    res.json({ entries: (await store.list()).map(toEntryResponse) });
  });

  app.post("/api/entries", requireJson, async (req, res) => {
    const started = Date.now();
    const text = validateText(req.body);
    if (!hasApiKey()) throw new ApiError("CONFIG_ERROR", undefined, "OPENROUTER_API_KEY is not set");

    // 응답 전에 클라이언트 연결이 끊기면 진행 중인 AI 호출을 멈추고 저장하지 않는다
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    const logCancelled = (usage) =>
      logger.log(`[entries] CANCELLED by client after ${Date.now() - started}ms (${formatUsage(usage)})`);

    // id를 먼저 정해 분석기에 넘긴다 (위기 일기의 고정 위로 문구를 id로 고름)
    const id = randomUUID();
    let analysis;
    try {
      analysis = await analyze(text, { signal: controller.signal, entryId: id });
    } catch (err) {
      if (err.cancelled || controller.signal.aborted) return logCancelled(err.usage);
      err.logPrefix = `[entries] FAILED in ${Date.now() - started}ms (${formatUsage(err.usage)}, chars: ${[...text].length})`;
      throw err;
    }
    // 분석은 끝났지만 그사이 화면이 기다리기를 그만뒀다면, 사용자는 실패로 알고 있으므로 저장하지 않는다
    if (controller.signal.aborted) return logCancelled(analysis.usage);

    const entry = {
      id,
      text,
      createdAt: now().toISOString(),
      emotion: analysis.emotion,
      empathy: analysis.empathy,
      comfort: analysis.comfort,
      crisis: analysis.crisis === true,
      model: analysis.model,
    };
    await store.add(entry);
    // 저장하는 사이에 끊겼으면 사용자는 실패로 알고 있으므로 방금 저장한 일기를 되돌린다 (B-12)
    if (controller.signal.aborted) {
      await store.remove(entry.id).catch((err) => logger.error(`[entries] failed to roll back cancelled entry: ${err.message}`));
      return logger.log(`[entries] CANCELLED by client after ${Date.now() - started}ms; rolled back saved entry (${formatUsage(analysis.usage)})`);
    }
    logger.log(
      `[entries] OK 201 in ${Date.now() - started}ms (model: ${analysis.model}, ${formatUsage(analysis.usage)}, chars: ${[...text].length}, emotion: ${entry.emotion.primary}/${entry.emotion.intensity}${entry.crisis ? ", crisis" : ""}${analysis.crisisReply ? `, crisis-reply: ${analysis.crisisReply}` : ""}${analysis.language ? `, language: ${analysis.language}` : ""}${analysis.style ? `, style: ${analysis.style}${analysis.styleSource ? ` (${analysis.styleSource})` : ""}` : ""})`,
    );
    if (!res.writableEnded && !controller.signal.aborted) res.status(201).json({ entry });
  });

  app.delete("/api/entries/:id", async (req, res) => {
    const removed = await store.remove(req.params.id);
    if (!removed) throw new ApiError("NOT_FOUND", "해당 일기를 찾을 수 없습니다.");
    res.status(204).end();
  });

  app.use((req, res) => {
    sendError(res, new ApiError("NOT_FOUND", "요청한 주소를 찾을 수 없습니다."));
  });

  // 공통 오류 처리: 모든 오류를 { error: { code, message } } 로 바꾼다
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let apiError = err;
    if (err?.type === "entity.parse.failed") apiError = new ApiError("INVALID_INPUT", "요청 본문이 올바른 JSON이 아닙니다.");
    else if (err?.type === "entity.too.large") apiError = new ApiError("INVALID_INPUT", "요청 본문이 너무 큽니다.");
    else if (!(err instanceof ApiError) && isClientBodyError(err)) {
      // 본문 파서의 그 밖의 4xx (지원 안 하는 charset·압축, 잘못된 gzip 본문 등). 스택은 남기지 않는다
      apiError = new ApiError("INVALID_INPUT", "요청 본문을 읽을 수 없습니다.", `${err.type ?? err.code ?? "body error"}: ${err.message}`);
    } else if (!(err instanceof ApiError)) {
      logger.error(`[server] unexpected error on ${req.method} ${req.path}:`, err);
      apiError = new ApiError("INTERNAL_ERROR");
    }
    if (err.logPrefix) logger.error(`${err.logPrefix}: ${apiError.code} ${apiError.detail || ""}`.trim());
    else if (apiError.code === "FORBIDDEN_ORIGIN") logger.warn(`[security] blocked ${req.method} ${req.path}: ${apiError.detail}`);
    else if (apiError.status >= 500 && err instanceof ApiError) logger.error(`[server] ${req.method} ${req.path} ${apiError.code} ${apiError.detail}`);
    if (res.headersSent) return;
    sendError(res, apiError);
  });

  return app;
}

// body-parser(http-errors)가 만든 클라이언트 오류: expose=true 이고 4xx 상태
function isClientBodyError(err) {
  const status = err?.status ?? err?.statusCode;
  return Boolean(err?.expose) && Number.isInteger(status) && status >= 400 && status < 500;
}

function sendError(res, err) {
  res.status(err.status).json({ error: { code: err.code, message: err.message } });
}
