// 작성일시: 2026-10-27 17:20
// 자해·자살 암시 표현 감지 (B-03, B-09, B-14 재설계).
// 목표 우선순위: 누락 최소화 > 오탐 최소화. 오탐은 109 안내 상자가 하나 더 붙는 것뿐이지만 누락은 위험하다.
// 그래서 문장 목록이 아니라 '의미 범주별 어휘(어간)'로 넓게 잡고, 명백한 일상어만 예외로 뺀다.
//
// 처리 순서
//  ① 정규화: 따옴표·영문 소문자, 흔한 구어·오타(시퍼/십어→싶어, 주글→죽을, 죽구→죽고, 시러→싫어, ㅈㅅ·ㅈㄱㅅㄷ)
//  ② 명백한 일상어 구간 지우기(자살골, 자살률, 유서 깊은, "죽고 싶을 만큼 행복" 등)
//  ③ 문장 단위로 나눈 뒤, 각 문장을 '공백을 모두 지운 문자열(compact)'에서 어휘 규칙으로 검사한다.
//     공백 위치에 상관없이 잡히므로("죽 고 싶 다", "살고싶지가않아") 띄어쓰기 변형마다 패턴을 따로 둘 필요가 없다.
//     compact의 각 글자가 원문 어디에서 왔는지 기억해 두었다가, 예외 판단이 필요한 규칙만 원문의 '바로 앞 낱말'을 본다.
//  ④ 예외는 문장 전체가 아니라 위기 표현 **바로 앞의 목적어·주어 한 낱말**에만 적용한다.
//     "숙제 끝내고 싶다"(목적어가 할 일) → 일상, "회사에서 깨지고 집에 오니 다 끝내고 싶다"(목적어 없음) → 위기.
//  ⑤ "~다는 농담" 문장은 같은 일기에 다른 위기 신호가 없고 '진심·사실' 같은 말이 없을 때만 건너뛴다.
// 모델의 crisis 판단은 diary.js에서 OR로 더한다.

// ---------------------------------------------------------------- ① 정규화
const NORMALIZERS = [
  [/[’‘`]/g, "'"],
  [/[“”]/g, '"'],
  // 초성 축약
  [/ㅈㄱㅅ[ㄷㅇㅍ]/g, "죽고싶다"],
  [/ㅈㅅ(?=\s*(하고|하려|할까|할래|각|충동|생각|시도|해\s*버리|했))/g, "자살"],
  // 죽을/죽어 구어·오타
  [/(주글|쥬글|쥭을|듀글)/g, "죽을"],
  [/(주거|쥬거|쥭어)(?=\s*(버리|버릴|버려|야))/g, "죽어"],
  [/쥭/g, "죽"],
  // "~구 싶다" → "~고 싶다" (죽구싶어, 살구싶지)
  [/([가-힣])구(\s*)(?=싶|시퍼|십|시프|프)/g, "$1고$2"],
  // 싶어 변형
  [/고(\s*)(시퍼|십어|싶퍼|시포|십퍼|시프|싶포)/g, "고$1싶어"],
  [/고(\s*)십(?=[다어음은네지])/g, "고$1싶"],
  // 싫어 변형
  [/시러/g, "싫어"],
  [/살기(\s*)실(?=[어다타])/g, "살기$1싫"],
];

const normalize = (text) => {
  let out = text.toLowerCase();
  for (const [re, to] of NORMALIZERS) out = out.replace(re, to);
  return out;
};

// ---------------------------------------------------------------- ② 명백한 일상어 구간
const BENIGN_SPANS = [
  /자살\s*(골|특공|스쿼드|예방|률|율|방지|유가족)/g,
  /유서\s*(가\s*)?깊/g,
  // 긍정 감정 과장: "죽고 싶을 만큼 행복해" (힘들어·괴로워 등은 지우지 않는다)
  /죽고\s*싶을\s*(만큼|정도로|정도)\s*((너무|정말|진짜|넘)\s*)?(행복|좋|기쁘|기뻐|설레|웃기|웃겨|재밌|재미있|귀여|귀엽|사랑스|맛있)/g,
];

// ---------------------------------------------------------------- 문장·낱말 도우미
const splitSentences = (text) =>
  text
    .split(/[.!?…~\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

// compact 문자열과 각 글자의 원문 위치
function compactOf(spaced) {
  let compact = "";
  const map = [];
  for (let i = 0; i < spaced.length; i++) {
    if (/\s/.test(spaced[i])) continue;
    compact += spaced[i];
    map.push(i);
  }
  return { compact, map };
}

// 낱말을 거슬러 볼 때 건너뛰는 부사(여러 개가 붙어 있어도 "그냥다" 통째로 건너뜀)
const ADVERB = "다|다시는|더|더는|더이상|밤|오늘밤|이밤|지금|이번엔|이번에는|그냥|걍|이제|이젠|이제는|전부|모두|진짜|정말|정말로|진심|진심으로|너무|좀|그만|확|콱|싹|오늘|오늘은|요즘|요즘은|요새|다시|또|그저|차라리|제발|마냥|계속|자꾸|문득|가끔|매일|맨날|이대로|그대로|조용히|영원히|멀리|혼자|아예|같이|많이|깊이|그냥좀|아무도|모르게";
const ADVERB_ONLY = new RegExp(`^(${ADVERB})+$`);
// 할 일·물건을 끝낸다는 뜻이 되는 '속도·기한' 표지 (부사 건너뛰기 전에 먼저 본다)
const SPEED_OR_DEADLINE = /^(빨리|얼른|후딱|어서|빨랑|일찍|당장|빨리빨리)$|(까지|안에|전에|내로|주에|중에)$/;
// 목적어·주어로 오면 일상(할 일·물건·활동)인 낱말
const TASK_STEM =
  /숙제|과제|보고서|리포트|프로젝트|업무|공부|시험|작업|청소|빨래|설거지|퇴근|출근|야근|회사|직장|학교|학원|마감|회의|발표|게임|드라마|시즌|정주행|논문|알바|아르바이트|집안일|정리|계약|이사|연애|다이어트|운동|인강|강의|시리즈|넷플|유튜브|팀플|대화|통화|싸움|관계|잔소리|생각|고민|걱정|일정|여행|휴가|방학|대학원|군대|취준|면접|자격증|레슨|수업|훈련|연습|번역|원고|코딩|개발|요리|식사|약속|모임|회식|담배|핸드폰|휴대폰|스마트폰|인스타|카톡|버그|스트레스|감기|장마|월요일|하루가|오늘이/;
const TASK_SHORT = /^(이|그|저)?(일|책|술|밥|글|폰|옷|돈|빚)(을|를|은|는|도|만|이|부터)?$/;
// 위기 쪽 목적어·주어 (나·삶·모든 것)
const SELF_OR_ALL = /^(나|난|날|나를|나는|나도|내가|내|저|전|제가|저를|저는|나같은|나란|모든|모든걸|모든것|모든것을|모든게|이모든|삶|삶을|삶은|삶도|인생|인생을|인생은|목숨|목숨을|세상|이세상|세상을|살기|살기를|사는|사는걸|사는것|사는것을|생|생을|생은|이생|이번생|이번생은|숨|숨을|고통|고통을|이고통|아픔|아픔을|괴로움|괴로움을|이괴로움|모든걸|다를)$/;
// 동사·연결 어미로 끝나는 낱말 = 원인 절("집에 오니", "망치고", "없어") → 목적어가 아님
const VERB_ENDING = /(고|니|서|면|며|데|만|지|어|아|해|요|다|게|자|라|니까|는데|지만|았|었|죠|네|군|워|와|여|려|쳐|져|야|래|걸|까)$/;

const cleanToken = (t) => t.replace(/^[^가-힣a-z0-9]+|[^가-힣a-z0-9]+$/g, "");

// 위기 표현 바로 앞의 낱말들 (가까운 것부터). 표현이 낱말 가운데서 시작하면 그 앞부분이 첫 낱말이다
function tokensBefore(spaced, start) {
  const before = spaced.slice(0, start);
  const tokens = before.split(/\s+/).map(cleanToken).filter(Boolean).reverse();
  const inWord = before.length > 0 && !/\s$/.test(before) ? tokens[0] ?? "" : "";
  return { tokens, inWord };
}

// 부사를 건너뛴 첫 낱말과 그 앞 낱말
function nearestWord(tokens, { skipSpeed = false } = {}) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (ADVERB_ONLY.test(t)) continue;
    if (skipSpeed && SPEED_OR_DEADLINE.test(t)) continue;
    return { word: t, prev: tokens[i + 1] ?? "" };
  }
  return { word: "", prev: "" };
}

const isThingWord = (w) => /^(걸|것|것을|거|게|건|것이|거를)$/.test(w);

// "끝내고 싶다"·"그만하고 싶다"·"포기하고 싶다"의 목적어가 할 일·물건이면 일상 (true = 일상)
function objectIsTask(spaced, start, { compoundGuard = false } = {}) {
  const { tokens, inWord } = tokensBefore(spaced, start);
  // "털어놓고 싶다", "쌓아 놓고"처럼 앞말과 붙어 다른 동사가 된 경우
  if (compoundGuard && inWord && !ADVERB_ONLY.test(inWord) && !/내려$/.test(inWord) && /(어|아|여|해|워|려|쳐|져|켜|와|내)$/.test(inWord)) return true;
  if (tokens[0] && SPEED_OR_DEADLINE.test(tokens[0])) return true;
  const { word, prev } = nearestWord(tokens);
  if (!word) return false;
  if (SPEED_OR_DEADLINE.test(word)) return true;
  if (SELF_OR_ALL.test(word)) return false;
  if (TASK_SHORT.test(word) || TASK_STEM.test(word)) return true;
  if (isThingWord(word)) return !/^(모든|이모든|전부|다|사는|살아있는|살아가는)$/.test(prev);
  if (/(을|를)$/.test(word) || /^(이거|그거|저거|이걸|그걸|저걸|이것|그것|저것)/.test(word)) return true;
  if (VERB_ENDING.test(word)) return false;
  return true; // 조사 없는 명사 목적어 ("알바 그만하고 싶다")
}

// 주어가 내가 아닌 다른 것이면 true ("걱정이 사라졌으면", "아기가 깨지 않았으면")
// 시간 낱말 주어("오늘 밤이 마지막이었으면")는 나의 일로 본다 (timeIsSelf)
const TIME_SUBJECT = /^(오늘|오늘밤|밤|이밤|하루|오늘하루|지금|이순간|이번)(이|가|은|는)?$/;
function subjectIsOther(spaced, start, { timeIsSelf = false } = {}) {
  const { tokens } = tokensBefore(spaced, start);
  const { word, prev } = nearestWord(tokens, { skipSpeed: true });
  if (!word) return false;
  if (timeIsSelf && TIME_SUBJECT.test(word)) return false;
  if (SELF_OR_ALL.test(word)) return false;
  if (isThingWord(word)) return !/^(모든|이모든|전부|다)$/.test(prev) && !/[가-힣](는|은|던)$/.test(prev);
  if (TASK_SHORT.test(word) || TASK_STEM.test(word)) return true;
  // 조사 이/가/은/는이 붙은 다른 명사가 주어 ("많이·깊이" 같은 부사는 ADVERB에서 건너뜀)
  return /[가-힣](이|가|은|는)$/.test(word);
}

// ---------------------------------------------------------------- ③ 어휘 규칙
// re: compact 문장에 거는 정규식 (공백 없음)
// unless: compact 문장 전체에 걸리면 일상 (명백한 일상어 예외만)
// beforeUnless: 표현 바로 앞(compact) 꼬리에 걸리면 일상 (과장·거주지 등)
// check: "object" → 목적어가 할 일이면 일상, "subject" → 주어가 남이면 일상
// contiguous: 원문에서 띄어쓰기 없이 붙어 있어야 함 (짧은 낱말이 "혼자 살"처럼 경계를 넘어 생기는 것 방지)
const HYPERBOLE_BEFORE = /(배고파|배불러|웃겨|귀여워|귀엽|더워|추워|졸려|심심해|보고싶어|좋아|맛있어|설레|부러워|궁금해|간지러워|짜증나|답답해|피곤해|목말라|배아파)서?$/;
const SECOND_PERSON_BEFORE = /(너|니|넌|너희|너네|니들|이놈|이녀석|저놈)(진짜|정말|진심|확|콱|좀)*$/;
const RESIDENCE_BEFORE = /(혼자|같이|함께|따로|여기서?|거기서?|저기서?|에서|서울|시골|도시|동네|랑|이랑|하고|과|와|(?<!세상)집에)$/;
const MEDIA = /게임|공격|스킬|드라마|영화|뉴스|다큐|기사|소설|웹툰|만화|애니|장면|주인공|등장인물|캐릭터|소재|교육|강의|수업|통계|논문|연구|캠페인|노래|가사|유튜브|영상|책에서|책을/;
const DESIRE = /싶|할까|할래|하려|충동|생각|해버리|했|하고|시도|계획|각|해야|중이|하자|프다|ㄹ래/;
const PHYSICAL_BEFORE = /(아파|아퍼|졸려|배고파|더워|추워|마려|다리|허리|발|어깨|무릎|목|손|잠|화장실)[가-힣]{0,4}$/;
const LEISURE = /친구|랑|같이|치킨|치맥|라면|자전거|산책|피크닉|소풍|데이트|야경|불꽃|축제|놀러|공원|러닝|달리기|날씨|주말|캠핑|돗자리|맥주|버스킹|고기|바베큐|파티|텃밭|빨래|별|사진|정원|카페|일출|일몰|노을|공사|청소|방수|담배|바람쐬|구경|수영|물놀이/;

const RULES = [
  // ---- (a) 죽음 소망
  { name: "die-wish", re: /죽고(만|도|파|프)?(싶|프|파)/ },
  { name: "die-throw", re: /죽어버(리|릴|려)/ },
  { name: "die-would", re: /죽을래/, beforeUnless: [HYPERBOLE_BEFORE, SECOND_PERSON_BEFORE] },
  { name: "die-maybe", re: /죽을까(봐|보다|싶|해|하고|요)?(ㅠ|ㅜ)*$|죽을까(싶|생각|고민|하고)|(그냥|차라리|확|콱|그만)죽을까/, beforeUnless: [HYPERBOLE_BEFORE], unless: [/죽을까봐(무서|걱정|겁|두려|조마|불안|떨|조심)/] },
  { name: "die-better", re: /죽는(게|것이|편이|쪽이|거|게더|편)(더|차라리|훨씬)?(나을|낫|나아|좋|편)/ },
  { name: "die-must", re: /죽어야(겠|지|할|하나|될|돼|해|만|하는)/ },
  { name: "die-plan", re: /(?<!안)죽(는|을)(상상|방법|법|생각|궁리|용기|결심|준비|날)|죽음(을|만|에대해)?(생각|떠올|꿈꾸|원하|바라|택하|준비)|죽음(이|만이|밖에)(답|해결|유일|편|나을|낫)/ },
  { name: "die-peaceful", re: /고통없이(죽|떠나|가고|잠들|사라지)|(편하게|안아프게|조용히)죽(고|을|는|어)/ },
  { name: "died-wish", re: /죽(었으면|었음|으면좋|어버렸으면|어졌으면)/, check: "subject" },
  { name: "if-i-die", re: /(나|내가|난|나하나|나하나쯤|제가|저하나)(죽어도|죽으면|죽는다면|죽더라도|죽었을때|죽어야|사라져도|사라지면|없어져도|없어지면)/ },
  { name: "die-slang", re: /(뒤지|디지|뒈지)고(싶|프)|(뒤져|디져|뒈져)버(리|릴|려)/ },
  { name: "die-slang-would", re: /(뒤질|디질|뒈질)래/, beforeUnless: [HYPERBOLE_BEFORE, SECOND_PERSON_BEFORE] },
  { name: "not-born", re: /태어나지(말|않|마)|안태어나|왜태어났|태어난(게|것이|것도|거)(후회|죄|잘못|싫|원망|미안)|태어나서(미안|죄송)/ },
  { name: "vanish", re: /(사라|없어)(지고(만)?(싶|프)|져버(리|릴|렸으면)|질래|질까|졌으면|지면(좋|편|나을|낫)|져야(겠|지|해))|증발(하고싶|해버리|했으면|할래)|소멸(하고싶|했으면|할래)|(사라지|사라져|사라질|없어지|없어져|없어질)[가-힣]{0,4}?(괜찮|좋겠|좋을|나을|낫|맞|편할|편하|도돼|도될|야해|야돼|야지)/, check: "subject" },
  { name: "no-wake", re: /(깨어나|일어나|깨|뜨|떠지|깨어지)지(않았으면|말았으면|않기를|말기를|않길|말길|않으면좋|못했으면|않게|않았음)|(안|못)(깨어났|깼|일어났|떴|떠졌|깨어나|깨|떠지)(으면|음좋|으면좋|음)|영원히(잠들|잠자|자고싶|눈감|쉬고싶|떠나)|(잠든|자는)채로(죽|안깨|가고|떠나)/, check: "subject" },
  { name: "no-tomorrow", re: /(내일|아침)(이|은)?(안왔으면|오지않았으면|안오면좋|오지않으면좋|영영안|안왔음)/ },
  { name: "afterlife", re: /하늘나라(에|로)?(가고(싶|프)|갈래|가버리|가고파)|저세상(에|으로)?(가고|갈래|가버)/ },
  { name: "breath-stop", re: /숨(이)?멎(었으면|기를|어버리|으면좋)/ },
  { name: "accident-wish", re: /(차|트럭|버스|기차|지하철)에?(치이고(싶|프)|치였으면|치여버리|치여서죽|뛰어들)|사고(라도|가)?(났으면|나서죽|나면좋)/ },
  { name: "rest-forever", re: /(그냥|이제|영원히|차라리)(좀)?편해지고(싶|프)/ },

  // ---- (b) 삶 포기·무의미
  { name: "life-hate", re: /살기(가|도|조차)?싫|살아있기(가|도)?싫|살아있는(게|것이|것도)싫|사는(게|것이|것도|거)싫/, beforeUnless: [RESIDENCE_BEFORE] },
  { name: "life-not-want", re: /살고(싶|프)(지|진|은마음이|은생각이|은맘이)(가|도|는)?(않|안|없)/, beforeUnless: [RESIDENCE_BEFORE] },
  { name: "stop-living", re: /그만살(?!찌|쪄|빼|펴|피|림|짝|금)/, check: "object" },
  { name: "why-live", re: /왜(이렇게)?(살아(?!남)|사는(지|건|걸|거|가|걸까)|사냐|살지|살아야|살고있|살까)/, check: "object" },
  { name: "live-pointless", re: /살아(서|봤자|봐야)(뭐|뭘|뭣|무슨|의미|소용|달라)|살아봤자/ },
  { name: "no-reason", re: /(살|살아갈|살아야할|살아있을|사는|살아가는|살아있는|살아야하는|살아야될)(이유|의미|목적|가치|재미|맛)(가|도|를|는|이|조차)?(없|모르|못찾|사라|안나|하나도)/ },
  { name: "more-live", re: /더(이상|는)?살(자신|힘|용기)(이|도|가)?(없|안)|살아갈(자신|힘|용기)(이|도|가)?(없|안)/ },
  { name: "life-pain", re: /(삶|인생|사는것|사는게|사는거|살아있는것|살아있는게|살아가는것|살아가는게|살아있다는것|살아있다는게)(이|은|가|는|자체가|조차|도|자체|마저)?[가-힣]{0,4}?(의미가?없|무의미|지옥|고통|괴롭|괴로|버겁|버거|지겹|지겨|싫|끔찍|형벌|벌같|힘들|무거|허무|지쳐|지치|지친|미안|죄스럽|죄송|비참|절망|막막|두렵|두려|무섭|무서|외롭|불행|저주|벌받|벌같|벌주)/ },
  { name: "days-hell", re: /(하루하루|매일매일|매일|하루가|날마다)(가|이|는)?[가-힣]{0,3}?(지옥|고통|형벌|끔찍|버티는|견디는)/ },
  { name: "hopeless", re: /(삶|사는|살|미래|인생|앞날)[가-힣]{0,3}?희망(이|도)?(없|안)|아무희망도없|희망이하나도없|희망이없어서|절망뿐|벼랑끝/ },
  { name: "meaningless", re: /(의미|가치|이유)(없는|도없는)(삶|인생)|무의미한(삶|인생|하루)|(삶|인생)의(의미|이유)(가|를)?(없|모르)/ },
  { name: "cannot-bear", re: /(버틸|견딜)(수가?|힘이|자신이|자신도|힘도)(없|안)|(못버티|못견디)|버티기(가)?(너무)?(힘들|싫|지쳤)/, beforeUnless: [PHYSICAL_BEFORE] },
  { name: "give-up-life", re: /(삶|인생|살기|사는것|살아가는것|목숨|모든것|모든걸)(을|를)?(다|그냥|이제)*(포기|(그만두|그만하|끝내|놓아|놔|내려놓)(버리)?(고싶|고프|버릴|버리고|려고|야겠|고말)|끝낼까|그만둘까|그만할까)/ },
  { name: "leave-world", re: /세상을?(떠나|등지)(고(싶|프)|버리고|버릴|야겠|려고|고말|고파)|생을마감|목숨을?끊|스스로(목숨|생을)/ },
  // 목적어 없는 "다 끝내고 싶다 / 그만하고 싶다 / 포기하고 싶다 / 다 놓고 싶다"
  { name: "end-all", re: /(그만(하|두)|끝내|포기하|내려놓|놓아|놔|놓)(버리)?고(싶|프|파)|(그만(할|둘)|끝낼|포기할|놓을)(까|래)|(끝내|놓아|놔)버(릴|려|리자)|(끝내|그만둬|그만해|포기해)야(겠|지|할)|(끝내|그만하|그만두|포기하)자(?!고|마)|(끝낼|그만둘|포기할)(거|게|꺼|것)|(끝내|그만두|그만하|포기하|내려놓|놓)으?려(고|해|한다|구)|끝(을)?내(고(싶|프)|버리|버릴|려|야겠|자|ㄹ래)/, check: "object", compoundGuard: true },
  { name: "all-ended", re: /(다|모든게|모든것이|전부)?끝났으면(좋|해|싶)/, check: "subject" },
  // 나 없는 게 낫다 / 내가 없으면 다들 편할 것 / 짐
  { name: "better-without-me", re: /(나|난|내가|나같은[가-힣]{0,2})[가-힣]{0,8}?없(는게|는편이|어지는게|어져야|는것이)(낫|나을|나아|좋|편|맞)/ },
  { name: "nobody-notice", re: /(내가|나만|나하나|난|나는|나|제가)(없으면|없어지면|사라지면|죽으면|없어져도|없어도|죽어도|사라져도)[가-힣]{0,20}?(편하|편할|편해|나을|낫|좋을|좋겠|행복하|행복할|홀가분|모르|모를|슬퍼하지|상관없|신경안|안슬퍼|눈치못|티도안)|(죽어도|없어져도|사라져도)[가-힣]{0,8}?(아무도|누구도)(모를|모르|신경|슬퍼하지|안슬퍼|눈치)/ },
  { name: "burden", re: /(필요없는|쓸모없는|없어도되는)존재|짐(만|밖에)(되|돼|안돼)|짐덩어리|짐이(되기싫|되는것같|될뿐|되는거같)/ },

  { name: "life-burden", re: /살기(가|도)?(버거|버겁|지겹|지겨|지쳐|지치|고통|무서|두려)|숨(쉬|쉬기|쉬는것|쉬는게)(도|조차|가|마저)?(싫|버거|버겁|귀찮|고통|지겹|지겨|의미없)/, beforeUnless: [RESIDENCE_BEFORE] },
  { name: "unworthy", re: /(살|살아갈|살아있을|살아있을|존재할|태어날)(자격|가치|이유)(이|도|가)?(없|안)|죽어(도)?(마땅|싸|싼)|죽어야마땅|나같은(건|게|거|애|놈|년|인간|사람)|나따위|나란인간|태어난(게|걸|것|거|것이|것을|것도)[가-힣]{0,3}?(후회|죄|잘못|싫|원망|미안|저주)/ },
  { name: "all-meaningless", re: /(아무|모든게|모든것이|모든것|전부|아무것도|다|이제|더는|더이상|인생|삶|사는게)(이|가|도|은|는)?[가-힣]{0,2}?(무의미|의미가?없|의미도없|부질없|소용없)/ },
  { name: "life-over", re: /(내|나의|제|이번)?(인생|삶)(은|이|도)?(끝났|끝이|다끝|망가졌|무너졌)/, unless: [/시험|성적|망했|ㅋㅋ|게임|주식|코인|맛집|영화|레전드/] },
  { name: "final-wish", re: /마지막(이었으면|이었음|이면좋|이길|이었으면좋|이고싶|날이었으면|이되었으면|이됐으면)|끝났으면/, check: "subject", timeIsSelf: true },
  { name: "end-plan", re: /(끝낼|끝내기로|그만둘|포기할|떠날)(준비|생각|각오|결심|계획|날)/, check: "object" },
  { name: "gentle-exit", re: /(편하게|고통없이|안아프게|조용히)(갈|가는|떠날|떠나는|죽|사라질|사라지는)(수|방법|법|까|래)|치사량/ },
  { name: "pills-amount", re: /(수면제|약|진통제|알약|안정제|타이레놀)[가-힣]{0,6}?(몇알|몇개|몇통|몇봉|얼마나먹|이면될|먹으면죽|먹으면될|먹으면끝|모으고|사모았)/ },
  { name: "strangle", re: /목(을)?(조르|졸라|졸랐|조를|졸려버리)/, beforeUnless: [/(너|니|걔|그놈|그사람|그새끼|쟤)(의)?$/] },
  { name: "forever-sleep", re: /(영원히|영영|다시는)[가-힣]{0,6}?(잠들|잠자|자고싶|눈감|쉬고싶|쉬고프|떠나|사라|안깨|못깨|깨지)|(잠들|잠자|자고|쉬고)[가-힣]{0,8}?(영원히|영영)/ },
  { name: "sleep-end", re: /(잠들|잠든|자다가|자는동안|눈감)[가-힣]{0,6}?(끝났으면|끝나면|끝났음|안깨|못깨|깨지않|죽었으면|사라졌으면)/ },

  // ---- 근접 규칙: 핵심 어간(anchor) 바로 뒤 window 글자 안에 바람·부정 평가(mod)가 오면 위기.
  // 어미·조사·부사가 바뀌거나 사이에 말이 끼어도 잡히게 하려는 넓은 그물이다 (개별 문장을 나열하지 않는다).
  {
    name: "near-death",
    re: /죽(?!겠|이|도록|기살기|는줄|을뻔|을것같|을거같|마고우|순|치|여주|어라|더라|었대|으러|었다|었어|었네|었고|어서|어가|어있|을까봐(무서|걱정|겁|두려|조마|불안))/,
    mod: /싶|프다|고파|래|버리|버릴|버려|까|낫|나아|나을|편해|편할|편하|좋겠|좋을|었으면|었음|마땅|싸|방법|상상|준비|용기|충동|계획|결심|야겠|야지|야해|야하|행복|모르|모를|끝|무섭지않|두렵지않|안무서|안두려|괜찮|건데|텐데|거야|거다|게요|래요|꺼야/,
    window: 6,
    beforeUnless: [HYPERBOLE_BEFORE, SECOND_PERSON_BEFORE, /(호박|전복|팥|야채|흰|본|소고기|닭|쌀|녹두|잣|깨|참)$/],
    unless: [/게임|롤|배그|캐릭|좀비|보스|레이드|피시방|오버워치|발로란트|스킬|꿈에서|꿈을|죽(을|이|도|은)?(먹|사다|사왔|사줘|끓|쑤|쒀|한그릇|집)/],
    check: "subject",
  },
  {
    name: "near-self-absence",
    re: /(나|내가|나만|나하나|나하나쯤|난|제가|저만|저하나)(없으면|없어지면|사라지면|죽으면|없어져도|없어도|죽어도|사라져도|없어져야|사라져야|없는게|없어야)/,
    mod: /편|평화|행복|좋|낫|나을|나아|모르|모를|상관없|아무도|아무렇지|웃|홀가분|조용|잘돌아가|잘살|괜찮|안슬퍼|티도|눈치|맞|해결|도움|위한|위해|숨(좀)?돌|숨(을)?쉬|살텐데|살것|살거|덜힘들|덜고생/,
    window: 15,
  },
  {
    name: "near-vanish",
    re: /(사라지|사라져|사라질|사라졌|없어지|없어져|없어질|없어졌|지워지|지워져|지워졌|증발|소멸|녹아없어)/,
    mod: /싶|프|래|까|었으면|면좋|면편|면나|야|버리|버릴|괜찮|좋겠|나을|낫|맞|편할|행복|도돼|도될/,
    window: 8,
    check: "subject",
  },
  {
    name: "near-life",
    re: /(삶(?!아|은(계란|달걀|감자|고구마|옥수수|면|국수|고기|빨래))|인생(?!영화|맛집|샷|네컷|템|사진|최고|곡|노래|드라마|책|작|캐|빵|커피|술|게임|첫|처음|여행|공부)|목숨(?!걸|을걸|바쳐|을바쳐)|사는게|사는것|사는거|살아있는게|살아있는것|살아가는게|살아가는것|살아있다는게|살아있다는것|살아야하는|살아갈|살아있을|살아있어야할|살아야할|살고싶은|사는이유|사는의미)/,
    mod: /끝|포기|그만|무거|무겁|지옥|고통|괴롭|괴로|지쳐|지치|지친|싫|의미없|의미가없|의미도없|무의미|이유가없|이유없|이유도없|이유가하나도|이유를모르|이유를하나도|버겁|버거|지겹|지겨|끔찍|형벌|벌받|비참|절망|막막|두렵|무섭|허무|미안|후회|저주|놓|마감|힘들|고문|감옥|희망이없|희망도없|가치없|가치가없/,
    window: 8,
    beforeUnless: [RESIDENCE_BEFORE],
    unless: [/시험|성적|ㅋㅋ|게임|주식|코인|맛집|레전드|최고/],
  },
  {
    name: "near-body-harm",
    re: /(손목|팔목|팔뚝|허벅지|손등)/,
    mod: /긋|그었|그어|그을|그은|칼|커터|면도|상처를?(냈|내|낸)|자해|베었|베어|그엇|그음|흉터|자국|피를/,
    window: 8,
  },
  {
    name: "near-self-hit",
    re: /(나|날|나를|내몸|내몸을|내몸에|자신|자신을|스스로|스스로를|제몸)(을|를|에)?/,
    mod: /^(때리|때렸|해치|다치게|벌주|할퀴|긁어서피|상처를?(냈|내))|^(벽|바닥|책상)에?머리를?(박|찧)/,
    window: 12,
  },
  { name: "why-endure", re: /왜(더)?(버텨|버티|견뎌|견디|참아|살아)야/ },
  { name: "own-funeral", re: /(내|나의|제)장례식|장례식[가-힣]{0,6}?(상상|생각|준비|계획)|영정사진(을|을미리)?(골라|준비|찍)/ },
  { name: "blade-and-wrist", re: /(칼|커터|면도날|면도칼|가위)[가-힣]{0,16}?(손목|팔목|허벅지)|(손목|팔목|허벅지)[가-힣]{0,16}?(칼|커터|면도날|면도칼)/, unless: [/요리|썰|깎|자르다가|다쳤|베였|실수/] },
  { name: "two-farewells", re: /(미안해|미안하다|미안했)[가-힣]{0,12}?(고마웠|사랑했|사랑해|그동안|잘있어|용서해)|(고마웠|사랑했)[가-힣]{0,12}?(미안해|미안하다|잘있어|안녕)/ },
  { name: "no-place", re: /(내|나의|제)(자리|있을곳|설자리|쉴곳)(는|가|도|은)?(없|하나도없)|(세상|이세상|어디)에?(도)?(내|나의|제)?(자리|있을곳|설자리)(는|가|도)?없/ },
  { name: "sleeping-pills", re: /수면제|치사량/ },
  { name: "no-attachment", re: /(세상|이세상|삶|인생|이승|살)[가-힣]{0,4}?미련(이|도|은)?(없|하나도)/ },
  { name: "worthless-existence", re: /(내|나의|제|나라는|나란)?존재(자체|자체가)?(가|는|도|는그냥)?[가-힣]{0,4}?(민폐|짐|쓸모없|필요없|의미없|무의미|실수|잘못|죄|싫|지워)/, unless: [/신|외계|유령|귀신|우주/] },
  { name: "blade-cut", re: /(칼|커터|면도날|면도칼)(로|으로|날로)[가-힣]{0,6}?(긋|그었|그어|그을|그엇|베었|베어)/, unless: [/요리|썰|깎|자르다가|양파|사과|과일|고기|종이|박스|택배|실수|다쳤/] },
  { name: "no-wake-wish", re: /(깨|깨어나|일어나|눈뜨)고(싶|프)(지|진)(가|도|는)?(않|안)/, check: "subject" },
  { name: "head-bang", re: /(벽|바닥|책상|문)에?(머리|이마)를?(박|찧|부딪치고싶)/ , unless: [/실수로|모르고|넘어|졸다가|어두워서|부딪혔/] },
  {
    name: "near-pills",
    re: /(수면제|안정제|진통제|타이레놀|약봉지|알약|약물|약(?!속|간|점|하|해|혼|자|사|국|효|품|탈|올|골|체|오|빠|도|이랑같이|사이)(을|를|들|통|이랑)?)/,
    mod: /모아|모으|모았|모아둔|한꺼번에|한번에|왕창|털어|다삼|삼켜|삼키|몇알|몇개|몇통|치사량|먹고죽|먹으면죽|먹으면될|먹으면끝|먹고자버|먹어버/,
    window: 12,
  },
  { name: "near-wake", re: /(눈뜨|눈을뜨|깨어나|눈이떠)(기|는게|는것이|는것도|기가)(싫|두렵|무섭|겁나)/ },
  { name: "near-tomorrow", re: /(내일|아침)(이|은|같은건|따위|이란게|이라는게)?(안왔으면|오지않았으면|안오면좋|안오길|오지않길|안왔음|영영안|안왔으면좋)/ },

  // ---- (c) 자해·자살·수단
  { name: "suicide-desire", re: /(자살|자해)(을|를)?(하고(싶|프)|할까|할래|하려|충동|생각|해버리|해야|시도|계획|각|했|하는중|하자)|극단적(인)?(생각|마음|충동|방법)|극단적(인)?선택을?(하고(싶|프)|할까|하려|해야|할래|생각)/ },
  { name: "suicide-mention", re: /자살|자해/, contiguous: true, unlessMediaWithoutDesire: true },
  { name: "extreme-choice", re: /극단적(인)?선택|투신/, unlessMediaWithoutDesire: true },
  { name: "wrist", re: /손목(을|에|에다|이)?(긋|그었|그어|그을|그은|그엇|칼|커터|면도|자국|흉터|베었|베어|베고|그었)/ },
  { name: "cut-body", re: /(팔|팔목|허벅지|살|몸|손등)(을|에|에다)?(긋|그었|그어|그을|그은|베었|베어)|(칼|커터|면도날|면도칼)(로|으로|을|를)?(팔|손목|몸|허벅지|살)/ },
  { name: "hang", re: /목(을)?(매고|매달|맸|매는|맬|매서|매려|매야|매버|메고싶|메달)|목(을)?매(?=고|달|ㄹ|어|기)/, beforeUnless: [/(에|에게|한테|만)$/], unless: [/넥타이|타이|스카프|목도리|리본|목줄|강아지|댕댕/] },
  { name: "jump", re: /뛰어내(리|릴|렸|려)/, unlessJump: true },
  { name: "dive-in", re: /(한강|강물|차도|선로|철로|기찻길|달리는차|트럭)(에|으로|에다|위로)?(뛰어들|몸을던)/ },
  { name: "pills", re: /(수면유도제|수면약|약|수면제|진통제|타이레놀|안정제|우울증약|약봉지|알약)(을|를|들을|들)?[가-힣]{0,6}?(모아|모으|모았|모아둔|한꺼번에|한번에|왕창|털어넣|털어먹|먹어버리|먹어버릴|삼켜버리|삼키고싶|다삼|과다|한움큼|한통)|과다복용|수면제(를|을)?(먹고(싶|죽)|잔뜩|사모|구하)/ },
  { name: "note", re: /유서/, contiguous: true },
  { name: "rooftop", re: /옥상[가-힣]{0,8}?(올라가|올라갔|올라와|가고(싶|프)|갈까|가볼까|서있|서서|난간|뛰어|떨어|가야)/, unless: [LEISURE] },
  { name: "han-river", re: /한강(에|으로|물|다리|대교)?(가고(싶|프)|갈까|가야겠|뛰어들|들어가고(싶|프)|가버릴까|물온도|수온|에빠|다리에서|다리위|물에|물|에빠지|에들어가)/, unless: [LEISURE] },
  { name: "height", re: /(난간|베란다|창틀|옥상|다리위|다리난간|높은곳|높은데|절벽|건물위|아파트|층에서|꼭대기)[가-힣]{0,8}?(걸쳐|걸터|넘어|넘었|넘을|내려다|아래를|아래로|밑을|밑으로|떨어지|떨어질|떨어져|뛰어|매달|서있|서서한참|발을)/, unless: [/야경|경치|풍경|구경|사진|예쁘|노을|불꽃|일출|일몰|커피|빨래|화분|청소|고양이|강아지|아기|애기|조심|무섭게생긴|공사|낙엽|별/] },
  // QA §12 K4: "마포대교 중간에 서서 한참 강물만 내려다봤어" (height 규칙의 8자 창보다 멀다). 노을·야경 등 나들이는 제외
  { name: "bridge-look", re: /(대교|다리위|다리난간|다리중간|난간|옥상)[가-힣]{0,14}?(내려다|아래만|밑만|강물만|물만)/, unless: [LEISURE, /야경|경치|풍경|구경|사진|예쁘|노을|불꽃|일출|일몰|낙엽|별/] },
  { name: "fall-wish", re: /(떨어지|뛰어내리|뛰어들|떨어져)면[가-힣]{0,4}?(아플|죽|끝|편할|편해|어떨|될까|덜아플)/ },
  { name: "farewell", re: /(미안해|미안하다|고마웠|사랑했|잘있어|안녕히|용서해|그동안|용서하지마)[가-힣]{0,12}?(먼저갈|먼저간|떠날게|떠난다|갈게|간다|보내줘|잊어줘|잊어|마지막)/, unless: [/여행|출장|유학|이사|군대|퇴사|졸업|모임|파티|회식|집에|약속|오늘은/] },
  { name: "charcoal", re: /번개탄|착화탄|연탄(을)?피우/, unless: [/고기|구이|캠핑|바베큐|숯불|삼겹살|굽|캠프|요리/] },
  { name: "hurt-self", re: /(나|날|나를|자신|자신을|스스로|스스로를|내몸|내몸을|내몸에)(해치|헤치|다치게하|때리고(싶|프)|벌주고(싶|프)|망가뜨리고(싶|프)|상처(를)?(내고|냈|내))/ },

  // ---- (d) 행동으로 드러나는 간접 신호 (QA §11: 모델과 정규식이 모두 놓친 범주)
  // 물·바다로 걸어 들어가거나 가라앉고 싶다 ("파도 속으로 걸어 들어가고 싶었어", "물속으로 들어가 버리고 싶어")
  {
    name: "into-water",
    re: /(바다|바닷물|바닷속|파도|강물|강가|강에|강으로|호수|저수지|물속|물에|물로|물으로|깊은물|강속)[가-힣]{0,12}?(걸어들어가|들어가|가라앉|잠기|잠겨|빠지|빠져|몸을맡기|몸을던지|몸을던져|휩쓸려|떠내려가)(버리|버려)?(고(싶|프|파)|ㄹ까|ㄹ래|고말|버릴|면좋|면편|었으면|려고|야겠|싶)/,
    unless: [/수영|서핑|물놀이|해수욕|스노클|다이빙|발만|발을담|튜브|조개|더워|더웠|덥|시원|싶을(만큼|정도)|만큼|레저|카약|패들|구명조끼/],
  },
  // 숨을 그만 쉬고 싶다 / 숨이 멈췄으면 ("숨 좀 돌리고", "숨이 멎는 줄 알았어"는 해당 없음)
  {
    name: "breath-quit",
    re: /숨(을|이|도)?(그만|더는|더이상|이제)[가-힣]{0,2}?(쉬고(싶|프|파)|쉬었으면|쉬면좋|쉬고싶지않|쉬기싫)|숨(쉬|쉬는|쉬는걸|쉬는것|쉬는것을|쉬기)(을|를|도)?(그만두|그만하|멈추|끊)(고(싶|프|파)|었으면|면좋|버리)|숨(이|을)?(멈췄으면|멈추면좋|멈춰버리|멈추고(싶|프)|끊어졌으면|끊겼으면|끊어버리)/,
  },
  // 작별·마지막 편지를 쓴다 (받은 편지·유학·전역 같은 일상 작별은 제외)
  {
    name: "farewell-letter",
    re: /(작별|마지막|이별|고별)(의)?(편지|인사글|글|메시지|영상)|(남길|남기는|남겨둘|남겨놓을|남겨둔)(편지|글|메시지|영상)/,
    unless: [/받았|받은|받고|받아|유학|이사|전학|퇴사|이직|졸업|여행|군대|입대|전역|이민|송별|은퇴|정년|드라마|영화|소설|책|과제|수업|결혼|축하|생일|방송|팬|콘서트|시즌/],
  },
  // 보험금이라도 남기고 / 사망보험금이면 빚은 (청구·입금 같은 일상 보험 처리는 제외)
  {
    name: "insurance-leave",
    re: /보험금[가-힣]{0,8}?(남기|남겨|남길|이라도|이면|으로라도|으로갚|으로빚|타게|나오면|나올테)/,
    unless: [/청구|들어왔|입금|받았|실손|자동차|차사고|접촉|수리|치료|병원비|입원|수술|도난|화재|여행자|휴대폰|폰/],
  },
];

// 일기 전체(문장을 넘어)에서 함께 나와야 하는 신호: '물건을 나눠 줌' + '이제 나한테 필요 없음'
// 예: "아끼던 물건들을 친구들한테 하나씩 나눠 주고 있어. 이제 나한테는 필요 없을 것 같아서"
// 이사·작아진 옷·중고 판매처럼 이유가 분명한 정리는 제외한다
const DIARY_RULES = [
  {
    name: "give-away-belongings",
    all: [
      /(나눠|나누어|넘겨|넘겼|물려|건네|건넸|줘버|줬|주고있|주는중|다줬|다주|맡겼|맡기고)/,
      /(나|난|내|나는|나한테|나한테는|나에게|나에게는|저한테|저는|제|이제|앞으로|더는|더이상)[가-힣]{0,6}?(필요없|필요가없|쓸일이없|쓸일없|쓸데가없|쓸데없을|소용없)/,
    ],
    unless: [/이사|새집|작아|커져|안쓰|안입|안맞|중고|당근|팔았|팔고|기부함|바자회|나눔행사|미니멀|새로샀|새거|유학|졸업|이민|결혼|출산|아기|애기|육아|다이어트|취미를바꿔/],
  },
  // QA §12 B-14 잔여2: 긍정 낱말로 포장된 정리 행동 (실제 nemotron이 고마움·안도감으로 읽고 놓침)
  // ① 그동안 고마웠다·마지막 인사 + 문자·편지를 보냄. 졸업·이사·퇴사·생일처럼 이유가 분명한 인사는 제외
  {
    name: "farewell-thanks",
    all: [
      /(그동안|지금까지|여태|여태껏|이제까지|그간)[가-힣]{0,12}?(고마웠|고마왔|감사했|고맙다|감사하다|미안했|사랑했)|마지막인사|작별인사|마지막으로[가-힣]{0,6}?인사/,
      /(문자|편지|메시지|메세지|카톡|톡|디엠|메일|쪽지|전화|인사|영상|연락)[가-힣]{0,8}?(보냈|보내|남겼|남겨|썼|써서|써놨|써뒀|써두|했|돌렸|넣어)/,
    ],
    unless: [/졸업|이사|전학|전근|퇴사|이직|퇴직|은퇴|정년|출근|근무|마지막수업|마지막날|알바|송별|유학|이민|입대|군대|전역|여행|출장|스승의날|어버이날|생일|기념일|결혼|명절|설날|추석|크리스마스|연말|새해|종강|방학|수료|이별|헤어지|또만나|다음에또|다음주|내일부터|새회사|새학교|새직장|발령|공연|대회|행사|시즌|프로젝트|롤링페이퍼/],
  },
  // ② 반려동물·아이·물건을 맡길 사람을 구해 둠 + 홀가분·다 정리됨. 여행·출장·입원처럼 잠시 맡기는 이유가 있으면 제외
  {
    name: "arranged-care",
    all: [
      /(맡아줄|맡아주실|맡길|맡겨줄|돌봐줄|돌봐주실|키워줄|키워주실|데려갈|데려가줄|입양보낼|입양해줄)(사람|곳|데|분|친구|집|가족)/,
      /홀가분|후련|정리(됐|되|된|했|끝)|걱정(할|될)?(게|것|거|일)?(이)?(하나도)?(없|안남)|걱정거리(가|도)?(하나도)?(없|안남)|신경쓸(게|것|거|일)?(이)?없|마음이(좀|한결|이제)?(놓|가벼|편)|마음놓|할일(은|을|도)?다(끝|했|마쳤)|다끝났|미련(이|도)?없|편해졌|편하다|평온|차분|마음에걸리는(게|것|거)?없/,
    ],
    unless: [/이사|여행|출장|유학|입원|수술|군대|입대|해외|이민|휴가|연수|파견|교환학생|병원|이직|발령|며칠|일주일|(?<!그)동안|잠깐|잠시|명절|귀성|출산|캠핑|펫호텔|다녀올|다녀와|갔다올|돌아오|돌아올/],
  },
  // ③ 통장·계좌·비밀번호를 적어 두거나 넘김 + 홀가분·다 정리됨 (QA §12 K1 유형). 은행 일·가계부·부모님 일을 대신 함은 제외
  {
    name: "accounts-settled",
    all: [
      /(통장|계좌|비밀번호|비번|공인인증|인증서|보험증서|보험증권|적금|예금)[가-힣]{0,16}?(적어|적었|남겨|남겼|정리|넘겨|넘겼|알려|보내|보냈|해지|두었|뒀|놨)/,
      /홀가분|후련|정리(됐|되|된|끝)|다정리|걱정(할|될)?(게|것|거|일)?(이)?(하나도)?(없|안남)|신경쓸(게|것|거|일)?(이)?없|마음이(좀|한결|이제)?(놓|가벼|편)|마음놓|할일(은|을|도)?다(끝|했|마쳤)|미련(이|도)?없|편해졌|편하다|평온|차분|마음에걸리는(게|것|거)?없/,
    ],
    unless: [/연말정산|세금|대출|은행가서|은행에|가계부|앱|용돈|월급|월세|관리비|공과금|부모님|엄마통장|아빠통장|해드렸|해드|드렸|대신|여행|출장|이사|까먹|잊어버|분실|재발급|만기|이자|투자|주식|코인|청약|결제|카드값|할부|비번바꿨|비밀번호바꿨|변경/],
  },
];

// 영어 일기 전체 규칙: 반려동물·계정·치료를 정리 + 안도 (QA §12 K8)
const EN_DIARY_RULES = [
  {
    name: "en-arranged",
    all: [
      /\b(left|gave|found\s+(someone|a\s+(new\s+)?home)\s+(to\s+take|for)|rehom\w*)\b[^.!?]{0,40}\b(dog|cat|pet|pets|kids?|children|bird)\b|\b(deleted|cancel+ed|closed|quit)\s+(all\s+(of\s+)?)?(my\s+)?(accounts|therapy|social\s+media)\b|\b(wrote|sent|texted)\b[^.!?]{0,30}\b(goodbye|thank(ed)?\s+(you\s+)?(them|everyone|for\s+everything))/,
      /\beasier\s+this\s+way\b|\brelieved\b|\bat\s+peace\b|\bfeel(s|ing)?\s+(so\s+)?(light|lighter|calm|free)\b|\bnothing\s+(left\s+)?to\s+worry\b|\ball\s+(settled|sorted|taken\s+care\s+of)\b|\bit'?s\s+(all\s+)?done\b|\bready\s+now\b/,
    ],
    unless: [/\b(trip|vacation|holiday|travel\w*|business|moving|move|hospital|surgery|weekend|week|while\s+i|until)\b/],
  },
];

// 영어 규칙 (원문 공백 유지, 소문자)
const EN_RULES = [
  /\b(want(s|ed)?|wanna|going|gonna|ready|need|deserve|plan(ning)?|try(ing)?|wish(ing)?|about)\s+(to\s+)?(die|disappear|kill\s+my\s*self|end\s+(it|my\s+life|everything))\b(?!\s+(of|laughing|from\s+laughing|for)\b)/,
  /\bkill(ing|ed)?\s+my\s*self\b|\bkms\b|\bunalive\b/,
  /\b(end(ing)?|take|taking|took)\s+(my\s+(own\s+)?life|it\s+all)\b/,
  /\bsuicid|\bself[-\s]?harm/,
  /\b(cut|cutting|hurt|hurting|harm|harming|hang|hanging|cut)\s+my\s*self\b/,
  /\b(want|wanted|wanna|need|just\s+want)\s+(it\s+(all\s+)?|everything\s+|this\s+|the\s+pain\s+|my\s+life\s+)to\s+(end|stop|be\s+over)\b/,
  /\b(no|nothing\s+to\s+live\s+for|no\s+more)\s*(reason|point)?\s*(to|in|of)?\s*(live|living|go(ing)?\s+on|keep(ing)?\s+going|be(ing)?\s+alive)\b/,
  /\bbetter\s+off\s+(dead|without\s+me)\b|\b(better|fine|happier|easier|okay|ok)\s+(off\s+)?without\s+me\b/,
  /\b(no\s*one|nobody|no-one)\s+(would|will|'d|wd)\s+(even\s+)?(miss|notice|care)\b/,
  /\b(don'?t|do\s+not|dont|didn'?t|never)\s+(want\s+to|wanna)\s+(live|be\s+alive|exist|wake\s+up|be\s+here|go\s+on)\b/,
  /\bwish\s+(i|i'?d)\s+(were|was|had\s+been|could\s+be)\s+dead\b|\bwish\s+i\s+(could\s+)?(die|disappear|not\s+exist|stop\s+existing)\b|\bwish\s+i\s+(had\s+)?never\s+(been\s+born|existed|woke\s+up)\b/,
  /\b(can'?t|cannot)\s+(go\s+on|keep\s+going|do\s+this|take\s+(it|this))\s*(any\s*more|any\s+longer|like\s+this|living)\b|\b(can'?t|cannot)\s+go\s+on\s*$/,
  /\b(rather|prefer\s+to)\s+(be\s+dead|die)\b(?!\s+than)|\bnot\s+(want|wanting)\s+to\s+(live|exist)\b/,
  /\boverdose\b|\bjump(ing)?\s+(off|from)\s+(a|the|that)\s+(bridge|building|roof|cliff|balcony)\b|\bsuicide\s+note\b|\bgoodbye\s+note\b/,
  /\bfeel(s|ing)?\s+like\s+(dying|dead|disappearing|ending\s+it)\b|\b(what'?s|whats|what\s+is)\s+the\s+point\s+(of|in)\s+(living|life|going\s+on|anything|being\s+alive)\b/,
  /\bgoodbye\s+(letter|message)s?\b|\b(took|take|taking|swallow(ed)?|stockpil\w*|saving|saved|hoard\w*)\s+(a\s+(bunch|lot|handful)\s+of\s+|all\s+(of\s+)?(my\s+)?(the\s+)?|too\s+many\s+|my\s+)?(sleeping\s+)?pills\b/,
  /\b(tired|done)\s+(of|with)\s+(living|life|being\s+alive|existing)\b|\bgive\s+up\s+on\s+(life|living)\b|\b(life|everything)\s+is\s+hopeless\b|\bsleep\s+forever\b|\bnever\s+wake\s+up\b/,
  /\b(can'?t|cannot)\s+(take|handle|bear|stand)\s+(it|this|the\s+pain|this\s+pain|life|living|anything|myself)\s*(any\s*more|any\s+longer)\b/,
  /\bstop\s+(existing|living|being\s+alive)\b|\bcease\s+to\s+exist\b|\b(if|when)\s+i('?m|\s+am|\s+was|\s+were)\s+(gone|dead|not\s+(here|around))\b/,
  /\bi'?m\s+(a|such\s+a|just\s+a|only\s+a)\s+burden\b|\bburden\s+(to|on)\s+(everyone|everybody|my\s+family|them|others)\b/,
  /\bend(ing)?\s+(things|everything)\b(?!\s+with)/,
  /\bpoint\s+(in|of|to)\s+(living|life|going\s+on|being\s+alive|staying\s+alive)\b|\b(isn'?t|is\s+not|not|never)\s+worth\s+(living|it\s+anymore)\b/,
  /\bwish\s+i\s+(could\s+)?(just\s+|simply\s+|really\s+)?(die|disappear|vanish|not\s+exist|stop\s+existing|sleep\s+forever)\b|\bwant\s+to\s+(just\s+|simply\s+)(die|disappear|vanish)\b/,
  /\b(can'?t|cannot)\s+keep\s+(living|going|doing\s+this)\b|\b(should|could|need\s+to|have\s+to|might\s+as\s+well)\s+(just\s+)?(die|disappear|kill\s+my\s*self|end\s+it)\b(?!\s+(of|happy|laughing|for|from|in)\b)/,
  /\bgoodbye\s+(everyone|everybody|world|all|forever)\b|^i'?m\s+(so\s+|just\s+)?done$/,
  /\bhate\s+(my\s+life|being\s+alive|living)\b|\b(life|living)\s+is\s+(pointless|meaningless|not\s+worth)\b|\bnot\s+worth\s+living\b/,
];

const JUMP_BENIGN = /버스|계단|침대|소파|의자|트램펄린|담장|그네|번지|낙하산|스카이|놀이기구|미끄럼|무대|보트|수영장|다이빙|차에서|지하철에서|턱|비행기/;
const JUMP_DANGER = /옥상|다리|창문|베란다|아파트|건물|층|한강|난간|절벽|철로|선로|고싶|고프|릴까|려고|버리|버릴/;

function ruleHits(rule, spaced, compact, map) {
  const re = new RegExp(rule.re.source, "g");
  let m;
  while ((m = re.exec(compact))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = map[m.index];
    const end = map[m.index + m[0].length - 1];
    if (rule.contiguous && /\s/.test(spaced.slice(start, end + 1))) continue;
    if (rule.mod && !rule.mod.test(compact.slice(m.index + m[0].length, m.index + m[0].length + rule.window))) continue;
    const beforeCompact = compact.slice(0, m.index);
    if (rule.beforeUnless?.some((u) => u.test(beforeCompact))) continue;
    if (rule.check === "object" && objectIsTask(spaced, start, { compoundGuard: rule.compoundGuard })) continue;
    if (rule.check === "subject" && subjectIsOther(spaced, start, { timeIsSelf: rule.timeIsSelf })) continue;
    return true;
  }
  return false;
}

function sentenceIsCrisis(spaced) {
  const { compact, map } = compactOf(spaced);
  if (EN_RULES.some((re) => re.test(spaced))) return true;
  return RULES.some((rule) => {
    if (rule.unless?.some((u) => u.test(compact))) return false;
    if (rule.unlessMediaWithoutDesire && MEDIA.test(compact) && !DESIRE.test(compact)) return false;
    if (rule.unlessJump && JUMP_BENIGN.test(compact) && !JUMP_DANGER.test(compact)) return false;
    return ruleHits(rule, spaced, compact, map);
  });
}

// "살기 싫다는 농담", "죽고 싶단 장난" 처럼 농담임을 밝힌 문장 (진심을 덧붙이면 농담으로 보지 않는다)
const JOKE_SENTENCE = /(다는|라는|단|란)\s*(농담|장난|드립|말장난)/;
const SINCERE = /진심|사실|실은|진짜로|농담\s*아니|장난\s*아니|농담\s*아님|반은\s*진심/;

export function detectCrisis(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  let cleaned = normalize(text);
  for (const span of BENIGN_SPANS) cleaned = cleaned.replace(span, " ");
  const sentences = splitSentences(cleaned);
  const jokes = [];
  for (const sentence of sentences) {
    if (!sentenceIsCrisis(sentence)) continue;
    if (JOKE_SENTENCE.test(sentence) && !SINCERE.test(sentence)) {
      jokes.push(sentence);
      continue;
    }
    return true;
  }
  // 일기 전체 규칙 (문장을 넘어 함께 나오는 신호)
  const compactAll = cleaned.replace(/\s+/g, "");
  if (DIARY_RULES.some((rule) => rule.all.every((re) => re.test(compactAll)) && !rule.unless.some((u) => u.test(compactAll)))) return true;
  if (EN_DIARY_RULES.some((rule) => rule.all.every((re) => re.test(cleaned)) && !rule.unless.some((u) => u.test(cleaned)))) return true;
  // 농담이라고 밝힌 문장만 걸렸으면: 일기 전체에 진심을 뜻하는 말이 있을 때만 위기
  return jokes.length > 0 && SINCERE.test(cleaned);
}
