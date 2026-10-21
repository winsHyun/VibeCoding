// TensorFlow.js로 브라우저 안에서만 동작하는 손글씨 숫자 인식기.
// 처음 방문할 때 작은 CNN을 MNIST로 학습시키고 IndexedDB에 저장해 두므로,
// 다음 방문부터는 바로 불러온다.

const MODEL_KEY = "indexeddb://mnist-cnn";
const IMAGE_SIZE = 28 * 28;
const NUM_CLASSES = 10;
const NUM_SAMPLES = 65000;
const NUM_TRAIN = 55000;
const EPOCHS = 3;
const BATCH_SIZE = 128;

const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const pad = document.getElementById("pad");
const padCtx = pad.getContext("2d");
const preview = document.getElementById("preview");
const previewCtx = preview.getContext("2d");
const digitEl = document.getElementById("digit");
const confidenceEl = document.getElementById("confidence");
const barsEl = document.getElementById("bars");
const clearBtn = document.getElementById("clear");
const retrainBtn = document.getElementById("retrain");

let model = null;

// ---------------------------------------------------------------------------
// 데이터셋 불러오기
// ---------------------------------------------------------------------------

// 스프라이트 이미지는 한 행에 28x28 샘플 하나씩(가로 784픽셀) 저장되어 있다.
// 브라우저의 캔버스 높이 제한 때문에 여러 덩어리로 나누어 디코딩한다.
async function loadMnist() {
  const img = new Image();
  img.src = "/data/mnist_images.png";
  await img.decode();

  const images = new Float32Array(NUM_SAMPLES * IMAGE_SIZE);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const chunkSize = 5000;
  canvas.width = IMAGE_SIZE;
  canvas.height = chunkSize;

  for (let start = 0; start < NUM_SAMPLES; start += chunkSize) {
    const rows = Math.min(chunkSize, NUM_SAMPLES - start);
    ctx.drawImage(img, 0, start, IMAGE_SIZE, rows, 0, 0, IMAGE_SIZE, rows);
    const pixels = ctx.getImageData(0, 0, IMAGE_SIZE, rows).data;
    // 흑백 이미지이므로 빨강 채널 값이 곧 밝기다.
    for (let i = 0; i < rows * IMAGE_SIZE; i++) {
      images[start * IMAGE_SIZE + i] = pixels[i * 4] / 255;
    }
  }

  const res = await fetch("/data/mnist_labels_uint8");
  const labels = new Uint8Array(await res.arrayBuffer()); // 원-핫 인코딩, 샘플당 10바이트
  return { images, labels };
}

// ---------------------------------------------------------------------------
// 모델
// ---------------------------------------------------------------------------

function buildModel() {
  const m = tf.sequential();
  m.add(tf.layers.conv2d({ inputShape: [28, 28, 1], filters: 16, kernelSize: 3, activation: "relu" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: "relu" }));
  m.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  m.add(tf.layers.flatten());
  m.add(tf.layers.dense({ units: 128, activation: "relu" }));
  m.add(tf.layers.dropout({ rate: 0.25 }));
  m.add(tf.layers.dense({ units: NUM_CLASSES, activation: "softmax" }));
  m.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });
  return m;
}

async function trainModel() {
  setStatus("Loading MNIST dataset...");
  const { images, labels } = await loadMnist();

  const xs = tf.tensor4d(images, [NUM_SAMPLES, 28, 28, 1]);
  const ys = tf.tensor2d(labels, [NUM_SAMPLES, NUM_CLASSES], "float32");
  const [xTrain, xTest] = tf.split(xs, [NUM_TRAIN, NUM_SAMPLES - NUM_TRAIN]);
  const [yTrain, yTest] = tf.split(ys, [NUM_TRAIN, NUM_SAMPLES - NUM_TRAIN]);
  xs.dispose();
  ys.dispose();

  const m = buildModel();
  const batchesPerEpoch = Math.ceil(NUM_TRAIN / BATCH_SIZE);
  const totalBatches = batchesPerEpoch * EPOCHS;
  let epoch = 0;
  progressEl.hidden = false;

  await m.fit(xTrain, yTrain, {
    epochs: EPOCHS,
    batchSize: BATCH_SIZE,
    shuffle: true,
    callbacks: {
      onEpochBegin: (e) => { epoch = e; },
      onBatchEnd: async (batch, logs) => {
        const done = epoch * batchesPerEpoch + batch + 1;
        progressEl.value = done / totalBatches;
        if (batch % 20 === 0) {
          setStatus(`Training epoch ${epoch + 1}/${EPOCHS} - accuracy ${(logs.acc * 100).toFixed(1)}%`);
          await tf.nextFrame(); // 학습 중에도 화면이 멈추지 않게 한다
        }
      },
    },
  });

  const [, testAcc] = m.evaluate(xTest, yTest, { batchSize: 512 });
  const accuracy = (await testAcc.data())[0];
  tf.dispose([xTrain, xTest, yTrain, yTest, testAcc]);

  progressEl.hidden = true;
  await m.save(MODEL_KEY);
  setStatus(`Model trained. Test accuracy: ${(accuracy * 100).toFixed(2)}%. Draw a digit (0-9) below.`);
  return m;
}

async function loadOrTrainModel(forceRetrain = false) {
  setBusy(true);
  try {
    if (!forceRetrain) {
      try {
        const saved = await tf.loadLayersModel(MODEL_KEY);
        setStatus("Loaded saved model. Draw a digit (0-9) below.");
        return saved;
      } catch {
        // 저장된 모델이 아직 없으면 아래에서 학습을 진행한다.
      }
    }
    return await trainModel();
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// 그리기 패드
// ---------------------------------------------------------------------------

function clearPad() {
  padCtx.fillStyle = "#000";
  padCtx.fillRect(0, 0, pad.width, pad.height);
  previewCtx.clearRect(0, 0, 28, 28);
  digitEl.textContent = "-";
  confidenceEl.innerHTML = "&nbsp;";
  renderBars(new Array(NUM_CLASSES).fill(0));
}

function canvasPoint(event) {
  const rect = pad.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * pad.width,
    y: ((event.clientY - rect.top) / rect.height) * pad.height,
  };
}

let drawing = false;
let last = null;

pad.addEventListener("pointerdown", (e) => {
  drawing = true;
  last = canvasPoint(e);
  pad.setPointerCapture(e.pointerId);
  strokeTo(last); // 한 번만 찍어도 점이 그려지게 한다
});

pad.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = canvasPoint(e);
  strokeTo(p);
  last = p;
});

function endStroke() {
  if (!drawing) return;
  drawing = false;
  predict();
}
pad.addEventListener("pointerup", endStroke);
pad.addEventListener("pointercancel", endStroke);

function strokeTo(p) {
  padCtx.strokeStyle = "#fff";
  padCtx.lineWidth = 18;
  padCtx.lineCap = "round";
  padCtx.lineJoin = "round";
  padCtx.beginPath();
  padCtx.moveTo(last.x, last.y);
  padCtx.lineTo(p.x, p.y);
  padCtx.stroke();
}

// ---------------------------------------------------------------------------
// 전처리: MNIST 숫자를 만든 방식을 그대로 따라 한다
// (20x20 상자에 맞춘 뒤, 28x28 영역에서 무게중심 기준으로 가운데 정렬).
// ---------------------------------------------------------------------------

function findBoundingBox(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function preprocess() {
  const box = findBoundingBox(padCtx, pad.width, pad.height);
  if (!box) return null;

  // 가로세로 비율을 유지하면서 긴 쪽이 20픽셀이 되도록 숫자 크기를 조정한다.
  const scale = 20 / Math.max(box.w, box.h);
  const sw = box.w * scale;
  const sh = box.h * scale;

  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = 28;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  tctx.fillStyle = "#000";
  tctx.fillRect(0, 0, 28, 28);
  tctx.drawImage(pad, box.x, box.y, box.w, box.h, (28 - sw) / 2, (28 - sh) / 2, sw, sh);

  // 무게중심이 28x28 영역의 정중앙에 오도록 이동한다.
  const pixels = tctx.getImageData(0, 0, 28, 28).data;
  let mass = 0, cx = 0, cy = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const v = pixels[(y * 28 + x) * 4];
      mass += v;
      cx += x * v;
      cy += y * v;
    }
  }
  const dx = Math.round(13.5 - cx / mass);
  const dy = Math.round(13.5 - cy / mass);

  previewCtx.fillStyle = "#000";
  previewCtx.fillRect(0, 0, 28, 28);
  previewCtx.drawImage(tmp, dx, dy);

  const centered = previewCtx.getImageData(0, 0, 28, 28).data;
  const input = new Float32Array(IMAGE_SIZE);
  for (let i = 0; i < IMAGE_SIZE; i++) input[i] = centered[i * 4] / 255;
  return input;
}

// ---------------------------------------------------------------------------
// 예측 및 결과 표시
// ---------------------------------------------------------------------------

async function predict() {
  if (!model) return;
  const input = preprocess();
  if (!input) return;

  const output = tf.tidy(() => model.predict(tf.tensor4d(input, [1, 28, 28, 1])).squeeze());
  const probs = await output.array();
  output.dispose();

  const best = probs.indexOf(Math.max(...probs));
  digitEl.textContent = best;
  confidenceEl.textContent = `${(probs[best] * 100).toFixed(1)}% confident`;
  renderBars(probs);
}

function renderBars(probs) {
  const best = probs.indexOf(Math.max(...probs));
  barsEl.innerHTML = "";
  probs.forEach((p, digit) => {
    const li = document.createElement("li");
    if (p > 0 && digit === best) li.className = "top";
    li.innerHTML =
      `<span class="name">${digit}</span>` +
      `<span class="track"><span class="fill" style="width:${(p * 100).toFixed(1)}%"></span></span>` +
      `<span class="pct">${(p * 100).toFixed(1)}%</span>`;
    barsEl.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// UI 연결
// ---------------------------------------------------------------------------

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  retrainBtn.disabled = busy;
  pad.style.pointerEvents = busy ? "none" : "auto";
}

clearBtn.addEventListener("click", clearPad);

retrainBtn.addEventListener("click", async () => {
  if (model) model.dispose();
  model = null;
  model = await loadOrTrainModel(true);
});

(async function main() {
  clearPad();
  try {
    model = await loadOrTrainModel();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
})();
