// 작성일시: 2026-10-28 14:30
// PDF 검사·텍스트 추출 (메모리에서만 처리, 디스크에 쓰지 않음).
// 라이브러리: unpdf(의존성 0개, 순수 JS로 묶은 PDF.js 서버리스 빌드). pdfjs-dist는 렌더링용 네이티브 선택 의존성
// (@napi-rs/canvas)을 함께 설치해 PRD의 "네이티브 모듈 없음" 조건에 맞지 않아 쓰지 않았다.
// CJK CMap: 글꼴을 넣지 않고 미리 정의된 CJK CMap(UniKS-UCS2-H·KSCms-UHC-H 등)을 쓰는 PDF는 CMap 데이터가 있어야 글자가 나온다.
// 번들된 PDF.js와 같은 버전(pdfjs-dist 6.4.299)의 .bcmap 파일을 vendor/pdfjs-cmaps/에 두고 로컬 파일로 읽는다(네트워크·네이티브 모듈 없음).
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { getResolvedPDFJS } from "unpdf";
import { ApiError } from "./errors.js";

// PDF.js 6의 BinaryDataFactory 자리에 넣는 로컬 읽기 객체. CMap(.bcmap)만 vendor/pdfjs-cmaps/에서 읽고 그 밖의 종류(표준 글꼴·wasm)는 거부한다.
// 파일 이름은 PDF 안의 값에서 오므로 형식을 검사해 폴더 밖 경로를 만들지 못하게 한다
const CMAP_DIR = new URL("../vendor/pdfjs-cmaps/", import.meta.url);
const CMAP_FILE = /^[A-Za-z0-9][A-Za-z0-9_+-]{0,63}\.bcmap$/;
export class LocalBinaryDataFactory {
  async fetch({ kind, filename }) {
    if (kind !== "cMapUrl") throw new Error(`binary data not bundled: ${String(kind).slice(0, 30)}`);
    if (typeof filename !== "string" || !CMAP_FILE.test(filename)) throw new Error(`invalid CMap file name: ${String(filename).slice(0, 40)}`);
    return new Uint8Array(await readFile(new URL(filename, CMAP_DIR)));
  }
}

const SIGNATURE = Buffer.from("%PDF-");
// 시그니처는 파일 맨 앞이 원칙이지만 앞에 쓰레기 바이트가 붙은 PDF도 리더들이 열어 주므로 앞 1,024바이트 안에서 찾는다
export const hasPdfSignature = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, 1024).includes(SIGNATURE);

// 공백 제외 글자 수가 이보다 적으면 "텍스트 없음"(스캔본 등)
export const MIN_TEXT_CHARS = 50;
// 읽은 페이지 중 공백 제외 글자가 이보다 적은 페이지는 "글자 없는 페이지"로 센다
const MIN_PAGE_CHARS = 10;

const nonSpaceLength = (s) => [...s.replace(/\s+/g, "")].length;
const codePoints = (s) => [...s].length;

// 문서 언어: 글자(\p{L}) 중 한글 30% 이상이면 ko, 라틴 70% 이상이면 en
export function detectLanguage(text) {
  let letters = 0;
  let hangul = 0;
  let latin = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    if (/[\p{Script=Hangul}]/u.test(ch)) hangul++;
    else if (/\p{Script=Latin}/u.test(ch)) latin++;
  }
  if (!letters) return "other";
  if (hangul / letters >= 0.3) return "ko";
  if (latin / letters >= 0.7) return "en";
  return "other";
}

// 표시용 문자열 정리: 제어 문자·양방향 덮어쓰기 문자 제거, 공백 정리, 코드 포인트 기준으로 자름
export function cleanDisplayText(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .normalize("NFC")
    .replace(/[\p{Cc}​‪-‮⁦-⁩﻿]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return [...cleaned].slice(0, maxLength).join("");
}

// PDF 메타데이터 제목. 의미 없는 값(Untitled, "Microsoft Word - 파일.docx", 파일 이름 같은 값)은 null
export function cleanTitle(raw) {
  const title = cleanDisplayText(raw, 200);
  if (!title) return null;
  if (/^(untitled|제목\s*없음|무제|document\d*|doc\d*)$/i.test(title)) return null;
  if (/^microsoft (word|powerpoint|excel)\s*-/i.test(title)) return null;
  if (/\.(pdf|docx?|pptx?|xlsx?|hwpx?|txt|rtf|odt)$/i.test(title)) return null;
  if (!/[\p{L}\p{N}]/u.test(title)) return null;
  return title;
}

const HANGUL = /\p{Script=Hangul}/u;

// 한 페이지의 텍스트 항목(PDF.js getTextContent의 items) → 줄 단위 텍스트.
// - 같은 줄(기준선 y가 글자 크기 절반 안)의 항목을 이어 붙이고, 사이가 벌어졌을 때만 공백 1칸을 넣는다
//   (한글끼리는 기준을 넉넉히 둬 자간 때문에 "안 녕 하 세 요"처럼 갈라지지 않게 함)
// - 줄 간격이 그 쪽의 보통 줄 간격(중앙값)보다 눈에 띄게 넓으면 빈 줄(문단 경계)을 넣는다 (나중에 문단 단위로 조각을 나눌 수 있게).
//   줄 간격 설정(160%·200% 등)이 문서마다 달라 글자 크기 배수 하나로는 정할 수 없다
export function buildPageText(items) {
  const rows = []; // { text, y, size }
  // 줄 조각은 배열에 모았다가 줄이 끝날 때 한 번만 join한다. 줄 끝 글자는 lastChar로 따로 들고 있어
  // 같은 줄에 항목이 수만 개여도 항목마다 줄 전체를 보지 않는다 (QA B-1: 예전 방식은 O(n²))
  let parts = [];
  let lastChar = "";
  let lineY = null; // 지금 줄의 기준선
  let lastEndX = null;
  let lastSize = 12;

  const flush = () => {
    const text = parts.join("").replace(/[ \t\u00A0\u3000]+/g, " ").trim();
    if (text) rows.push({ text: collapseSpacedHangul(text), y: lineY, size: lastSize });
    parts = [];
    lastChar = "";
    lineY = null;
    lastEndX = null;
  };
  const append = (str) => {
    parts.push(str);
    lastChar = str.at(-1);
  };

  for (const item of items) {
    if (typeof item?.str !== "string") continue; // 표시 내용 표시(marked content) 항목
    const str = item.str;
    const [, , c = 0, d = 0, x = 0, y = 0] = Array.isArray(item.transform) ? item.transform : [];
    const size = Math.hypot(c, d) || item.height || lastSize;
    const visible = str.trim() !== "";

    if (visible) {
      if (lineY !== null && Math.abs(y - lineY) > size * 0.5) flush();
      if (parts.length && lastEndX !== null && !/\s/.test(lastChar) && !/^\s/.test(str)) {
        const gap = x - lastEndX;
        const bothHangul = HANGUL.test(lastChar) && HANGUL.test(str[0]);
        if (gap > size * (bothHangul ? 0.3 : 0.2)) append(" ");
      }
      append(str);
      lineY = y;
      lastEndX = x + (Number(item.width) || 0);
      lastSize = size;
    } else if (str && parts.length) {
      append(" ");
    }
    if (item.hasEOL) flush();
  }
  flush();

  // 아래로 내려가는 줄 간격만 모아 중앙값을 보통 줄 간격으로 본다 (단 바뀜·위로 되돌아감은 문단 경계로 보지 않음)
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1].y - rows[i].y;
    if (gap > 0) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  const typical = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 0;
  const out = [];
  rows.forEach((row, i) => {
    if (i > 0) {
      const gap = rows[i - 1].y - row.y;
      const size = Math.max(rows[i - 1].size, row.size);
      if (gap > Math.max(typical * 1.3, size * 1.5)) out.push("");
    }
    out.push(row.text);
  });
  return out.join("\n");
}

// 자간을 넓혀 한 글자씩 띄운 제목 줄("목 차", "요 약 문")만 붙인다. 줄 전체가 한 글자 한글 낱말 2~10개일 때만
function collapseSpacedHangul(text) {
  return /^(\p{Script=Hangul} ){1,9}\p{Script=Hangul}$/u.test(text) ? text.replace(/ /g, "") : text;
}

// 추출 텍스트 정리: NFC(분리된 자모 합치기), 제어 문자·소프트 하이픈 제거
function normalizeText(text) {
  return text
    .normalize("NFC")
    .replace(/­/g, "")
    .replace(/[\p{Cc}--[\n\t]]/gv, "")
    .replace(/\t/g, " ");
}

// 클라이언트가 연결을 끊어 멈춘 경우 (응답할 곳이 없으므로 로그에만 남는다)
function cancelled() {
  const err = new ApiError("INTERNAL_ERROR", "요청이 취소되었습니다.", "client closed during extraction");
  err.cancelled = true;
  return err;
}

const shortMessage = (err) => `${err?.name ?? "Error"}: ${err?.message ?? err}`.slice(0, 200);

// PDF.js 문서 열기 오류 → API 오류
function openError(err) {
  if (err?.name === "PasswordException") return new ApiError("PDF_ENCRYPTED", undefined, shortMessage(err));
  return new ApiError("PDF_CORRUPTED", undefined, shortMessage(err));
}

/**
 * 추출기를 만든다. 반환 함수: extractPdf(buffer, { signal }) → Promise<ExtractedPdf>
 *
 * ExtractedPdf = {
 *   bytes,              // 업로드 크기
 *   pages,              // 전체 페이지 수
 *   processedPages,     // 실제로 읽은 페이지 수 (≤ maxPages. 글자 상한에 먼저 닿으면 그보다 적을 수 있음)
 *   pagesWithoutText,   // 읽은 페이지 중 공백 제외 10자 미만인 페이지 수
 *   characters,         // pageTexts의 text 코드 포인트 합 (≤ maxChars)
 *   language,           // "ko" | "en" | "other"
 *   title,              // 메타데이터 제목 또는 null
 *   truncatedPages,     // pages > maxPages 라서 뒤쪽 페이지를 읽지 않음
 *   truncatedChars,     // 글자 상한(maxChars)에 닿아 뒤쪽 텍스트를 버림
 *   itemCappedPages,    // 텍스트 항목이 maxItemsPerPage를 넘어 뒷부분을 읽지 않은 쪽 수 (PDF 폭탄 대비)
 *   pageTexts: [{ page, text }], // 읽은 페이지마다 1개(글자 없는 페이지는 text ""), page는 1부터. 줄은 "\n", 문단은 "\n\n"
 * }
 * 실패: ApiError PDF_ENCRYPTED | PDF_CORRUPTED | PDF_TOO_COMPLEX(timeoutMs 초과·워커 메모리 초과) | PDF_NO_TEXT,
 *       signal이 abort되면 err.cancelled = true 인 오류.
 *
 * 기본은 worker_threads 워커 1개를 요청마다 띄워 그 안에서 추출한다 (QA B-1).
 * - PDF.js와 줄 재구성은 동기로 오래 도는 구간이 있어 주 스레드에서 돌리면 서버 전체(다이어리 포함)가 멈춘다.
 * - 시간 초과·취소 때 worker.terminate()로 확실히 멈추고, resourceLimits로 메모리를 묶어 OOM이 나도 워커만 죽는다.
 * - 돌려주는 프로미스는 워커가 완전히 끝난(exit) 뒤에 정해진다 → 동시 1건 자리가 풀린 뒤 뒤에서 도는 작업이 없다.
 * - buffer는 워커로 넘긴다(transfer, 복사 없음). 그 Buffer가 ArrayBuffer 전체를 쓰고 있으면 호출 뒤 비워지므로 다시 쓰지 않는다
 *   (Node 풀 버퍼 등 일부만 쓰는 Buffer는 복사해서 넘긴다). transfer: false면 항상 복사한다.
 * loadPdfjs를 주면(테스트용 느린·가짜 PDF.js) 워커 없이 이 스레드에서 돈다(useWorker로 바꿀 수 있음).
 */
export function createPdfExtractor({
  maxPages = 200,
  maxChars = 200000,
  timeoutMs = 15000,
  maxItemsPerPage = 50000,
  workerMemoryMb = 512,
  transfer = true,
  loadPdfjs,
  useWorker = !loadPdfjs,
} = {}) {
  const limits = { maxPages, maxChars, maxItemsPerPage };

  if (useWorker) {
    return function extractPdf(buffer, { signal } = {}) {
      return runInWorker(buffer, { signal, limits, timeoutMs, workerMemoryMb, transfer });
    };
  }

  // 같은 스레드에서 추출 (테스트용). 시간 상한은 타이머 + 쪽마다 시각 확인이라, 한 쪽 처리 중에는 끊지 못한다
  const load = loadPdfjs ?? getResolvedPDFJS;
  return async function extractPdf(buffer, { signal } = {}) {
    if (signal?.aborted) throw cancelled();
    const pdfjs = await load();
    let timer;
    let onAbort;
    let stopped = false;
    const deadline = Date.now() + timeoutMs;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => {
        stopped = true;
        reject(new ApiError("PDF_TOO_COMPLEX", undefined, `extraction exceeded ${timeoutMs}ms`));
      }, timeoutMs);
      onAbort = () => {
        stopped = true;
        reject(cancelled());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    // PDF.js가 ArrayBuffer를 넘겨받아 원본이 비워질 수 있어 복사본을 준다
    let task = null;
    const work = readPdfText(pdfjs, new Uint8Array(buffer), limits, {
      isStopped: () => stopped || Date.now() > deadline,
      timeoutMs,
      onTask: (t) => (task = t),
    });
    work.catch(() => {}); // 시간 초과로 먼저 끝난 뒤의 오류는 버린다
    try {
      return await Promise.race([work, guard]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      // 문서 열기에서 멈췄어도 문서 객체를 정리한다
      Promise.resolve(task?.destroy?.()).catch(() => {});
    }
  };
}

const WORKER_URL = new URL("./pdf-worker.js", import.meta.url);

// Buffer → 워커로 넘길 ArrayBuffer. ArrayBuffer 전체를 쓰는 Buffer만 그대로 넘기고, 나머지는 필요한 부분만 복사한다
function toTransferable(buffer, transfer) {
  const whole = buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength && buffer.buffer instanceof ArrayBuffer;
  if (transfer && whole) return buffer.buffer;
  return new Uint8Array(buffer).buffer;
}

function runInWorker(buffer, { signal, limits, timeoutMs, workerMemoryMb, transfer }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const bytes = buffer.length;
    const worker = new Worker(WORKER_URL, {
      resourceLimits: { maxOldGenerationSizeMb: workerMemoryMb, maxYoungGenerationSizeMb: Math.min(64, Math.max(8, Math.floor(workerMemoryMb / 8))) },
      stdout: true, // 워커의 콘솔 출력은 버린다 (PDF.js 경고 등)
      stderr: true,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    let outcome = null; // 처음 정해진 결과만 쓴다 ({ value } | { error })
    const settle = (o) => {
      if (!outcome) outcome = o;
    };
    const stop = (error) => {
      settle({ error });
      worker.terminate().catch(() => {});
    };
    const timer = setTimeout(() => stop(new ApiError("PDF_TOO_COMPLEX", undefined, `extraction exceeded ${timeoutMs}ms`)), timeoutMs);
    const onAbort = () => stop(cancelled());
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.on("message", (msg) => {
      if (msg?.ok) settle({ value: { ...msg.result, bytes } });
      else settle({ error: new ApiError(msg?.error?.code, undefined, msg?.error?.detail ?? "") });
      worker.terminate().catch(() => {});
    });
    worker.on("error", (err) => {
      if (err?.code === "ERR_WORKER_OUT_OF_MEMORY") settle({ error: new ApiError("PDF_TOO_COMPLEX", undefined, `extraction worker out of memory (limit ${workerMemoryMb}MB)`) });
      else settle({ error: new ApiError("INTERNAL_ERROR", undefined, `pdf worker error: ${shortMessage(err)}`) });
    });
    // 워커가 완전히 끝난 뒤에만 결과를 돌려준다 (자리를 놓은 뒤 뒤에서 도는 추출이 없게)
    worker.on("exit", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle({ error: new ApiError("INTERNAL_ERROR", undefined, `pdf worker exited with code ${code}`) });
      if (outcome.error) reject(outcome.error);
      else resolve(outcome.value);
    });

    const data = toTransferable(buffer, transfer);
    worker.postMessage({ data, limits, timeoutMs }, [data]);
  });
}

// 한 쪽의 텍스트 항목을 스트림으로 받는다. 항목 수 상한이나 글자 예산에 닿으면 남은 항목을 읽지 않고 멈춘다
async function readPageItems(page, maxItems, charBudget) {
  const reader = page.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader();
  const items = [];
  let raw = 0;
  let cut = null; // "items" | "chars"
  try {
    while (!cut) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const item of value?.items ?? []) {
        if (items.length >= maxItems) {
          cut = "items";
          break;
        }
        items.push(item);
        raw += typeof item?.str === "string" ? item.str.length : 0;
        if (raw > charBudget) {
          cut = "chars";
          break;
        }
      }
    }
  } finally {
    if (cut) await reader.cancel().catch(() => {});
  }
  return { items, cut };
}

/**
 * PDF.js로 문서를 열어 쪽별 텍스트를 만든다 (워커 안 또는 테스트에서 같은 스레드로 호출).
 * isStopped: 쪽 사이마다 확인해 true면 PDF_TOO_COMPLEX. onTask: 문서 열기 작업(loadingTask)을 받아 밖에서 정리할 때. 결과의 bytes는 data 길이.
 */
export async function readPdfText(pdfjs, data, { maxPages = 200, maxChars = 200000, maxItemsPerPage = 50000 } = {}, { isStopped = () => false, timeoutMs = 0, onTask } = {}) {
  const bytes = data.length;
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false, // 글꼴 처리에 eval(new Function)을 쓰지 않는다
    enableXfa: false, // XFA 폼 무시
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0, // 경고를 콘솔에 찍지 않는다 (오류만)
    BinaryDataFactory: LocalBinaryDataFactory,
    cMapPacked: true,
    useWorkerFetch: false, // 워커가 직접 읽지 않고 위 객체로 요청하게 한다
  });
  onTask?.(task);
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      throw openError(err);
    }
    const pages = doc.numPages;
    const lastPage = Math.min(pages, maxPages);
    const pageTexts = [];
    let characters = 0;
    let truncatedChars = false;
    let itemCappedPages = 0;
    let failedPages = 0;
    for (let n = 1; n <= lastPage; n++) {
      // 쪽 사이마다 이벤트 루프에 양보한다 (같은 스레드 모드에서 시간 초과 타이머·연결 끊김이 처리될 수 있게)
      await yieldToEventLoop();
      if (isStopped()) throw new ApiError("PDF_TOO_COMPLEX", undefined, `extraction exceeded ${timeoutMs}ms at page ${n}`);
      let text = "";
      try {
        const page = await doc.getPage(n);
        // 원문 글자 수가 남은 글자 예산의 2배(+여유)를 넘으면 더 읽지 않는다 (공백 정리로 줄어드는 몫을 넉넉히 둠)
        const { items, cut } = await readPageItems(page, maxItemsPerPage, (maxChars - characters) * 2 + 1000);
        text = normalizeText(buildPageText(items));
        if (cut === "items") itemCappedPages++;
        if (cut === "chars") truncatedChars = true;
        page.cleanup?.();
      } catch {
        // 한 페이지가 깨져도 나머지는 읽는다. 모든 페이지가 깨졌으면 아래에서 손상으로 본다
        failedPages++;
      }
      const length = codePoints(text);
      if (characters + length > maxChars) {
        text = [...text].slice(0, maxChars - characters).join("");
        truncatedChars = true;
      }
      characters += codePoints(text);
      pageTexts.push({ page: n, text });
      if (truncatedChars) break;
    }
    if (failedPages && failedPages === pageTexts.length) {
      throw new ApiError("PDF_CORRUPTED", undefined, `all ${failedPages} pages failed to parse`);
    }

    const allText = pageTexts.map((p) => p.text).join("\n");
    if (nonSpaceLength(allText) < MIN_TEXT_CHARS) {
      throw new ApiError("PDF_NO_TEXT", undefined, `non-space chars: ${nonSpaceLength(allText)} in ${pageTexts.length} pages`);
    }
    let title = null;
    try {
      const meta = await doc.getMetadata();
      title = cleanTitle(meta?.metadata?.get?.("dc:title") || meta?.info?.Title);
    } catch {
      // 메타데이터가 깨져도 본문은 쓸 수 있다
    }
    return {
      bytes,
      pages,
      processedPages: pageTexts.length,
      pagesWithoutText: pageTexts.filter((p) => nonSpaceLength(p.text) < MIN_PAGE_CHARS).length,
      characters,
      language: detectLanguage(allText),
      title,
      truncatedPages: pages > maxPages,
      truncatedChars,
      itemCappedPages,
      pageTexts,
    };
  } finally {
    // 문서 객체를 정리해 응답 뒤에 참조가 남지 않게 한다
    Promise.resolve(task.destroy?.()).catch(() => {});
  }
}

// 문서 상태 안내(10.2절 서버 고정 문구 중 문서 쪽). 요약 경로(rerank/head) 안내는 요약기가 앞에 붙이고 전체는 3개까지
export function documentNotices(extracted, { maxPages = 200, maxChars = 200000 } = {}) {
  const notices = [];
  if (extracted.truncatedPages) notices.push(`${extracted.pages}쪽 중 앞 ${maxPages}쪽만 읽었어요.`);
  if (extracted.truncatedChars) notices.push(`글자가 많아 앞부분 ${maxChars.toLocaleString("en-US")}자까지만 읽었어요.`);
  if (extracted.pagesWithoutText > 0) notices.push(`글자가 없는 페이지 ${extracted.pagesWithoutText}쪽(스캔 이미지 등)은 요약에서 빠졌어요.`);
  return notices;
}
