-- 작성일시: 2026-11-03 14:00
-- 출처 표시(tags)와 대표 사진(image_url) 열 추가

alter table public.bakeries
  add column tags text[] not null default '{}',
  add column image_url text;  -- 직접 찍었거나 사용 허락을 받은 사진만. 비어 있으면 화면이 메뉴 일러스트를 그림

comment on column public.bakeries.tags is '출처 표시: 시민추천, 시민추천 BEST5, 대전시 소개, 언론·리뷰 소개';

-- 기존 30곳의 출처 표시
update public.bakeries set tags = array['시민추천 BEST5']
  where slug in ('sungsimdang-main', 'bbang-hanmogeum', 'yeoniga-bakeshop', 'harehare-dunsan', 'dasori');
update public.bakeries set tags = array['대전시 소개']
  where slug in ('jeongdong-munhwasa', 'cafe-jini', 'sujebbang-lab', 'cold-butter-bakeshop', 'daejeon-salad',
                 'mongsim-junggyo', 'mongsim-hannam', 'mongsim-doan', 'myeonggine', 'eco-bread-house');
update public.bakeries set tags = array['언론·리뷰 소개'] where tags = '{}';

-- 시민추천 목록의 궁동점과 묶기 위해 브랜드 지정
update public.bakeries set brand = '파티세리 소신' where slug = 'patisserie-sosin';
