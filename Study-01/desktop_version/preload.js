// 작성일시: 2026-10-21 16:41
// 프리로드 스크립트: 렌더러에 꼭 필요한 최소한의 API만 window.digitApp 으로 노출한다.
// 렌더러는 Node.js에 직접 접근할 수 없다(contextIsolation + sandbox).

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("digitApp", {
  // MNIST 데이터셋(필요하면 처음 한 번 내려받음)을 { images, labels } 바이트 배열로 돌려준다.
  loadDataset: () => ipcRenderer.invoke("dataset:load"),
  // 저장된 모델 { modelTopology, weightSpecs, weightData } 또는 null.
  loadModel: () => ipcRenderer.invoke("model:load"),
  saveModel: (artifacts) => ipcRenderer.invoke("model:save", artifacts),
  // 메뉴 명령("clear", "retrain")을 받을 콜백을 등록한다.
  onMenu: (callback) => {
    ipcRenderer.on("menu:clear", () => callback("clear"));
    ipcRenderer.on("menu:retrain", () => callback("retrain"));
  },
});
