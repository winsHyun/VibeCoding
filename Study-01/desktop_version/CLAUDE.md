<!-- 작성일시: 2026-10-21 16:33 (2026-10-21 17:10 구현 내용으로 갱신) -->

# 손글씨 숫자 인식기 — 데스크톱 버전

**Electron**으로 만든 Windows 데스크톱 앱. 사용자가 창에 숫자를 그리면
MNIST로 학습한 CNN이 그 숫자를 인식한다. 웹 버전(`../web_version`)의 모델·전처리 로직을 재사용한다.

## 실행 방법

- `Start Digit Recognizer.bat` 더블클릭: 필요하면 `npm install`과 Electron 실행 파일 다운로드를 한 뒤,
  콘솔 창 없이 앱 창만 띄운다.
- 또는 `npm start`(= `electron .`).
- 첫 실행 때 MNIST 데이터셋(약 11MB)을 내려받고 모델을 학습한다(GPU 기준 약 50초).
  이후에는 저장된 모델을 바로 불러온다.

## 기술 스택

- Electron `44.5.1`, TensorFlow.js `@tensorflow/tfjs@4.22.0` (둘 다 버전 고정, 로컬 설치 — CDN 미사용, 오프라인 동작).
- Node.js 24 / npm 12. Python은 이 PC에 없다.
- 백엔드는 WebGL(NVIDIA RTX 3050)로 동작한다.

## 파일 구성

- `main.js` — 메인 프로세스. 창·메뉴 생성, IPC 처리(`dataset:load`, `model:load`, `model:save`).
  데이터셋은 `%APPDATA%\digit-recognizer-desktop\data`, 모델은 `...\model`(model.json + weights.bin)에 저장한다.
  단일 인스턴스 잠금, 외부 페이지 이동·새 창 차단.
- `preload.js` — `contextBridge`로 `window.digitApp`(loadDataset, loadModel, saveModel, onMenu)만 노출한다.
- `renderer/index.html` — CSP: `script-src 'self'` (eval 금지).
- `renderer/app.js` — `../web_version/public/app.js`를 바탕으로, 데이터 로딩과 모델 저장만 IPC 방식으로 바꿨다.
- `renderer/style.css` — 웹 버전 스타일 기반.
- `Start Digit Recognizer.bat` — 더블클릭 실행용(CRLF + CP949).

## 메뉴

- File: Clear(Esc), Retrain Model(Ctrl+R), Open Model Folder, Exit
- View: 개발자 도구, 확대/축소

## 주의할 점 (실제로 겪은 문제)

- **TF.js는 `tf.es2017.min.js`를 써야 한다.** ES5용 `tf.min.js`는 polyfill이 `Function("return this")`를
  호출해서 CSP(`unsafe-eval` 없음)에 막히고 `tf`가 정의되지 않는다. CSP를 완화하지 말 것.
- **`backgroundThrottling: false`가 필요하다.** `tf.nextFrame()`이 requestAnimationFrame을 쓰므로
  창이 가려지면 학습이 크게 느려진다(433초 → 50초로 개선됨).
- **Electron 실행 파일은 `npm install` 때 설치되지 않는다.** Electron 44는 설치 스크립트가 없고,
  처음 `require('electron')` 할 때 `node_modules/electron/dist`에 내려받는다. `.bat`이 이를 처리한다.

## 웹 버전과 반드시 일치시킬 것

- 데이터셋 형식, CNN 구조, 전처리(잘라내기 → 20픽셀로 맞추기 → 28x28 →
  무게중심 정렬 → 0–1 정규화)가 같아야 한다. 자세한 내용은 `../web_version/CLAUDE.md` 참고.
- 한쪽을 고치면 다른 쪽도 함께 고친다. 공통 로직이 커지면 공통 모듈로 분리하는 것을 고려한다.

## 다음 단계 (미구현)

- electron-builder로 Windows 설치 파일 / 포터블 `.exe` 패키징.
- 미리 학습한 모델을 앱에 포함해 첫 실행 학습 생략.

## 작업 규칙

- 코드와 식별자는 영어로, 주석과 CLAUDE.md는 한글로 작성한다.
- 새로 만드는 모든 파일 맨 위에 `작성일시: YYYY-MM-DD HH:MM` 주석(현지 시간)을 넣는다.
  JSON 파일은 주석을 넣을 수 없으므로 `package.json`은 예외다.
- `.bat` 파일은 CRLF 줄바꿈으로 저장하고, 한글 주석이 있으면 CP949 인코딩으로 저장한다
  (LF 줄바꿈이나 UTF-8이면 cmd가 줄을 잘못 읽어 실행이 실패한다).
- 의존성 버전은 정확히 고정한다.
