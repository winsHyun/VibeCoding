-- 작성일시: 2026-11-03 11:40
-- M1: 빵집·코스 테이블과 읽기 전용 RLS 정책

create table public.bakeries (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  brand text,                         -- 같은 상호의 지점 묶음 (예: 성심당, 몽심)
  district text not null check (district in ('중구', '동구', '서구', '유성구', '대덕구')),
  address text not null,
  lat double precision,               -- 카카오 장소 검색으로 채움 (tools/geocode.html)
  lng double precision,
  kakao_place_id text,
  hours_text text,                    -- 출처마다 표기가 달라 1차는 글로 보관
  closed_text text,
  signature_menus text[] not null default '{}',
  description text,
  tips text,
  source_url text,                    -- 정보 출처
  checked_at date,                    -- 출처를 확인한 날짜
  created_at timestamptz not null default now()
);

create table public.courses (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  summary text not null,
  duration_text text not null,
  transport text not null check (transport in ('도보', '대중교통', '차량')),
  start_point text not null,
  tips text,
  sort_order int not null default 0
);

create table public.course_stops (
  course_id bigint not null references public.courses (id) on delete cascade,
  seq int not null,
  bakery_id bigint not null references public.bakeries (id),
  move_min int,                       -- 이전 지점에서 이동 시간(분). 좌표가 채워지면 계산
  note text,
  primary key (course_id, seq)
);

create index course_stops_bakery_id_idx on public.course_stops (bakery_id);

alter table public.bakeries enable row level security;
alter table public.courses enable row level security;
alter table public.course_stops enable row level security;

-- 누구나 읽기만 가능 (쓰기는 마이그레이션·SQL로만)
create policy "bakeries are readable" on public.bakeries for select to anon, authenticated using (true);
create policy "courses are readable" on public.courses for select to anon, authenticated using (true);
create policy "course stops are readable" on public.course_stops for select to anon, authenticated using (true);
