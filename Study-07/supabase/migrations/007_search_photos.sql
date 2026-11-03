-- 작성일시: 2026-11-03 15:10
-- 카카오 이미지 검색 API 결과(썸네일 + 원본 글 출처) 저장 칸
-- image_url(직접 찍었거나 허락받은 사진)이 있으면 그것을 먼저 쓰고, 없으면 검색 결과 사진, 그것도 없으면 일러스트

alter table public.bakeries
  add column photo_thumb_url text,
  add column photo_doc_url text,
  add column photo_site text;

comment on column public.bakeries.photo_thumb_url is '카카오 이미지 검색 API 썸네일 (검색 결과로 표시, 원본은 photo_doc_url)';
comment on column public.bakeries.photo_doc_url is '검색 결과 사진이 실린 원본 글 주소';
comment on column public.bakeries.photo_site is '원본 글 사이트 이름 (출처 표시용)';

-- 상세 화면용 검색 결과 사진 여러 장 (최대 4장). photo_* 칸은 첫 번째 사진과 같음
alter table public.bakeries add column photos jsonb not null default '[]'::jsonb;
comment on column public.bakeries.photos is '카카오 이미지 검색 결과 최대 4장 [{thumb, doc, site}] (130x130 썸네일, 원본 글 출처)';
