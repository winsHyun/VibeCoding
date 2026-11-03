-- 작성일시: 2026-11-03 16:20
-- 요즘 핫한 빵집: 최근 7일 상세 조회 수(기기당 하루 1회) + 현장 제보 수로 순위

create table public.bakery_views (
  bakery_id bigint not null references public.bakeries (id) on delete cascade,
  device_hash text not null,
  viewed_on date not null default (now() at time zone 'Asia/Seoul')::date,
  primary key (bakery_id, device_hash, viewed_on)
);
create index bakery_views_day_idx on public.bakery_views (viewed_on);

-- 정책 없음: 직접 읽기·쓰기 불가, 아래 함수로만 사용
alter table public.bakery_views enable row level security;

create or replace function public.record_view(p_bakery_slug text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_device is null or char_length(p_device) not between 16 and 64 then
    return;
  end if;
  insert into public.bakery_views (bakery_id, device_hash)
  select id, encode(extensions.digest(p_device, 'sha256'), 'hex')
  from public.bakeries where slug = p_bakery_slug
  on conflict do nothing;
end;
$$;

-- 집계 결과만 공개 (기기 해시는 내보내지 않음). 제보 1건은 조회 3회로 침
create or replace function public.hot_bakeries(p_limit int default 10)
returns table (bakery_id bigint, views_7d bigint, reports_7d bigint, score bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select bakery_id, count(*) as n from public.bakery_views
    where viewed_on > (now() at time zone 'Asia/Seoul')::date - 7
    group by bakery_id
  ), r as (
    select bakery_id, count(*) as n from public.reports
    where hidden = false and created_at > now() - interval '7 days'
    group by bakery_id
  )
  select coalesce(v.bakery_id, r.bakery_id),
         coalesce(v.n, 0), coalesce(r.n, 0),
         coalesce(v.n, 0) + coalesce(r.n, 0) * 3 as score
  from v full join r on r.bakery_id = v.bakery_id
  order by score desc, 1
  limit least(greatest(p_limit, 1), 30);
$$;

revoke all on function public.record_view(text, text) from public;
revoke all on function public.hot_bakeries(int) from public;
grant execute on function public.record_view(text, text) to anon, authenticated;
grant execute on function public.hot_bakeries(int) to anon, authenticated;
