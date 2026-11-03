-- 작성일시: 2026-11-03 15:40
-- M2·M3: 현장 상황 제보·신고
-- 로그인 없이 기기 ID(브라우저 저장 UUID)와 IP의 해시로 도배·중복 신고를 막음. 좌표·원본 IP는 저장하지 않음

create extension if not exists pgcrypto with schema extensions;

create table public.reports (
  id bigint generated always as identity primary key,
  bakery_id bigint not null references public.bakeries (id) on delete cascade,
  wait_level text not null check (wait_level in ('none', 'short', 'medium', 'long')),
  queue_count int check (queue_count between 0 and 300),
  sold_out text[] not null default '{}',
  memo text check (char_length(memo) <= 140),
  distance_m int not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reports_bakery_created_idx on public.reports (bakery_id, created_at desc);
create index reports_created_idx on public.reports (created_at desc);

-- 작성자 식별 해시는 공개 테이블과 분리 (누구도 직접 읽지 못함)
create table public.report_authors (
  report_id bigint primary key references public.reports (id) on delete cascade,
  device_hash text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index report_authors_device_idx on public.report_authors (device_hash, created_at desc);
create index report_authors_ip_idx on public.report_authors (ip_hash, created_at desc);

create table public.report_flags (
  report_id bigint not null references public.reports (id) on delete cascade,
  device_hash text not null,
  reason text not null check (reason in ('false_info', 'inappropriate', 'ad')),
  created_at timestamptz not null default now(),
  primary key (report_id, device_hash)
);

alter table public.reports enable row level security;
alter table public.report_authors enable row level security;
alter table public.report_flags enable row level security;

-- 숨기지 않은 최근 24시간 제보만 읽기 가능. 쓰기 정책은 없음(RPC만 가능)
create policy "recent visible reports are readable" on public.reports
  for select to anon, authenticated
  using (hidden = false and created_at > now() - interval '24 hours');

-- 요청한 쪽 IP의 해시 (PostgREST가 넘기는 헤더, 없으면 null)
create or replace function public.request_ip_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select encode(extensions.digest(ip, 'sha256'), 'hex')
  from (
    select nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '') as ip
  ) h
  where ip is not null;
$$;

create or replace function public.submit_report(
  p_bakery_slug text,
  p_wait_level text,
  p_queue_count int,
  p_sold_out text[],
  p_memo text,
  p_lat double precision,
  p_lng double precision,
  p_device text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bakery public.bakeries%rowtype;
  v_distance double precision;
  v_device_hash text;
  v_ip_hash text := public.request_ip_hash();
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_sold_out text[];
  v_id bigint;
begin
  if p_device is null or char_length(p_device) not between 16 and 64 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_wait_level not in ('none', 'short', 'medium', 'long') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_queue_count is not null and p_queue_count not between 0 and 300 then
    raise exception 'INVALID_INPUT';
  end if;
  if v_memo is not null and (char_length(v_memo) > 140 or v_memo ~* '(https?://|www\.|\.(com|net|kr|co)\b|open\.kakao)') then
    raise exception 'INVALID_MEMO';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'NO_LOCATION';
  end if;

  select * into v_bakery from public.bakeries where slug = p_bakery_slug;
  if not found or v_bakery.lat is null then
    raise exception 'NOT_FOUND';
  end if;

  -- 품절 메뉴는 그 빵집 대표 메뉴 안에서만 (최대 6개)
  select coalesce(array_agg(distinct m), '{}') into v_sold_out
  from unnest(coalesce(p_sold_out, '{}')) m
  where m = any(v_bakery.signature_menus);
  if cardinality(v_sold_out) > 6 then
    raise exception 'INVALID_INPUT';
  end if;

  v_distance := 2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat - v_bakery.lat) / 2), 2) +
    cos(radians(v_bakery.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_bakery.lng) / 2), 2)
  ));
  if v_distance > 300 then
    raise exception 'TOO_FAR:%', round(v_distance)::int;
  end if;

  v_device_hash := encode(extensions.digest(p_device, 'sha256'), 'hex');

  -- 같은 빵집 10분에 1건, 전체 1시간에 10건 (기기 또는 IP 기준)
  if exists (
    select 1 from public.report_authors a join public.reports r on r.id = a.report_id
    where r.bakery_id = v_bakery.id and r.created_at > now() - interval '10 minutes'
      and (a.device_hash = v_device_hash or (v_ip_hash is not null and a.ip_hash = v_ip_hash))
  ) then
    raise exception 'RATE_LIMITED';
  end if;
  if (
    select count(*) from public.report_authors a
    where a.created_at > now() - interval '1 hour'
      and (a.device_hash = v_device_hash or (v_ip_hash is not null and a.ip_hash = v_ip_hash))
  ) >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.reports (bakery_id, wait_level, queue_count, sold_out, memo, distance_m)
  values (v_bakery.id, p_wait_level, p_queue_count, v_sold_out, v_memo, round(v_distance)::int)
  returning id into v_id;

  insert into public.report_authors (report_id, device_hash, ip_hash)
  values (v_id, v_device_hash, v_ip_hash);

  return v_id;
end;
$$;

create or replace function public.flag_report(p_report_id bigint, p_reason text, p_device text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_hash text;
  v_count int;
begin
  if p_device is null or char_length(p_device) not between 16 and 64
     or p_reason not in ('false_info', 'inappropriate', 'ad') then
    raise exception 'INVALID_INPUT';
  end if;
  if not exists (select 1 from public.reports where id = p_report_id and hidden = false) then
    raise exception 'NOT_FOUND';
  end if;
  v_device_hash := encode(extensions.digest(p_device, 'sha256'), 'hex');
  if exists (select 1 from public.report_authors where report_id = p_report_id and device_hash = v_device_hash) then
    raise exception 'OWN_REPORT';
  end if;

  insert into public.report_flags (report_id, device_hash, reason)
  values (p_report_id, v_device_hash, p_reason)
  on conflict do nothing;

  select count(*) into v_count from public.report_flags where report_id = p_report_id;
  if v_count >= 3 then
    update public.reports set hidden = true where id = p_report_id;
    return 'HIDDEN';
  end if;
  return 'FLAGGED';
end;
$$;

revoke all on function public.submit_report(text, text, int, text[], text, double precision, double precision, text) from public;
revoke all on function public.flag_report(bigint, text, text) from public;
revoke all on function public.request_ip_hash() from public, anon, authenticated;
grant execute on function public.submit_report(text, text, int, text[], text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.flag_report(bigint, text, text) to anon, authenticated;

-- 새 제보를 화면에 실시간으로 보냄
alter publication supabase_realtime add table public.reports;
