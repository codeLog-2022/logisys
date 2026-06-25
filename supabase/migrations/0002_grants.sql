-- 0002_grants.sql — PostgREST ロール権限付与（GRANT のみ。RLS は認証配線時に追加）
-- 背景: 0001 の DDL は anon / authenticated に SELECT/INSERT/UPDATE/DELETE を付与していないため、
--       supabase-js（REST）経由の読み書きが permission denied で失敗する。
--       MVP 段階では認証未配線のため RLS は張らず、GRANT のみで CRUD を可能にする。
--       認証配線時に RLS ポリシーを追加し、テナント分離を担保する（将来対応）。

-- 業務テーブル4種: SELECT / INSERT / UPDATE / DELETE
grant select, insert, update, delete on table shippers to anon, authenticated;
grant select, insert, update, delete on table products to anon, authenticated;
grant select, insert, update, delete on table locations to anon, authenticated;
grant select, insert, update, delete on table inventory_transactions to anon, authenticated;

-- 導出在庫 VIEW: 参照のみ
grant select on table inventory_current to anon, authenticated;
