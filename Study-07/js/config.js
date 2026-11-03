// 작성일시: 2026-11-03 12:00

// Supabase 프로젝트 정보 (publishable 키는 브라우저 공개용이며, 접근 권한은 RLS 정책으로 제어)
export const SUPABASE_URL = "https://txjsdtqzqbftyasbcksa.supabase.co";
export const SUPABASE_KEY = "sb_publishable_KYpi1g8cG_1Z8-r23pFfyw_ciAIbqcY";

// 카카오 개발자 콘솔의 JavaScript 키 (브라우저 공개용, 콘솔에 등록한 도메인에서만 동작)
// 비어 있으면 지도 대신 "카카오맵에서 보기" 링크만 보여 줌
export const KAKAO_JS_KEY = "c9b2393ce3cfa92990e3dba4c40fe393";

// 구별 캐릭터 이미지. 꿈돌이·꿈씨패밀리는 대전관광공사가 지식재산권을 가지고 있어
// 사용 승인을 받은 뒤에만 파일을 assets/characters/에 넣고 경로를 적음 (null이면 자체 빵 캐릭터 사용)
export const CHARACTER_IMAGES = {
  동구: null,
  중구: null,
  서구: null,
  유성구: null,
  대덕구: null,
};
