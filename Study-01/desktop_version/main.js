// 작성일시: 2026-10-21 16:41
// Electron 메인 프로세스: 창과 메뉴를 만들고, 렌더러가 요청하면
// MNIST 데이터셋과 학습된 모델 파일을 사용자 데이터 폴더에서 읽고 쓴다.

const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const fs = require("fs");
const fsp = require("fs/promises");
const https = require("https");
const path = require("path");

// 데이터셋과 모델은 앱 폴더가 아니라 사용자 데이터 폴더에 둔다
// (패키징 후에는 앱 폴더가 읽기 전용일 수 있기 때문).
const DATA_DIR = () => path.join(app.getPath("userData"), "data");
const MODEL_DIR = () => path.join(app.getPath("userData"), "model");

// 웹 버전과 같은 MNIST 스프라이트 데이터셋.
const DATA_FILES = {
  "mnist_images.png":
    "https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png",
  "mnist_labels_uint8":
    "https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8",
};

let mainWindow = null;

// ---------------------------------------------------------------------------
// 데이터셋 다운로드 및 읽기
// ---------------------------------------------------------------------------

// 파일 하나를 내려받는다(리다이렉트 추적). 임시 파일에 먼저 쓰므로
// 중간에 끊겨도 손상된 파일이 남지 않는다.
function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GET ${url} failed with status ${res.statusCode}`));
        }
        const tmp = dest + ".part";
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on("finish", () => out.close(() => fs.rename(tmp, dest, (err) => (err ? reject(err) : resolve()))));
        out.on("error", reject);
      })
      .on("error", reject);
  });
}

async function loadDataset() {
  const dir = DATA_DIR();
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, url] of Object.entries(DATA_FILES)) {
    const dest = path.join(dir, name);
    if (!fs.existsSync(dest)) await download(url, dest);
  }
  const [images, labels] = await Promise.all([
    fsp.readFile(path.join(dir, "mnist_images.png")),
    fsp.readFile(path.join(dir, "mnist_labels_uint8")),
  ]);
  return { images, labels };
}

// ---------------------------------------------------------------------------
// 모델 저장/불러오기 (TensorFlow.js의 model.json + weights.bin 형식)
// ---------------------------------------------------------------------------

async function saveModel({ modelTopology, weightSpecs, weightData }) {
  const dir = MODEL_DIR();
  await fsp.mkdir(dir, { recursive: true });
  const modelJson = {
    modelTopology,
    weightsManifest: [{ paths: ["weights.bin"], weights: weightSpecs }],
  };
  // 가중치를 먼저 쓰고 model.json을 마지막에 써서, model.json이 있으면 항상 완전한 모델이 되게 한다.
  await fsp.writeFile(path.join(dir, "weights.bin"), Buffer.from(weightData));
  await fsp.writeFile(path.join(dir, "model.json"), JSON.stringify(modelJson));
}

async function loadModel() {
  const dir = MODEL_DIR();
  try {
    const modelJson = JSON.parse(await fsp.readFile(path.join(dir, "model.json"), "utf8"));
    const weightData = await fsp.readFile(path.join(dir, "weights.bin"));
    return {
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest[0].weights,
      weightData,
    };
  } catch {
    return null; // 저장된 모델이 없거나 읽을 수 없음
  }
}

ipcMain.handle("dataset:load", () => loadDataset());
ipcMain.handle("model:load", () => loadModel());
ipcMain.handle("model:save", (_event, artifacts) => saveModel(artifacts));

// ---------------------------------------------------------------------------
// 창과 메뉴
// ---------------------------------------------------------------------------

function sendToRenderer(channel) {
  if (mainWindow) mainWindow.webContents.send(channel);
}

function buildMenu() {
  const template = [
    {
      label: "&File",
      submenu: [
        { label: "Clear", accelerator: "Esc", click: () => sendToRenderer("menu:clear") },
        { label: "Retrain Model", accelerator: "CmdOrCtrl+R", click: () => sendToRenderer("menu:retrain") },
        { type: "separator" },
        { label: "Open Model Folder", click: () => shell.openPath(app.getPath("userData")) },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "&View",
      submenu: [{ role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 640,
    minWidth: 400,
    minHeight: 500,
    title: "Digit Recognizer",
    backgroundColor: "#f5f5f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 학습 중 창이 가려지거나 최소화되어도 느려지지 않게 한다
      // (tf.nextFrame이 requestAnimationFrame을 쓰므로 백그라운드에서 크게 지연됨).
      backgroundThrottling: false,
    },
  });

  // 앱 밖의 페이지로 이동하거나 새 창을 여는 것을 막는다.
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

// 앱을 두 번 실행하면 새 창 대신 기존 창을 앞으로 가져온다.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
