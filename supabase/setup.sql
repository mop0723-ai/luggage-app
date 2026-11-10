-- ============================================================
-- 行李規劃 app：Supabase 設定（整段複製，貼到 SQL Editor 執行一次）
-- 重複執行也沒關係，不會刪掉已存的資料。
-- ============================================================

-- 1. 資料表：每個帳號一筆，存整份資料（物品、衣櫃、家、行李、旅程）
create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- 開啟 Row Level Security：每個人只能看到、修改自己的那一筆
alter table public.app_state enable row level security;

grant select, insert, update, delete on public.app_state to authenticated;

drop policy if exists "own state select" on public.app_state;
drop policy if exists "own state insert" on public.app_state;
drop policy if exists "own state update" on public.app_state;
drop policy if exists "own state delete" on public.app_state;

create policy "own state select" on public.app_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state insert" on public.app_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state update" on public.app_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own state delete" on public.app_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2. 照片（上一版）：私人的 photos 空間。新版改用 item-photos（見 item-photos.sql），
--    app 會自動把這裡的照片搬過去，所以這段規則先保留，讓搬家時讀得到、刪得掉舊照片。
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos select" on storage.objects;
drop policy if exists "own photos insert" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;

create policy "own photos select" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. 新版照片空間 item-photos：請另外執行 supabase/item-photos.sql
