<!-- 작성일시: 2026-10-21 17:05 -->

# 손글씨 숫자 인식기

마우스나 터치로 숫자(0–9)를 그리면, MNIST 데이터셋으로 학습한 CNN이 어떤 숫자인지 인식합니다.
같은 모델과 전처리를 쓰는 **웹 버전**과 **데스크톱 버전** 두 가지로 제공합니다.

| | 웹 버전 | 데스크톱 버전 |
|---|---|---|
| 폴더 | [`web_version/`](web_version/) | [`desktop_version/`](desktop_version/) |
| 기술 | Node.js 서버 + 브라우저 TensorFlow.js | Electron + TensorFlow.js |
| 실행 | `Start Digit Recognizer.bat` 더블클릭 | `Start Digit Recognizer.bat` 더블클릭 |
| 모델 저장 위치 | 브라우저 IndexedDB | `%APPDATA%\digit-recognizer-desktop\model` |
| 인터넷 | TensorFlow.js를 CDN에서 불러옴 | 첫 실행 때 데이터셋만 내려받고 이후 오프라인 동작 |
| 추가 설치 | 없음 (npm 의존성 없음) | 첫 실행 때 `npm install` 자동 실행 (Electron 약 250MB) |

## 요구 사항

- Windows
- [Node.js](https://nodejs.org) (Node.js 24 / npm 12에서 테스트)
- 인터넷 연결 (첫 실행 때 MNIST 데이터셋 약 11MB 다운로드)

Python은 필요하지 않습니다.

## 빠른 시작

### 웹 버전

1. `web_version\Start Digit Recognizer.bat`을 더블클릭합니다.
   (또는 `web_version` 폴더에서 `npm start`)
2. 브라우저에서 http://localhost:3000 이 자동으로 열립니다.
3. 처음에는 브라우저에서 모델을 학습합니다(1–2분). **학습하는 동안 탭을 화면에 띄워 두세요.**
   백그라운드 탭에서는 브라우저가 학습을 크게 늦춥니다.
4. 서버를 끄려면 콘솔 창을 닫습니다.

### 데스크톱 버전

1. `desktop_version\Start Digit Recognizer.bat`을 더블클릭합니다.
   (또는 `desktop_version` 폴더에서 `npm install` 후 `npm start`)
2. 첫 실행 때는 패키지 설치 → 데이터셋 다운로드 → 모델 학습(GPU 기준 약 50초) 순서로 진행됩니다.
3. 다음 실행부터는 저장된 모델을 바로 불러옵니다.

## 사용 방법

- 검은 캔버스에 숫자 하나를 크게 그리고 마우스를 떼면 결과가 나옵니다.
- 오른쪽에 **예측한 숫자**, **확신도**, **0–9 각각의 확률 막대**, 그리고 모델에 실제로 들어간 **28x28 입력 이미지**가 표시됩니다.
- **Clear**: 캔버스 지우기 / **Retrain model**: 모델을 처음부터 다시 학습
- 데스크톱 버전 단축키: `Esc` 지우기, `Ctrl+R` 다시 학습, 메뉴 *File → Open Model Folder*로 저장 폴더 열기

## 동작 원리

1. **데이터**: MNIST 손글씨 숫자 65,000개(28x28 흑백). 55,000개로 학습하고 10,000개로 정확도를 측정합니다.
2. **모델**: 작은 CNN — `Conv(16) → Pool → Conv(32) → Pool → Dense(128) → Dropout → Softmax(10)`,
   Adam 옵티마이저로 3 epoch 학습. 테스트 정확도는 약 **98.6%** 입니다.
3. **전처리**: 그린 그림을 MNIST와 같은 방식으로 바꿉니다 —
   숫자 부분만 잘라 긴 쪽을 20픽셀로 줄이고, 28x28 안에서 무게중심이 가운데 오도록 옮긴 뒤 0–1로 정규화합니다.
   이 과정 덕분에 캔버스 어디에 어떤 크기로 그려도 잘 인식됩니다.

학습과 추론은 모두 TensorFlow.js로 실행되며, GPU가 있으면 WebGL로 가속됩니다.

## 폴더 구조

```
Study-01/
├── README.md
├── .gitignore                    data/, node_modules/ 제외
├── web_version/
│   ├── CLAUDE.md                 웹 버전 개발 메모
│   ├── Start Digit Recognizer.bat
│   ├── server.js                 정적 파일 서버 + 데이터셋 다운로드 (Node 내장 모듈만 사용)
│   ├── package.json
│   ├── public/                   index.html, app.js(학습·인식 로직), style.css
│   └── data/                     MNIST 데이터 (자동 다운로드, git 제외)
└── desktop_version/
    ├── CLAUDE.md                 데스크톱 버전 개발 메모
    ├── Start Digit Recognizer.bat
    ├── main.js                   Electron 메인 프로세스 (창, 메뉴, 파일 저장)
    ├── preload.js                렌더러에 노출하는 최소 API
    ├── package.json              electron 44.5.1, @tensorflow/tfjs 4.22.0
    └── renderer/                 index.html, app.js, style.css
```

## 문제 해결

| 증상 | 해결 방법 |
|---|---|
| "Node.js was not found" | [nodejs.org](https://nodejs.org)에서 Node.js를 설치한 뒤 다시 실행 |
| 웹 버전 학습이 매우 느림 | 브라우저 탭을 화면에 띄워 둔 채로 기다리기 |
| 웹 버전을 두 번 실행함 | 이미 실행 중이면 새 서버를 띄우지 않고 브라우저만 엽니다 (정상) |
| 포트 3000을 다른 프로그램이 사용 중 | `set PORT=3001` 후 `npm start` |
| 인식 결과가 이상함 | **Retrain model**로 다시 학습하거나, 숫자를 캔버스에 크게 그리기 |

## 현재 상태 및 다음 단계

- [x] 웹 버전 — 학습, 인식, 모델 저장, 더블클릭 실행
- [x] 데스크톱 버전 — 학습, 인식, 파일로 모델 저장, 메뉴·단축키, 더블클릭 실행
- [ ] 데스크톱 버전을 Windows 설치 파일 / 포터블 `.exe`로 패키징 (electron-builder)
- [ ] 미리 학습한 모델을 포함해 첫 실행 학습 생략
- [ ] 두 버전이 공유하는 모델·전처리 코드를 공통 모듈로 분리

## 개발 규칙

- 코드와 식별자는 영어, 주석과 문서(CLAUDE.md, README.md)는 한글로 작성합니다.
- 새 파일 맨 위에는 `작성일시: YYYY-MM-DD HH:MM` 주석을 넣습니다 (JSON 제외).
- `.bat` 파일은 CRLF 줄바꿈 + CP949 인코딩으로 저장합니다.
- 두 버전의 모델 구조와 전처리는 항상 같게 유지합니다.
- 자세한 내용은 각 폴더의 `CLAUDE.md`를 참고하세요.
