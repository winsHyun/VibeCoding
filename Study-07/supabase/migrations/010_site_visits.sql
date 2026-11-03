-- 작성일시: 2026-11-03 18:00
-- 사이트 방문자 수: 기기당 하루 1회(한국 시간 기준)만 셈. 누적·오늘·어제는 일별 집계표에서 계산
-- 현재 접속자는 DB를 쓰지 않고 Supabase Realtime Presence로 셈

-- 오늘 이미 센 기기인지 확인하는 용도. 어제 이전 행은 지워 기기 해시를 오래 보관하지 않음
create table public.site_visits (
  device_hash text not null,
  visited_on date not null default (now() at time zone 'Asia/Seoul')::date,
  primary key (visited_on, device_hash)
);

create table public.site_visit_daily (
  day date primary key,
  visitors int not null default 0
);

-- 정책 없음: 직접 읽기·쓰기 불가, 아래 함수로만 사용
alter table public.site_visits enable row level security;
alter table public.site_visit_daily enable row level security;

-- 방문 기록 후 집계를 돌려줌. p_device가 이상하면 기록 없이 집계만
create or replace function public.record_visit(p_device text)
returns table (total bigint, today bigint, yesterday bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_added int := 0;
begin
  if p_device is not null and char_length(p_device) between 16 and 64 then
    insert into public.site_visits (device_hash, visited_on)
    values (encode(extensions.digest(p_device, 'sha256'), 'hex'), v_today)
    on conflict do nothing;
    get diagnostics v_added = row_count;

    if v_added > 0 then
      insert into public.site_visit_daily (day, visitors) values (v_today, 1)
      on conflict (day) do update set visitors = public.site_visit_daily.visitors + 1;
      delete from public.site_visits where visited_on < v_today - 1;
    end if;
  end if;

  return query
  select coalesce(sum(d.visitors), 0)::bigint,
         coalesce(sum(d.visitors) filter (where d.day = v_today), 0)::bigint,
         coalesce(sum(d.visitors) filter (where d.day = v_today - 1), 0)::bigint
  from public.site_visit_daily d;
end;
$$;

revoke all on function public.record_visit(text) from public;
grant execute on function public.record_visit(text) to anon, authenticated;
