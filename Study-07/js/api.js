// 작성일시: 2026-11-03 12:00
// Supabase 읽기 함수 (빵집·코스는 자주 바뀌지 않아 한 번 불러온 뒤 메모리에 보관)

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BAKERY_COLUMNS =
  "id, slug, name, brand, district, address, lat, lng, kakao_place_id, hours_text, closed_text, signature_menus, description, tips, source_url, checked_at, tags, image_url, photo_thumb_url, photo_doc_url, photo_site, photos";

let bakeriesPromise = null;
let coursesPromise = null;

export function fetchBakeries() {
  bakeriesPromise ??= db
    .from("bakeries")
    .select(BAKERY_COLUMNS)
    .order("name")
    .then(({ data, error }) => {
      if (error) {
        bakeriesPromise = null;
        throw error;
      }
      // 성심당 → 시민추천 BEST5 → 대전시·언론 소개 → 나머지 순, 같은 순위는 이름순
      const featured = (b) =>
        b.brand === "성심당" ? 0 : b.tags.includes("시민추천 BEST5") ? 1 : b.tags.includes("시민추천") ? 3 : 2;
      return data.sort((a, b) => featured(a) - featured(b) || a.name.localeCompare(b.name, "ko"));
    });
  return bakeriesPromise;
}

// ---------- 현장 상황 제보 ----------

// 최근 24시간 제보 (RLS가 숨김·오래된 제보를 걸러 줌), 최신순
export async function fetchRecentReports() {
  const { data, error } = await db
    .from("reports")
    .select("id, bakery_id, wait_level, queue_count, sold_out, memo, distance_m, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data;
}

// RPC 오류 메시지(TOO_FAR:1234 등)를 코드와 값으로 나눔
function rpcError(error) {
  const [code, value] = (error.message ?? "").split(":");
  const err = new Error(code || "UNKNOWN");
  err.code = code || "UNKNOWN";
  err.value = value ? Number(value) : null;
  return err;
}

export async function submitReport({ slug, waitLevel, queueCount, soldOut, memo, lat, lng, device }) {
  const { data, error } = await db.rpc("submit_report", {
    p_bakery_slug: slug,
    p_wait_level: waitLevel,
    p_queue_count: queueCount,
    p_sold_out: soldOut,
    p_memo: memo,
    p_lat: lat,
    p_lng: lng,
    p_device: device,
  });
  if (error) throw rpcError(error);
  return data;
}

export async function flagReport(reportId, reason, device) {
  const { data, error } = await db.rpc("flag_report", { p_report_id: reportId, p_reason: reason, p_device: device });
  if (error) throw rpcError(error);
  return data;
}

// 상세 화면 조회 기록 (기기당 하루 1회만 셈, 실패해도 화면에는 영향 없음)
export function recordView(slug, device) {
  db.rpc("record_view", { p_bakery_slug: slug, p_device: device }).then(({ error }) => {
    if (error) console.warn(error);
  });
}

// 요즘 핫한 빵집: [{ bakery_id, views_7d, reports_7d, score }]
export async function fetchHotBakeries(limit = 10) {
  const { data, error } = await db.rpc("hot_bakeries", { p_limit: limit });
  if (error) throw error;
  return data;
}

// 새 제보 실시간 구독. onStatus로 연결 상태(SUBSCRIBED, CHANNEL_ERROR 등)를 알려 줌
export function subscribeReports(onInsert, onStatus) {
  return db
    .channel("reports-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, (payload) => onInsert(payload.new))
    .subscribe((status) => onStatus?.(status));
}

// 코스와 경유지를 함께 불러와 경유지를 순서대로 정렬
export function fetchCourses() {
  coursesPromise ??= db
    .from("courses")
    .select("id, slug, title, summary, duration_text, transport, start_point, tips, sort_order, course_stops(seq, bakery_id, move_min, note)")
    .order("sort_order")
    .then(({ data, error }) => {
      if (error) {
        coursesPromise = null;
        throw error;
      }
      data.forEach((course) => course.course_stops.sort((a, b) => a.seq - b.seq));
      return data;
    });
  return coursesPromise;
}
