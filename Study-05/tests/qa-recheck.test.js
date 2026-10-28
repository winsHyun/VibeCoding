// 작성일시: 2026-10-27 16:55
// QA 재검증에서 찾은 빈 곳의 회귀 테스트 (B-03, B-04, B-09, B-11, B-12, B-13 반말 감지, iframe 차단 제안).
// 처음에는 { todo } 였고, 고친 뒤 todo를 지웠다. OpenRouter는 가짜 chat 으로 대신한다.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { buildStyleRetryMessages, createAnalyzer, detectCrisis, fixBanmalEndings, hasBanmal, softenBanmal, styleRetryTemperature } from "../src/diary.js";

const MODELS = ["a:free", "b:free", "c:free"];
const AI = { temperature: 0.4, maxTokens: 800, callTimeoutMs: 30000, maxCalls: 4, totalTimeoutMs: 60000, retryDelayMs: 0, modelCooldownMs: 0 };
const quiet = { log() {}, warn() {}, error() {} };

describe("QA 재검증: 위기 표현 감지 (B-03 회귀, B-09)", () => {
  // QA 스크립트(crisis-battery.mjs)의 '감지되어야 함' 35개 전체 + 추가 변형
  const shouldDetect = [
    "죽고 싶다", "죽고싶어", "그냥 죽어버리고 싶어", "자살하고 싶다", "살기 싫어", "살 이유가 없어",
    "다 끝내고 싶다", "요즘 그냥 다 끝내고 싶다", "요즘 다 끝내고 싶어", "오늘은 정말 다 끝내고 싶었어",
    "사라지고 싶어", "그냥 내가 없어졌으면 좋겠어", "자고 일어나지 않았으면 좋겠어", "내일 아침에 눈 뜨지 않았으면",
    "I want to die", "I want to end it all", "I don't want to live anymore",
    "죽을래", "그냥 죽을까 봐", "세상을 떠나고 싶다", "삶을 포기하고 싶어", "더는 못 버티겠어 그만하고 싶어",
    "내가 없으면 다들 편하겠지", "살아 있는 게 고통이야", "다 놓아 버리고 싶다", "죽는 게 나을 것 같아",
    "죽어야겠다", "목숨 끊고 싶어", "아무도 없는 곳으로 사라지고 싶다", "I wish I were dead", "I'm going to kill myself",
    "I want to disappear", "killing myself", "I can't go on anymore", "한강 가고 싶다",
    // 추가 변형
    "죽고 싶을 만큼 힘들어", "자살 생각이 자꾸 들어", "인생을 포기했어", "이제 그만 끝내고 싶다", "모든 걸 끝내고 싶어",
    "삶을 그만두고 싶다", "나 하나 없어져도 아무도 모를 거야", "그냥 증발하고 싶다", "자해했어", "죽어야겠어",
    "살아 있는 게 힘들어", "I can't go on", "I wish I was dead", "죽을까 싶어", "영화 보다가 자살하고 싶어졌어",
    "오늘 숙제는 다 했어. 근데 이제 다 끝내고 싶다",
    // QA §12 후속: 긍정 낱말로 포장된 정리 행동 (DIARY_RULES)
    "형한테 그동안 고마웠다고, 엄마 잘 부탁한다고 문자 보냈어", "우리 고양이 맡아 줄 친구를 구했어. 걱정거리가 하나도 안 남아서 홀가분하다",
    "남은 돈 계좌랑 비밀번호를 쪽지에 남겨 뒀어. 이제야 마음이 놓인다",
  ];
  // QA 스크립트의 '오탐이면 안 됨' 20개 전체 + 추가 일상 표현
  const shouldNot = [
    "배고파 죽겠다", "숙제 끝내고 싶다", "오늘 일 다 끝내고 싶다", "빨리 다 끝내고 싶어", "보고서 오늘 다 끝내고 싶다",
    "퇴근하고 다 끝내고 싶다", "이번 주에 프로젝트를 다 끝내고 싶어", "웃겨 죽는 줄 알았어", "더워 죽겠어",
    "아기가 깨지 않았으면 좋겠다", "축구에서 자살골을 넣었어", "살 빼기 싫어", "다이어트 하느라 살기 싫다는 농담을 했어",
    "죽고 싶을 만큼 행복해", "걱정이 사라졌으면 좋겠어", "스트레스가 사라지고 싶다", "I'm dying to see the show", "This game kills me",
    "드라마 주인공이 극단적 선택을 하는 장면이 슬펐어", "자해 관련 다큐를 봤어",
    // 추가
    "자살 소재 영화를 봤어", "할머니가 세상을 떠나셨어", "죽을까 봐 무서웠어", "다이어트를 포기하고 싶어", "회사 그만두고 싶다",
    "게임 그만하고 싶어", "주말에 친구랑 한강 가고 싶다", "웃겨 죽을래", "너 죽을래?", "내가 없으면 회사가 안 돌아가",
    "오늘 일 다 끝냈다", "자살예방 교육을 받았어", "I can't go on the trip", "자살골 때문에 졌어",
    // QA §12 후속: 이유가 분명한 인사·맡기기·계좌 정리
    "알바 마지막 날이라 사장님한테 그동안 고마웠다고 문자 보냈어. 내일부터 방학이다", "여행 가는 동안 강아지 맡길 곳을 찾아서 마음이 놓여",
    "연말정산 때문에 계좌랑 카드 내역 정리했어. 다 끝내니까 홀가분해",
  ];
  for (const t of shouldDetect) test(`감지: ${t}`, () => assert.equal(detectCrisis(t), true));
  for (const t of shouldNot) test(`오탐 아님: ${t}`, () => assert.equal(detectCrisis(t), false));

  test("패턴이 놓쳐도 모델의 crisis: true 는 그대로 OR 된다", async () => {
    const reply = JSON.stringify({ primary: "sadness", intensity: 4, keywords: ["절망"], empathy: "많이 힘드셨겠어요.", comfort: "곁에 있을게요.", crisis: true });
    const analyze = createAnalyzer({ chat: async ({ model }) => ({ content: reply, finishReason: "stop", model }), models: MODELS, ai: AI });
    const r = await analyze("오늘따라 모든 게 너무 멀게 느껴져");
    assert.equal(r.crisis, true);
    assert.match(r.comfort, /109/);
  });
});

describe("QA 재검증: 반말 감지·보정 (B-04, B-13)", () => {
  test("반말 2인칭 감지: 너랑·너희·니가 추가, 대답 '네'·'네 번째'·'너무'·'널리'는 제외", () => {
    for (const t of ["네가 정말 애썼구나", "너도 알잖아", "넌 잘했어", "너 정말 대단해", "너희 팀이", "니가 한 일", "너랑 같이", "너희들이 해냈네요", "정말 네 마음이 아팠겠어요"]) {
      assert.equal(hasBanmal(t), true, t);
    }
    for (const t of ["너무 힘드셨겠어요", "언니가 도와줬군요", "네, 그렇군요", "네 번째 도전이었네요", "오늘 네 시에 만났군요", "널리 알려졌어요"]) {
      assert.equal(hasBanmal(t), false, t);
    }
  });

  // B-15 이후: 2인칭을 지우면 뜻이 바뀌므로 "본인"으로 바꾼다. 부르는 말 "너,"만 지우고 '너희'는 '여러분'
  test("기계 보정 규칙: 2인칭은 '본인'으로, '너희'는 '여러분'으로", () => {
    const cases = [
      ["팀장님께서 네가 한 일을 가로채셨군요.", "팀장님께서 본인이 한 일을 가로채셨군요."],
      ["너는 정말 잘했어요.", "본인은 정말 잘했어요."],
      ["너, 정말 대단해요.", "정말 대단해요."],
      ["너의 노력은 사라지지 않아요.", "본인의 노력은 사라지지 않아요."],
      ["너를 응원해요.", "본인을 응원해요."],
      ["너랑 같이 걷고 싶어요.", "본인과 같이 걷고 싶어요."],
      ["니가 애쓴 걸 알아요.", "본인이 애쓴 걸 알아요."],
      ["너희 팀이 이겼군요. 너희가 애썼어요.", "여러분 팀이 이겼군요. 여러분이 애썼어요."],
      ["정말 네 마음이 아팠겠어요.", "정말 본인 마음이 아팠겠어요."],
      // 바꾸면 안 되는 말
      ["네, 그렇군요. 네 번째 도전이었네요.", "네, 그렇군요. 네 번째 도전이었네요."],
      ["너무 힘드셨겠어요.", "너무 힘드셨겠어요."],
    ];
    for (const [input, expected] of cases) assert.equal(softenBanmal(input), expected, input);
  });

  test("문장 끝 '~구나'는 '~군요'로 (실제 nemotron 답에서 나온 반말 끝맺음)", async () => {
    assert.equal(fixBanmalEndings("분노하게 만든 날이었겠구나. 표현해도 돼요."), "분노하게 만든 날이었겠군요. 표현해도 돼요.");
    assert.equal(fixBanmalEndings("정말 애썼구나"), "정말 애썼군요");
    assert.equal(fixBanmalEndings("구나라는 말"), "구나라는 말");
    const reply = JSON.stringify({ primary: "anger", intensity: 4, keywords: ["분노"], empathy: "정말 화가 나셨겠어요.", comfort: "힘든 날이었겠구나.", crisis: false });
    const analyze = createAnalyzer({ chat: async ({ model }) => ({ content: reply, finishReason: "stop", model }), models: MODELS, ai: AI });
    assert.equal((await analyze("화가 나")).comfort, "힘든 날이었겠군요.");
  });

  test("말투 재요청은 직전 답 없이 새 대화 + 더 강한 높임 지시, temperature는 다르게", () => {
    const msgs = buildStyleRetryMessages("팀장이 내가 한 일을 자기가 한 것처럼 보고해서 너무 화가 나");
    assert.deepEqual(msgs.map((m) => m.role), ["system", "user"]);
    assert.match(msgs[0].content, /하셨군요/);
    assert.match(msgs[0].content, /너랑, 너희/);
    assert.equal(msgs[1].content, "<diary>팀장이 내가 한 일을 자기가 한 것처럼 보고해서 너무 화가 나</diary>");
    assert.equal(styleRetryTemperature(0.4), 0.7);
    assert.equal(styleRetryTemperature(0.9), 1);
  });

  // 실제 nemotron 호출에서 재요청 답이 처음 답과 글자 하나 다르지 않게 똑같이 와서 "네가"가 그대로 화면에 나갔다
  test("재요청도 같은 반말 답이면 화면에 '네가'가 나가지 않는다", async () => {
    const banmal = JSON.stringify({
      primary: "anger", intensity: 4, keywords: ["부당함"],
      empathy: "팀장님께서 네가 한 일을 마치 자기가 한 것처럼 보고하신 일이라니, 정말 분하셨겠어요.",
      comfort: "오늘은 일찍 쉬시면서 마음을 정리해 보세요.", crisis: false,
    });
    const seen = [];
    const chat = async ({ model, messages, temperature }) => {
      seen.push({ messages, temperature });
      return { content: banmal, finishReason: "stop", model };
    };
    const analyze = createAnalyzer({ chat, models: MODELS, ai: AI });
    const text = "팀장이 내가 한 일을 자기가 한 것처럼 보고해서 너무 화가 나";
    const result = await analyze(text);
    assert.equal(seen.length, 2);
    // 재요청에는 직전 답(assistant)을 넣지 않고, temperature를 바꾼다
    assert.equal(seen[1].messages.some((m) => m.role === "assistant"), false);
    assert.notEqual(seen[1].temperature, seen[0].temperature);
    assert.doesNotMatch(`${result.empathy} ${result.comfort}`, /(^|[^가-힣])(네가|너는|넌)(?=[^가-힣]|$)/);
    assert.equal(result.style, "banmal patched");
  });

  // B-17 이후: 첫 답이 crisis:true면 말투 재요청을 하지 않고(재요청 답이 위기 판단을 잃음) 첫 답을 서버가 고쳐 쓴다
  test("첫 답이 crisis: true면 말투 재요청 없이 고쳐 쓰고 crisis·109는 유지된다", async () => {
    const first = JSON.stringify({ primary: "sadness", intensity: 5, keywords: ["절망"], empathy: "네가 많이 힘들었겠어요.", comfort: "곁에 있을게요.", crisis: true });
    const second = JSON.stringify({ primary: "sadness", intensity: 5, keywords: ["절망"], empathy: "많이 힘드셨겠어요.", comfort: "곁에 있을게요.", crisis: false });
    const replies = [first, second];
    const analyze = createAnalyzer({ chat: async ({ model }) => ({ content: replies.shift(), finishReason: "stop", model }), models: MODELS, ai: AI });
    const r = await analyze("오늘 너무 지쳤어");
    assert.equal(replies.length, 1); // 두 번째 답은 쓰지 않음
    assert.equal(r.style, "banmal patched");
    assert.equal(r.crisisReply, "model");
    assert.doesNotMatch(r.empathy, /네가/);
    assert.equal(r.crisis, true);
    assert.match(r.comfort, /109/);
  });
});

// 앱을 띄우고 port로 요청을 보내는 도우미
async function withApp(deps, fn) {
  const app = createApp({ hasApiKey: () => true, primaryModel: "a:free", indexPath: "missing.html", logger: quiet, ...deps });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    return await fn(server.address().port);
  } finally {
    server.close();
  }
}

describe("QA 재검증: 서버 (B-11, B-12, iframe 차단)", () => {
  test("B-11: FORBIDDEN_ORIGIN 안내 문구에 실제 포트가 들어간다", async () => {
    await withApp({ store: { list: async () => [] }, analyze: async () => ({}) }, async (port) => {
      for (const headers of [{ Origin: "null" }, { Origin: "http://evil.example" }]) {
        const res = await fetch(`http://127.0.0.1:${port}/api/entries`, { headers });
        assert.equal(res.status, 403);
        assert.match((await res.json()).error.message, new RegExp(`http://127\\.0\\.0\\.1:${port} `));
      }
    });
  });

  test("B-12: store.add 하는 사이 클라이언트가 끊기면 방금 저장한 일기를 되돌린다", async () => {
    const saved = new Map();
    let addStarted;
    const addStartedP = new Promise((r) => (addStarted = r));
    const store = {
      list: async () => [...saved.values()],
      add: async (entry) => {
        saved.set(entry.id, entry);
        addStarted();
        await new Promise((r) => setTimeout(r, 100)); // 이 사이에 클라이언트가 끊는다
      },
      remove: async (id) => saved.delete(id),
    };
    const analysis = {
      emotion: { primary: "joy", label: "기쁨", intensity: 3, keywords: ["기쁨"] },
      empathy: "좋으셨겠어요.", comfort: "오늘을 기억해요.", crisis: false, model: "a:free", usage: { calls: 1, maxCalls: 4, fallbacks: [] },
    };
    await withApp({ store, analyze: async () => analysis }, async (port) => {
      const body = JSON.stringify({ text: "오늘 좋았다" });
      const req = httpRequest(`http://127.0.0.1:${port}/api/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      });
      req.on("error", () => {});
      req.end(body);
      await addStartedP;
      assert.equal(saved.size, 1);
      req.destroy();
      await new Promise((r) => setTimeout(r, 250));
      assert.equal(saved.size, 0);
    });
  });

  test("GET / 는 X-Frame-Options: DENY 와 frame-ancestors 'none' 만 담은 CSP를 보낸다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "diary-frame-"));
    const indexPath = join(dir, "index.html");
    await writeFile(indexPath, "<!doctype html><title>t</title>");
    try {
      await withApp({ store: { list: async () => [] }, analyze: async () => ({}), indexPath }, async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("x-frame-options"), "DENY");
        assert.equal(res.headers.get("content-security-policy"), "frame-ancestors 'none'");
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
