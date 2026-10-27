// 작성일시: 2026-10-26 14:55
// 데모 모드(--demo)용 고정 결과. AI를 호출하지 않고 화면 흐름을 테스트할 때 쓴다.
import { finalizeRecipes } from "./recipes.js";

const DEMO_RECOGNITION = [
  { id: "egg", score: 0.52, confidence: "high" },
  { id: "milk", score: 0.51, confidence: "high" },
  { id: "onion", score: 0.49, confidence: "normal" },
  { id: "kimchi", score: 0.48, confidence: "normal" },
  { id: "tofu", score: 0.47, confidence: "normal" },
];

// 사진과 관계없이 같은 인식 결과를 돌려준다 (ingredients: 후보 재료 목록, 한국어 이름 조회용)
export function demoRecognition(ingredients) {
  return DEMO_RECOGNITION.map((item) => ({ ...item, name: ingredients.find((i) => i.id === item.id).ko }));
}

const DEMO_RECIPES = [
  {
    title: "김치 두부찌개",
    summary: "김치와 두부만 있으면 끓이는 얼큰한 찌개",
    cookTimeMinutes: 25,
    difficulty: "easy",
    servings: 2,
    caloriesPerServing: 280,
    ingredients: [
      { name: "김치", amount: "1컵" },
      { name: "두부", amount: "1/2모" },
      { name: "양파", amount: "1/2개" },
      { name: "대파", amount: "1/2대" },
      { name: "고춧가루", amount: "1큰술" },
      { name: "물", amount: "500ml" },
    ],
    steps: ["김치와 양파를 한입 크기로 썬다.", "냄비에 김치를 볶다가 물을 붓고 끓인다.", "두부와 고춧가루를 넣고 10분 더 끓인다.", "대파를 넣고 마무리한다."],
    tips: "잘 익은 김치를 쓰면 국물 맛이 깊어진다.",
  },
  {
    title: "양파 달걀말이",
    summary: "양파를 잘게 다져 넣어 달큰한 달걀말이",
    cookTimeMinutes: 15,
    difficulty: "easy",
    servings: 2,
    caloriesPerServing: 190,
    ingredients: [
      { name: "달걀", amount: "4개" },
      { name: "양파", amount: "1/4개" },
      { name: "우유", amount: "2큰술" },
      { name: "소금", amount: "약간" },
      { name: "식용유", amount: "1큰술" },
    ],
    steps: ["양파를 잘게 다진다.", "달걀에 우유, 소금, 양파를 넣고 푼다.", "약불에서 얇게 부어 조금씩 말아 가며 익힌다."],
    tips: "우유를 조금 넣으면 더 부드럽다.",
  },
  {
    title: "두부 부침",
    summary: "겉은 바삭하고 속은 부드러운 반찬",
    cookTimeMinutes: 20,
    difficulty: "easy",
    servings: 2,
    caloriesPerServing: 210,
    ingredients: [
      { name: "두부", amount: "1모" },
      { name: "달걀", amount: "1개" },
      { name: "부침가루", amount: "3큰술" },
      { name: "간장", amount: "2큰술" },
      { name: "식용유", amount: "2큰술" },
    ],
    steps: ["두부를 1cm 두께로 썰어 물기를 뺀다.", "부침가루, 달걀물 순서로 옷을 입힌다.", "기름 두른 팬에 앞뒤로 노릇하게 부친다.", "간장을 곁들여 낸다."],
    tips: "두부 물기를 충분히 빼야 기름이 덜 튄다.",
  },
  {
    title: "김치볶음밥",
    summary: "냉장고 속 김치로 만드는 든든한 한 끼",
    cookTimeMinutes: 15,
    difficulty: "easy",
    servings: 2,
    caloriesPerServing: 550,
    ingredients: [
      { name: "김치", amount: "1컵" },
      { name: "밥", amount: "2공기" },
      { name: "달걀", amount: "2개" },
      { name: "양파", amount: "1/2개" },
      { name: "참기름", amount: "1큰술" },
    ],
    steps: ["김치와 양파를 잘게 썬다.", "팬에 김치와 양파를 볶는다.", "밥을 넣고 고루 볶은 뒤 참기름을 두른다.", "달걀 프라이를 올린다."],
    tips: "김치 국물을 조금 넣으면 색과 맛이 산다.",
  },
  {
    title: "양파 달걀국",
    summary: "부드러운 달걀과 달큰한 양파로 끓인 맑은 국",
    cookTimeMinutes: 15,
    difficulty: "easy",
    servings: 2,
    caloriesPerServing: 120,
    ingredients: [
      { name: "달걀", amount: "2개" },
      { name: "양파", amount: "1/2개" },
      { name: "대파", amount: "약간" },
      { name: "국간장", amount: "1큰술" },
      { name: "물", amount: "600ml" },
    ],
    steps: ["양파를 채 썰어 물에 넣고 끓인다.", "국간장으로 간을 한다.", "달걀을 풀어 둘러 붓고 젓지 않고 익힌다.", "대파를 넣고 불을 끈다."],
    tips: "달걀을 넣은 뒤 바로 젓지 않아야 국물이 맑다.",
  },
  {
    title: "우유 두부 크림 수프",
    summary: "두부와 우유로 만드는 고소하고 가벼운 수프",
    cookTimeMinutes: 25,
    difficulty: "medium",
    servings: 2,
    caloriesPerServing: 240,
    ingredients: [
      { name: "두부", amount: "1/2모" },
      { name: "우유", amount: "300ml" },
      { name: "양파", amount: "1/2개" },
      { name: "버터", amount: "1큰술" },
      { name: "소금", amount: "약간" },
      { name: "후추", amount: "약간" },
    ],
    steps: ["양파를 버터에 투명해질 때까지 볶는다.", "두부와 우유를 넣고 약불에서 5분 끓인다.", "믹서로 곱게 간다.", "소금, 후추로 간을 한다."],
    tips: "우유는 끓어 넘치기 쉬우니 약불을 유지한다.",
  },
];

// 이미 추천한 제목은 빼고 3개를 고른다. 남은 게 부족하면 처음부터 다시 돈다.
export function demoRecipes({ ingredients, excludeTitles, profile = null }) {
  const fresh = DEMO_RECIPES.filter((r) => !excludeTitles.includes(r.title));
  const picked = (fresh.length >= 3 ? fresh : DEMO_RECIPES).slice(0, 3);
  return finalizeRecipes(picked, ingredients, profile?.allergies ?? []);
}
