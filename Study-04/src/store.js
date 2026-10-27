// 작성일시: 2026-10-26 15:35
// 3단계 사용자 데이터 저장소: data/user/db.json 하나에 프로필과 저장 레시피를 둔다
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PATH = fileURLToPath(new URL("../data/user/db.json", import.meta.url));
const EMPTY_DB = () => ({ profiles: [], savedRecipes: [] });

let dbPath = DEFAULT_PATH;
let db = null;
let queue = Promise.resolve();

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// db.json 구조 검사: { profiles: 객체 배열, savedRecipes: 객체 배열 }. 문제없으면 null
function findDbShapeError(data) {
  if (!isRecord(data)) return "최상위 값이 객체가 아닙니다";
  for (const field of ["profiles", "savedRecipes"]) {
    if (!Array.isArray(data[field])) return `${field}가 배열이 아닙니다`;
    if (!data[field].every(isRecord)) return `${field}에 객체가 아닌 항목이 있습니다`;
  }
  return null;
}

// path는 테스트에서 임시 파일을 쓰기 위한 인자
export async function openStore(path = DEFAULT_PATH) {
  dbPath = path;
  await mkdir(dirname(dbPath), { recursive: true });
  let loaded;
  try {
    loaded = JSON.parse(await readFile(dbPath, "utf8"));
  } catch (err) {
    // 파일이 없으면 새로 시작. 파일이 깨졌으면 덮어쓰지 않도록 서버 시작을 멈춘다
    if (err.code !== "ENOENT") throw new Error(`사용자 데이터 파일을 읽을 수 없습니다 (${dbPath}): ${err.message}`);
    loaded = EMPTY_DB();
  }
  // JSON은 맞지만 구조가 다르면(배열이 아님 등) 다음 저장 때 데이터를 잃으므로 깨진 파일과 똑같이 멈춘다
  const problem = findDbShapeError(loaded);
  if (problem) throw new Error(`사용자 데이터 파일을 읽을 수 없습니다 (${dbPath}): ${problem}`);
  db = loaded;
  queue = Promise.resolve();
}

// 읽기 전용 스냅샷 (호출한 쪽에서 고치지 않는다)
export function readDb() {
  if (!db) throw new Error("store is not opened");
  return db;
}

// mutate(draft)는 복사본을 고치고 결과를 돌려준다. 예외가 나면 아무것도 저장되지 않는다.
// 쓰기는 하나씩 순서대로 처리하고, 임시 파일에 쓴 뒤 이름을 바꿔 저장 중 꺼져도 파일이 깨지지 않게 한다.
export function writeDb(mutate) {
  const run = queue.then(async () => {
    const draft = structuredClone(db);
    const result = mutate(draft);
    const tmpPath = `${dbPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(draft, null, 2));
    await rename(tmpPath, dbPath);
    db = draft;
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
