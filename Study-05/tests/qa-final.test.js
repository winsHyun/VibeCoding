// 작성일시: 2026-10-27 18:10
// QA 최종 검증(§10): 이전 목록에 없던 새 문장으로 위기 감지 과적합 여부와 반말 보정 부작용을 확인한다.
// 처음에는 고쳐지지 않은 것을 { todo }(B-14, B-15, B-16)로 두었고, 고친 뒤 todo를 지웠다. 외부 API는 부르지 않는다.
// 같은 원칙으로 새로 만든 문장 묶음은 tests/crisis-generalization.test.js에 있다.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectCrisis, fixBanmalEndings, hasBanmal, softenBanmal } from "../src/diary.js";

describe("QA 최종: 새 위기 표현 (과적합 확인)", () => {
  // 현재 감지되는 새 문장 (회귀 방지)
  const detected = [
    "죽고싶다 진짜", "뒤지고싶다", "그냥 콱 죽어버릴까", "사는게 지옥이야", "살기싫다ㅠㅠ",
    "이 세상에서 없어지고 싶어", "자살 하고싶다", "i want to die", "thinking about suicide", "I want to kill myself lol",
    "wanna die", "자살각", "죽고 싶은 마음이 들어", "학교도 집도 다 싫고 사라지고 싶어", "요즘 계속 자해 생각이 나",
    "자살하고싶어ㅠ", "WANT TO DIE",
  ];
  for (const t of detected) test(`감지: ${t}`, () => assert.equal(detectCrisis(t), true));

  // B-14 (a) 직접적인 표현인데 놓침: 정규식으로 충분히 잡을 수 있는 것
  const missedDirect = [
    "살고싶지가 않아", "그만 살래", "더 살아서 뭐해", "왜 살아야 하는지 모르겠어", "태어나지 말았어야 했어",
    "이대로 잠들어서 안 깨어났으면", "눈 감고 다시 안 떴으면 좋겠다", "목을 매고 싶다", "삶이 의미가 없어",
    "극단적인 생각이 계속 들어", "다들 나 없는 게 낫겠지", "아무도 날 필요로 하지 않아 사라질래",
    "더는 버틸 힘이 없어 끝내고 싶어", "약을 한꺼번에 다 먹어버릴까 생각했어", "다리 위에서 뛰어내릴까 생각했어",
    "또 손목을 그었어", "손목에 칼 댔어",
    "I just want it all to end", "I feel like ending my life", "nobody would miss me if I was gone", "I don't wanna be here anymore",
  ];
  for (const t of missedDirect) test(`B-14 감지(직접 표현): ${t}`, () => assert.equal(detectCrisis(t), true));

  // B-14 (b) 오타·축약·띄어쓰기 변형
  const missedVariants = ["죽구싶어", "죽고 시퍼", "주글래", "ㅈㅅ하고 싶다", "죽 고 싶 다", "살기 시러"];
  for (const t of missedVariants) test(`B-14 감지(변형): ${t}`, () => assert.equal(detectCrisis(t), true));

  // B-14 (c) 같은 문장에 일·학교 같은 스트레스 원인이 있으면 예외 문맥(TASK_CONTEXT)에 걸려 위기 표현이 지워짐
  const suppressedByStressor = [
    "회사에서 또 깨지고 집에 오니 다 끝내고 싶다", "시험 망치고 나니 이제 그만하고 싶어", "공부도 안 되고 다 놓아 버리고 싶다",
    "연애도 끝났고 이제 다 그만두고 싶다",
  ];
  for (const t of suppressedByStressor) test(`B-14 감지(원인 문맥 동반): ${t}`, () => assert.equal(detectCrisis(t), true));
});

describe("QA 최종: 위기처럼 보이는 일상 표현 (새 문장)", () => {
  const benign = [
    "시험 망해서 죽겠다", "다리 아파 죽겠네", "졸려 죽겠다 진짜", "이 영화 너무 웃겨서 죽는 줄", "롤에서 다섯 번 죽었어",
    "게임 캐릭터가 계속 죽어서 짜증나", "축구 경기 졌어 너무 아쉬워", "좀비 영화에서 다 죽더라", "할아버지 기일이라 성묘 다녀왔어",
    "친구 강아지가 무지개다리를 건넜대", "뉴스에서 자살률 통계를 봤어", "이 일 오늘 끝내고 싶다", "이 프로젝트 빨리 끝내고 싶어",
    "드라마 시즌 다 끝내고 싶다", "연애를 끝내고 싶어", "이 관계를 그만두고 싶어", "알바 그만하고 싶다", "핸드폰 게임 그만하고 싶어",
    "다 끝내고 쉬고 싶다", "모든 걸 놓고 여행 가고 싶어", "잠수 타고 싶다", "사라진 줄 알았던 지갑을 찾았어",
    "주말에 그냥 아무것도 안 하고 싶어", "죽이는 날씨였어", "맛있어서 죽을 뻔", "I'm dead tired", "this homework is killing me",
    "I could just die of embarrassment lol", "the battery died", "살 빠져서 기분 좋아", "숨 막히게 더운 날",
    "엄마한테 혼나서 쥐구멍에 숨고 싶었어", "시험 끝나서 살 것 같아",
  ];
  for (const t of benign) test(`오탐 아님: ${t}`, () => assert.equal(detectCrisis(t), false));
  // 매체 속 인용·남 이야기: 오케스트레이터 결정으로 109 안내가 붙어도 된다(누락 최소화 우선).
  // 강한 표현에 매체 예외를 두면 "드라마 보다가 죽고 싶어졌어" 같은 진짜 위기를 놓치므로 감지되는 쪽으로 고정한다
  for (const t of ["소설 속 인물이 스스로 목숨을 끊는 장면이 충격이었어", "이 노래 가사가 죽고 싶다는 내용이래"]) {
    test(`매체 인용은 감지돼도 됨(허용): ${t}`, () => assert.equal(detectCrisis(t), true));
  }
});

describe("QA 최종: 반말 보정 부작용 (B-15)", () => {
  // 정상 존댓말은 바꾸지 않는다
  const untouched = [
    "네, 맞아요. 정말 힘드셨겠어요.", "네 번째 도전이라니 대단해요.", "너무 속상하셨겠어요.", "오늘 네 시간이나 걸으셨군요.",
    "친구분이 네 개나 챙겨 주셨네요.", "그래요, 네 맞아요.", "언니가 네 시에 왔군요.", "너무너무 수고하셨어요.",
    "넓은 마음으로 이해하셨네요.", "널리 알려진 이야기예요.", "너그러운 마음이 느껴져요.", "고생 많으셨네요, 네.",
    "아이가 네 살이 되었군요.", "정말 그랬구나 싶으셨겠어요.", "알겠구나 하는 순간이 있었군요.", "많이 놀라셨군요!",
    "네일 아트를 받으셨군요.", "네 명이 함께 갔군요.", "벌써 네 해째예요.", "네 장 다 쓰셨군요.",
  ];
  for (const t of untouched) {
    test(`그대로: ${t}`, () => {
      assert.equal(hasBanmal(t), false);
      assert.equal(softenBanmal(fixBanmalEndings(t)), t);
    });
  }

  // 2인칭은 지우지 않고 "본인"으로 바꾼다 (부르는 말 "너,"만 지움)
  for (const [input, expected] of [
    ["너의 노력이 빛났어요.", "본인의 노력이 빛났어요."],
    ["넌 혼자가 아니에요.", "본인은 혼자가 아니에요."],
    ["너, 정말 애썼어요.", "정말 애썼어요."],
    ["힘든 날이었겠구나.", "힘든 날이었겠군요."],
  ]) test(`보정: ${input}`, () => assert.equal(softenBanmal(fixBanmalEndings(input)), expected));

  // 지우면 뜻이 바뀌거나 문장이 깨지던 경우 (B-15) → "본인"으로 바꿔 뜻을 지킨다. 기대값 고정
  for (const [input, broken, expected] of [
    ["너만 힘든 게 아니에요.", "힘든 게 아니에요.", "본인만 힘든 게 아니에요."],
    ["그건 네 잘못이 아니에요.", "그건 잘못이 아니에요.", "그건 본인 잘못이 아니에요."],
    ["정말 네 탓이 아니에요.", "정말 탓이 아니에요.", "정말 본인 탓이 아니에요."],
    ["친구가 네가 한 말에 상처받았군요.", "친구가 한 말에 상처받았군요.", "친구가 본인이 한 말에 상처받았군요."],
  ]) {
    test(`B-15 뜻 유지: ${input}`, () => {
      const out = softenBanmal(input);
      assert.notEqual(out, broken);
      assert.equal(out, expected);
      assert.equal(hasBanmal(out), false);
    });
  }

  // 작품 제목·인용 속 "너"는 그대로 (따옴표 안은 감지·보정하지 않음)
  test("B-15 인용 보존: 드라마 '너의 이름은'", () => {
    assert.equal(hasBanmal("드라마 '너의 이름은'을 보셨군요."), false);
    assert.equal(softenBanmal("드라마 '너의 이름은'을 보셨군요."), "드라마 '너의 이름은'을 보셨군요.");
  });

  // 낮음: 감지하지 못하는 반말 2인칭 (재요청·보정 대상에서 빠짐)
  for (const t of ["엄마가 네 편이었군요.", "네게 정말 고마워요."]) {
    test(`B-16 반말 감지: ${t}`, () => assert.equal(hasBanmal(t), true));
  }
  // "당신"은 3인칭 높임("엄마는 항상 당신을 응원하셨어요")으로도 쓰여 감지 대상에서 뺐다 (B-18, 프롬프트에서만 금지)
  test("B-18 '당신'은 반말 감지 대상이 아니다", () => assert.equal(hasBanmal("당신은 잘하고 있어요."), false));
});
