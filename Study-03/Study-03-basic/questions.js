const quizQuestions = [
    // 한국사 (13문제)
    {
        id: 1,
        category: "한국사",
        difficulty: "easy",
        question: "조선을 건국한 왕은 누구인가요?",
        options: ["이성계", "왕건", "이방원", "세종"],
        correctAnswer: 0,
        explanation: "이성계(태조)는 1392년 조선을 건국했습니다."
    },
    {
        id: 2,
        category: "한국사",
        difficulty: "medium",
        question: "한글을 창제한 왕은 누구인가요?",
        options: ["태조", "태종", "세종", "성종"],
        correctAnswer: 2,
        explanation: "세종대왕은 1443년(세종 25년) 한글을 창제하고 1446년에 반포했습니다."
    },
    {
        id: 3,
        category: "한국사",
        difficulty: "medium",
        question: "임진왜란이 일어난 연도는?",
        options: ["1392년", "1592년", "1636년", "1910년"],
        correctAnswer: 1,
        explanation: "임진왜란은 1592년(선조 25년)에 일본의 침략으로 시작되었습니다."
    },
    {
        id: 4,
        category: "한국사",
        difficulty: "hard",
        question: "고려의 수도는 어디였나요?",
        options: ["한양", "평양", "개경", "경주"],
        correctAnswer: 2,
        explanation: "고려의 수도는 개경(현재의 개성)이었습니다. 몽골 침입기(1232~1270년)에는 일시적으로 강화도로 천도하기도 했습니다."
    },
    {
        id: 5,
        category: "한국사",
        difficulty: "medium",
        question: "3·1 운동이 일어난 연도는?",
        options: ["1910년", "1919년", "1945년", "1950년"],
        correctAnswer: 1,
        explanation: "3·1 운동은 1919년 3월 1일에 일어난 독립운동입니다."
    },
    {
        id: 6,
        category: "한국사",
        difficulty: "easy",
        question: "신라의 삼국통일을 완성한 왕은?",
        options: ["문무왕", "무열왕", "진흥왕", "법흥왕"],
        correctAnswer: 0,
        explanation: "문무왕은 676년 당나라 세력을 몰아내고 삼국통일을 완성했습니다."
    },
    {
        id: 7,
        category: "한국사",
        difficulty: "hard",
        question: "고구려를 건국한 인물은?",
        options: ["온조", "주몽", "박혁거세", "김수로"],
        correctAnswer: 1,
        explanation: "주몽(동명성왕)은 『삼국사기』 기록에 따르면 기원전 37년 고구려를 건국했습니다."
    },
    {
        id: 8,
        category: "한국사",
        difficulty: "medium",
        question: "조선시대 4대 사화 중 첫 번째는?",
        options: ["무오사화", "갑자사화", "기묘사화", "을사사화"],
        correctAnswer: 0,
        explanation: "무오사화(1498년)는 연산군 때 일어난 첫 번째 사화입니다."
    },
    {
        id: 9,
        category: "한국사",
        difficulty: "easy",
        question: "대한민국 정부 수립일은?",
        options: ["1945년 8월 15일", "1948년 8월 15일", "1950년 6월 25일", "1953년 7월 27일"],
        correctAnswer: 1,
        explanation: "대한민국 정부는 1948년 8월 15일에 수립되었습니다."
    },
    {
        id: 10,
        category: "한국사",
        difficulty: "medium",
        question: "조선시대 국가가 세운 최고(最高) 학부, 즉 국립 최고 교육기관은?",
        options: ["향교", "서원", "성균관", "서당"],
        correctAnswer: 2,
        explanation: "성균관은 조선시대 최고의 국립 교육기관이었습니다."
    },
    {
        id: 41,
        category: "한국사",
        difficulty: "medium",
        question: "1170년 무신정변 직후, 무신정권 초기의 최고 권력기구는?",
        options: ["중방", "정방", "도방", "삼별초"],
        correctAnswer: 0,
        explanation: "중방은 1170년 무신정변 직후 무신들이 국정을 논의하던 최고 권력기구였습니다. 이후 최씨 정권기에는 교정도감이 최고 권력기구 역할을 했습니다."
    },
    {
        id: 42,
        category: "한국사",
        difficulty: "hard",
        question: "조선 후기 실학자 중 '북학의'를 저술한 인물은?",
        options: ["박지원", "박제가", "정약용", "이익"],
        correctAnswer: 1,
        explanation: "박제가는 18세기 후반 실학자로 '북학의(北學議)'를 저술하여 청나라의 선진 문물을 배울 것을 주장했습니다."
    },
    {
        id: 43,
        category: "한국사",
        difficulty: "hard",
        question: "대한민국 임시정부가 처음 수립된 장소는?",
        options: ["베이징", "난징", "충칭", "상하이"],
        correctAnswer: 3,
        explanation: "대한민국 임시정부는 1919년 4월 11일 중국 상하이에서 수립되었습니다. 이후 일제의 탄압을 피해 항저우, 충칭 등으로 이동했습니다."
    },
    {
        id: 44,
        category: "한국사",
        difficulty: "hard",
        question: "조선 후기 세도정치 시대의 '삼정의 문란'에 포함되지 않는 것은?",
        options: ["전정", "군정", "환곡", "공납"],
        correctAnswer: 3,
        explanation: "삼정의 문란은 전정(토지세), 군정(군역), 환곡(환곡제)의 폐단을 지칭합니다. 공납은 대동법으로 이미 개혁되었습니다."
    },

    // 세계지리 (10문제)
    {
        id: 11,
        category: "세계지리",
        difficulty: "easy",
        question: "면적 기준으로 세계에서 가장 큰 대륙은?",
        options: ["아프리카", "아시아", "북아메리카", "남극"],
        correctAnswer: 1,
        explanation: "아시아는 약 44,579,000km²로 세계에서 가장 큰 대륙입니다."
    },
    {
        id: 12,
        category: "세계지리",
        difficulty: "medium",
        question: "일반적으로 세계에서 가장 긴 강으로 인정되는 강은? (길이 기준)",
        options: ["콩고강", "나일강", "양쯔강", "미시시피강"],
        correctAnswer: 1,
        explanation: "나일강은 약 6,650km로 일반적으로 세계에서 가장 긴 강으로 인정됩니다. 다만 발원지 측정 방식에 따라 아마존강이 더 길다는 주장도 있습니다."
    },
    {
        id: 13,
        category: "세계지리",
        difficulty: "easy",
        question: "일본의 수도는?",
        options: ["오사카", "교토", "도쿄", "요코하마"],
        correctAnswer: 2,
        explanation: "도쿄는 일본의 수도이자 최대 도시입니다."
    },
    {
        id: 14,
        category: "세계지리",
        difficulty: "hard",
        question: "최대 수심 기준으로 세계에서 가장 깊은 해구는?",
        options: ["마리아나 해구", "통가 해구", "필리핀 해구", "푸에르토리코 해구"],
        correctAnswer: 0,
        explanation: "마리아나 해구의 챌린저 해연은 약 10,900m 이상(측정에 따라 약 10,920~10,990m)으로 세계에서 가장 깊습니다."
    },
    {
        id: 15,
        category: "세계지리",
        difficulty: "medium",
        question: "극지 사막을 포함할 때, 면적 기준으로 세계에서 가장 큰 사막은?",
        options: ["사하라 사막", "고비 사막", "남극 사막", "아라비아 사막"],
        correctAnswer: 2,
        explanation: "남극 대륙은 약 1,400만km²의 극지 사막으로 세계 최대입니다. 극지 사막을 제외한 아열대 사막 중에서는 사하라 사막이 가장 큽니다."
    },
    {
        id: 16,
        category: "세계지리",
        difficulty: "easy",
        question: "프랑스의 수도는?",
        options: ["런던", "베를린", "파리", "로마"],
        correctAnswer: 2,
        explanation: "파리는 프랑스의 수도이자 최대 도시입니다."
    },
    {
        id: 17,
        category: "세계지리",
        difficulty: "medium",
        question: "해발고도 기준으로 세계에서 가장 높은 산은?",
        options: ["K2", "에베레스트", "칸첸중가", "마칼루"],
        correctAnswer: 1,
        explanation: "에베레스트산은 해발 8,848.86m(2020년 중국·네팔 공동 측량 기준)로 세계 최고봉입니다."
    },
    {
        id: 18,
        category: "세계지리",
        difficulty: "hard",
        question: "면적 기준으로 세계에서 가장 큰 호수는? (염호 포함)",
        options: ["바이칼호", "슈피리어호", "카스피해", "빅토리아호"],
        correctAnswer: 2,
        explanation: "카스피해는 이름에 '해'가 붙지만 지리학적으로는 바다와 연결되지 않은 호수(염호)로, 약 371,000km²로 세계 최대입니다. 담수호 중에서는 슈피리어호가 가장 큽니다."
    },
    {
        id: 19,
        category: "세계지리",
        difficulty: "easy",
        question: "이탈리아의 수도는?",
        options: ["밀라노", "베네치아", "로마", "나폴리"],
        correctAnswer: 2,
        explanation: "로마는 이탈리아의 수도입니다."
    },
    {
        id: 20,
        category: "세계지리",
        difficulty: "medium",
        question: "면적 기준으로 세계에서 가장 작은 나라는?",
        options: ["모나코", "바티칸", "산마리노", "리히텐슈타인"],
        correctAnswer: 1,
        explanation: "바티칸 시국은 약 0.44km²로 면적 기준 세계에서 가장 작은 나라입니다."
    },

    // 과학 (10문제)
    {
        id: 21,
        category: "과학",
        difficulty: "easy",
        question: "물의 화학식은?",
        options: ["H2O", "CO2", "O2", "H2O2"],
        correctAnswer: 0,
        explanation: "물은 수소 원자 2개와 산소 원자 1개로 이루어진 H2O입니다."
    },
    {
        id: 22,
        category: "과학",
        difficulty: "medium",
        question: "지름 기준으로 태양계에서 가장 큰 행성은?",
        options: ["토성", "목성", "천왕성", "해왕성"],
        correctAnswer: 1,
        explanation: "목성은 적도 지름이 약 142,984km로 태양계 최대 행성이며, 질량도 가장 큽니다."
    },
    {
        id: 23,
        category: "과학",
        difficulty: "easy",
        question: "진공에서 빛의 속도는 초속 약 몇 km인가요?",
        options: ["30만 km", "100만 km", "3만 km", "1000 km"],
        correctAnswer: 0,
        explanation: "빛의 속도는 진공에서 초속 약 299,792km입니다."
    },
    {
        id: 24,
        category: "과학",
        difficulty: "hard",
        question: "1953년 DNA 이중나선 구조 모형을 발표한 과학자는?",
        options: ["다윈", "아인슈타인", "왓슨과 크릭", "멘델"],
        correctAnswer: 2,
        explanation: "제임스 왓슨과 프랜시스 크릭은 1953년 DNA 이중나선 구조 모형을 발표했습니다. 이 과정에서 로절린드 프랭클린의 X선 회절 사진이 중요한 근거가 되었습니다."
    },
    {
        id: 25,
        category: "과학",
        difficulty: "medium",
        question: "원자번호 1번 원소는?",
        options: ["헬륨", "수소", "리튬", "탄소"],
        correctAnswer: 1,
        explanation: "수소(H)는 원자번호 1번으로 가장 가벼운 원소입니다."
    },
    {
        id: 26,
        category: "과학",
        difficulty: "easy",
        question: "건조 공기의 부피 기준으로, 지구 대기 중 가장 많은 기체는?",
        options: ["산소", "이산화탄소", "질소", "수소"],
        correctAnswer: 2,
        explanation: "질소는 대기의 약 78%를 차지합니다."
    },
    {
        id: 27,
        category: "과학",
        difficulty: "medium",
        question: "절대온도 0도는 섭씨 몇 도인가요?",
        options: ["-100°C", "-273.15°C", "-373°C", "0°C"],
        correctAnswer: 1,
        explanation: "절대영도는 -273.15°C로 이론상 최저 온도이며, 실제로는 도달할 수 없습니다."
    },
    {
        id: 28,
        category: "과학",
        difficulty: "hard",
        question: "광합성에서 생성되는 주요 산물은?",
        options: ["이산화탄소와 물", "포도당과 산소", "질소와 수소", "메탄과 산소"],
        correctAnswer: 1,
        explanation: "광합성은 이산화탄소와 물을 이용해 포도당과 산소를 생성합니다."
    },
    {
        id: 29,
        category: "과학",
        difficulty: "easy",
        question: "무게 기준으로 인체에서 가장 큰 기관(器官)은?",
        options: ["심장", "간", "폐", "피부"],
        correctAnswer: 3,
        explanation: "피부는 인체에서 가장 큰 기관으로 체중의 약 16%를 차지합니다. 몸속 내장 기관 중에서는 간이 가장 큽니다."
    },
    {
        id: 30,
        category: "과학",
        difficulty: "medium",
        question: "상대성 이론을 발표한 과학자는?",
        options: ["뉴턴", "갈릴레이", "아인슈타인", "호킹"],
        correctAnswer: 2,
        explanation: "알베르트 아인슈타인은 1905년 특수상대성이론, 1915년 일반상대성이론을 발표했습니다."
    },

    // 예술과 문화 (10문제)
    {
        id: 31,
        category: "예술과 문화",
        difficulty: "easy",
        question: "'모나리자'를 그린 화가는?",
        options: ["피카소", "고흐", "다빈치", "미켈란젤로"],
        correctAnswer: 2,
        explanation: "레오나르도 다빈치는 1503-1519년경 모나리자를 그렸습니다."
    },
    {
        id: 32,
        category: "예술과 문화",
        difficulty: "medium",
        question: "베토벤이 완성한 교향곡은 총 몇 개인가요?",
        options: ["5개", "7개", "9개", "12개"],
        correctAnswer: 2,
        explanation: "루트비히 판 베토벤은 총 9개의 교향곡을 완성했습니다. 10번 교향곡은 스케치만 남아 있습니다."
    },
    {
        id: 33,
        category: "예술과 문화",
        difficulty: "easy",
        question: "'해바라기' 연작으로 유명한 화가는?",
        options: ["모네", "고흐", "르누아르", "세잔"],
        correctAnswer: 1,
        explanation: "빈센트 반 고흐는 1887년 파리 시기와 1888~1889년 아를 시기에 해바라기 연작을 그렸습니다."
    },
    {
        id: 34,
        category: "예술과 문화",
        difficulty: "hard",
        question: "'게르니카'를 그린 화가는?",
        options: ["달리", "피카소", "미로", "고야"],
        correctAnswer: 1,
        explanation: "파블로 피카소는 1937년 스페인 내전을 주제로 게르니카를 그렸습니다."
    },
    {
        id: 35,
        category: "예술과 문화",
        difficulty: "medium",
        question: "'로미오와 줄리엣'의 작가는?",
        options: ["괴테", "셰익스피어", "단테", "호메로스"],
        correctAnswer: 1,
        explanation: "윌리엄 셰익스피어는 1595년경 로미오와 줄리엣을 집필했습니다."
    },
    {
        id: 36,
        category: "예술과 문화",
        difficulty: "easy",
        question: "피아노의 건반 수는 일반적으로 몇 개인가요?",
        options: ["52개", "66개", "88개", "100개"],
        correctAnswer: 2,
        explanation: "현대 피아노는 일반적으로 88개의 건반(52개 백건, 36개 흑건)을 가지고 있습니다."
    },
    {
        id: 37,
        category: "예술과 문화",
        difficulty: "medium",
        question: "'생각하는 사람' 조각의 작가는?",
        options: ["로댕", "미켈란젤로", "베르니니", "도나텔로"],
        correctAnswer: 0,
        explanation: "오귀스트 로댕은 1880년경 '지옥의 문'의 일부로 '생각하는 사람'을 구상했고, 1904년 대형 청동상으로 주조했습니다."
    },
    {
        id: 38,
        category: "예술과 문화",
        difficulty: "hard",
        question: "인상주의 화파의 이름은 어느 작품에서 유래했나요?",
        options: ["수련", "인상, 해돋이", "물랭 루즈", "별이 빛나는 밤"],
        correctAnswer: 1,
        explanation: "클로드 모네의 '인상, 해돋이(1872)'가 1874년 전시회에 출품된 뒤, 이 제목에서 인상주의라는 이름이 유래했습니다."
    },
    {
        id: 39,
        category: "예술과 문화",
        difficulty: "easy",
        question: "한국의 전통 음악을 총칭하는 말은?",
        options: ["가요", "국악", "민요", "판소리"],
        correctAnswer: 1,
        explanation: "국악은 한국의 전통 음악을 총칭하는 말입니다."
    },
    {
        id: 40,
        category: "예술과 문화",
        difficulty: "medium",
        question: "'돈키호테'의 작가는?",
        options: ["세르반테스", "톨스토이", "도스토예프스키", "발자크"],
        correctAnswer: 0,
        explanation: "미겔 데 세르반테스는 1605년과 1615년 돈키호테를 출간했습니다."
    }
,
    {
        id: 45,
        category: "한국사",
        difficulty: "hard",
        question: "조선시대 4대 사화 중 가장 마지막에 일어난 것은?",
        options: ["무오사화","갑자사화","기묘사화","을사사화"],
        correctAnswer: 3,
        explanation: "을사사화(1545년)는 명종 때 일어난 마지막 사화입니다."
    },
    {
        id: 46,
        category: "세계지리",
        difficulty: "medium",
        question: "2011년 남수단 독립 이후, 면적 기준으로 아프리카에서 가장 큰 국가는?",
        options: ["나이지리아","남아프리카공화국","알제리","이집트"],
        correctAnswer: 2,
        explanation: "알제리는 약 238만km²로 아프리카에서 가장 큰 국가입니다. 2011년 남수단이 분리되기 전에는 수단이 가장 컸습니다."
    },
    {
        id: 47,
        category: "과학",
        difficulty: "easy",
        question: "광합성의 원료로 사용되는 기체는?",
        options: ["산소","이산화탄소","질소","수소"],
        correctAnswer: 1,
        explanation: "식물은 이산화탄소와 물, 빛을 이용해 광합성을 합니다."
    },
    {
        id: 48,
        category: "예술과 문화",
        difficulty: "medium",
        question: "레오나르도 다빈치의 '최후의 만찬' 원작 벽화가 있는 도시는?",
        options: ["로마","피렌체","밀라노","베네치아"],
        correctAnswer: 2,
        explanation: "최후의 만찬은 밀라노의 산타 마리아 델레 그라치에 수도원에 있습니다."
    },

    // 3단계 문제 풀 확장 (ID 49~80, 카테고리별 20문제)
    // 한국사
    {
        id: 49,
        category: "한국사",
        difficulty: "easy",
        question: "임진왜란 때 한산도 대첩을 승리로 이끈 장수는?",
        options: ["권율", "김시민", "이순신", "곽재우"],
        correctAnswer: 2,
        explanation: "이순신은 1592년 한산도 앞바다에서 학익진 전법으로 일본 수군을 크게 물리쳤습니다."
    },
    {
        id: 50,
        category: "한국사",
        difficulty: "easy",
        question: "고려를 건국한 인물은?",
        options: ["왕건", "궁예", "견훤", "이성계"],
        correctAnswer: 0,
        explanation: "왕건(태조)은 918년 고려를 건국하고 936년 후삼국을 통일했습니다."
    },
    {
        id: 51,
        category: "한국사",
        difficulty: "easy",
        question: "고려 시대 몽골의 침입을 불교의 힘으로 물리치려고 새긴 것으로, 현재 합천 해인사에 보관된 것은?",
        options: ["직지심체요절", "훈민정음 해례본", "팔만대장경", "조선왕조실록"],
        correctAnswer: 2,
        explanation: "팔만대장경(재조대장경)은 1236~1251년에 새겨졌으며, 현재 합천 해인사 장경판전에 보관되어 있습니다."
    },
    {
        id: 52,
        category: "한국사",
        difficulty: "medium",
        question: "612년 고구려의 을지문덕이 수나라 군대를 크게 물리친 전투는?",
        options: ["안시성 전투", "귀주대첩", "행주대첩", "살수대첩"],
        correctAnswer: 3,
        explanation: "살수대첩(612년)은 을지문덕이 수 양제의 대군을 살수(청천강으로 추정)에서 크게 물리친 전투입니다."
    },
    {
        id: 53,
        category: "한국사",
        difficulty: "hard",
        question: "1876년 조선이 일본과 체결한 조약은?",
        options: ["제물포 조약", "한성 조약", "톈진 조약", "강화도 조약"],
        correctAnswer: 3,
        explanation: "강화도 조약(조일수호조규)은 1876년에 체결되었습니다. 제물포 조약은 1882년, 한성 조약은 1884년, 톈진 조약은 1885년(청·일)에 맺어졌습니다."
    },

    // 세계지리
    {
        id: 54,
        category: "세계지리",
        difficulty: "easy",
        question: "영국의 수도는?",
        options: ["런던", "맨체스터", "에든버러", "리버풀"],
        correctAnswer: 0,
        explanation: "런던은 영국의 수도입니다. 에든버러는 영국을 구성하는 스코틀랜드의 수도입니다."
    },
    {
        id: 55,
        category: "세계지리",
        difficulty: "easy",
        question: "이집트의 피라미드와 나일강이 있는 대륙은?",
        options: ["아시아", "유럽", "남아메리카", "아프리카"],
        correctAnswer: 3,
        explanation: "이집트는 아프리카 대륙 북동부에 있으며, 나일강은 아프리카를 남에서 북으로 흐릅니다."
    },
    {
        id: 56,
        category: "세계지리",
        difficulty: "medium",
        question: "오스트레일리아(호주)의 수도는?",
        options: ["캔버라", "시드니", "멜버른", "퍼스"],
        correctAnswer: 0,
        explanation: "캔버라는 1913년 수도로 계획되어 1927년부터 연방 의회가 자리한 호주의 수도입니다. 최대 도시는 시드니입니다."
    },
    {
        id: 57,
        category: "세계지리",
        difficulty: "medium",
        question: "캐나다의 수도는?",
        options: ["토론토", "밴쿠버", "몬트리올", "오타와"],
        correctAnswer: 3,
        explanation: "오타와는 캐나다의 수도입니다. 최대 도시는 토론토입니다."
    },
    {
        id: 58,
        category: "세계지리",
        difficulty: "medium",
        question: "유엔(UN) 추계 기준, 2023년 인구가 가장 많은 나라가 된 국가는?",
        options: ["중국", "인도", "미국", "인도네시아"],
        correctAnswer: 1,
        explanation: "유엔 추계에 따르면 인도는 2023년 약 14억 2,860만 명으로 중국(약 14억 2,570만 명)을 넘어 인구 1위가 되었습니다."
    },
    {
        id: 59,
        category: "세계지리",
        difficulty: "hard",
        question: "면적 기준으로 세계에서 가장 큰 섬은? (대륙인 오스트레일리아 제외)",
        options: ["그린란드", "뉴기니섬", "보르네오섬", "마다가스카르섬"],
        correctAnswer: 0,
        explanation: "그린란드는 약 216만km²로 세계에서 가장 큰 섬입니다. 2위는 뉴기니섬(약 78만km²)입니다."
    },
    {
        id: 60,
        category: "세계지리",
        difficulty: "hard",
        question: "국토 면적 기준으로 남아메리카에서 두 번째로 큰 나라는?",
        options: ["페루", "콜롬비아", "볼리비아", "아르헨티나"],
        correctAnswer: 3,
        explanation: "아르헨티나는 약 278만km²로 브라질(약 851만km²) 다음으로 남아메리카에서 큰 나라입니다."
    },
    {
        id: 61,
        category: "세계지리",
        difficulty: "hard",
        question: "해발고도 기준 아프리카 최고봉인 킬리만자로산이 있는 나라는?",
        options: ["탄자니아", "케냐", "우간다", "에티오피아"],
        correctAnswer: 0,
        explanation: "킬리만자로산(약 5,895m)은 케냐 국경 가까이에 있지만 탄자니아 북동부에 위치합니다."
    },
    {
        id: 62,
        category: "세계지리",
        difficulty: "hard",
        question: "총면적 기준으로 세계에서 두 번째로 큰 나라는?",
        options: ["미국", "중국", "브라질", "캐나다"],
        correctAnswer: 3,
        explanation: "캐나다는 약 998만km²로 러시아 다음으로 큰 나라입니다. 미국과 중국은 측정 방식에 따라 3·4위가 바뀝니다."
    },

    // 과학
    {
        id: 63,
        category: "과학",
        difficulty: "easy",
        question: "식물의 잎이 초록색으로 보이게 하는 색소는?",
        options: ["엽록소", "카로틴", "멜라닌", "헤모글로빈"],
        correctAnswer: 0,
        explanation: "엽록소(클로로필)는 붉은빛과 푸른빛을 주로 흡수하고 초록빛을 반사해 잎이 초록색으로 보입니다."
    },
    {
        id: 64,
        category: "과학",
        difficulty: "easy",
        question: "평균 공전 거리 기준으로 태양에 가장 가까운 행성은?",
        options: ["금성", "지구", "화성", "수성"],
        correctAnswer: 3,
        explanation: "수성은 태양으로부터 평균 약 5,790만km 떨어져 있어 태양에 가장 가까운 행성입니다."
    },
    {
        id: 65,
        category: "과학",
        difficulty: "medium",
        question: "원소 기호 'Fe'가 나타내는 원소는?",
        options: ["플루오린", "납", "철", "금"],
        correctAnswer: 2,
        explanation: "Fe는 라틴어 ferrum에서 온 철의 원소 기호입니다. 플루오린은 F, 납은 Pb, 금은 Au입니다."
    },
    {
        id: 66,
        category: "과학",
        difficulty: "medium",
        question: "사람의 혈액에서 산소를 운반하는 혈구는?",
        options: ["백혈구", "혈소판", "림프구", "적혈구"],
        correctAnswer: 3,
        explanation: "적혈구 속 헤모글로빈이 폐에서 산소와 결합해 온몸으로 운반합니다."
    },
    {
        id: 67,
        category: "과학",
        difficulty: "medium",
        question: "뉴턴의 운동 제2법칙(가속도 법칙)을 나타내는 식은?",
        options: ["F = ma", "E = mc²", "PV = nRT", "V = IR"],
        correctAnswer: 0,
        explanation: "운동 제2법칙은 힘(F)이 질량(m)과 가속도(a)의 곱과 같다는 법칙입니다. E = mc²는 질량-에너지 등가식, V = IR은 옴의 법칙입니다."
    },
    {
        id: 68,
        category: "과학",
        difficulty: "hard",
        question: "1928년 푸른곰팡이에서 페니실린을 발견한 과학자는?",
        options: ["파스퇴르", "코흐", "제너", "플레밍"],
        correctAnswer: 3,
        explanation: "알렉산더 플레밍은 1928년 푸른곰팡이가 세균의 증식을 막는 것을 관찰해 페니실린을 발견했습니다."
    },
    {
        id: 69,
        category: "과학",
        difficulty: "hard",
        question: "1869년 원소를 원자량 순으로 배열한 주기율표를 발표한 러시아 화학자는?",
        options: ["멘델레예프", "라부아지에", "돌턴", "보어"],
        correctAnswer: 0,
        explanation: "드미트리 멘델레예프는 1869년 주기율표를 발표하고, 아직 발견되지 않은 원소의 자리와 성질까지 예측했습니다."
    },
    {
        id: 70,
        category: "과학",
        difficulty: "hard",
        question: "지구 내부 구조 중 액체 상태로 알려진 층은?",
        options: ["지각", "맨틀", "외핵", "내핵"],
        correctAnswer: 2,
        explanation: "외핵은 철과 니켈이 주성분인 액체층으로, 지진파 중 S파가 통과하지 못하는 것으로 확인됩니다. 내핵은 고체입니다."
    },
    {
        id: 71,
        category: "과학",
        difficulty: "hard",
        question: "세포 호흡으로 ATP를 주로 만들어 '세포의 발전소'라 불리는 세포 소기관은?",
        options: ["리보솜", "골지체", "핵", "미토콘드리아"],
        correctAnswer: 3,
        explanation: "미토콘드리아는 세포 호흡으로 ATP를 생성합니다. 리보솜은 단백질 합성, 골지체는 단백질 가공·분비를 담당합니다."
    },

    // 예술과 문화
    {
        id: 72,
        category: "예술과 문화",
        difficulty: "easy",
        question: "'어린 왕자'의 작가는?",
        options: ["헤밍웨이", "카뮈", "톨스토이", "생텍쥐페리"],
        correctAnswer: 3,
        explanation: "앙투안 드 생텍쥐페리는 1943년 '어린 왕자'를 출간했습니다."
    },
    {
        id: 73,
        category: "예술과 문화",
        difficulty: "easy",
        question: "사물놀이에 쓰이는 네 가지 악기에 포함되지 않는 것은?",
        options: ["가야금", "꽹과리", "장구", "북"],
        correctAnswer: 0,
        explanation: "사물놀이는 꽹과리, 징, 장구, 북의 네 타악기로 연주합니다. 가야금은 현악기입니다."
    },
    {
        id: 74,
        category: "예술과 문화",
        difficulty: "medium",
        question: "오페라 '마술피리'를 작곡한 음악가는?",
        options: ["바흐", "베르디", "바그너", "모차르트"],
        correctAnswer: 3,
        explanation: "볼프강 아마데우스 모차르트는 1791년 오페라 '마술피리'를 작곡해 같은 해 빈에서 초연했습니다."
    },
    {
        id: 75,
        category: "예술과 문화",
        difficulty: "medium",
        question: "바티칸 시스티나 성당의 천장화 '천지창조'를 그린 화가는?",
        options: ["미켈란젤로", "라파엘로", "보티첼리", "다빈치"],
        correctAnswer: 0,
        explanation: "미켈란젤로는 1508~1512년 시스티나 성당 천장화를 그렸고, 1536~1541년에는 제단 벽화 '최후의 심판'을 그렸습니다."
    },
    {
        id: 76,
        category: "예술과 문화",
        difficulty: "medium",
        question: "판소리 다섯 마당에 포함되지 않는 것은?",
        options: ["춘향가", "심청가", "아리랑", "수궁가"],
        correctAnswer: 2,
        explanation: "판소리 다섯 마당은 춘향가, 심청가, 흥보가, 수궁가, 적벽가입니다. 아리랑은 민요입니다."
    },
    {
        id: 77,
        category: "예술과 문화",
        difficulty: "hard",
        question: "1893년 작품 '절규'를 그린 화가는?",
        options: ["클림트", "실레", "칸딘스키", "뭉크"],
        correctAnswer: 3,
        explanation: "노르웨이의 화가 에드바르 뭉크는 1893년 '절규'를 그렸으며, 이후 여러 버전을 남겼습니다."
    },
    {
        id: 78,
        category: "예술과 문화",
        difficulty: "hard",
        question: "발레 음악 '백조의 호수'를 작곡한 음악가는?",
        options: ["차이콥스키", "림스키코르사코프", "스트라빈스키", "라흐마니노프"],
        correctAnswer: 0,
        explanation: "표트르 일리치 차이콥스키는 1875~1876년 '백조의 호수'를 작곡했고, 1877년 모스크바에서 초연되었습니다."
    },
    {
        id: 79,
        category: "예술과 문화",
        difficulty: "hard",
        question: "1844년 제주 유배 중에 '세한도'를 그린 조선 후기 인물은?",
        options: ["김홍도", "신윤복", "정선", "김정희"],
        correctAnswer: 3,
        explanation: "추사 김정희는 1844년 제주 유배 중 제자 이상적에게 '세한도'를 그려 주었습니다."
    },
    {
        id: 80,
        category: "예술과 문화",
        difficulty: "hard",
        question: "안평대군의 꿈 이야기를 바탕으로 1447년 '몽유도원도'를 그린 화가는?",
        options: ["정선", "김홍도", "신사임당", "안견"],
        correctAnswer: 3,
        explanation: "조선 전기 화가 안견은 1447년 안평대군의 꿈 이야기를 듣고 3일 만에 '몽유도원도'를 그렸습니다."
    },
    {
        id: 81,
        category: "한국사",
        difficulty: "hard",
        question: "1608년 광해군 즉위년에 이원익의 건의로 선혜청을 두고 경기도에서 처음 시행한 제도는?",
        options: ["균역법", "영정법", "직전법", "대동법"],
        correctAnswer: 3,
        explanation: "대동법은 공물을 특산물 대신 쌀 등으로 내게 한 제도로, 1608년(광해군 즉위년) 경기도에서 처음 시행되었습니다. 이후 효종 때 김육의 노력으로 충청도 등으로 확대되었습니다."
    },
    {
        id: 82,
        category: "세계지리",
        difficulty: "easy",
        question: "면적 기준으로 세계에서 가장 넓은 대양은?",
        options: ["태평양", "대서양", "인도양", "북극해"],
        correctAnswer: 0,
        explanation: "태평양은 면적이 약 1억 6,500만 km²로 세계에서 가장 넓은 대양이며, 지구의 모든 육지를 합친 것보다 넓습니다."
    },
    {
        id: 83,
        category: "과학",
        difficulty: "hard",
        question: "1543년 '천구의 회전에 관하여'를 출간해 태양 중심설(지동설)을 주장한 천문학자는?",
        options: ["프톨레마이오스", "코페르니쿠스", "갈릴레이", "케플러"],
        correctAnswer: 1,
        explanation: "니콜라우스 코페르니쿠스는 1543년 뉘른베르크에서 '천구의 회전에 관하여'를 출간해, 지구가 아니라 태양이 중심에 있다는 지동설을 주장했습니다. 그는 같은 해에 세상을 떠났습니다."
    },
    {
        id: 84,
        category: "예술과 문화",
        difficulty: "easy",
        question: "'인어공주'와 '미운 오리 새끼'를 쓴 덴마크의 동화 작가는?",
        options: ["그림 형제", "이솝", "샤를 페로", "안데르센"],
        correctAnswer: 3,
        explanation: "한스 크리스티안 안데르센(1805~1875)은 덴마크 오덴세 출신의 작가로, '인어공주', '미운 오리 새끼', '눈의 여왕' 등의 동화를 썼습니다."
    }];
