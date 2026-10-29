// 작성일시: 2026-10-28 14:45
// PDF 검사·추출 모듈(src/pdf.js) 테스트. 픽스처 PDF는 tests/fixtures/pdf-builder.js로 테스트 중에 만든다(파일로 저장하지 않음)
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import {
  buildPageText,
  cleanDisplayText,
  cleanTitle,
  createPdfExtractor,
  detectLanguage,
  documentNotices,
  hasPdfSignature,
  LocalBinaryDataFactory,
  watchMemoryGrowth,
} from "../src/pdf.js";
import { buildPdf, charByChar, lines } from "./fixtures/pdf-builder.js";

const extract = createPdfExtractor();
const KO_LINES = ["전기차 충전 시장 보고서입니다.", "올해 충전기 설치 수는 전년보다 42% 늘었어요.", "지방 충전소 부족이 가장 큰 과제입니다."];
// 쪽 너비(595pt) 안에 들어가는 길이로 둔다 (PDF.js는 쪽 밖으로 나간 글자를 버린다)
const EN_TEXT = "Large language models summarize long documents for busy readers.";

async function expectCode(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code} (${err.detail})`);
    return true;
  });
}

describe("시그니처", () => {
  test("%PDF- 로 시작하면 PDF, 앞 1,024바이트 안에 있으면 허용", () => {
    assert.equal(hasPdfSignature(buildPdf([{ items: lines(["x"]) }])), true);
    assert.equal(hasPdfSignature(Buffer.concat([Buffer.alloc(500, 0x20), Buffer.from("%PDF-1.7\n")])), true);
  });
  test("PNG·텍스트·1,024바이트 뒤 시그니처는 PDF가 아님", () => {
    assert.equal(hasPdfSignature(Buffer.from("89504E470D0A1A0A0000000D49484452", "hex")), false);
    assert.equal(hasPdfSignature(Buffer.from("이건 그냥 텍스트 파일이에요.")), false);
    assert.equal(hasPdfSignature(Buffer.concat([Buffer.alloc(1100, 0x20), Buffer.from("%PDF-1.7")])), false);
    assert.equal(hasPdfSignature(Buffer.alloc(0)), false);
  });
});

describe("텍스트 추출", () => {
  test("한글 1쪽: 쪽 번호·줄·언어·제목", async () => {
    const pdf = buildPdf([{ items: lines(KO_LINES) }], { title: "2026 시장조사 보고서" });
    const r = await extract(pdf);
    assert.equal(r.pages, 1);
    assert.equal(r.processedPages, 1);
    assert.equal(r.language, "ko");
    assert.equal(r.title, "2026 시장조사 보고서");
    assert.equal(r.bytes, pdf.length);
    assert.deepEqual(r.pageTexts, [{ page: 1, text: KO_LINES.join("\n") }]);
    assert.equal(r.characters, [...KO_LINES.join("\n")].length);
    assert.equal(r.pagesWithoutText, 0);
    assert.equal(r.truncatedPages, false);
    assert.equal(r.truncatedChars, false);
  });

  test("영문 여러 쪽: 쪽마다 텍스트와 쪽 번호를 유지한다", async () => {
    const pdf = buildPdf([1, 2, 3].map((n) => ({ items: lines([`Page ${n} heading`, EN_TEXT]) })));
    const r = await extract(pdf);
    assert.equal(r.pages, 3);
    assert.equal(r.language, "en");
    assert.equal(r.title, null);
    assert.deepEqual(r.pageTexts.map((p) => p.page), [1, 2, 3]);
    assert.equal(r.pageTexts[1].text, `Page 2 heading\n${EN_TEXT}`);
  });

  test("글자마다 따로 그린 한글 줄도 낱말 공백만 남기고 이어 붙인다", async () => {
    const r = await extract(buildPdf([{ items: [...charByChar("한 글자씩 그린 줄입니다"), ...lines([EN_TEXT], { y: 600 })] }]));
    assert.equal(r.pageTexts[0].text.split("\n")[0], "한 글자씩 그린 줄입니다");
  });

  test("자간이 조금 벌어진 한글(0.1em)은 붙이고, 한 글자씩 띄운 제목 줄(목 차)은 합친다", async () => {
    const spaced = [..."자간이넓은문장"].map((ch, i) => ({ text: ch, x: 72 + i * 13.2, y: 700, size: 12 }));
    const heading = charByChar("목 차", { y: 760 });
    const r = await extract(buildPdf([{ items: [...heading, ...spaced, ...lines([EN_TEXT], { y: 500 })] }]));
    const [first, second] = r.pageTexts[0].text.split("\n").filter(Boolean);
    assert.equal(first, "목차");
    assert.equal(second, "자간이넓은문장");
  });

  test("줄 사이가 넓으면 빈 줄(문단 경계)을 넣는다", async () => {
    const r = await extract(buildPdf([{ items: [...lines(["First paragraph line one", "line two"]), ...lines([EN_TEXT], { y: 600 })] }]));
    assert.equal(r.pageTexts[0].text, `First paragraph line one\nline two\n\n${EN_TEXT}`);
  });

  test("줄 간격이 넓은 문서(200%)라도 고른 간격이면 줄마다 빈 줄을 넣지 않는다", async () => {
    const r = await extract(buildPdf([{ items: lines([...KO_LINES, "마지막 줄입니다."], { gap: 2 }) }]));
    assert.equal(r.pageTexts[0].text, [...KO_LINES, "마지막 줄입니다."].join("\n"));
  });

  test("201쪽 PDF는 앞 200쪽만 읽고 표시한다", async () => {
    const pdf = buildPdf(Array.from({ length: 201 }, (_, i) => ({ items: lines([`Page ${i + 1} ${EN_TEXT}`]) })));
    const r = await extract(pdf);
    assert.equal(r.pages, 201);
    assert.equal(r.processedPages, 200);
    assert.equal(r.truncatedPages, true);
    assert.equal(r.pageTexts.at(-1).page, 200);
    assert.deepEqual(documentNotices(r), ["201쪽 중 앞 200쪽만 읽었어요."]);
  });

  test("글자 상한에 닿으면 그 뒤를 버리고 표시한다 (코드 포인트 기준)", async () => {
    const small = createPdfExtractor({ maxChars: 120 });
    const pdf = buildPdf([1, 2, 3].map(() => ({ items: lines([EN_TEXT]) })));
    const r = await small(pdf);
    assert.equal(r.characters, 120);
    assert.equal(r.truncatedChars, true);
    assert.equal(r.processedPages, 2); // 둘째 쪽에서 상한에 닿아 셋째 쪽은 읽지 않음
    assert.equal(r.pageTexts.map((p) => [...p.text].length).reduce((a, b) => a + b), 120);
    assert.deepEqual(documentNotices(r, { maxChars: 120 }), ["글자가 많아 앞부분 120자까지만 읽었어요."]);
  });

  test("일부 쪽만 글자가 없으면 pagesWithoutText로 센다", async () => {
    const pdf = buildPdf([{ items: lines([EN_TEXT]) }, { items: [], rect: true }, { items: lines([EN_TEXT]) }, { items: lines(["p.4"]) }]);
    const r = await extract(pdf);
    assert.equal(r.pagesWithoutText, 2);
    assert.equal(r.pageTexts[1].text, "");
    assert.deepEqual(documentNotices(r), ["글자가 없는 페이지 2쪽(스캔 이미지 등)은 요약에서 빠졌어요."]);
  });

  test("transfer: false면 업로드 버퍼를 바꾸지 않는다", async () => {
    const pdf = buildPdf([{ items: lines(KO_LINES) }, { items: lines([EN_TEXT]) }]);
    const copy = Buffer.from(pdf);
    await createPdfExtractor({ transfer: false })(pdf);
    assert.ok(pdf.equals(copy));
  });

  test("기본은 ArrayBuffer 전체를 쓰는 버퍼를 워커로 넘기고(복사 없음), 풀의 일부인 작은 버퍼는 복사해 넘긴다", async () => {
    const big = Buffer.alloc(8192);
    const pdf = buildPdf([{ items: lines(KO_LINES) }]);
    pdf.copy(big);
    const r = await extract(big);
    assert.equal(r.bytes, 8192);
    assert.equal(big.length, 0, "transfer 뒤에는 비워진다");
    const pooled = Buffer.from(pdf); // 4KB 미만 → Node 버퍼 풀의 일부
    await extract(pooled);
    assert.equal(pooled.length, pdf.length);
  });
});

describe("워커 추출 (QA B-1)", () => {
  const heavyPage = (n) => buildPdf([{ items: Array.from({ length: n }, () => ({ text: "Hello bomb text here", x: 72, y: 720 })) }]);

  test("항목 수 상한으로 잘린 쪽은 안내 문구로 알린다 (QA B-9), 순서는 페이지 → 글자 → 항목 → 글자 없는 쪽", async () => {
    const pdf = buildPdf([{ items: lines(Array.from({ length: 30 }, (_, i) => `Line ${i} ${EN_TEXT}`)) }]);
    const r = await createPdfExtractor({ maxItemsPerPage: 10 })(pdf);
    assert.deepEqual(documentNotices(r), ["내용이 아주 많은 쪽 1개는 앞부분만 읽었어요."]);
    const all = documentNotices({ pages: 250, truncatedPages: true, truncatedChars: true, itemCappedPages: 2, pagesWithoutText: 1 });
    assert.deepEqual(all, [
      "250쪽 중 앞 200쪽만 읽었어요.",
      "글자가 많아 앞부분 200,000자까지만 읽었어요.",
      "내용이 아주 많은 쪽 2개는 앞부분만 읽었어요.",
      "글자가 없는 페이지 1쪽(스캔 이미지 등)은 요약에서 빠졌어요.",
    ]);
  });

  test("watchMemoryGrowth: 시작 시점 대비 증가량이 상한을 넘을 때 한 번만 알린다 (QA B-7)", async () => {
    const values = [100, 150, 900, 1300, 5000];
    let i = 0;
    const calls = [];
    const stop = watchMemoryGrowth({ probe: () => values[Math.min(i++, values.length - 1)], limitBytes: 1000, intervalMs: 5, onExceed: (g) => calls.push(g) });
    await new Promise((r) => setTimeout(r, 80));
    stop();
    assert.deepEqual(calls, [1200]); // 1300 - 100. 그 뒤(5000)는 다시 부르지 않음
  });

  test("watchMemoryGrowth: 상한 안이면 부르지 않고, stop 뒤에는 재지 않는다", async () => {
    let n = 0;
    const stop = watchMemoryGrowth({ probe: () => (n++, 100), limitBytes: 10, intervalMs: 5, onExceed: () => assert.fail("should not fire") });
    await new Promise((r) => setTimeout(r, 40));
    stop();
    const after = n;
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(n, after);
  });

  test("추출 중 RSS 증가가 상한을 넘으면 워커를 멈추고 PDF_TOO_COMPLEX, 다음 추출은 정상 (측정 함수 주입)", async () => {
    let calls = 0;
    const probe = () => (calls++ === 0 ? 0 : 2048 * 1024 * 1024); // 시작 뒤 첫 측정부터 2GB 증가로 보이게
    const ex = createPdfExtractor({ maxRssGrowthMb: 1024, memoryCheckMs: 10, memoryProbe: probe, maxChars: 1e9, maxItemsPerPage: 1e9 });
    const t = Date.now();
    await assert.rejects(ex(heavyPage(80000)), (err) => err.code === "PDF_TOO_COMPLEX" && /memory grew 2048MB \(limit 1024MB\)/.test(err.detail));
    assert.ok(Date.now() - t < 2000, `${Date.now() - t}ms`);
    assert.equal((await extract(buildPdf([{ items: lines(KO_LINES) }]))).language, "ko");
  });

  test("maxRssGrowthMb: 0이면 RSS 감시를 하지 않는다", async () => {
    let calls = 0;
    const r = await createPdfExtractor({ maxRssGrowthMb: 0, memoryProbe: () => (calls++, 1e12) })(buildPdf([{ items: lines(KO_LINES) }]));
    assert.equal(r.language, "ko");
    assert.equal(calls, 0);
  });

  test("이미 넘겨져 비워진 버퍼를 다시 주면 워커를 기다리지 않고 바로 INTERNAL_ERROR (QA S-7)", async () => {
    const big = Buffer.alloc(8192);
    buildPdf([{ items: lines(KO_LINES) }]).copy(big);
    await extract(big);
    const t = Date.now();
    await assert.rejects(extract(big), (err) => err.code === "INTERNAL_ERROR" && /already transferred/.test(err.detail));
    assert.ok(Date.now() - t < 500);
  });

  test("쪽당 항목 수 상한을 넘으면 그 쪽의 나머지를 읽지 않고 표시한다", async () => {
    const pdf = buildPdf([{ items: lines(Array.from({ length: 30 }, (_, i) => `Line ${i} ${EN_TEXT}`)) }]);
    const r = await createPdfExtractor({ maxItemsPerPage: 10 })(pdf);
    assert.equal(r.itemCappedPages, 1);
    assert.equal(r.pageTexts[0].text.split("\n").length, 10);
  });

  test("글자 상한에 닿으면 남은 항목을 읽지 않고 멈춘다", async () => {
    const t = Date.now();
    const r = await createPdfExtractor({ maxChars: 1000 })(heavyPage(80000));
    assert.equal(r.characters, 1000);
    assert.equal(r.truncatedChars, true);
    assert.ok(Date.now() - t < 3000, `${Date.now() - t}ms`);
  });

  test("워커 메모리 상한을 넘으면 PDF_TOO_COMPLEX, 프로세스는 살아 있다", async () => {
    const extractSmall = createPdfExtractor({ workerMemoryMb: 16, maxChars: 1e9, maxItemsPerPage: 1e9, timeoutMs: 30000 });
    await expectCode(extractSmall(heavyPage(80000)), "PDF_TOO_COMPLEX");
    // 다음 추출도 정상
    assert.equal((await extract(buildPdf([{ items: lines(KO_LINES) }]))).language, "ko");
  });

  test("워커 추출 중 abort → cancelled, 결과는 워커가 끝난 뒤에 정해진다", async () => {
    const controller = new AbortController();
    const run = createPdfExtractor({ maxChars: 1e9, maxItemsPerPage: 1e9 })(heavyPage(80000), { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    const t = Date.now();
    await assert.rejects(run, (err) => err.cancelled === true);
    assert.ok(Date.now() - t < 2000);
  });

  test("이미 abort된 signal이면 워커를 띄우지 않고 cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(extract(buildPdf([{ items: lines(KO_LINES) }]), { signal: controller.signal }), (err) => err.cancelled === true);
  });
});

describe("미리 정의된 CJK CMap (글꼴 파일·ToUnicode 없는 한글 PDF)", () => {
  for (const cjkCMap of ["UniKS-UCS2-H", "UniKS-UTF16-H"]) {
    test(`${cjkCMap}: vendor/pdfjs-cmaps의 CMap으로 글자를 읽는다`, async () => {
      const r = await extract(buildPdf([{ items: lines(KO_LINES) }], { cjkCMap }));
      assert.equal(r.pageTexts[0].text, KO_LINES.join("\n"));
      assert.equal(r.language, "ko");
    });
  }
  test("vendor 폴더에 한글 CMap과 라이선스가 있다", () => {
    for (const name of ["UniKS-UCS2-H.bcmap", "UniKS-UTF16-H.bcmap", "KSCms-UHC-H.bcmap", "KSC-EUC-H.bcmap", "Adobe-Korea1-UCS2.bcmap", "LICENSE", "LICENSE-pdfjs", "README.md"]) {
      assert.ok(existsSync(new URL(`../vendor/pdfjs-cmaps/${name}`, import.meta.url)), name);
    }
  });
  test("로컬 읽기 객체는 CMap 이름 형식만 받고 다른 종류·경로는 거부한다", async () => {
    const f = new LocalBinaryDataFactory();
    assert.ok((await f.fetch({ kind: "cMapUrl", filename: "UniKS-UCS2-H.bcmap" })).length > 0);
    for (const filename of ["../package.json", "..\\x.bcmap", "a/b.bcmap", "UniKS-UCS2-H", ".bcmap"]) {
      await assert.rejects(f.fetch({ kind: "cMapUrl", filename }), /invalid CMap file name/, filename);
    }
    await assert.rejects(f.fetch({ kind: "standardFontDataUrl", filename: "FoxitSans.pfb" }), /not bundled/);
    await assert.rejects(f.fetch({ kind: "cMapUrl", filename: "NoSuchCMap-H.bcmap" }));
  });
});

describe("요약할 수 없는 PDF", () => {
  test("이미지(도형)만 있는 1쪽 → PDF_NO_TEXT", async () => {
    await expectCode(extract(buildPdf([{ items: [], rect: true }])), "PDF_NO_TEXT");
  });
  test("빈 쪽 → PDF_NO_TEXT", async () => {
    await expectCode(extract(buildPdf([{ items: [] }])), "PDF_NO_TEXT");
  });
  test("공백 제외 50자 미만 → PDF_NO_TEXT", async () => {
    await expectCode(extract(buildPdf([{ items: lines(["Cover page only"]) }])), "PDF_NO_TEXT");
  });
  test("열기 암호 PDF → PDF_ENCRYPTED", async () => {
    await expectCode(extract(buildPdf([{ items: lines([EN_TEXT]) }], { encrypt: { userPassword: "secret", ownerPassword: "owner" } })), "PDF_ENCRYPTED");
  });
  test("권한 암호만 있는 PDF(열기 암호 없음)는 정상으로 읽는다", async () => {
    const pdf = buildPdf([{ items: lines([...KO_LINES, EN_TEXT]) }], { encrypt: { userPassword: "", ownerPassword: "owner" }, title: "권한 문서" });
    const r = await extract(pdf);
    assert.equal(r.pageTexts[0].text, [...KO_LINES, EN_TEXT].join("\n"));
    assert.equal(r.title, "권한 문서");
  });
  test("끝이 잘린 PDF → PDF_CORRUPTED (QA #12 기록: 절반 자르면 이 라이브러리는 열지 못함)", async () => {
    const pdf = buildPdf([1, 2].map(() => ({ items: lines([EN_TEXT]) })));
    await expectCode(extract(pdf.subarray(0, Math.floor(pdf.length / 2))), "PDF_CORRUPTED");
  });
  test("머리말만 PDF인 쓰레기 → PDF_CORRUPTED", async () => {
    await expectCode(extract(Buffer.from("%PDF-1.4\nthis is not really a pdf\n")), "PDF_CORRUPTED");
  });
});

describe("시간 상한·취소", () => {
  // 문서 열기가 끝나지 않는 가짜 PDF.js
  const hangingPdfjs = (state) => async () => ({
    getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => (state.destroyed = true) }),
  });

  test("추출이 timeoutMs를 넘으면 PDF_TOO_COMPLEX, 문서 객체를 정리한다", async () => {
    const state = {};
    const slow = createPdfExtractor({ timeoutMs: 50, loadPdfjs: hangingPdfjs(state) });
    const started = Date.now();
    await expectCode(slow(Buffer.from("%PDF-1.4")), "PDF_TOO_COMPLEX");
    assert.ok(Date.now() - started < 2000);
    assert.equal(state.destroyed, true);
  });

  test("실제 PDF도 시간 상한이 아주 짧으면 PDF_TOO_COMPLEX", async () => {
    const pdf = buildPdf(Array.from({ length: 50 }, () => ({ items: lines([EN_TEXT]) })));
    await expectCode(createPdfExtractor({ timeoutMs: 1 })(pdf), "PDF_TOO_COMPLEX");
  });

  test("signal이 abort되면 cancelled 오류로 멈춘다", async () => {
    const state = {};
    const controller = new AbortController();
    const run = createPdfExtractor({ timeoutMs: 5000, loadPdfjs: hangingPdfjs(state) })(Buffer.from("%PDF-1.4"), { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(run, (err) => err.cancelled === true);
    assert.equal(state.destroyed, true);
  });
});

describe("도움 함수", () => {
  test("buildPageText: 같은 줄 항목의 간격으로 공백을 정한다", () => {
    const item = (str, x, y, width, hasEOL = false) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL });
    const items = [item("Hello", 72, 700, 30), item("world", 106, 700, 30), item("한", 72, 680, 12), item("글", 85, 680, 12), item("", 0, 0, 0, true), item("next", 72, 660, 24)];
    assert.equal(buildPageText(items), "Hello world\n한글\nnext");
  });
  test("detectLanguage", () => {
    assert.equal(detectLanguage("안녕하세요 Large Language Model 보고서"), "ko");
    assert.equal(detectLanguage("This is English 텍스트"), "en");
    assert.equal(detectLanguage("これは日本語の文書です"), "other");
    assert.equal(detectLanguage("12345 !!!"), "other");
  });
  test("cleanTitle: 의미 없는 제목은 null", () => {
    for (const t of ["", "  ", "Untitled", "제목 없음", "Microsoft Word - 보고서.docx", "report_final.pdf", "---"]) assert.equal(cleanTitle(t), null, t);
    assert.equal(cleanTitle("  2026 시장조사\u0000 보고서 "), "2026 시장조사 보고서");
    assert.equal([...cleanTitle("가".repeat(300))].length, 200);
  });
  test("cleanDisplayText: 제어·양방향 문자를 지우고 200자로 자른다", () => {
    assert.equal(cleanDisplayText("보고서‮fdp.exe\n.pdf"), "보고서 fdp.exe .pdf");
    assert.equal(cleanDisplayText(null), null);
    assert.equal([...cleanDisplayText("😀".repeat(250))].length, 200);
  });
});
