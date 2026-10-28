// 작성일시: 2026-10-28 16:20
// PDF 요약 실측용 (수동 실행, 자동 테스트 아님). 켜 둔 서버에 짧은 한글 PDF 1건(full)과 긴 영문 PDF 1건(rerank)을 보내 결과·시간을 출력한다.
// 실제 OpenRouter 호출을 쓴다: 정상이면 full 1회 + rerank 2회 = 3회(최대 8회). 계정 하루 무료 한도(약 50회)를 다이어리와 함께 쓴다.
// 사용: npm start 로 서버를 켠 뒤  node scripts/pdf-live-check.js [short|long] [http://127.0.0.1:3000]
import { buildPdf, lines } from "../tests/fixtures/pdf-builder.js";

const which = process.argv[2] ?? "both";
const base = process.argv[3] ?? "http://127.0.0.1:3000";

// 짧은 한글 보고서 (2쪽)
// 줄이 길면 쪽 너비를 넘어 뒤가 잘려 추출되므로 한 줄을 짧게 둔다
const KO_PAGES = [
  [
    "2026 전기차 충전 인프라 현황 보고서",
    "요약: 국내 공용 충전기는 2026년 9월 기준",
    "48만 기로 전년보다 42% 늘었습니다.",
    "급속 충전기 비중은 14%에 머물러",
    "장거리 이동 수요를 따라가지 못합니다.",
    "수도권에 전체 충전기의 61%가 몰려 있고,",
    "강원·경북의 차량당 충전기 수는 수도권의 절반입니다.",
    "고장 신고는 월평균 3,200건이며",
    "수리까지 평균 6일이 걸립니다.",
  ],
  [
    "정책 제안",
    "첫째, 지방 고속도로 휴게소에",
    "급속 충전기를 2027년까지 1,500기 더 설치해야 합니다.",
    "둘째, 고장 수리 기한을 3일 이내로 정하고",
    "운영사 평가에 반영해야 합니다.",
    "셋째, 완속 충전기 보조금을",
    "지방 중소도시에 우선 배정해야 합니다.",
    "결론: 양적 확대는 성공했지만",
    "지역 격차와 유지 관리가 다음 과제입니다.",
  ],
];

// 긴 영문 보고서: 30쪽 × 약 2,200자. 1쪽 초록, 2~29쪽 본문(쪽마다 다른 주제·수치), 30쪽 결론
const TOPICS = [
  "battery recycling", "grid load at night", "fast charger uptime", "rural coverage", "payment interoperability", "fleet electrification",
  "charging prices", "public subsidies", "highway corridors", "apartment charging", "workplace charging", "maintenance contracts",
  "user satisfaction", "queue times", "solar canopies", "battery swapping", "heavy trucks", "bus depots", "cold weather range",
  "data sharing", "cybersecurity", "accessibility", "permitting delays", "grid upgrades", "tariff design", "vehicle to grid",
  "workforce training", "standards",
];
function englishPage(page) {
  const out = [];
  if (page === 1) {
    out.push("Electric Vehicle Charging Network Review 2026", "Abstract");
    out.push("This review evaluates the national charging network after the 2024 expansion plan.");
    out.push("Main finding: public chargers grew 42 percent to 480,000 units, but fast chargers are only 14 percent.");
    out.push("Rural regions have half the chargers per vehicle of the capital area, and repairs take 6 days on average.");
  } else if (page === 30) {
    out.push("Conclusions");
    out.push("The expansion succeeded in volume but not in balance. We recommend 1,500 new highway fast chargers by 2027,");
    out.push("a 3-day repair deadline for operators, and subsidies targeted at small rural cities.");
    out.push("Without these steps, rural EV adoption is projected to stall below 5 percent of new car sales.");
  } else {
    const topic = TOPICS[(page - 2) % TOPICS.length];
    out.push(`Section ${page}: ${topic}`);
    out.push(`This section discusses ${topic}. Survey data from ${page * 37} sites were collected in 2026.`);
  }
  let i = 0;
  while (out.join(" ").length < 2200) {
    out.push(`Paragraph ${i++} on page ${page}: operators reported routine observations that do not change the main findings.`);
  }
  return out;
}

const DOCS = {
  short: { name: "충전 인프라 보고서.pdf", pdf: () => buildPdf(KO_PAGES.map((t) => ({ items: lines(t, { size: 11 }) })), { title: "2026 전기차 충전 인프라 현황 보고서" }) },
  long: {
    name: "ev-charging-review-2026.pdf",
    pdf: () => buildPdf(Array.from({ length: 30 }, (_, i) => ({ items: lines(englishPage(i + 1), { size: 9, y: 780, gap: 1.25 }) })), { title: "Electric Vehicle Charging Network Review 2026" }),
  },
};

for (const key of which === "both" ? ["short", "long"] : [which]) {
  const doc = DOCS[key];
  const started = Date.now();
  const res = await fetch(`${base}/api/pdf/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(doc.name) },
    body: doc.pdf(),
  });
  const body = await res.json();
  console.log(`\n=== ${key}: HTTP ${res.status} in ${Date.now() - started}ms ===`);
  console.log(JSON.stringify(body, null, 2));
}
