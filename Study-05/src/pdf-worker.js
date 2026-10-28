// 작성일시: 2026-10-28 16:10
// PDF 텍스트 추출 워커 (worker_threads). src/pdf.js의 createPdfExtractor가 요청마다 하나 띄우고, 끝나면 terminate한다.
// 주 스레드를 막지 않게 PDF.js 파싱·줄 재구성을 여기서 돌린다. 메모리 상한·시간 상한은 주 스레드가 resourceLimits·terminate로 건다.
import { parentPort } from "node:worker_threads";
import { getResolvedPDFJS } from "unpdf";
import { ApiError } from "./errors.js";
import { readPdfText } from "./pdf.js";

parentPort.once("message", async ({ data, limits, timeoutMs }) => {
  try {
    const pdfjs = await getResolvedPDFJS();
    const result = await readPdfText(pdfjs, new Uint8Array(data), limits, { timeoutMs });
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    // ApiError가 아닌 예외(버그)는 코드 없이 보내 주 스레드에서 INTERNAL_ERROR가 되게 한다
    const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
    const detail = err instanceof ApiError ? err.detail : `${err?.name ?? "Error"}: ${err?.message ?? err}`.slice(0, 200);
    parentPort.postMessage({ ok: false, error: { code, detail } });
  }
});
