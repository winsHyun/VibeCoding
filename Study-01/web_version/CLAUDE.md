<!-- 작성일시: 2026-10-21 16:33 -->

# 손글씨 숫자 인식기 — 웹 버전

사용자가 캔버스에 숫자를 그리면, MNIST로 학습한 작은 CNN이 그 숫자를 인식하는 브라우저 앱.
학습과 추론 모두 TensorFlow.js로 브라우저 안에서 실행된다.
Electron 기반 데스크톱 버전은 `../desktop_version`에 있다.

## 실행 방법

- `Start Digit Recognizer.bat`을 더블클릭하거나 `npm start`(= `node server.js`)를 실행한다.
- http://localhost:3000 에서 서비스하며(`PORT` 환경 변수로 변경 가능), 기본 브라우저를 자동으로 연다
  (`NO_OPEN=1`이면 열지 않음). 포트가 이미 사용 중이면 브라우저만 연다.
- 이 PC에는 Python이 설치되어 있지 않고, Node.js 24가 설치되어 있다.

## 파일 구성

- `server.js` — Node 내장 모듈만 사용하는 정적 파일 서버(npm 의존성 없음).
  처음 실행할 때 MNIST 스프라이트 데이터셋을 `data/`에 내려받는다(git 제외 대상).
  `public/`은 `/`로, `data/`는 `/data/`로 제공하며 경로 탐색 공격은 거부한다.
- `public/index.html` — 페이지 마크업. TensorFlow.js를 jsDelivr에서 불러온다(`@tensorflow/tfjs@4.22.0`로 버전 고정).
- `public/app.js` — 데이터셋 로딩, 모델 정의·학습, 그리기 패드, 전처리, 예측.
- `public/style.css` — 스타일.

## 모델과 데이터

- 데이터셋: `mnist_images.png`(784픽셀 너비의 행 65,000개, 행 하나가 샘플 하나)와
  `mnist_labels_uint8`(원-핫, 샘플당 10바이트). 앞의 55,000개는 학습용, 나머지는 테스트용.
- CNN 구조: conv16 → pool → conv32 → pool → dense128 → dropout 0.25 → softmax10. Adam, 3 epoch, batch 128.
- 학습된 모델은 IndexedDB에 `indexeddb://mnist-cnn`으로 저장된다. "Retrain model" 버튼은 이를 덮어쓴다.
  모델 구조를 바꾸면 예전에 저장된 모델을 불러오지 않도록 `MODEL_KEY`도 함께 바꿔야 한다.

## 전처리 (학습 데이터와 반드시 일치시킬 것)

예측 전에 그린 그림을 MNIST 방식으로 변환한다: 검은 바탕에 흰 획,
경계 상자로 잘라내기, 긴 쪽을 20픽셀로 축소, 28x28 안에 배치, 무게중심이 가운데 오도록 이동,
밝기를 0–1로 정규화. 이 과정을 바꾸면 인식 정확도가 달라진다.

## 작업 규칙

- 코드와 식별자는 영어로, 주석과 CLAUDE.md는 한글로 작성한다.
- 새로 만드는 모든 파일 맨 위에 `작성일시: YYYY-MM-DD HH:MM` 주석(현지 시간)을 넣는다.
- `.bat` 파일은 CRLF 줄바꿈으로 저장하고, 한글 주석이 있으면 CP949 인코딩으로 저장한다
  (LF 줄바꿈이나 UTF-8이면 cmd가 줄을 잘못 읽어 실행이 실패한다).
- 서버는 의존성 없이 유지하고, CDN 스크립트는 정확한 버전으로 고정한다.
