-- 작성일시: 2026-11-03 13:00
-- 좌표로 이동 시간을 계산해 보니 동선이 맞지 않는 코스 정리

-- 갈마동 도보 코스: 정인구팥빵 용문점은 도보 약 46분이라 제외
delete from public.course_stops
where course_id = (select id from public.courses where slug = 'galma-salt-bread') and seq = 4;

-- 유성 차량 코스: 북쪽(관평) → DCC → 봉명 → 노은 → 지족 순으로 재배열
update public.courses set start_point = '슬로우브레드 관평점' where slug = 'yuseong-drive';
update public.course_stops s set seq = -n.seq
from (values ('slow-bread-gwanpyeong', 1), ('green-bakery', 2), ('sungsimdang-dcc', 3), ('harupang', 4),
             ('sujebbang-lab', 5), ('daejeon-salad', 6), ('coudebien', 7)) as n(slug, seq)
join public.bakeries b on b.slug = n.slug
where s.course_id = (select id from public.courses where slug = 'yuseong-drive') and s.bakery_id = b.id;
update public.course_stops set seq = -seq
where course_id = (select id from public.courses where slug = 'yuseong-drive');

-- 이동 시간 다시 계산 (003과 같은 식)
update public.course_stops set move_min = null;
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
