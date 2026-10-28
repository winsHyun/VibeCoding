// 작성일시: 2026-10-27 15:28
// 저장소 테스트: 최신순 목록, 삭제, 동시 쓰기 직렬화, 손상 파일 복구 (임시 폴더 사용)
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createStore } from "../src/store.js";

let dir;
before(async () => (dir = await mkdtemp(join(tmpdir(), "diary-store-"))));
after(async () => rm(dir, { recursive: true, force: true }));

const quiet = { warn() {}, log() {}, error() {} };
const entry = (id, createdAt) => ({ id, text: `t-${id}`, createdAt, emotion: {}, empathy: "", comfort: "", model: "m" });

describe("store", () => {
  test("파일이 없으면 빈 목록, 추가 후 최신순, 다시 열어도 유지", async () => {
    const file = join(dir, "a", "entries.json");
    const store = createStore(file, { logger: quiet });
    assert.deepEqual(await store.list(), []);
    await store.add(entry("1", "2026-10-27T01:00:00.000Z"));
    await store.add(entry("2", "2026-10-27T03:00:00.000Z"));
    await store.add(entry("3", "2026-10-27T02:00:00.000Z"));
    assert.deepEqual((await store.list()).map((e) => e.id), ["2", "3", "1"]);
    const reopened = createStore(file, { logger: quiet });
    assert.deepEqual((await reopened.list()).map((e) => e.id), ["2", "3", "1"]);
    // 임시 파일이 남지 않는다
    assert.deepEqual(await readdir(join(dir, "a")), ["entries.json"]);
  });

  test("삭제: 있으면 true, 없으면 false", async () => {
    const store = createStore(join(dir, "b.json"), { logger: quiet });
    await store.add(entry("x", "2026-10-27T01:00:00.000Z"));
    assert.equal(await store.remove("nope"), false);
    assert.equal(await store.remove("x"), true);
    assert.equal(await store.remove("x"), false);
    assert.deepEqual(await store.list(), []);
  });

  test("동시 쓰기를 순서대로 처리해 하나도 잃지 않는다", async () => {
    const file = join(dir, "c.json");
    const store = createStore(file, { logger: quiet });
    await Promise.all(Array.from({ length: 30 }, (_, i) => store.add(entry(String(i), new Date(2026, 0, 1, 0, i).toISOString()))));
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.entries.length, 30);
    assert.equal((await createStore(file, { logger: quiet }).list()).length, 30);
  });

  for (const [name, content] of [
    ["JSON 문법 오류", "{ broken"],
    ["entries가 배열이 아님", '{"entries": 5}'],
  ]) {
    test(`손상 파일(${name})은 백업 후 빈 목록으로 시작하고 계속 쓸 수 있다`, async () => {
      const sub = join(dir, `corrupt-${name.length}`);
      const file = join(sub, "entries.json");
      await rm(sub, { recursive: true, force: true });
      await import("node:fs/promises").then((fs) => fs.mkdir(sub, { recursive: true }));
      await writeFile(file, content);
      const warnings = [];
      const store = createStore(file, { logger: { ...quiet, warn: (m) => warnings.push(m) } });
      assert.deepEqual(await store.list(), []);
      assert.equal(warnings.length, 1);
      const files = await readdir(sub);
      const backup = files.find((f) => f.includes(".corrupt-"));
      assert.ok(backup, files.join(","));
      assert.equal(await readFile(join(sub, backup), "utf8"), content);
      await store.add(entry("n", "2026-10-27T01:00:00.000Z"));
      assert.equal(JSON.parse(await readFile(file, "utf8")).entries.length, 1);
    });
  }

  test("깨진 항목만 걸러내고 나머지는 읽는다", async () => {
    const file = join(dir, "d.json");
    await writeFile(file, JSON.stringify({ version: 1, entries: [entry("ok", "2026-10-27T01:00:00.000Z"), null, { id: 1 }, "x"] }));
    const store = createStore(file, { logger: quiet });
    assert.deepEqual((await store.list()).map((e) => e.id), ["ok"]);
  });
});
