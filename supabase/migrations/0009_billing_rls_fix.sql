-- 0009_billing_rls_fix.sql — billing_line_items RLS 循環参照修正
--
-- 問題: billing_line_items のポリシーが billing_statements を EXISTS で参照するとき、
--       PostgreSQL が billing_statements の RLS を再評価 → infinite recursion が発生。
-- 原因: ローカルテストは service_role（RLS バイパス）だったため検出されなかった。
-- 修正: security definer 関数でラップし、RLS の再帰評価を回避する。

create or replace function check_billing_line_item_access(p_statement_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from billing_statements s
    where s.id = p_statement_id
      and (
        current_shipper_id() is null
        or s.shipper_id = current_shipper_id()
      )
  )
$$;

-- billing_line_items の既存ポリシーを差し替え
drop policy if exists billing_line_items_auth_select on billing_line_items;
drop policy if exists billing_line_items_auth_insert on billing_line_items;
drop policy if exists billing_line_items_auth_delete on billing_line_items;

create policy billing_line_items_auth_select on billing_line_items
  for select to authenticated
  using (check_billing_line_item_access(statement_id));

create policy billing_line_items_auth_insert on billing_line_items
  for insert to authenticated
  with check (check_billing_line_item_access(statement_id));

create policy billing_line_items_auth_delete on billing_line_items
  for delete to authenticated
  using (check_billing_line_item_access(statement_id));
