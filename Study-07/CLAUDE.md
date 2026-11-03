<!-- 작성일시: 2026-11-03 10:58 -->
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

`Study-07`은 "대전 빵지순례" 서비스(빵집 정보·추천 코스·실시간 현장 상황 공유)입니다. 요구사항은 `PRD.md`에 있고, 구현 전에 해당 마일스톤(M1~M5)을 먼저 읽습니다. 2026-11-03 기준 **M1(빵집·코스 둘러보기)** 과 빵지순례 지도, 메뉴 일러스트 커버까지 구현했습니다. 빵집 120곳(대전시 시민추천 100곳 포함) 모두 좌표가 있습니다. 배포 주소: https://daejeon-bread-study07.vercel.app (Vercel 프로젝트 `daejeon-bread-study07`).

- 저장소 루트는 상위 폴더 `D:\study\inflearn\VibeCoding`이고, `Study-01`~`Study-07`이 각각 독립된 프로젝트입니다. 명령은 이 폴더 안에서 실행합니다.
- 프로젝트를 끝내면 루트 `README.md`의 목차·프로젝트 섹션(스크린샷 포함)·기술 스택 표·폴더 구조에 Study-07을 추가합니다.

## 명령어

- 빌드 도구 없음. ES 모듈을 쓰므로 `file://`로는 열리지 않고 정적 서버가 필요합니다: `npx serve -l 5173 .` → http://localhost:5173
- 화면 확인은 Playwright MCP로 합니다(폭 390px 기준). 스크린샷은 `.playwright-mcp/`에만 저장할 수 있습니다(`.gitignore`로 제외).
- DB 변경은 Supabase MCP `apply_migration`으로 적용하고, 같은 SQL을 `supabase/migrations/`에 번호를 붙여 남깁니다. 변경 후 `get_advisors`(security)를 확인합니다.
- 좌표 채우기: `js/config.js`에 `KAKAO_JS_KEY`를 넣고 서버를 띄운 뒤 `tools/geocode.html`을 열면, 좌표 없는 빵집을 카카오 장소 검색으로 찾아 도로명 주소가 일치하는 것만 UPDATE SQL로 만들어 줍니다. "검토 필요" 행은 손으로 확인합니다. 카카오 콘솔에 `http://localhost:5173`과 배포 도메인을 등록해야 SDK가 동작합니다.

## 구조

- Supabase 프로젝트는 Study-06과 같은 `txjsdtqzqbftyasbcksa`를 씁니다(Study-06 테이블 `shopping_items`와 공존). 테이블: `bakeries`, `courses`, `course_stops`. 모두 RLS로 `anon`·`authenticated`는 읽기만 가능하고, 데이터는 마이그레이션 SQL로만 바꿉니다.
- `bakeries`의 영업시간은 출처마다 표기가 달라 글(`hours_text`, `closed_text`)로 보관하며, 모든 행에 `source_url`·`checked_at`을 둡니다. 출처로 확인되지 않은 사실(팁·위치 설명 등)은 넣지 않습니다.
  - `tags`는 출처 표시입니다(`시민추천`, `시민추천 BEST5`, `대전시 소개`, `언론·리뷰 소개`). 화면의 출처 필터는 `startsWith`로 비교하므로 `시민추천`은 BEST5도 포함합니다.
  - 시민추천 빵집(slug `dj-<ntatcSeq>`)은 대전시 `BreadRecommendList.do`(구별 `colmn1Cont`, `pageIndex`)에서 가져왔고, 좌표는 카카오 장소 검색(주소 일치 → 같은 구·같은 이름 → 주소 검색 순)으로 찾았습니다. 이름으로만 찾은 곳은 카카오 주소(현재 정보)를 씁니다(`006_citizen_bakeries.sql`).
  - 대표 이미지 우선순위: `image_url`(직접 찍었거나 사용 허락을 받은 사진) → `photo_thumb_url`(카카오 이미지 검색 API 썸네일) → 메뉴 일러스트. 블로그·카카오맵 원본 사진을 내려받거나 원본 주소로 직접 불러오지 않습니다(저작권·약관).
  - 검색 사진은 `node tools/search-photos.mjs <출력.sql>`(환경 변수 `KAKAO_REST_KEY`, 키는 파일에 저장하지 않음)로 빵집당 최대 4장(`photos` jsonb, 130×130 썸네일 + 원본 글 `doc`·사이트 `site`)을 찾습니다. 화면은 썸네일을 흐린 배경 위 폴라로이드로 보여 주고 출처 링크를 항상 표시합니다.
  - 자동 검색 결과에는 엉뚱한 사진(캐릭터·인물·축제 포스터·글자 이미지)이 섞이므로 반영 뒤 한 화면에 모아 검토하고, 2026-11-03에 36곳을 손으로 골랐습니다(29곳 교체, 7곳은 일러스트로 되돌림). `--all`로 다시 돌리면 이 선택이 덮어써지므로 새로 추가한 빵집만(기본값) 검색합니다. `course_stops.move_min`은 직선거리 × 1.3을 이동 수단별 속도로 나눈 추정값이며(`supabase/migrations/004_m1_course_fixes.sql`), 경유지나 좌표를 바꾸면 같은 식으로 다시 계산합니다.
- 배포: GitHub 저장소(`winsHyun/VibeCoding`)의 `main`에 푸시하면 Vercel이 자동으로 운영 배포합니다. 프로젝트 Root Directory가 `Study-07`이라 저장소 전체가 아니라 이 폴더만 사이트가 됩니다(이 설정이 없으면 `/`가 404). `.vercelignore`가 `tools/`·`supabase/`·문서를 제외합니다. 수동 배포가 필요하면 `npx vercel redeploy <배포 URL>`을 쓰고, `Study-07`에서 `npx vercel deploy --prod`를 실행하면 Root Directory와 경로가 겹칠 수 있어(검증 안 함) 쓰지 않습니다. 배포 도메인을 카카오 콘솔의 JavaScript SDK 도메인에 등록해야 지도가 나옵니다.
- `index.html` + `style.css` + `js/` 단일 페이지. 라우팅은 쿼리 문자열(`?bakery=<slug>`, `?course=<slug>`, `?tab=courses|map`, 없으면 빵집 목록)과 `history.pushState`로 하며, 공유 링크가 그대로 해당 화면을 엽니다.
  - `js/app.js`: 라우터와 모든 화면 렌더링. DOM은 `el()` 도우미로 만들고 문자열은 텍스트 노드로만 넣습니다(M2부터 사용자 입력이 들어오므로 `innerHTML` 금지).
  - `js/api.js`: Supabase 읽기. 빵집·코스는 한 번 불러와 메모리에 보관하고, 빵집은 성심당 매장을 먼저 정렬합니다.
  - `js/kakao.js`: SDK 지연 로딩(`autoload=false`, `services` 포함), 카카오맵 장소·길찾기 링크. `renderMap`은 기본 마커 대신 `makePin`이 만든 DOM을 CustomOverlay로 올리고, 필터용 `setVisible`·`fitTo`·`panTo`를 돌려줍니다.
  - `js/category.js`: 대표 메뉴를 앞에서부터 정규식으로 보고 빵 종류 8가지 중 하나로 정합니다(우선순위 순서가 중요, 마지막 `sweet`가 기본값). 종류별 색은 지도 핀·배지에, `coverSvg`는 사진이 없을 때의 커버 일러스트에 씁니다. SVG는 코드가 만든 고정 문자열이라 `innerHTML`로 넣는 유일한 곳입니다.
  - `js/mascot.js`: 구별 자체 캐릭터 5종(SVG): 동구 기관사 소금빵(대전역), 중구 딸기 케이크(원도심), 서구 화가 크루아상(둔산), 유성구 온천 에그타르트(유성온천), 대덕구 등산 머핀(계족산). 공통 `face()`(반짝이는 눈·볼터치·표정 3종)와 `wave()`(손 흔드는 팔, pose 1)를 씁니다. 구 배너에서는 통통 튀는 애니메이션이 있고 `prefers-reduced-motion`이면 멈춥니다. 화면 톤은 대전시 「대전의 맛」 빵산책 페이지(초록 `#06866c`, 살구빛 배너, 갈색 알약 버튼)를 따릅니다. **꿈돌이·꿈씨패밀리는 대전관광공사 IP라 승인 없이 이미지를 넣거나 비슷하게 그리지 않습니다.** 승인 후에는 `config.js`의 `CHARACTER_IMAGES`에 구별 이미지 경로만 넣으면 됩니다.
  - **현장 상황(M2·M3)**: `js/live.js`가 최근 24시간 제보를 메모리에 두고 Supabase Realtime(INSERT)으로 갱신합니다. `data-live-bakery`(배지)·`data-live-pin`(지도 핀 링)·`data-live-card`(상세 현장 카드) 속성이 붙은 요소는 새 제보 때 자동으로 다시 그려지고, 그 밖의 영역은 `onLiveChange`로 구독합니다(화면에서 사라지면 해제). 90분이 지난 제보는 배지에 쓰지 않습니다. 숨김 처리는 Realtime으로 오지 않아 5분마다 다시 불러옵니다.
    - 쓰기는 RPC만: `submit_report`(300m 거리 검사, 같은 빵집 10분 1건·전체 1시간 10건, 메모 140자·링크 금지, 품절 메뉴는 그 빵집 `signature_menus` 안에서만), `flag_report`(서로 다른 기기 3건이면 `hidden`). 오류는 `raise exception 'CODE[:값]'`이고 `api.js`의 `rpcError`가 `code`·`value`로 나눕니다.
    - 로그인 없음: 기기 ID(localStorage UUID)와 요청 IP(`x-forwarded-for`)의 SHA-256 해시만 `report_authors`에 저장(정책 없음 = 아무도 못 읽음). 좌표·원본 IP는 저장하지 않습니다. Supabase advisor의 "anon이 SECURITY DEFINER 함수 실행 가능" 경고는 이 설계상 의도한 것입니다.
    - 시험: Playwright `context.setGeolocation`으로 빵집 근처 좌표를 주거나 REST로 RPC를 직접 부릅니다. 시험 제보는 끝나면 지웁니다.
  - **소개 카드**(`introScene`·`statBox`·`countUp`): 구별 캐릭터 5명이 언덕길에서 폴짝폴짝 행진하고(`hop`·`parade-walk`), 빵 말풍선이 떠오르며, 카드 모서리 점선 궤도를 별이 돕니다. 제목 형광펜·숫자 올라가기·버튼 빛 효과가 있고, `prefers-reduced-motion`이면 모두 멈춥니다. `introScene`은 궤도와 장면 두 요소를 배열로 돌려줍니다(`el`이 펼침).
  - **첫 화면 "지금 현장" 소식판**(`liveTicker`, 소개 카드 바로 아래): 최근 90분 제보가 있는 빵집을 최신순으로 한 줄씩(4곳, 나머지는 "더 보기"), 줄을 누르면 상세로 이동. 화면을 연 뒤 들어온 제보는 `is-new`로 반짝입니다. 소식이 없으면 별과 안내 문구를 보여 줘 자리를 유지합니다. 넓은 화면에서는 2열.
  - **요즘 핫한 빵집**: `record_view`(상세 진입 시, 기기당 하루 1회)와 `hot_bakeries`(최근 7일 조회 + 제보×3, 집계만 공개)로 첫 화면에 순위를 보여 줍니다.
  - **방문자 수**(`js/visitors.js`, `010_site_visits.sql`): 앱 시작 때 `record_visit`(기기당 하루 1회, 한국 시간)이 기록하고 누적·오늘·어제를 돌려줍니다. 일별 집계는 `site_visit_daily`에, 중복 확인용 기기 해시(`site_visits`)는 어제까지만 남깁니다. 현재 접속자는 Realtime Presence(`site-presence` 채널, 키 = 기기 ID라 여러 탭도 1명)로 셉니다. 헤더 오른쪽 "N명 보는 중" 알약을 누르면 첫 화면 꼬리말 방문자 판으로 이동하며, `data-visitors` 속성 요소는 숫자가 바뀌면 굴러가며 갱신됩니다. 시험 방문은 끝나면 지웁니다.
  - `js/dom.js`: `el`·`toast`·`distanceKm` 공통 도우미. 브라우저 `replaceChildren`은 배열·`false`를 걸러 주지 않으므로 조건부 자식은 `el()`로 감싸거나 `live.js`의 `put`을 씁니다.
  - 지도 탭(`?tab=map`)은 `body.map-mode`로 전체 화면이 되고, 종류·출처 필터와 아래쪽 카드(시트), 자료 출처 안내가 있습니다.
  - `js/config.js`: Supabase URL·publishable 키와 카카오 JS 키(둘 다 브라우저 공개용).

## 작업 규칙

- 새 파일 맨 위에는 `작성일시: YYYY-MM-DD HH:MM` 주석을 넣습니다(파일 형식에 맞는 주석 문법 사용).
- 코드(변수·함수 이름 등)는 영어, 주석과 문서(CLAUDE.md·PRD·README)는 한국어로 씁니다.
- `.bat` 파일은 CRLF 줄바꿈 + CP949 인코딩으로 저장합니다.
