-- 작성일시: 2026-11-03 12:50
-- 카카오 장소 검색(tools/geocode.html + 수동 확인)으로 찾은 좌표·장소 id 반영, 코스 이동 시간 추정

update public.bakeries set lat = 36.3275110291498, lng = 127.42680306279986, kakao_place_id = '1834095519', address = '대전 중구 대종로 480' where slug = 'sungsimdang-cake-boutique';
update public.bakeries set lat = 36.34027840299744, lng = 127.39002744810387, kakao_place_id = '1513470800' where slug = 'sungsimdang-lotte';
update public.bakeries set lat = 36.3258423325237, lng = 127.423429522778, kakao_place_id = '673022665' where slug = 'cold-butter-bakeshop';
update public.bakeries set lat = 36.3275353130851, lng = 127.423777249915, kakao_place_id = '370240239' where slug = 'pie-garden';
update public.bakeries set lat = 36.3262624369902, lng = 127.418781024901, kakao_place_id = '1221858321' where slug = 'dasori';
update public.bakeries set lat = 36.3083985056886, lng = 127.44226693545, kakao_place_id = '1894389440' where slug = 'myeonggine';
update public.bakeries set lat = 36.3277152543658, lng = 127.435640356106, kakao_place_id = '1846629815' where slug = 'jeongdong-munhwasa';
update public.bakeries set lat = 36.33865337670698, lng = 127.44912445756594, kakao_place_id = '428067792' where slug = 'bbang-hanmogeum';
update public.bakeries set lat = 36.3514287412284, lng = 127.394936975138, kakao_place_id = '10093756' where slug = 'harehare-dunsan';
update public.bakeries set lat = 36.3488220258716, lng = 127.370041212749, kakao_place_id = '117257942' where slug = 'cafe-jini';
update public.bakeries set lat = 36.35247730918036, lng = 127.37319126380761, kakao_place_id = '535720711' where slug = 'mimi-bakery';
update public.bakeries set lat = 36.3363900646359, lng = 127.395167349194, kakao_place_id = '11040780' where slug = 'jeongingu-yongmun';
update public.bakeries set lat = 36.4241170709855, lng = 127.389434957784, kakao_place_id = '68011732' where slug = 'slow-bread-gwanpyeong';
update public.bakeries set lat = 36.42775712201993, lng = 127.38963378982153, kakao_place_id = '907048988' where slug = 'green-bakery';
update public.bakeries set lat = 36.359335176028985, lng = 127.34471700635453, kakao_place_id = '2059217223' where slug = 'harupang';
update public.bakeries set lat = 36.34372341280587, lng = 127.34119051081318, kakao_place_id = '442959515' where slug = 'sujebbang-lab';
update public.bakeries set lat = 36.375102862995256, lng = 127.31880903119561, kakao_place_id = '1070354318' where slug = 'daejeon-salad';
update public.bakeries set lat = 36.386762521068, lng = 127.3087487122597, kakao_place_id = '27558110' where slug = 'coudebien';
update public.bakeries set lat = 36.3544217987096, lng = 127.449685169432, kakao_place_id = '8112636' where slug = 'eco-bread-house';
update public.bakeries set lat = 36.36582558026842, lng = 127.43843442745863, kakao_place_id = '27493876' where slug = 'orange-blossom';
update public.bakeries set lat = 36.3666500794301, lng = 127.43722450439424, kakao_place_id = '27503927' where slug = 'boboro-bakery';
update public.bakeries set lat = 36.32774375491543, lng = 127.42724536162811, kakao_place_id = '17733090' where slug = 'sungsimdang-main';
update public.bakeries set lat = 36.375314602374466, lng = 127.39238984121546, kakao_place_id = '1148545656' where slug = 'sungsimdang-dcc';
update public.bakeries set lat = 36.332217306511836, lng = 127.4337196562067, kakao_place_id = '21537026' where slug = 'sungsimdang-station';
update public.bakeries set lat = 36.3526958772463, lng = 127.373036337419, kakao_place_id = '1897624319' where slug = 'planet-egg-tart';

-- 수동 확인 (카카오 등록 이름이 달라 자동 검색에서 빠진 곳)
update public.bakeries set lat = 36.35185387463499, lng = 127.42494731342249, kakao_place_id = '843666963' where slug = 'mongsim-hannam';
update public.bakeries set lat = 36.32511642126199, lng = 127.42356035003742, kakao_place_id = '1719408011', name = '몽심 대흥점' where slug = 'mongsim-junggyo';
update public.bakeries set lat = 36.3260219650647, lng = 127.345131519131, kakao_place_id = '209938289' where slug = 'mongsim-doan';
update public.bakeries set lat = 36.3498741625644, lng = 127.397128213832, kakao_place_id = '1625271152' where slug = 'yeoniga-bakeshop';
-- 처음 출처(중앙로 124)는 파이가든과 호수까지 겹쳐 카카오 장소 정보로 바로잡음
update public.bakeries set lat = 36.3251564664812, lng = 127.422940250064, kakao_place_id = '849071034',
  name = '파티세리 소신 대흥점', address = '대전 중구 중교로 27-2', source_url = 'https://place.map.kakao.com/849071034'
  where slug = 'patisserie-sosin';

-- 코스 이동 시간 추정: 직선거리 × 1.3(도로 보정)을 이동 수단별 속도로 나눔
-- 도보 75m/분, 차량 400m/분 + 주차 3분, 대중교통은 1km 이하면 도보, 넘으면 300m/분 + 대기 10분
with legs as (
  select s.course_id, s.seq, c.transport,
    1.3 * 2 * 6371000 * asin(sqrt(
      power(sin(radians(cur.lat - prev.lat) / 2), 2) +
      cos(radians(prev.lat)) * cos(radians(cur.lat)) * power(sin(radians(cur.lng - prev.lng) / 2), 2)
    )) as meters
  from public.course_stops s
  join public.courses c on c.id = s.course_id
  join public.course_stops p on p.course_id = s.course_id and p.seq = s.seq - 1
  join public.bakeries cur on cur.id = s.bakery_id
  join public.bakeries prev on prev.id = p.bakery_id
)
update public.course_stops s
set move_min = greatest(1, ceil(case
  when legs.transport = '도보' then legs.meters / 75
  when legs.transport = '차량' then legs.meters / 400 + 3
  when legs.meters <= 1000 then legs.meters / 75
  else legs.meters / 300 + 10
end))::int
from legs
where s.course_id = legs.course_id and s.seq = legs.seq;
