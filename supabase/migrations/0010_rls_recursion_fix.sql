-- 0010_rls_recursion_fix.sql — RLS infinite recursion 根本修正
--
-- 原因:
--   billing_statements のポリシーが users テーブルにインライン SELECT
--   → users_tenant ポリシーが評価される
--   → users_tenant ポリシー内でも users テーブルにインライン SELECT
--   → 無限ループ（infinite recursion detected in rules for relation "users"）
--
-- 修正方針:
--   users テーブルへのインライン SELECT を security definer 関数でラップする。
--   (1) current_user_row_id() 関数を追加（users.id を返す security definer 関数）
--   (2) users_tenant ポリシーを関数経由に差し替え
--   (3) billing_statements ポリシーを current_shipper_id() のみ使う形に差し替え

-- ============================================================
-- §1 current_user_row_id() — security definer 関数
--    users テーブルへのインライン SELECT を排除するためのラッパー
-- ============================================================
create or replace function current_user_row_id()
returns uuid
language sql
security definer
stable
as $$
  select id from users where auth_user_id = auth.uid()
$$;

-- ============================================================
-- §2 users_tenant ポリシーを差し替え
--    (select id from users ...) → current_user_row_id() で再帰を排除
-- ============================================================
drop policy if exists users_tenant on users;

create policy users_tenant on users
  for all to authenticated
  using (
    current_shipper_id() is null        -- admin/operator: 全ユーザー参照可
    or id = current_user_row_id()       -- shipper_user: 自分のみ
  )
  with check (
    current_shipper_id() is null
    or id = current_user_row_id()
  );

-- ============================================================
-- §3 billing_statements ポリシーを差し替え
--    インライン (select shipper_id from users ...) → current_shipper_id() に統一
-- ============================================================
drop policy if exists billing_statements_auth_select on billing_statements;
drop policy if exists billing_statements_auth_insert on billing_statements;
drop policy if exists billing_statements_auth_update on billing_statements;
drop policy if exists billing_statements_auth_delete on billing_statements;

create policy billing_statements_auth_select on billing_statements
  for select to authenticated
  using (current_shipper_id() is null or shipper_id = current_shipper_id());

create policy billing_statements_auth_insert on billing_statements
  for insert to authenticated
  with check (current_shipper_id() is null or shipper_id = current_shipper_id());

create policy billing_statements_auth_update on billing_statements
  for update to authenticated
  using (
    status = 'draft'
    and (current_shipper_id() is null or shipper_id = current_shipper_id())
  )
  with check (current_shipper_id() is null or shipper_id = current_shipper_id());

create policy billing_statements_auth_delete on billing_statements
  for delete to authenticated
  using (
    status = 'draft'
    and (current_shipper_id() is null or shipper_id = current_shipper_id())
  );
