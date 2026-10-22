// 퀴즈 문제 데이터 (카테고리별 10문제, 총 40문제)
const CATEGORIES = ["한국사", "과학", "지리", "일반상식"];

const QUESTIONS = [
  // ===== 한국사 =====
  {
    id: 1,
    category: "한국사",
    difficulty: "easy",
    question: "조선을 건국한 왕은?",
    options: ["이성계", "왕건", "이방원", "세종"],
    correctAnswer: 0,
    explanation: "이성계는 1392년 조선을 건국했습니다."
  },
  {
    id: 2,
    category: "한국사",
    difficulty: "easy",
    question: "훈민정음을 창제한 왕은?",
    options: ["태종", "세조", "세종", "성종"],
    correctAnswer: 2,
    explanation: "세종대왕은 1443년 훈민정음을 창제하고 1446년 반포했습니다."
  },
  {
    id: 3,
    category: "한국사",
    difficulty: "easy",
    question: "고려를 건국한 인물은?",
    options: ["궁예", "왕건", "견훤", "김부식"],
    correctAnswer: 1,
    explanation: "왕건은 918년 고려를 건국하고 936년 후삼국을 통일했습니다."
  },
  {
    id: 4,
    category: "한국사",
    difficulty: "easy",
    question: "임진왜란 때 한산도 대첩을 승리로 이끈 장군은?",
    options: ["권율", "김시민", "곽재우", "이순신"],
    correctAnswer: 3,
    explanation: "이순신 장군은 1592년 학익진 전법으로 한산도 대첩을 승리로 이끌었습니다."
  },
  {
    id: 5,
    category: "한국사",
    difficulty: "easy",
    question: "삼국을 통일한 나라는?",
    options: ["신라", "고구려", "백제", "가야"],
    correctAnswer: 0,
    explanation: "신라는 당과 연합해 백제(660)와 고구려(668)를 멸망시키고 삼국을 통일했습니다."
  },
  {
    id: 6,
    category: "한국사",
    difficulty: "medium",
    question: "3·1 운동이 일어난 해는?",
    options: ["1910년", "1919년", "1945년", "1950년"],
    correctAnswer: 1,
    explanation: "3·1 운동은 1919년 3월 1일 일제의 식민 통치에 맞서 일어난 독립운동입니다."
  },
  {
    id: 7,
    category: "한국사",
    difficulty: "medium",
    question: "광개토대왕릉비를 세운 고구려의 왕은?",
    options: ["광개토대왕", "소수림왕", "장수왕", "고국천왕"],
    correctAnswer: 2,
    explanation: "장수왕은 아버지 광개토대왕의 업적을 기리기 위해 414년 비석을 세웠습니다."
  },
  {
    id: 8,
    category: "한국사",
    difficulty: "medium",
    question: "팔만대장경이 보관되어 있는 사찰은?",
    options: ["불국사", "해인사", "통도사", "송광사"],
    correctAnswer: 1,
    explanation: "팔만대장경은 경남 합천 해인사의 장경판전에 보관되어 있습니다."
  },
  {
    id: 9,
    category: "한국사",
    difficulty: "medium",
    question: "1919년 대한민국 임시정부가 수립된 도시는?",
    options: ["상하이", "베이징", "도쿄", "충칭"],
    correctAnswer: 0,
    explanation: "대한민국 임시정부는 1919년 4월 중국 상하이에서 수립되었습니다."
  },
  {
    id: 10,
    category: "한국사",
    difficulty: "hard",
    question: "수원 화성 축조를 주도한 조선의 왕은?",
    options: ["영조", "숙종", "정조", "순조"],
    correctAnswer: 2,
    explanation: "정조는 1794~1796년 정약용의 설계와 거중기를 활용해 수원 화성을 축조했습니다."
  },

  // ===== 과학 =====
  {
    id: 11,
    category: "과학",
    difficulty: "easy",
    question: "물의 화학식은?",
    options: ["CO₂", "H₂O", "O₂", "NaCl"],
    correctAnswer: 1,
    explanation: "물은 수소 원자 2개와 산소 원자 1개로 이루어진 H₂O입니다."
  },
  {
    id: 12,
    category: "과학",
    difficulty: "easy",
    question: "태양계에서 가장 큰 행성은?",
    options: ["토성", "지구", "목성", "해왕성"],
    correctAnswer: 2,
    explanation: "목성은 지름이 지구의 약 11배로 태양계에서 가장 큰 행성입니다."
  },
  {
    id: 13,
    category: "과학",
    difficulty: "medium",
    question: "진공에서 빛의 속도는 초속 약 몇 km인가?",
    options: ["약 30만 km", "약 3만 km", "약 300만 km", "약 3천 km"],
    correctAnswer: 0,
    explanation: "빛의 속도는 초속 약 299,792km로, 1초에 지구를 약 7바퀴 반 돌 수 있습니다."
  },
  {
    id: 14,
    category: "과학",
    difficulty: "easy",
    question: "식물이 빛 에너지를 이용해 양분을 만드는 과정은?",
    options: ["호흡", "증산 작용", "광합성", "발효"],
    correctAnswer: 2,
    explanation: "광합성은 빛 에너지로 이산화탄소와 물에서 포도당과 산소를 만드는 과정입니다."
  },
  {
    id: 15,
    category: "과학",
    difficulty: "medium",
    question: "원소 기호 'Fe'가 나타내는 원소는?",
    options: ["불소", "철", "금", "납"],
    correctAnswer: 1,
    explanation: "Fe는 라틴어 Ferrum에서 온 철의 원소 기호입니다."
  },
  {
    id: 16,
    category: "과학",
    difficulty: "easy",
    question: "혈액 속에서 산소를 운반하는 세포는?",
    options: ["백혈구", "혈소판", "적혈구", "림프구"],
    correctAnswer: 2,
    explanation: "적혈구 속 헤모글로빈이 산소와 결합해 온몸으로 운반합니다."
  },
  {
    id: 17,
    category: "과학",
    difficulty: "medium",
    question: "뉴턴의 운동 제2법칙을 나타내는 식은?",
    options: ["F = mv", "F = ma", "E = mgh", "E = ½mv²"],
    correctAnswer: 1,
    explanation: "힘(F)은 질량(m)과 가속도(a)의 곱과 같습니다."
  },
  {
    id: 18,
    category: "과학",
    difficulty: "hard",
    question: "1953년 DNA의 이중나선 구조를 발표한 과학자는?",
    options: ["다윈과 멘델", "왓슨과 크릭", "퀴리 부부", "파스퇴르와 코흐"],
    correctAnswer: 1,
    explanation: "제임스 왓슨과 프랜시스 크릭은 1953년 DNA 이중나선 모델을 발표했습니다."
  },
  {
    id: 19,
    category: "과학",
    difficulty: "hard",
    question: "절대영도(0K)는 섭씨 몇 도인가?",
    options: ["-100℃", "-273.15℃", "-459.67℃", "0℃"],
    correctAnswer: 1,
    explanation: "절대영도는 -273.15℃입니다. -459.67은 화씨(℉) 기준 값입니다."
  },
  {
    id: 20,
    category: "과학",
    difficulty: "easy",
    question: "소리가 전달되지 않는 곳은?",
    options: ["물속", "철", "공기", "진공"],
    correctAnswer: 3,
    explanation: "소리는 매질의 진동으로 전달되므로 매질이 없는 진공에서는 전달되지 않습니다."
  },

  // ===== 지리 =====
  {
    id: 21,
    category: "지리",
    difficulty: "easy",
    question: "면적이 세계에서 가장 넓은 나라는?",
    options: ["중국", "캐나다", "러시아", "미국"],
    correctAnswer: 2,
    explanation: "러시아는 약 1,710만 km²로 세계에서 가장 넓은 나라입니다."
  },
  {
    id: 22,
    category: "지리",
    difficulty: "medium",
    question: "호주의 수도는?",
    options: ["시드니", "멜버른", "캔버라", "퍼스"],
    correctAnswer: 2,
    explanation: "호주의 수도는 시드니와 멜버른 사이에 계획도시로 건설된 캔버라입니다."
  },
  {
    id: 23,
    category: "지리",
    difficulty: "easy",
    question: "세계에서 가장 높은 산은?",
    options: ["K2", "에베레스트", "킬리만자로", "몽블랑"],
    correctAnswer: 1,
    explanation: "에베레스트산은 해발 약 8,849m로 세계 최고봉입니다."
  },
  {
    id: 24,
    category: "지리",
    difficulty: "medium",
    question: "남한에서 가장 긴 강은?",
    options: ["한강", "낙동강", "금강", "영산강"],
    correctAnswer: 1,
    explanation: "낙동강은 길이 약 510km로 남한에서 가장 긴 강입니다."
  },
  {
    id: 25,
    category: "지리",
    difficulty: "easy",
    question: "사하라 사막이 위치한 대륙은?",
    options: ["아시아", "남아메리카", "아프리카", "오세아니아"],
    correctAnswer: 2,
    explanation: "사하라 사막은 아프리카 북부에 있는 세계 최대의 열대 사막입니다."
  },
  {
    id: 26,
    category: "지리",
    difficulty: "medium",
    question: "캐나다의 수도는?",
    options: ["토론토", "오타와", "밴쿠버", "몬트리올"],
    correctAnswer: 1,
    explanation: "캐나다의 수도는 온타리오주에 있는 오타와입니다."
  },
  {
    id: 27,
    category: "지리",
    difficulty: "easy",
    question: "세계에서 가장 큰 대양은?",
    options: ["대서양", "인도양", "북극해", "태평양"],
    correctAnswer: 3,
    explanation: "태평양은 지구 표면의 약 3분의 1을 차지하는 가장 큰 대양입니다."
  },
  {
    id: 28,
    category: "지리",
    difficulty: "hard",
    question: "브라질의 공용어는?",
    options: ["스페인어", "포르투갈어", "영어", "프랑스어"],
    correctAnswer: 1,
    explanation: "브라질은 포르투갈의 식민지였기 때문에 포르투갈어를 사용합니다."
  },
  {
    id: 29,
    category: "지리",
    difficulty: "easy",
    question: "우리나라에서 가장 큰 섬은?",
    options: ["거제도", "울릉도", "제주도", "강화도"],
    correctAnswer: 2,
    explanation: "제주도는 면적 약 1,850km²로 우리나라에서 가장 큰 섬입니다."
  },
  {
    id: 30,
    category: "지리",
    difficulty: "easy",
    question: "아마존강이 흐르는 대륙은?",
    options: ["남아메리카", "아프리카", "아시아", "북아메리카"],
    correctAnswer: 0,
    explanation: "아마존강은 남아메리카를 가로지르며 유량이 세계에서 가장 많은 강입니다."
  },

  // ===== 일반상식 =====
  {
    id: 31,
    category: "일반상식",
    difficulty: "easy",
    question: "올림픽 오륜기의 고리는 몇 개인가?",
    options: ["4개", "5개", "6개", "7개"],
    correctAnswer: 1,
    explanation: "오륜기의 5개 고리는 다섯 대륙의 화합을 상징합니다."
  },
  {
    id: 32,
    category: "일반상식",
    difficulty: "medium",
    question: "북반구에서 1년 중 낮이 가장 긴 절기는?",
    options: ["춘분", "하지", "추분", "동지"],
    correctAnswer: 1,
    explanation: "하지(6월 21일경)는 북반구에서 낮이 가장 깁니다."
  },
  {
    id: 33,
    category: "일반상식",
    difficulty: "easy",
    question: "'모나리자'를 그린 화가는?",
    options: ["미켈란젤로", "라파엘로", "레오나르도 다빈치", "빈센트 반 고흐"],
    correctAnswer: 2,
    explanation: "모나리자는 레오나르도 다빈치의 작품으로 프랑스 루브르 박물관에 있습니다."
  },
  {
    id: 34,
    category: "일반상식",
    difficulty: "easy",
    question: "축구 경기에서 한 팀이 경기장에 내보내는 선수는 몇 명인가?",
    options: ["9명", "10명", "11명", "12명"],
    correctAnswer: 2,
    explanation: "축구는 골키퍼를 포함해 한 팀 11명이 경기합니다."
  },
  {
    id: 35,
    category: "일반상식",
    difficulty: "easy",
    question: "'로미오와 줄리엣'의 작가는?",
    options: ["셰익스피어", "괴테", "톨스토이", "헤밍웨이"],
    correctAnswer: 0,
    explanation: "로미오와 줄리엣은 윌리엄 셰익스피어의 희곡입니다."
  },
  {
    id: 36,
    category: "일반상식",
    difficulty: "easy",
    question: "일반적으로 무지개는 몇 가지 색으로 표현하는가?",
    options: ["5가지", "6가지", "7가지", "8가지"],
    correctAnswer: 2,
    explanation: "빨주노초파남보, 일반적으로 7가지 색으로 표현합니다."
  },
  {
    id: 37,
    category: "일반상식",
    difficulty: "hard",
    question: "베토벤의 '합창' 교향곡은 몇 번인가?",
    options: ["5번", "6번", "9번", "3번"],
    correctAnswer: 2,
    explanation: "'합창'은 베토벤의 교향곡 제9번입니다. 5번은 '운명', 6번은 '전원', 3번은 '영웅'입니다."
  },
  {
    id: 38,
    category: "일반상식",
    difficulty: "easy",
    question: "한글날은 언제인가?",
    options: ["3월 1일", "6월 6일", "8월 15일", "10월 9일"],
    correctAnswer: 3,
    explanation: "한글날은 훈민정음 반포를 기념하는 10월 9일입니다."
  },
  {
    id: 39,
    category: "일반상식",
    difficulty: "medium",
    question: "일반적인 주사위에서 마주 보는 두 면의 눈의 합은?",
    options: ["6", "7", "8", "9"],
    correctAnswer: 1,
    explanation: "주사위는 1-6, 2-5, 3-4가 마주 보도록 만들어져 합이 항상 7입니다."
  },
  {
    id: 40,
    category: "일반상식",
    difficulty: "medium",
    question: "표준 피아노의 건반 수는?",
    options: ["76개", "88개", "92개", "100개"],
    correctAnswer: 1,
    explanation: "표준 피아노는 흰 건반 52개와 검은 건반 36개, 총 88개입니다."
  }
];
