// 작성일시: 2026-10-26 14:39
// 로컬 웹 서버: 정적 파일 제공 + OpenRouter 프록시 API (API 키는 서버에서만 사용)
// .env는 config.js가 읽히기 전에 불러와야 하므로 반드시 첫 번째 import로 둔다
import "./src/env.js";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./src/config.js";
import { OpenRouterError, RequestBudget, formatUsage, getKeyStatus } from "./src/openrouter.js";
import { loadIngredientList, getIngredientVectors } from "./src/ingredients.js";
import { InvalidImageError, scoreImageCached, selectIngredients } from "./src/recognizer.js";
import { RecipeError, parseRecipeRequest, generateRecipes } from "./src/recipes.js";
import { demoRecognition, demoRecipes } from "./src/demo.js";
import { openStore } from "./src/store.js";
import {
  ApiError,
  PROFILE_OPTIONS,
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  listSavedRecipes,
  saveRecipe,
  updateSavedRecipeMemo,
  deleteSavedRecipe,
} from "./src/profiles.js";

// 데모 모드는 AI를 부르지 않으므로 API 키 확인과 키 상태 조회를 건너뛴다
if (!config.demo) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY가 없습니다. .env.example을 참고해 .env를 만드세요.");
    process.exit(1);
  }

  // 시작 시 상태 보고: 키 유효성, 남은 무료 요청 수, 모델 순서 (키 조회는 하루 한도를 쓰지 않음)
  const key = await getKeyStatus();
  if (!key.valid) {
    console.error(`[status] API 키 확인 실패: ${key.error}`);
  } else if (key.freeDaily) {
    const { used, limit, remaining } = key.freeDaily;
    console.log(`[status] API 키 정상, 오늘 무료 모델 요청 ${used}/${limit} 사용 (남은 횟수 ${remaining})`);
    if (remaining <= 0) console.warn("[status] 하루 무료 한도 소진: 모든 무료 모델이 막혀 있습니다 (대체 모델로도 해결되지 않음)");
  }
  console.log(`[status] 재료 인식 모델 순서: ${config.embedModels.join(" → ")}`);
  console.log(`[status] 레시피 모델 순서: ${config.chatModels.join(" → ")}`);
  const { maxCalls, timeMs } = config.requestBudget;
  console.log(`[status] 요청 1건당 AI 호출 상한: ${maxCalls}회, ${timeMs / 1000}초`);
}

await openStore();
console.log(`[store] 프로필 ${listProfiles().length}개 로드 (data/user/db.json)`);

const ingredients = await loadIngredientList();
if (!config.demo) {
  // 첫 번째 임베딩 모델의 재료 벡터를 미리 준비. 실패해도 서버는 띄운다 (직접 입력·레시피 생성은 가능)
  try {
    await getIngredientVectors(config.embedModels[0], ingredients);
    console.log(`[ingredients] ${ingredients.length} candidates ready (${config.embedModels[0]})`);
  } catch (err) {
    console.warn(`[ingredients] 재료 벡터를 준비하지 못했습니다 (${err.code ?? ""} ${err.message}). 재료 인식 요청 때 다시 시도합니다.`);
  }
}

const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
// 데모 모드에서 로딩 표시를 확인할 수 있도록 넣는 지연
const DEMO_DELAY_MS = 1500;

const app = express();
// 큰 본문(사진)은 /api/recognize에서만 받는다. 나머지 API는 작은 JSON만 허용
const imageJson = express.json({ limit: "15mb" });
const smallJson = express.json({ limit: "1mb" });
app.use((req, res, next) => (req.path === "/api/recognize" ? imageJson : smallJson)(req, res, next));
app.use(express.static(fileURLToPath(new URL("public", import.meta.url))));

const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// OpenRouter 오류를 HTTP 응답으로 변환 (처리했으면 true)
function sendUpstreamError(res, err) {
  if (!(err instanceof OpenRouterError)) return false;
  // 하루 한도·사용량 초과는 429, 업스트림 응답 문제는 502, 키 오류는 500, 크레딧 부족·호출 상한 초과(BUDGET_EXCEEDED) 등은 503
  const status = { UPSTREAM_ERROR: 502, REQUEST_ERROR: 502, AUTH_ERROR: 500, INSUFFICIENT_CREDITS: 503, DAILY_LIMIT: 429, RATE_LIMITED: 429 }[err.code] ?? 503;
  sendError(res, status, err.code, err.message);
  return true;
}

// 응답을 보내기 전에 클라이언트가 연결을 끊으면(화면에서 취소·창 닫기) abort되는 신호.
// 이 신호를 RequestBudget에 넣어, 버려진 요청이 재시도·대체 모델·재생성으로 하루 한도를 더 쓰지 않게 한다
function clientSignal(res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

// 재료 직접 추가용 자동완성 목록
app.get("/api/ingredients", (req, res) => {
  res.json({ ingredients: ingredients.map(({ id, ko }) => ({ id, name: ko })) });
});

app.post("/api/recognize", async (req, res) => {
  const match = typeof req.body?.image === "string" && req.body.image.match(DATA_URL_PATTERN);
  if (!match) return sendError(res, 400, "INVALID_IMAGE", "JPEG, PNG, WebP 이미지만 올릴 수 있습니다.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > config.maxImageBytes) {
    return sendError(res, 400, "INVALID_IMAGE", "이미지는 10MB 이하만 올릴 수 있습니다.");
  }

  const started = Date.now();
  if (config.demo) {
    await sleep(DEMO_DELAY_MS);
    return res.json({ ingredients: demoRecognition(ingredients), elapsedMs: Date.now() - started, demo: true });
  }
  const signal = clientSignal(res);
  try {
    // 같은 사진을 다시 보내면 최근 결과를 재사용한다 (API 요청 없음).
    // 같은 사진을 기다리는 다른 요청이 있으면 이 요청이 끊겨도 작업은 계속된다
    const { scores, model, cached, usage } = await scoreImageCached(buffer, ingredients, { signal });
    const picked = selectIngredients(scores);
    const gone = signal.aborted ? ", client disconnected" : "";
    console.log(`[recognize] OK ${picked.length} ingredients in ${Date.now() - started}ms (model: ${model}, ${formatUsage(usage)}${cached ? ", cached" : ""}${gone})`);
    if (signal.aborted) return;
    res.json({ ingredients: picked, model, elapsedMs: Date.now() - started });
  } catch (err) {
    if (err.code === "CLIENT_CLOSED" && signal.aborted) {
      return console.log(`[recognize] CANCELLED by client in ${Date.now() - started}ms (${formatUsage(err.usage)})`);
    }
    console.error(`[recognize] FAILED in ${Date.now() - started}ms (${formatUsage(err.usage)}): ${err.code ?? ""} ${err.detail || err.message}`);
    if (signal.aborted) return;
    if (sendUpstreamError(res, err)) return;
    if (err instanceof InvalidImageError) return sendError(res, 400, "INVALID_IMAGE", err.message);
    throw err;
  }
});

app.post("/api/recipes", async (req, res) => {
  let request;
  try {
    request = parseRecipeRequest(req.body);
  } catch (err) {
    if (err instanceof RecipeError) return sendError(res, 400, err.code, err.message);
    throw err;
  }
  // 프로필의 알레르기·식단 정보를 프롬프트와 알레르기 검사에 쓴다 (없는 프로필이면 404)
  if (request.profileId) request.profile = getProfile(request.profileId);

  const started = Date.now();
  if (config.demo) {
    await sleep(DEMO_DELAY_MS);
    return res.json({ recipes: demoRecipes(request), elapsedMs: Date.now() - started, demo: true });
  }
  const signal = clientSignal(res);
  // 이 요청의 모든 OpenRouter 호출(재시도·대체 모델·재생성)이 함께 쓰는 예산. 클라이언트가 끊기면 새 호출을 멈춘다
  const budget = new RequestBudget({ signal });
  try {
    const { recipes, attempts, model } = await generateRecipes(request, { budget });
    // calls는 실제 OpenRouter 호출 수, stages는 생성 단계 수(기본·답 잘림·JSON 오류)
    console.log(`[recipes] OK ${recipes.length} recipes in ${Date.now() - started}ms (model: ${model}, ${formatUsage(budget.usage())}, stages: ${attempts})`);
    if (signal.aborted) return;
    res.json({ recipes, model, elapsedMs: Date.now() - started });
  } catch (err) {
    if (err.code === "CLIENT_CLOSED" && signal.aborted) {
      return console.log(`[recipes] CANCELLED by client in ${Date.now() - started}ms (${formatUsage(budget.usage())})`);
    }
    console.error(`[recipes] FAILED in ${Date.now() - started}ms (${formatUsage(budget.usage())}): ${err.code ?? ""} ${err.detail || err.message}`);
    if (signal.aborted) return;
    if (sendUpstreamError(res, err)) return;
    if (err instanceof RecipeError) return sendError(res, 502, err.code, err.message);
    throw err;
  }
});

// ---- 3단계: 프로필과 저장 레시피 ----

app.get("/api/profile-options", (req, res) => res.json(PROFILE_OPTIONS));
app.get("/api/profiles", (req, res) => res.json({ profiles: listProfiles() }));
app.post("/api/profiles", async (req, res) => res.status(201).json({ profile: await createProfile(req.body) }));
app.get("/api/profiles/:id", (req, res) => res.json({ profile: getProfile(req.params.id) }));
app.put("/api/profiles/:id", async (req, res) => res.json({ profile: await updateProfile(req.params.id, req.body) }));
app.delete("/api/profiles/:id", async (req, res) => res.json(await deleteProfile(req.params.id)));

app.get("/api/profiles/:id/recipes", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json({ recipes: listSavedRecipes(req.params.id, q) });
});
app.post("/api/profiles/:id/recipes", async (req, res) => {
  res.status(201).json({ savedRecipe: await saveRecipe(req.params.id, req.body) });
});
app.patch("/api/profiles/:id/recipes/:recipeId", async (req, res) => {
  res.json({ savedRecipe: await updateSavedRecipeMemo(req.params.id, req.params.recipeId, req.body) });
});
app.delete("/api/profiles/:id/recipes/:recipeId", async (req, res) => {
  res.json(await deleteSavedRecipe(req.params.id, req.params.recipeId));
});

// 공통 오류 처리: 검증·없음·중복 오류(ApiError), JSON 본문이 너무 크거나 깨진 경우 등
app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  const inputCode = req.path === "/api/recognize" ? "INVALID_IMAGE" : "INVALID_INPUT";
  if (err.type === "entity.too.large") {
    const message = req.path === "/api/recognize" ? "요청 크기가 너무 큽니다. 이미지는 10MB 이하만 올릴 수 있습니다." : "요청 크기가 너무 큽니다.";
    return sendError(res, 413, inputCode, message);
  }
  if (err.type === "entity.parse.failed") return sendError(res, 400, inputCode, "요청 형식이 올바르지 않습니다.");
  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", "서버 오류가 발생했습니다.");
});

// Express 5는 포트 사용 중 등 listen 오류도 이 콜백으로 넘긴다
// 기본은 127.0.0.1에서만 받는다 (HOST 환경 변수로 변경)
app.listen(config.port, config.host, (err) => {
  if (err) {
    console.error(`서버를 시작하지 못했습니다 (${config.host}:${config.port}): ${err.message}`);
    process.exit(1);
  }
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(config.host);
  const shownHost = loopback || config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
  const scope = loopback ? "" : ` (HOST=${config.host}: 다른 기기에서도 접속 가능)`;
  console.log(`Server running at http://${shownHost}:${config.port}${scope}${config.demo ? " (데모 모드: AI 호출 없음)" : ""}`);
});
