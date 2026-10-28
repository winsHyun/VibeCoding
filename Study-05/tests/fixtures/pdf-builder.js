// 작성일시: 2026-10-28 14:20
// 테스트용 작은 PDF를 코드로 만든다 (외부 도구 없이). 테스트 파일이 아니므로 node --test가 실행하지 않는다.
// - 영문: 표준 Type1 글꼴 Helvetica (WinAnsi, 글꼴 파일 없음)
// - 한글: Type0/Identity-H 글꼴 + ToUnicode CMap (CID = 유니코드 코드 포인트, 글꼴 파일 없음 → 글자 추출만 확인)
// - 암호화: 표준 보안 처리기 RC4 40비트(R2). 열기 암호(userPassword)·권한 암호만(ownerPassword) 둘 다 만들 수 있다
import { createHash } from "node:crypto";

// 표준 보안 처리기의 32바이트 채움 문자열 (PDF 1.7 7.6.3.3)
const PAD = Buffer.from("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A", "hex");

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

const md5 = (...parts) => createHash("md5").update(Buffer.concat(parts)).digest();
const padPassword = (pw) => Buffer.concat([Buffer.from(pw, "latin1"), PAD]).subarray(0, 32);

// R2 암호화 사전 값과 파일 키를 만든다
function makeEncryption({ userPassword = "", ownerPassword = "owner", permissions = -44 }, fileId) {
  const ownerKey = md5(padPassword(ownerPassword || userPassword)).subarray(0, 5);
  const O = rc4(ownerKey, padPassword(userPassword));
  const P = Buffer.alloc(4);
  P.writeInt32LE(permissions);
  const key = md5(padPassword(userPassword), O, P, fileId).subarray(0, 5);
  const U = rc4(key, PAD);
  return { O, U, P: permissions, key };
}

// 객체 번호별 RC4 키 (7.6.2 알고리즘 1)
function objectKey(fileKey, num) {
  const suffix = Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0]);
  return md5(fileKey, suffix).subarray(0, Math.min(fileKey.length + 5, 16));
}

const hex4 = (cp) => cp.toString(16).toUpperCase().padStart(4, "0");
const escapeLiteral = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);

// pages: [{ items: [{ text, x, y, size }] , rect?: true }]
// options: { title, encrypt: { userPassword, ownerPassword, permissions }, cjkCMap }
// cjkCMap: "UniKS-UCS2-H"처럼 미리 정의된 CMap 이름을 주면 한글 글꼴을 글꼴 파일·ToUnicode 없는 Adobe-Korea1 CID 글꼴로 만든다
//          (코드 = UCS-2 = 코드 포인트. 글자를 얻으려면 리더가 그 CMap 데이터를 가지고 있어야 함)
export function buildPdf(pages, { title, encrypt, cjkCMap } = {}) {
  // 한글 글꼴 ToUnicode에 넣을 코드 포인트(BMP만)
  const cjk = new Set();
  for (const page of pages) for (const item of page.items ?? []) if (!isAscii(item.text)) for (const ch of item.text) cjk.add(ch.codePointAt(0));

  const objects = []; // [num, body(Buffer|string), stream?]
  const add = (body, stream) => {
    objects.push({ body, stream });
    return objects.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const helv = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const codes = [...cjk].sort((a, b) => a - b);
  const bf = [];
  for (let i = 0; i < codes.length; i += 100) {
    const chunk = codes.slice(i, i + 100);
    bf.push(`${chunk.length} beginbfchar\n${chunk.map((c) => `<${hex4(c)}> <${hex4(c)}>`).join("\n")}\nendbfchar`);
  }
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Test-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange",
    ...bf,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
  const toUnicode = add("", Buffer.from(cmap, "latin1"));
  const cidFont = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestGothic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
      "/FontDescriptor << /Type /FontDescriptor /FontName /TestGothic /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >> " +
      "/DW 1000 /CIDToGIDMap /Identity >>",
  );
  const predefined = cjkCMap
    ? add(
        "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 1 >> " +
          "/FontDescriptor << /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >> /DW 1000 >>",
      )
    : null;
  const korean = cjkCMap
    ? add(`<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium-${cjkCMap} /Encoding /${cjkCMap} /DescendantFonts [${predefined} 0 R] >>`)
    : add(`<< /Type /Font /Subtype /Type0 /BaseFont /TestGothic /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`);

  const pageNums = [];
  for (const page of pages) {
    const ops = [];
    if (page.rect) ops.push("0.6 g 72 400 300 200 re f");
    for (const { text, x = 72, y = 720, size = 12 } of page.items ?? []) {
      const [font, str] = isAscii(text)
        ? ["/F1", `(${escapeLiteral(text)})`]
        : ["/F2", `<${[...text].map((ch) => hex4(ch.codePointAt(0))).join("")}>`];
      ops.push(`BT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${str} Tj ET`);
    }
    const content = add("", Buffer.from(ops.join("\n"), "latin1"));
    const pageNum = add(null);
    objects[pageNum - 1].body =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${helv} 0 R /F2 ${korean} 0 R >> >> /Contents ${content} 0 R >>`;
    pageNums.push(pageNum);
  }
  objects[catalog - 1].body = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1].body = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;

  const fileId = createHash("md5").update(`test-pdf-${pages.length}-${title ?? ""}`).digest();
  let enc = null;
  let encryptObj = null;
  if (encrypt) {
    enc = makeEncryption(encrypt, fileId);
    encryptObj = add(`<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${enc.O.toString("hex")}> /U <${enc.U.toString("hex")}> /P ${enc.P} >>`);
  }
  let info = null;
  if (title !== undefined) {
    // 제목은 UTF-16BE(BOM) 16진 문자열. 암호화 PDF에서는 문자열도 암호화한다
    let bytes = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(title, "utf16le").swap16()]);
    info = add(null);
    if (enc) bytes = rc4(objectKey(enc.key, info), bytes);
    objects[info - 1].body = `<< /Title <${bytes.toString("hex")}> >>`;
  }

  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach(({ body, stream }, i) => {
    const num = i + 1;
    offsets.push(offset);
    let part;
    if (stream) {
      const data = enc && num !== encryptObj ? rc4(objectKey(enc.key, num), stream) : stream;
      part = Buffer.concat([Buffer.from(`${num} 0 obj\n<< /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    } else {
      part = Buffer.from(`${num} 0 obj\n${body}\nendobj\n`, "latin1");
    }
    chunks.push(part);
    offset += part.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  const idHex = fileId.toString("hex");
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R` +
    (info ? ` /Info ${info} 0 R` : "") +
    (encryptObj ? ` /Encrypt ${encryptObj} 0 R` : "") +
    ` /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, "latin1"));
  return Buffer.concat(chunks);
}

// 한 줄을 글자마다 따로 그린다 (글자별 텍스트 항목 → 줄 재구성 확인용). gapAfter: 이 글자 뒤 띄울 폭(em)
export function charByChar(text, { x = 72, y = 720, size = 12 } = {}) {
  const items = [];
  let cx = x;
  for (const ch of text) {
    if (ch === " ") {
      cx += size; // 한글 글꼴 폭(1em)만큼 띄움 = 낱말 사이 공백
      continue;
    }
    items.push({ text: ch, x: cx, y, size });
    cx += isAscii(ch) ? size * 0.6 : size;
  }
  return items;
}

// 여러 줄 문단 (줄 간격 size*1.4)
export function lines(texts, { x = 72, y = 760, size = 12, gap = 1.4 } = {}) {
  return texts.map((text, i) => ({ text, x, y: y - i * size * gap, size }));
}
