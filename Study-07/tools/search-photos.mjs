// 작성일시: 2026-11-03 15:15
// 카카오 이미지 검색 API로 빵집별 대표 사진(검색 결과 썸네일 + 원본 글 출처)을 찾아 UPDATE SQL을 만듦
// 사용: KAKAO_REST_KEY=... node tools/search-photos.mjs <출력.sql> [--all]
//   기본은 photo_thumb_url이 비어 있는 빵집만, --all이면 전부 다시 검색
// REST 키는 서버용 비밀 키라 파일에 저장하지 않고 환경 변수로만 받음

import { writeFileSync } from "node:fs";
import { SUPABASE_URL, SUPABASE_KEY } from "../js/config.js";

const REST_KEY = process.env.KAKAO_REST_KEY;
const [outPath, flag] = process.argv.slice(2);
if (!REST_KEY || !outPath) {
  console.error("사용: KAKAO_REST_KEY=... node tools/search-photos.mjs <출력.sql> [--all]");
  process.exit(1);
}

const filter = flag === "--all" ? "" : "&photo_thumb_url=is.null";
const res = await fetch(`${SUPABASE_URL}/rest/v1/bakeries?select=slug,name,district${filter}&order=id`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
if (!res.ok) throw new Error(`Supabase ${res.status}`);
const bakeries = await res.json();

// 이름이 일반 낱말(레시피, 시나몬 등)이어도 빵집 사진이 나오도록 지역·빵 낱말을 붙임
const queryFor = (b) => {
  const name = b.name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const bakeryWord = /베이커리|제과|빵|베이크|브레드|과자|파티세리|타르트|베이글|롤케이크/.test(name) ? "" : " 빵집";
  return `대전 ${name}${bakeryWord}`;
};

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const statements = [];
const report = [];
for (const b of bakeries) {
  const query = queryFor(b);
  const url = `https://dapi.kakao.com/v2/search/image?query=${encodeURIComponent(query)}&sort=accuracy&size=10`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${REST_KEY}` } });
  if (!r.ok) {
    console.error(`${b.name}: HTTP ${r.status} ${await r.text()}`);
    if (r.status === 401 || r.status === 403) process.exit(1);
    continue;
  }
  const { documents } = await r.json();
  // 너무 작은 이미지·세로로 긴 캡처(지도·메뉴판 캡처일 때가 많음)는 건너뛰고, 같은 글의 사진은 한 장만
  const seenDocs = new Set();
  const picks = documents
    .filter((d) => d.width >= 400 && d.height >= 300 && d.height / d.width <= 1.6)
    .filter((d) => !seenDocs.has(d.doc_url) && seenDocs.add(d.doc_url))
    .slice(0, 4)
    .map((d) => ({ thumb: d.thumbnail_url, doc: d.doc_url, site: d.display_sitename || "웹 문서" }));
  if (!picks.length) {
    report.push(`${b.name}\t(결과 없음)\t${query}`);
    continue;
  }
  const [first] = picks;
  statements.push(
    `update public.bakeries set photo_thumb_url = ${quote(first.thumb)}, photo_doc_url = ${quote(first.doc)}, photo_site = ${quote(first.site)}, photos = ${quote(JSON.stringify(picks))}::jsonb where slug = ${quote(b.slug)};`,
  );
  report.push(`${b.name}\t${picks.length}장\t${first.site}`);
  await sleep(120);
}

writeFileSync(outPath, `-- 카카오 이미지 검색 결과 (${new Date().toISOString()})\n${statements.join("\n")}\n`);
console.log(report.join("\n"));
console.log(`\n${statements.length}/${bakeries.length}곳 사진 찾음 → ${outPath}`);
