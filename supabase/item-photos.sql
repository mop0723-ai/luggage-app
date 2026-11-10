-- ============================================================
-- 行李規劃 app：物品照片空間 item-photos（整段複製，貼到 SQL Editor 執行一次）
-- 重複執行也沒關係，不會刪掉任何照片。
-- ============================================================

-- 1. 私人的照片空間（不公開；單張上限 5 MB，只收圖片）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

-- 2. 安全規則：每個人只能讀取、上傳、修改、刪除「自己 user_id 資料夾」裡的照片
drop policy if exists "item photos select own" on storage.objects;
drop policy if exists "item photos insert own" on storage.objects;
drop policy if exists "item photos update own" on storage.objects;
drop policy if exists "item photos delete own" on storage.objects;

create policy "item photos select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "item photos insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "item photos update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "item photos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
