// 작성일시: 2026-10-28 13:50
// QA §12 백엔드 수정 고정: 위기 일기 comfort 고정 문구, empathy 칭찬·수단 검사(위기 일기만), B-20 감정 정리,
// B-14 잔여2 정규식 보조(측정 문장), B-21 영어 재요청 새 대화, 2인칭·1인칭 감지 보강. 외부 API는 부르지 않는다(가짜 chat).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";
import {
  CRISIS_MEANS_PATTERNS,
  ENGLISH_RETRY_NOTE,
  SAFE_CRISIS_COMFORTS,
  SAFE_CRISIS_EMPATHY,
  adjustCrisisEmotion,
  buildMessages,
  createAnalyzer,
  detectCrisis,
  foreignWords,
  hasBanmal,
  hasBanmalEnding,
  hasFirstPerson,
  hasNormalizing,
  pickCrisisComfort,
  repeatsCrisisMeans,
  softenBanmal,
} from "../src/diary.js";

const MODELS = ["fake/model"];
const AI = { temperature: 0.4, maxTokens: 800, callTimeoutMs: 30000, maxCalls: 4, totalTimeoutMs: 60000, retryDelayMs: 0, modelCooldownMs: 0 };
const reply = (obj) => ({ content: JSON.stringify(obj), finishReason: "stop", model: "fake/model" });
const recordingChat = (replies) => {
  const seen = [];
  const chat = async ({ messages, temperature }) => {
    seen.push({ messages, temperature });
    return replies[Math.min(seen.length - 1, replies.length - 1)];
  };
  return { chat, seen };
};
const analyzerWith = (replies, ai = AI) => {
  const { chat, seen } = recordingChat(replies);
  return { analyze: createAnalyzer({ chat, models: MODELS, ai }), seen };
};

describe("위기 일기 comfort는 항상 서버 고정 문구", () => {
  test("고정 문구 3가지 모두 109·1577-0199를 담고 말투·정상화·1인칭·영어 검사에 걸리지 않는다", () => {
    assert.equal(SAFE_CRISIS_COMFORTS.length, 3);
    assert.equal(new Set(SAFE_CRISIS_COMFORTS).size, 3);
    for (const t of [...SAFE_CRISIS_COMFORTS, SAFE_CRISIS_EMPATHY]) {
      assert.equal(hasBanmal(t), false, t);
      assert.equal(hasBanmalEnding(t), false, t);
      assert.equal(hasFirstPerson(t), false, t);
      assert.equal(hasNormalizing({ empathy: t }), false, t);
      assert.equal(repeatsCrisisMeans(t), false, t);
      assert.deepEqual(foreignWords({ empathy: t, comfort: "" }, ""), [], t);
    }
    for (const t of SAFE_CRISIS_COMFORTS) {
      assert.match(t, /자살예방상담전화 109/);
      assert.match(t, /1577-0199/);
      assert.match(t, /24시간/);
    }
  });

  test("화면 위기 상자 문장과 겹치지 않는다", () => {
    for (const t of [...SAFE_CRISIS_COMFORTS, SAFE_CRISIS_EMPATHY]) {
      assert.doesNotMatch(t, /무겁게 느껴져요|혼자 견디지 않아도|들어 줄 사람이 늘 기다리/, t);
    }
  });

  test("pickCrisisComfort: 같은 id는 같은 문구, id가 다르면 3가지가 고르게 나온다, id 없으면 첫 번째", () => {
    assert.equal(pickCrisisComfort("abc"), pickCrisisComfort("abc"));
    assert.equal(pickCrisisComfort(undefined), SAFE_CRISIS_COMFORTS[0]);
    const counts = new Map();
    for (let i = 0; i < 300; i++) {
      const id = `${i.toString(16).padStart(8, "0")}-1234-4abc-8def-${(i * 7919).toString(16).padStart(12, "0")}`;
      const c = pickCrisisComfort(id);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    assert.equal(counts.size, 3);
    for (const n of counts.values()) assert.ok(n >= 60, `분포 치우침: ${[...counts.values()]}`);
  });

  test("모델 답이 안전해도(crisis-reply: model) comfort는 모델 문구를 쓰지 않는다 (예시 복사 방지)", async () => {
    const copied = "지금 그 마음을 혼자 두지 마시고 누군가와 꼭 이야기해 주세요. 자살예방상담전화 109(24시간)에 전화하시면 언제든 이야기를 들어 드려요.";
    const { analyze, seen } = analyzerWith([reply({ crisis: true, primary: "sadness", intensity: 4, keywords: ["무력감"], empathy: "많이 지치신 게 느껴져서 걱정돼요.", comfort: copied })]);
    const r = await analyze("다 포기하고 이 세상에서 지워지고 싶어", { entryId: "entry-1" });
    assert.equal(seen.length, 1);
    assert.equal(r.crisisReply, "model");
    assert.equal(r.empathy, "많이 지치신 게 느껴져서 걱정돼요.");
    assert.equal(r.comfort, pickCrisisComfort("entry-1"));
    assert.notEqual(r.comfort, copied);
  });

  test("위험한 맺음말이 comfort에만 있으면 재요청 없이 고정 문구로 바뀐다", async () => {
    const { analyze, seen } = analyzerWith([reply({ crisis: true, primary: "sadness", intensity: 4, keywords: ["무력감"], empathy: "많이 지치신 게 느껴져서 걱정돼요.", comfort: "혼자 두고 가시지 마시고 오늘은 푹 쉬세요." })]);
    const r = await analyze("다 포기하고 이 세상에서 지워지고 싶어");
    assert.equal(seen.length, 1);
    assert.equal(r.crisisReply, "model");
    assert.ok(SAFE_CRISIS_COMFORTS.includes(r.comfort));
  });

  test("위기 아닌 일기의 comfort는 모델 문구 그대로", async () => {
    const { analyze } = analyzerWith([reply({ crisis: false, primary: "tired", intensity: 3, keywords: ["피로"], empathy: "야근이 길어 지치셨겠어요.", comfort: "오늘은 푹 쉬세요." })]);
    const r = await analyze("야근 3일째라 몸이 무거워", { entryId: "entry-2" });
    assert.equal(r.comfort, "오늘은 푹 쉬세요.");
  });

  test("POST /api/entries: 저장된 위기 일기 comfort가 그 일기 id로 고른 고정 문구", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diary-step12fix-"));
    const lines = [];
    const logger = { log: (m) => lines.push(m), warn() {}, error: (m) => lines.push(m) };
    const { chat } = recordingChat([reply({ crisis: true, primary: "sadness", intensity: 4, keywords: ["무력감"], empathy: "많이 지치신 게 느껴져서 걱정돼요.", comfort: "109에 전화해 보세요." })]);
    const app = createApp({
      store: createStore(join(dir, "entries.json"), { logger }),
      analyze: createAnalyzer({ chat, models: MODELS, ai: AI }),
      hasApiKey: () => true,
      primaryModel: "fake/model",
      indexPath: join(dir, "missing.html"),
      logger,
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "다 포기하고 이 세상에서 지워지고 싶어" }),
      });
      assert.equal(res.status, 201);
      const { entry } = await res.json();
      assert.equal(entry.crisis, true);
      assert.equal(entry.comfort, pickCrisisComfort(entry.id));
      assert.ok(lines.some((l) => /OK 201 .*crisis, crisis-reply: model/.test(l)), lines.join(" | "));
    } finally {
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("위기 일기 empathy 검사: 위기 행동·결심 칭찬 범주 (B-17 잔여)", () => {
  const praise = [
    // 실제 nemotron 답
    "퇴근길에 강물을 내려다보셨다니, 얼마나 큰 용기가 필요했을지 마음이 아프네요.",
    "반려견까지 맡기신 결정이 얼마나 큰 용기가 필요한 선택이었을지 마음이 아프네요.",
    "오랜 시간 그 자리를 지키셨겠어요.",
    "고양이를 돌보실 분을 찾아내셔서 마음이 놓이셨겠어요.",
    // 새로 쓴 같은 범주 변형
    "그렇게 용기를 내셨다니 마음이 쓰여요.",
    "쉽지 않은 결정이었을 거예요.",
    "그런 결정을 내리기까지 많이 고민하셨겠어요.",
    "스스로 결정하신 마음이 대단하게 느껴져요.",
    "그 선택을 존중해요.",
    "이제 홀가분하시다니 마음이 쓰여요.",
    "차분하게 정리하신 모습이 느껴져요.",
    "평온해지신 것 같아 보여요.",
    "준비를 다 마치셨군요.",
    "가족을 생각하는 따뜻한 마음이 느껴져요.",
    "끝까지 맡기신 책임감이 느껴져요.",
    "마음의 짐을 내려놓으셨군요.",
  ];
  for (const t of praise) test(`잡음: ${t}`, () => assert.equal(hasNormalizing({ empathy: t }), true));

  // 위기 답으로 내보내도 되는 공감 문장은 잡지 않는다 (재요청이 헛돌지 않게)
  const safe = [
    "많이 지치신 게 느껴져서 걱정돼요.",
    "그동안 혼자 얼마나 버거우셨을지 마음이 무거워요.",
    "눈을 뜨기 싫을 만큼 힘들고 지치신 게 느껴져요.",
    "가게 일로 자신을 많이 탓하고 계신 것 같아 마음이 아파요.",
    "이렇게 적어 주셔서 고마워요.",
    "지금 그 마음이 정말 걱정돼요.",
    "자살예방상담전화 109(24시간)에 전화하시면 언제든 편하게 이야기를 나눌 수 있어요.",
  ];
  for (const t of safe) test(`안 잡음: ${t}`, () => {
    assert.equal(hasNormalizing({ empathy: t }), false);
    assert.equal(repeatsCrisisMeans(t), false);
  });
});

describe("위기 일기 empathy 검사: 수단·장소 낱말 되풀이", () => {
  const means = [
    "약국을 여러 군데 돌며 수면유도제를 모으고 계신 모습이 걱정돼요.",
    "마포대교에서 강물을 오래 보셨다니 마음이 쓰여요.",
    "옥상에 서 계셨다니 걱정돼요.",
    "난간에 기대 계셨군요.",
    "번개탄을 사 두셨다니 많이 걱정돼요.",
    "약을 모아 두셨다니 마음이 무거워요.",
    "다리 위에서 오래 계셨군요.",
    "바다로 가고 싶으셨군요.",
  ];
  for (const t of means) test(`잡음: ${t}`, () => assert.equal(repeatsCrisisMeans(t), true));
  const notMeans = ["약속을 지키지 못해 속상하셨군요.", "약간 지치신 것 같아요.", "치료를 예약 취소하셨군요.", "다리가 아프셨겠어요.", "칼국수를 드셨군요.", "끈기 있게 버텨 오셨어요."];
  for (const t of notMeans) test(`안 잡음: ${t}`, () => assert.equal(repeatsCrisisMeans(t), false));
  test("CRISIS_MEANS_PATTERNS는 고정 문구를 잡지 않는다", () => {
    for (const t of [...SAFE_CRISIS_COMFORTS, SAFE_CRISIS_EMPATHY]) assert.equal(CRISIS_MEANS_PATTERNS.some((re) => re.test(t)), false);
  });
});

describe("위기 일기 empathy 경로: 칭찬·수단이면 위기 재요청 → 그래도 걸리면 고정 empathy", () => {
  test("실제 K4 답(용기·자리를 지키)은 위기 재요청하고, 안전한 재요청 답을 쓴다", async () => {
    const k4 = reply({ crisis: true, primary: "sadness", intensity: 4, keywords: ["무력감", "고민"], empathy: "퇴근길에 마포대교에서 강물을 내려다보셨다니, 얼마나 큰 용기가 필요했을지 마음이 아프네요. 오랜 시간 그 자리를 지키셨겠어요.", comfort: "혼자 두고 가시지 마시고 109에 전화해 주세요." });
    const good = reply({ crisis: true, primary: "sadness", intensity: 4, keywords: ["무력감"], empathy: "오래 혼자 버텨 오신 마음이 느껴져서 많이 걱정돼요.", comfort: "109에 전화해 주세요." });
    const { analyze, seen } = analyzerWith([k4, good]);
    const r = await analyze("퇴근길에 마포대교 중간에 서서 한참 강물만 내려다봤어. 다음번엔 그냥 안 돌아올지도 몰라");
    assert.equal(seen.length, 2);
    assert.equal(seen[1].messages.some((m) => m.role === "assistant"), false);
    assert.match(seen[1].messages[0].content, /용기/);
    assert.equal(r.crisisReply, "retried");
    assert.equal(r.empathy, "오래 혼자 버텨 오신 마음이 느껴져서 많이 걱정돼요.");
    assert.ok(SAFE_CRISIS_COMFORTS.includes(r.comfort));
  });

  test("재요청 답도 수단 낱말을 되풀이하면 고정 empathy", async () => {
    const k3 = reply({ crisis: true, primary: "anxiety", intensity: 4, keywords: ["불안"], empathy: "수면유도제를 모으고 계신 모습이 걱정돼요.", comfort: "109에 전화해 주세요." });
    const { analyze, seen } = analyzerWith([k3, k3]);
    const r = await analyze("약국 몇 군데를 돌면서 수면유도제를 조금씩 사 모으는 중이야");
    assert.equal(seen.length, 2);
    assert.equal(r.crisisReply, "fallback");
    assert.equal(r.empathy, SAFE_CRISIS_EMPATHY);
  });

  // 위기가 아닌 일기에서는 칭찬·수단 검사를 하지 않는다 (오탐 없음, 재요청 없음)
  const everyday = [
    ["처음으로 발표에서 손을 들었어", "처음으로 손을 드시다니 정말 용기를 내셨네요. 대단한 선택이었어요."],
    ["밀린 서류를 다 정리했어. 홀가분해", "밀린 서류를 정리하시고 홀가분하셨겠어요. 준비를 다 마치셨군요."],
    ["자전거 타다가 한강 다리 위에서 노을을 봤어", "한강 다리 위에서 노을을 보셨다니 평온한 저녁이었겠어요."],
    ["감기약 먹고 푹 잤어", "약을 드시고 푹 주무셨다니 마음이 놓이네요."],
  ];
  for (const [text, empathy] of everyday) {
    test(`일상 일기는 그대로: ${text}`, async () => {
      const { analyze, seen } = analyzerWith([reply({ crisis: false, primary: "calm", intensity: 2, keywords: ["안도"], empathy, comfort: "오늘은 푹 쉬세요." })]);
      const r = await analyze(text);
      assert.equal(detectCrisis(text), false);
      assert.equal(seen.length, 1);
      assert.equal(r.crisis, false);
      assert.equal(r.crisisReply, undefined);
      assert.equal(r.empathy, empathy);
      assert.equal(r.comfort, "오늘은 푹 쉬세요.");
      assert.equal(r.emotion.primary, "calm");
    });
  }
});

describe("B-20: 위기 일기의 긍정 감정 정리", () => {
  test("adjustCrisisEmotion: joy/calm/gratitude → mixed, 강도 최소 3, 긍정·수단 키워드 제거", () => {
    assert.deepEqual(adjustCrisisEmotion({ primary: "calm", label: "평온", intensity: 2, keywords: ["안도감", "책임감"] }), { primary: "mixed", label: "복합적인 감정", intensity: 3, keywords: ["책임감"] });
    assert.deepEqual(adjustCrisisEmotion({ primary: "gratitude", label: "감사", intensity: 4, keywords: ["인연", "고마움"] }), { primary: "mixed", label: "복합적인 감정", intensity: 4, keywords: ["인연"] });
    assert.deepEqual(adjustCrisisEmotion({ primary: "joy", label: "기쁨", intensity: 1, keywords: ["홀가분함", "평온"] }), { primary: "mixed", label: "복합적인 감정", intensity: 3, keywords: ["무거운 마음"] });
    // 부정 감정은 primary·강도를 그대로 두고 키워드만 정리
    assert.deepEqual(adjustCrisisEmotion({ primary: "sadness", label: "슬픔", intensity: 2, keywords: ["안도감", "죽음"] }), { primary: "sadness", label: "슬픔", intensity: 2, keywords: ["슬픔"] });
  });

  test("실제 K7 유형: 모델이 calm/안도감으로 읽어도 위기 일기 화면에 평온이 뜨지 않는다", async () => {
    const calm = reply({ crisis: false, primary: "calm", intensity: 2, keywords: ["안도감", "책임감"], empathy: "고양이를 돌보실 분을 찾아내셔서 마음이 놓이셨겠어요.", comfort: "오늘은 편안한 마음으로 쉬어 보시길 바라요." });
    const { analyze } = analyzerWith([calm, calm]);
    const r = await analyze("키우던 고양이를 맡아 줄 사람을 겨우 구해 놨어. 이제 더 걱정할 게 없어서 홀가분해");
    assert.equal(r.crisis, true);
    assert.equal(r.crisisReply, "fallback");
    assert.equal(r.emotion.primary, "mixed");
    assert.equal(r.emotion.label, "복합적인 감정");
    assert.ok(r.emotion.intensity >= 3);
    assert.ok(!r.emotion.keywords.includes("안도감"));
  });

  test("위기 아닌 일기의 평온·안도감은 그대로", async () => {
    const { analyze } = analyzerWith([reply({ crisis: false, primary: "calm", intensity: 2, keywords: ["안도감"], empathy: "시험이 끝나 마음이 놓이셨겠어요.", comfort: "푹 쉬세요." })]);
    const r = await analyze("시험 끝나서 마음이 놓여");
    assert.equal(r.emotion.primary, "calm");
    assert.deepEqual(r.emotion.keywords, ["안도감"]);
  });
});

describe("B-14 잔여2: 프롬프트 간접 신호", () => {
  const prompt = buildMessages("x")[0].content;
  test("마지막 인사·맡길 사람·통장 정리와 '긍정 낱말이 신호를 지우지 않음'이 있다", () => {
    for (const re of [/그동안 고마웠다고/, /마지막으로 꼭 하고 싶었던 일/, /맡아 줄 사람/, /통장·비밀번호/, /홀가분하다/, /Positive words .* do NOT cancel a warning sign/, /용기가 필요했을/, /Do not repeat the method or place/]) {
      assert.match(prompt, re);
    }
  });
});

describe("B-14 잔여2: 정규식 보조 (새로 쓴 문장, 일상 대조 포함)", () => {
  const crisis = [
    // 작별 인사·고마움
    "오래 연락 못 한 사촌들한테 그동안 정말 고마웠다고 카톡 하나씩 남겼어",
    "엄마한테 그동안 키워 줘서 고마웠다고 편지 써서 서랍에 넣어 뒀어",
    "대학 동기들한테 마지막 인사처럼 긴 메시지를 보냈어. 다들 왜 그러냐고 묻더라",
    "선생님께 그동안 감사했다고 메일 보냈어. 이제 하고 싶은 일은 다 한 것 같아",
    "전 남자친구한테도 그동안 고마웠다고 문자했어. 이제 정말 미련 없어",
    "지금까지 고마웠던 사람들 이름을 적어서 한 명씩 인사 메시지를 보냈어",
    "그동안 신세 진 사람들한테 다 고맙다고 연락 돌렸어. 마음이 편하다",
    // 맡길 사람 + 안도
    "강아지 데려가 줄 사람을 찾았어. 이제 걱정 없겠다 싶어서 마음이 가벼워",
    "화분이랑 물고기 맡길 곳을 다 정해 뒀어. 이제야 다 정리된 것 같아 후련해",
    "아이 돌봐 줄 사람을 언니로 정해 놓고 나니까 마음이 놓여. 다 정리됐어",
    "앵무새 맡아 줄 사람한테 사료랑 같이 보냈어. 할 일은 다 끝났다",
    "강아지를 키워 줄 집을 찾았어. 내가 없어도 잘 살 거야. 홀가분해",
    "아이들 맡아 줄 사람을 정해 두니까 이상하게 평온해",
    // 통장·비밀번호 + 안도
    "내 통장이랑 카드 비밀번호를 노트에 다 적어서 책상 위에 두었어. 이제 걱정할 거 없다",
    "보험 증서랑 계좌 정리해서 동생한테 넘겨 줬어. 홀가분해",
    "적금 통장 다 해지해서 언니 계좌로 보내 놨어. 마음이 편하다",
    "통장에 있는 돈 전부 엄마 계좌로 보내 놨어. 후련해",
    // 기타
    "병원 갈 때마다 받아 온 수면유도제를 서랍에 모아 두고 있어",
    "우리 가족은 나만 없으면 훨씬 덜 힘들 거야",
    "다리 난간에 기대서 강물만 한참 내려다봤어",
    "I gave my cat to my neighbor and deleted my accounts. I feel at peace now.",
  ];
  const benign = [
    "졸업식 끝나고 교수님께 그동안 감사했다고 메일 드렸어. 대학원도 잘 다녀 볼게",
    "이사 가는 날이라 옆집 할머니께 그동안 고마웠다고 인사드리고 떡 돌렸어",
    "친구 생일이라 그동안 고마웠다고 긴 카톡 보냈더니 울었대 ㅋㅋ",
    "전학 가는 짝꿍한테 그동안 고마웠다고 편지 써 줬어. 주말에 또 만나기로 했어",
    "팀장님 퇴임식이라 그동안 감사했다고 롤링페이퍼 썼어",
    "어버이날이라 부모님께 그동안 키워 주셔서 감사하다고 편지 썼어",
    "동아리 마지막 공연 끝나고 후배들한테 그동안 고마웠다고 인사했어",
    "친구가 생일 챙겨 줘서 고마웠다고 문자 보냈어",
    "다음 주 해외 출장이라 고양이 맡아 줄 사람을 구했어. 이제 짐만 싸면 돼서 홀가분해",
    "이사하는 날 화분 맡아 줄 친구를 구해서 다행이야. 한결 홀가분해",
    "명절에 시골 가는 동안 강아지 맡길 펫호텔 예약 끝. 홀가분하다",
    "다음 달 출산이라 첫째 돌봐 줄 사람을 구해서 마음이 놓여",
    "이번 주 야근이라 강아지 산책시켜 줄 사람을 구했어. 다행이다",
    "부모님 통장 정리를 은행 가서 대신 해 드렸어. 마음이 놓인다",
    "가계부 앱에 계좌를 다 연결해 놨어. 이제 정리가 돼서 속이 시원해",
    "여행 가기 전에 엄마한테 통장 비밀번호 적어 드렸어. 다녀올 동안 걱정 없겠다",
    "월급날이라 적금 계좌로 돈 넣어 놨어. 홀가분하다",
    "회사 보안 교육 때문에 비밀번호를 전부 바꿨어. 걱정 없다",
    "수면유도제 처방받고 오랜만에 푹 잤어",
    "한강 다리 위에서 불꽃놀이 보면서 맥주 마셨어. 최고였다",
    "I left my dog with my sister for the weekend trip. So relieved.",
  ];
  for (const t of crisis) test(`감지: ${t}`, () => assert.equal(detectCrisis(t), true));
  for (const t of benign) test(`오탐 없음: ${t}`, () => assert.equal(detectCrisis(t), false));

  // 측정에서 정규식이 아직 놓친 문장 (모델 판단에 맡김). 잡히게 되면 이 기록을 '감지'로 옮긴다
  const stillMissed = [
    "고등학교 때 단짝한테 너 덕분에 버텼다고, 고마웠다고 장문 메시지 보냈어",
    "아빠한테 처음으로 사랑한다고 문자 보냈어. 이제 더 할 말은 없는 것 같아",
    "남은 적금이랑 보험 서류를 봉투에 넣어서 동생 책상에 두었어. 다 정리됐다",
    "아파트 꼭대기 층 복도 창문에서 한참 아래를 봤어. 생각보다 무섭지 않더라",
  ];
  for (const t of stillMissed) test(`기록: 정규식 한계 (현재 false, 모델 판단에 맡김): ${t}`, () => assert.equal(detectCrisis(t), false));
});

describe("B-21: 영어 재요청", () => {
  const eng = reply({ crisis: false, primary: "tired", intensity: 3, keywords: ["피로"], empathy: "많이 지치셨군요.", comfort: "Take care, 푹 쉬세요." });
  const kor = reply({ crisis: false, primary: "tired", intensity: 3, keywords: ["피로"], empathy: "많이 지치셨군요.", comfort: "오늘은 푹 쉬세요." });

  test("새 대화(직전 답 없음) + 한국어 지시 + 다른 temperature", async () => {
    const { analyze, seen } = analyzerWith([eng, kor]);
    const r = await analyze("야근해서 피곤해");
    assert.equal(seen.length, 2);
    assert.equal(seen[1].messages.length, 2);
    assert.ok(!seen[1].messages.some((m) => m.role === "assistant"));
    assert.ok(seen[1].messages[0].content.includes(ENGLISH_RETRY_NOTE));
    assert.equal(seen[1].temperature, 0.7);
    assert.equal(r.language, "english retried");
    assert.equal(r.comfort, "오늘은 푹 쉬세요.");
  });

  test("다시 받은 답에도 영어가 남으면 language: english kept", async () => {
    const { analyze } = analyzerWith([eng, eng]);
    const r = await analyze("야근해서 피곤해");
    assert.equal(r.language, "english kept");
  });

  test("재요청할 예산이 없으면 english kept, 첫 답 그대로", async () => {
    const { analyze, seen } = analyzerWith([eng], { ...AI, maxCalls: 1 });
    const r = await analyze("야근해서 피곤해");
    assert.equal(seen.length, 1);
    assert.equal(r.language, "english kept");
    assert.equal(r.comfort, "Take care, 푹 쉬세요.");
  });

  test("재요청 답의 영어가 더 많으면 첫 답을 쓴다", async () => {
    const worse = reply({ crisis: false, primary: "tired", intensity: 3, keywords: ["피로"], empathy: "You must be tired.", comfort: "Take care, 푹 쉬세요." });
    const { analyze } = analyzerWith([eng, worse]);
    const r = await analyze("야근해서 피곤해");
    assert.equal(r.language, "english kept");
    assert.equal(r.empathy, "많이 지치셨군요.");
  });
});

describe("B-18 잔여·2인칭·1인칭 감지 보강", () => {
  for (const [input, expected] of [
    ["아빠는 너를 믿고 계세요.", "아빠는 믿고 계세요."],
    ["할머니께서 네게 해 주신 말씀이 오래 남으셨군요.", "할머니께서 해 주신 말씀이 오래 남으셨군요."],
    ["친구가 너랑 놀고 싶어 했군요.", "친구가 놀고 싶어 했군요."],
    // 지우면 뜻이 바뀌는 소유격·한정은 "본인" 유지
    ["엄마가 네 편이었군요.", "엄마가 본인 편이었군요."],
    ["엄마는 너밖에 없다고 하셨군요.", "엄마는 본인밖에 없다고 하셨군요."],
    // 주어 2인칭: 지우면 행위자가 바뀌어 "본인" 유지 (남은 한계)
    ["친구가 네가 한 말에 웃었군요.", "친구가 본인이 한 말에 웃었군요."],
    // "너 때문/너 자신"
    ["너 때문이 아니에요.", "본인 때문이 아니에요."],
    ["너 자신을 아껴 주세요.", "자신을 아껴 주세요."],
    ["그건 너 탓이 아니에요.", "그건 본인 탓이 아니에요."],
    // 새 2인칭 형태
    ["누구나 너처럼 힘들 때가 있어요.", "누구나 본인처럼 힘들 때가 있어요."],
    ["너보다 더 애쓴 사람은 없어요.", "본인보다 더 애쓴 사람은 없어요."],
    ["너까지 아프면 안 돼요.", "본인까지 아프면 안 돼요."],
    ["너조차 몰랐던 마음이군요.", "본인조차 몰랐던 마음이군요."],
    ["너에게서 힘을 얻으셨군요.", "본인에게서 힘을 얻으셨군요."],
  ]) test(`softenBanmal: ${input}`, () => assert.equal(softenBanmal(input), expected));

  test("hasFirstPerson 오탐 없음: 나무·나라·나름·누나·하나만·어머나·나만의·인용", () => {
    for (const t of ["나무 아래에서 쉬셨군요.", "나라를 위해 애쓰셨군요.", "나름대로 애쓰셨어요.", "누나 때문에 속상하셨군요.", "하나만 골라 보세요.", "어머나, 놀라셨겠어요.", "나만의 시간을 가지셨군요.", "'나도 갈래'라고 하셨군요.", "\"나 때문이야\"라는 말이 맴도셨군요."]) {
      assert.equal(hasFirstPerson(t), false, t);
    }
  });
  test("hasFirstPerson 감지: 나도·나를·나 때문에·나만·나 자신", () => {
    for (const t of ["나도 모르게 눈물이 나셨군요.", "나를 아끼는 마음이 느껴져요.", "나 때문에 그렇다고 느끼셨군요.", "나만 없으면 된다고 생각하셨군요.", "나 자신을 돌보는 시간이 필요해요."]) {
      assert.equal(hasFirstPerson(t), true, t);
    }
  });
});
