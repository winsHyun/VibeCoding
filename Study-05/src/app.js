// 작성일시: 2026-10-27 15:14
// Express 앱 구성 (라우팅·검증·오류 응답). 저장소·분석기는 주입받아 테스트에서 바꿔 끼울 수 있다.
import { randomUUID } from "node:crypto";
import express from "express";
import { validateText } from "./diary.js";
import { ApiError, ERRORS, PDF_MESSAGES } from "./errors.js";
import { cleanDisplayText, createPdfExtractor, hasPdfSignature } from "./pdf.js";
import { createOriginGuard, DEFAULT_HOST_NAMES } from "./security.js";

// PDF 설정 기본값 (config.pdf와 같은 이름). 테스트는 일부만 덮어쓴다
const PDF_DEFAULTS = { maxBytes: 20 * 1024 * 1024, maxPages: 200, maxTextChars: 200000, extractTimeoutMs: 15000, workerMemoryMb: 512, extractMaxRssMb: 1024, maxItemsPerPage: 50000, maxCalls: 4, rerankModel: null };

// X-File-Name(encodeURIComponent 값) → 표시용 파일 이름. 없거나 디코딩에 실패하면 null (오류 아님)
export function parseFileName(header) {
  if (typeof header !== "string" || !header) return null;
  try {
    return cleanDisplayText(decodeURIComponent(header), 200);
  } catch {
    return null;
  }
}

// 20971520 → "20MB"
const formatMb = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;

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

// deps: { store, analyze(text, { signal, entryId }), hasApiKey(), primaryModel, indexPath, pdfIndexPath, hostNames, logger, now,
//         pdf: config.pdf 값 (maxBytes, maxPages, maxTextChars, extractTimeoutMs, workerMemoryMb, extractMaxRssMb, maxItemsPerPage, maxCalls, rerankModel),
//         extractPdf(buffer, { signal }) → ExtractedPdf (기본: pdf.js의 createPdfExtractor. 구조는 그 파일 주석),
//         summarizePdf(extracted, { signal, fileName, startedAt }) → PdfSummaryResult (pdf-summary.js의 createPdfSummarizer. 없으면 PDF 요약은 INTERNAL_ERROR) }
// PdfSummaryResult = { oneLine, overview, keyPoints: [{ text, pages? }], sections: [{ title, summary, pages? }], keywords: string[],
//   coverage: { method: "full"|"rerank"|"head", usedCharacters, totalCharacters, selectedChunks, totalChunks, truncated },
//   notices: string[] (문서 안내는 pdf.js의 documentNotices), model, rerankModel: string|null,
//   usage?: { calls, maxCalls, fallbacks: string[] }, rerankFailure?: string, retry?: string }  ← usage 이하는 로그 전용, 응답에 넣지 않음
// summarizePdf의 실패는 ApiError로 던진다(다이어리용 기본 문구는 이 파일이 PDF용으로 바꿈). 취소로 멈췄으면 err.cancelled = true.
export function createApp({
  store,
  analyze,
  hasApiKey,
  primaryModel,
  indexPath,
  pdfIndexPath,
  pdf: pdfOptions = {},
  extractPdf,
  summarizePdf,
  hostNames = DEFAULT_HOST_NAMES,
  logger = console,
  now = () => new Date(),
}) {
  const app = express();
  app.disable("x-powered-by");
  const guard = createOriginGuard({ hostNames });
  const pdf = { ...PDF_DEFAULTS, ...pdfOptions };
  const extract = extractPdf ?? createPdfExtractor({
      maxPages: pdf.maxPages,
      maxChars: pdf.maxTextChars,
      timeoutMs: pdf.extractTimeoutMs,
      workerMemoryMb: pdf.workerMemoryMb,
      maxRssGrowthMb: pdf.extractMaxRssMb,
      maxItemsPerPage: pdf.maxItemsPerPage,
    });
  const summarize =
    summarizePdf ??
    (async () => {
      throw new ApiError("INTERNAL_ERROR", undefined, "summarizePdf is not configured");
    });

  // 모든 요청: 이 서버 주소가 아닌 Host는 거부 (DNS 리바인딩)
  app.use(guard.checkHost);

  // 화면 파일 1개씩만 제공한다 (루트 폴더를 정적 제공하지 않음 → .env 노출 방지).
  // 다른 사이트가 iframe으로 띄워 클릭을 유도(삭제 확인 등)하지 못하게 한다.
  // CSP는 frame-ancestors만 둔다(다른 지시어를 넣으면 인라인 스크립트·Google Fonts가 막힌다)
  const sendPage = (res, filePath, missingMessage) => {
    res.set({ "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" });
    if (!filePath) return sendError(res, new ApiError("NOT_FOUND", missingMessage));
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) sendError(res, new ApiError("NOT_FOUND", missingMessage));
    });
  };
  app.get("/", (req, res) => sendPage(res, indexPath, "index.html 파일이 아직 없습니다."));
  app.get("/pdf", (req, res) => sendPage(res, pdfIndexPath, "index_pdf.html 파일이 아직 없습니다."));
  // 브라우저가 자동으로 찾는 아이콘. 콘솔 404 대신 빈 응답
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  // /api/*: 다른 출처 요청 거부(CORS 없음). 같은 출처 화면과 Origin 없는 도구(curl 등)만 통과
  app.use("/api", guard.checkOrigin);
  app.use("/api", express.json({ limit: "10kb" }));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      model: primaryModel,
      hasApiKey: hasApiKey(),
      pdf: { maxBytes: pdf.maxBytes, maxPages: pdf.maxPages, rerankModel: pdf.rerankModel },
    });
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

  // ---- PDF 요약: POST /api/pdf/summarize (본문 = PDF 원본 바이트, 디스크에 쓰지 않음) ----
  // 검사 순서(PRD 8.4): Host/Origin(위 공통) → 동시 처리 → Content-Type → 크기 → 빈 본문 → 시그니처 → API 키 → 열기·추출 → 텍스트 양 → 요약
  let pdfBusy = false;
  const pdfCalls = (usage) => `calls: ${usage?.calls ?? 0}/${usage?.maxCalls || pdf.maxCalls}`;

  // 서버 전체에서 PDF 1건만 처리한다 (업로드 본문과 추출 텍스트만 메모리에 두기 위함).
  // 자리는 본문을 받기 전에 잡고, 처리기가 끝날 때(처리기에 닿기 전에 응답이 끝났으면 그때) 놓는다
  function acquirePdfSlot(req, res, next) {
    if (pdfBusy) return next(new ApiError("PDF_BUSY", undefined, "another PDF is in progress"));
    pdfBusy = true;
    const slot = { started: Date.now(), handling: false, released: false };
    slot.release = () => {
      if (slot.released) return;
      slot.released = true;
      pdfBusy = false;
    };
    res.locals.pdfSlot = slot;
    res.on("close", () => {
      if (!slot.handling) slot.release();
    });
    next();
  }

  // Content-Type은 매개변수(charset 등)를 빼고 application/pdf여야 한다. 본문이 없어도 헤더로 판단한다(빈 본문은 뒤에서 INVALID_INPUT)
  function requirePdfUpload(req, res, next) {
    const type = String(req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/pdf") return next(new ApiError("NOT_PDF", undefined, `content-type: ${type.slice(0, 60) || "(none)"}`));
    const encoding = String(req.get("content-encoding") ?? "identity").trim().toLowerCase();
    if (encoding !== "identity") {
      return next(new ApiError("INVALID_INPUT", PDF_MESSAGES.UNREADABLE_BODY, `content-encoding: ${encoding.slice(0, 40)}`));
    }
    next();
  }

  // 이 라우트에만 붙이는 원본 본문 파서 (다른 /api 라우트에 20MB 본문을 열지 않음).
  // Content-Length가 상한을 넘으면 버퍼에 담지 않고 413 (본문은 읽어서 버린 뒤 응답 → 브라우저가 연결 오류 대신 413을 받음)
  const readPdfBody = express.raw({ type: "application/pdf", limit: pdf.maxBytes, inflate: false });

  app.post("/api/pdf/summarize", acquirePdfSlot, requirePdfUpload, readPdfBody, async (req, res) => {
    const slot = res.locals.pdfSlot;
    slot.handling = true;
    const body = req.body;
    let extracted = null;
    let usage = null;
    // 응답 전에 클라이언트 연결이 끊기면 추출·AI 호출을 멈춘다 (저장할 것이 없어 되돌리기 없음)
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    const bytes = Buffer.isBuffer(body) ? body.length : 0;
    const logCancelled = () => logger.log(`[pdf] CANCELLED by client after ${Date.now() - slot.started}ms (${pdfCalls(usage)})`);

    try {
      if (!bytes) throw new ApiError("INVALID_INPUT", PDF_MESSAGES.EMPTY_FILE, "empty body");
      if (!hasPdfSignature(body)) throw new ApiError("NOT_PDF", undefined, "no %PDF- signature in first 1024 bytes");
      // 키가 없으면 AI 단계에서 어차피 실패하므로 추출 전에 멈춘다
      if (!hasApiKey()) throw new ApiError("CONFIG_ERROR", undefined, "OPENROUTER_API_KEY is not set");
      const fileName = parseFileName(req.get("x-file-name"));

      extracted = await extract(body, { signal: controller.signal });
      if (controller.signal.aborted) return logCancelled();
      // startedAt: 요약기가 추출에 쓴 시간까지 빼고 전체 시간(PDF_TOTAL_TIMEOUT_MS)을 센다
      const result = await summarize(extracted, { signal: controller.signal, fileName, startedAt: slot.started });
      usage = result?.usage ?? null;
      if (controller.signal.aborted) return logCancelled();

      const summary = {
        fileName,
        generatedAt: now().toISOString(),
        document: {
          pages: extracted.pages,
          processedPages: extracted.processedPages,
          pagesWithoutText: extracted.pagesWithoutText,
          characters: extracted.characters,
          language: extracted.language,
          title: extracted.title ?? null,
        },
        oneLine: result.oneLine,
        overview: result.overview,
        keyPoints: result.keyPoints ?? [],
        sections: result.sections ?? [],
        keywords: result.keywords ?? [],
        coverage: result.coverage,
        notices: result.notices ?? [],
        model: result.model,
        rerankModel: result.rerankModel ?? null,
      };
      // 파일 이름·문서 본문·요약문은 로그에 남기지 않는다
      const { method = "-", selectedChunks, totalChunks } = result.coverage ?? {};
      const fallback = usage?.fallbacks?.length ? `, fallback: ${usage.fallbacks.join("; ")}` : "";
      const chunks = totalChunks ? `, chunks: ${selectedChunks}/${totalChunks}` : "";
      const rerank = result.rerankFailure ? `, rerank: failed (${String(result.rerankFailure).slice(0, 200)})` : "";
      const retry = result.retry ? `, retry: ${result.retry}` : "";
      const tokens = usage?.tokens ? `, tokens: ${usage.tokens.prompt}/${usage.tokens.completion}` : "";
      logger.log(
        `[pdf] OK 200 in ${Date.now() - slot.started}ms (bytes: ${bytes}, pages: ${extracted.processedPages}/${extracted.pages}, chars: ${extracted.characters}, method: ${method}${chunks}, model: ${result.model}, ${pdfCalls(usage)}${fallback}${rerank}${retry}${tokens})`,
      );
      if (!res.writableEnded) res.json({ summary });
    } catch (err) {
      usage = err?.usage ?? usage;
      if (err?.cancelled || controller.signal.aborted) return logCancelled();
      const pages = extracted ? `${extracted.processedPages}/${extracted.pages}` : "-";
      err.logPrefix = `[pdf] FAILED in ${Date.now() - slot.started}ms (bytes: ${bytes}, pages: ${pages}, ${pdfCalls(usage)})`;
      throw err;
    } finally {
      slot.release();
    }
  }, pdfErrors);

  // PDF 라우트 오류 정리 후 공통 처리기로 넘긴다: 본문 파서 오류 → PDF 코드, 다이어리용 기본 문구 → PDF용 문구, 로그 머리말
  // eslint-disable-next-line no-unused-vars
  function pdfErrors(err, req, res, next) {
    let apiError = err;
    if (err?.type === "entity.too.large") {
      apiError = new ApiError("PDF_TOO_LARGE", `파일이 너무 커요. ${formatMb(pdf.maxBytes)} 이하 PDF만 올릴 수 있어요.`, `body over ${pdf.maxBytes} bytes`);
    } else if (!(err instanceof ApiError) && isClientBodyError(err)) {
      apiError = new ApiError("INVALID_INPUT", PDF_MESSAGES.UNREADABLE_BODY, `${err.type ?? err.code ?? "body error"}: ${err.message}`);
    } else if (err instanceof ApiError && PDF_MESSAGES[err.code] && err.message === ERRORS[err.code].message) {
      apiError = new ApiError(err.code, PDF_MESSAGES[err.code], err.detail);
    }
    if (apiError !== err && err?.logPrefix) apiError.logPrefix = err.logPrefix;
    if (!apiError.logPrefix) {
      const started = res.locals.pdfSlot?.started ?? Date.now();
      apiError.logPrefix = `[pdf] FAILED in ${Date.now() - started}ms (bytes: ${Number(req.get("content-length")) || 0}, pages: -, calls: 0/${pdf.maxCalls})`;
    }
    next(apiError);
  }

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
