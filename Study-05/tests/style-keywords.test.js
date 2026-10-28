// 작성일시: 2026-10-28 10:20
// B-15·B-16 말투 보정과 위기 일기 키워드 정리 테스트. OpenRouter는 가짜 chat으로 대신한다(실제 호출 없음).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildMessages,
  createAnalyzer,
  fixSpelling,
  hasBanmal,
  hasBanmalEnding,
  sanitizeCrisisKeywords,
  softenBanmal,
  STYLE_RETRY_NOTE,
} from "../src/diary.js";

const MODELS = ["a:free", "b:free", "c:free"];
const AI = { temperature: 0.4, maxTokens: 800, callTimeoutMs: 30000, maxCalls: 4, totalTimeoutMs: 60000, retryDelayMs: 0, modelCooldownMs: 0 };
const reply = (fields) => JSON.stringify({ primary: "sadness", intensity: 4, keywords: ["서운함"], empathy: "많이 힘드셨겠어요.", comfort: "곁에 있을게요.", crisis: false, ...fields });
const analyzerWith = (replies) => {
  const calls = [];
  const chat = async ({ model, messages }) => {
    calls.push(messages);
    const content = replies[calls.length - 1];
    if (content === undefined) throw new Error(`unexpected call #${calls.length}`);
    return { content, finishReason: "stop", model };
  };
  return { analyze: createAnalyzer({ chat, models: MODELS, ai: AI }), calls };
};

describe("B-15 '본인' 치환", () => {
  test("2인칭 활용형마다 뜻을 지키는 '본인' 형태로 바꾼다", () => {
    for (const [input, expected] of [
      ["너만 힘든 게 아니에요.", "본인만 힘든 게 아니에요."],
      ["그건 네 잘못이 아니에요.", "그건 본인 잘못이 아니에요."],
      ["네게 정말 고마운 하루였겠어요.", "본인에게 정말 고마운 하루였겠어요."],
      ["너한테 소중한 사람이군요.", "본인에게 소중한 사람이군요."],
      ["너도 애쓰셨어요.", "본인도 애쓰셨어요."],
      ["널 아끼는 마음이 느껴져요.", "본인을 아끼는 마음이 느껴져요."],
      // "당신"은 3인칭 높임으로도 쓰여 보정하지 않는다 (B-18)
      ["당신은 잘하고 있어요.", "당신은 잘하고 있어요."],
      ["당신의 하루를 응원해요.", "당신의 하루를 응원해요."],
      ["엄마가 네 편이었군요.", "엄마가 본인 편이었군요."],
      ["네 덕분에 다들 웃었겠어요.", "본인 덕분에 다들 웃었겠어요."],
      ["너희들이 함께해서 다행이에요.", "여러분이 함께해서 다행이에요."],
    ]) assert.equal(softenBanmal(input), expected, input);
  });
  test("따옴표 안('…' \"…\" 「…」 『…』)은 감지·보정하지 않는다", () => {
    for (const t of ["영화 『너의 이름은』을 보셨군요.", "노래 「너를 만나」가 위로가 됐군요.", '친구가 "너만 믿어"라고 했군요.']) {
      assert.equal(hasBanmal(t), false, t);
      assert.equal(softenBanmal(t), t, t);
    }
  });
  test("'네 편'은 수(네 편의 영화)일 때 그대로", () => {
    assert.equal(hasBanmal("영화를 네 편이나 보셨군요."), false);
    assert.equal(hasBanmal("하루에 네 편의 글을 쓰셨군요."), false);
  });
});

describe("B-16 문장 끝 반말 어미 감지", () => {
  test("문장 끝 반말 어미를 찾는다", () => {
    for (const t of ["정말 대단해.", "괜찮을 거야.", "오늘 힘들었니?", "많이 힘들었겠다.", "푹 쉬어야 해.", "잘했어. 응원할게요."]) {
      assert.equal(hasBanmalEnding(t), true, t);
    }
  });
  test("존댓말·인용·'~구나'(자동 보정)는 감지하지 않는다", () => {
    for (const t of [
      "정말 대단해요.", "힘드셨겠습니다.", "고생 많으셨네요, 네.", "오늘도 수고하셨어요!", "곁에 있을게요 :)",
      "친구가 '괜찮아'라고 해 줬군요.", "힘든 날이었겠구나.", "109(24시간)에 전화해 이야기를 나눠 보세요.", "벌써 네 해째예요.",
    ]) assert.equal(hasBanmalEnding(t), false, t);
  });
  test("반말 어미 답이면 1회 다시 요청하고, 존댓말 답을 쓴다 (어미는 기계로 고치지 않음)", async () => {
    const { analyze, calls } = analyzerWith([reply({ empathy: "정말 속상했겠다." }), reply({ empathy: "정말 속상하셨겠어요." })]);
    const r = await analyze("친구가 약속을 또 어겼어");
    assert.equal(calls.length, 2);
    assert.equal(r.empathy, "정말 속상하셨겠어요.");
    assert.equal(r.style, "banmal fixed");
  });
  test("재요청도 반말 어미면 그대로 두되 실패시키지 않는다", async () => {
    const { analyze, calls } = analyzerWith([reply({ empathy: "정말 속상했겠다." }), reply({ empathy: "정말 속상했겠다." })]);
    const r = await analyze("친구가 약속을 또 어겼어");
    assert.equal(calls.length, 2);
    assert.equal(r.empathy, "정말 속상했겠다.");
    assert.equal(r.style, "banmal patched");
  });
  test("재요청 지시에 문장 끝 어미 규칙이 있다", () => assert.match(STYLE_RETRY_NOTE, /~요 or ~세요/));
});

describe("맞춤법: 바래요 → 바라요 (답만)", () => {
  test("fixSpelling", () => {
    assert.equal(fixSpelling("위로가 되셨기를 바래요."), "위로가 되셨기를 바라요.");
    assert.equal(fixSpelling("그렇게 바랬어요."), "그렇게 바랐어요.");
    assert.equal(fixSpelling("오래 바랬던 일이군요."), "오래 바랐던 일이군요.");
    assert.equal(fixSpelling("바라요"), "바라요");
  });
  test("모델 답에는 적용하고 사용자 원문은 건드리지 않는다", async () => {
    const { analyze } = analyzerWith([reply({ comfort: "편히 쉬시길 바래요." })]);
    const r = await analyze("그렇게 되길 바랬어");
    assert.equal(r.comfort, "편히 쉬시길 바라요.");
  });
  test("프롬프트 예시·규칙에 반영", () => {
    const prompt = buildMessages("x")[0].content;
    assert.match(prompt, /바라요/);
    assert.match(prompt, /never 바래요/);
  });
});

describe("위기 일기 키워드: 죽음·자살·자해·수단 낱말 제외", () => {
  test("sanitizeCrisisKeywords", () => {
    assert.deepEqual(sanitizeCrisisKeywords(["무력감", "죽음", "자해"], "sadness"), ["무력감"]);
    assert.deepEqual(sanitizeCrisisKeywords(["죽음", "손목", "유서"], "tired"), ["지침"]);
    assert.deepEqual(sanitizeCrisisKeywords(["자살 충동"], "lonely"), ["외로움"]);
  });
  test("crisis: true 일기는 키워드가 감정 낱말만 남는다", async () => {
    const { analyze } = analyzerWith([reply({ primary: "sadness", keywords: ["무력감", "죽음"], crisis: true })]);
    const r = await analyze("왜 살아야 하는지 모르겠어. 그냥 그만 살래");
    assert.equal(r.crisis, true);
    assert.deepEqual(r.emotion.keywords, ["무력감"]);
    assert.match(r.comfort, /109/);
  });
  test("전부 빠지면 primary 기반 기본 키워드 1개", async () => {
    const { analyze } = analyzerWith([reply({ primary: "tired", keywords: ["죽음", "자살"] })]);
    const r = await analyze("다 끝내고 싶다");
    assert.equal(r.crisis, true);
    assert.deepEqual(r.emotion.keywords, ["지침"]);
  });
  test("위기가 아니면 키워드를 건드리지 않는다", async () => {
    const { analyze } = analyzerWith([reply({ keywords: ["피로", "야근"] })]);
    assert.deepEqual((await analyze("야근 3일째")).emotion.keywords, ["피로", "야근"]);
  });
  test("프롬프트에 위기 키워드 규칙", () => assert.match(buildMessages("x")[0].content, /keywords must be emotion words only/));
});
