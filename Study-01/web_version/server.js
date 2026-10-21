// 손글씨 숫자 인식기를 위한 최소한의 정적 파일 서버.
// 처음 실행할 때 MNIST 스프라이트 데이터셋을 ./data 에 내려받아,
// 브라우저가 같은 출처(origin)에서 불러올 수 있게 한다. npm 의존성이 필요 없다.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");

// 스프라이트 이미지 한 장과 원-핫 라벨 파일로 묶인 MNIST 데이터셋
// (샘플 65,000개, 28x28 흑백). TensorFlow.js 예제와 함께 공개된 파일이다.
const DATA_FILES = {
  "mnist_images.png":
    "https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png",
  "mnist_labels_uint8":
    "https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

// 파일 하나를 내려받는다(리다이렉트 추적). 먼저 임시 파일에 쓰고 나서 이름을 바꾸므로
// 다운로드가 중간에 끊겨도 손상된 파일이 남지 않는다.
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

async function ensureDataset() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const [name, url] of Object.entries(DATA_FILES)) {
    const dest = path.join(DATA_DIR, name);
    if (fs.existsSync(dest)) continue;
    console.log(`Downloading ${name} ...`);
    await download(url, dest);
    console.log(`  saved to ${dest}`);
  }
}

// URL 경로를 허용된 루트 폴더 안의 파일 경로로 바꾼다. 상위 폴더 접근(경로 탐색)은 거부한다.
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const [root, rel] = clean.startsWith("/data/")
    ? [DATA_DIR, clean.slice("/data/".length)]
    : [PUBLIC_DIR, clean === "/" ? "index.html" : clean.slice(1)];
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url);
    if (!file) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      const type = MIME_TYPES[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type }).end(body);
    });
  });

  const url = `http://localhost:${PORT}`;

  // 다른 인스턴스가 이미 앱을 서비스 중이면 브라우저만 연다.
  server.on("error", (err) => {
    if (err.code !== "EADDRINUSE") throw err;
    console.log(`Port ${PORT} is already in use; opening the running app at ${url}`);
    if (!process.env.NO_OPEN) openBrowser(url);
    setTimeout(() => process.exit(0), 1000);
  });

  server.listen(PORT, () => {
    console.log(`Digit recognizer running at ${url}`);
    console.log("Close this window (or press Ctrl+C) to stop the server.");
    if (!process.env.NO_OPEN) openBrowser(url);
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

ensureDataset()
  .then(startServer)
  .catch((err) => {
    console.error("Failed to prepare dataset:", err.message);
    process.exit(1);
  });
