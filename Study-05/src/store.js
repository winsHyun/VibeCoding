// 작성일시: 2026-10-27 15:10
// 일기 저장소: data/entries.json 파일 하나에 { version, entries } 로 저장한다.
// - 쓰기는 하나씩 순서대로(직렬화) 처리하고, 임시 파일에 쓴 뒤 이름 바꾸기로 원자적으로 바꾼다.
// - 파일이 깨져 있으면 서버를 멈추지 않고 백업(.corrupt-<시각>.bak)으로 옮긴 뒤 빈 목록으로 시작한다.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// 저장된 항목이 최소한 갖춰야 할 모양 (깨진 항목은 읽을 때 걸러낸다)
const isEntry = (e) =>
  e && typeof e === "object" && typeof e.id === "string" && typeof e.text === "string" && typeof e.createdAt === "string";

export function createStore(filePath, { logger = console } = {}) {
  let entries = null; // 메모리 사본 (처음 접근할 때 파일에서 읽음)
  let loading = null;
  let queue = Promise.resolve(); // 쓰기 직렬화용

  async function load() {
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    try {
      const data = JSON.parse(raw);
      const list = Array.isArray(data) ? data : data?.entries;
      if (!Array.isArray(list)) throw new Error("entries is not an array");
      const valid = list.filter(isEntry);
      if (valid.length !== list.length) logger.warn(`[store] skipped ${list.length - valid.length} invalid entries`);
      return valid;
    } catch (err) {
      const backup = `${filePath}.corrupt-${Date.now()}.bak`;
      await rename(filePath, backup).catch(() => {});
      logger.warn(`[store] data file is corrupted (${err.message}); moved to ${backup} and started with an empty list`);
      return [];
    }
  }

  async function ensureLoaded() {
    if (entries) return entries;
    loading ??= load().then((list) => (entries = list)).finally(() => (loading = null));
    return loading;
  }

  async function persist(next) {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify({ version: 1, entries: next }, null, 2), "utf8");
      await rename(tmp, filePath);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  // mutate(복사본) → { changed, result }. 바뀐 경우에만 저장하고, 저장에 성공했을 때만 메모리에 반영한다
  function write(mutate) {
    const task = queue.then(async () => {
      const current = await ensureLoaded();
      const next = [...current];
      const { changed, result } = mutate(next);
      if (!changed) return result;
      await persist(next);
      entries = next;
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }

  return {
    // 최신순
    async list() {
      const current = await ensureLoaded();
      return [...current].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    },
    add(entry) {
      return write((list) => {
        list.push(entry);
        return { changed: true, result: entry };
      });
    },
    // 지웠으면 true, 없으면 false
    remove(id) {
      return write((list) => {
        const index = list.findIndex((e) => e.id === id);
        if (index === -1) return { changed: false, result: false };
        list.splice(index, 1);
        return { changed: true, result: true };
      });
    },
  };
}
