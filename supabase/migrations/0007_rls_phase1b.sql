-- 0007_rls_phase1b.sql — Phase1-b: RLS 実効化
-- 設計: Phase1-DataModel-Design.md §5（RLS方針 Phase1-b）。
-- 依存: 0001-0006（0006 で anon_all ポリシー・RLS 有効化済み・users テーブル作成済み）。
--       PR#5 で Supabase Auth 配線済み = auth.uid() が使用可能。
--
-- 確定設計:
--   1. anon 全許可ポリシー（<table>_anon_all）の撤去 — 全対象テーブル
--   2. テナント解決関数 current_shipper_id() の作成
--      auth.uid() → users(auth_user_id) → users.shipper_id
--      admin/operator（shipper_id IS NULL）= 全データ参照可
--      shipper_user（shipper_id NOT NULL）= 自社のみ
--   3. 業務テーブル（shipper_id 列あり）: 0006 のテナント雛形を破棄し実効ポリシーへ差し替え
--   4. 横断テーブルのポリシー設計:
--      - roles, locations: authenticated なら全 SELECT 可
--      - users: admin（shipper_id IS NULL） = 全参照、shipper_user = 自分のレコードのみ
--      - inbound_plan_lines: 親 inbound_plans の shipper_id で解決（JOIN）
-- ============================================================

-- ============================================================
-- §0 service_role GRANT（テスト・管理ツール用）
-- 0002 以降の GRANT は anon/authenticated のみ。service_role には CRUD が付与されていないため
-- supabase-js の service_role クライアントから permission denied になる。
-- service_role は RLS をバイパスするため、テスト環境での CRUD 検証に使用する。
-- ============================================================

grant select, insert, update, delete on table
  shippers, products, locations, inventory_transactions,
  business_partners, rate_master, master_revisions, shipper_product_code_map,
  inbound_plans, inbound_plan_lines, inbound_inspections, putaway_recommendations,
  lots, roles, users, audit_logs
to service_role;

grant select on table inventory_current, inventory_current_v2, inventory_by_expiry to service_role;

-- ============================================================
-- §1 anon 全許可ポリシーの撤去
-- ============================================================

-- shipper_id 列を持つ業務テーブルの anon_all を撤去
do $$
declare t text;
begin
  foreach t in array array[
    'shippers',
    'products','inventory_transactions','business_partners','rate_master',
    'master_revisions','shipper_product_code_map','inbound_plans',
    'inbound_inspections','putaway_recommendations','lots','audit_logs'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
  end loop;
end $$;

-- shipper_id を持たない横断テーブルの anon_all を撤去
do $$
declare t text;
begin
  foreach t in array array['roles','locations','users','inbound_plan_lines'] loop
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
  end loop;
end $$;

-- ============================================================
-- §2 テナント解決関数
-- ============================================================

-- auth.uid() → users.shipper_id でテナント解決する補助関数。
-- admin/operator（shipper_id IS NULL）は NULL を返す → 全データ許可の判定に使用。
-- security definer で users テーブルを呼び出し元権限に依存せず参照できる。
create or replace function current_shipper_id() returns uuid as $$
  select shipper_id from users where auth_user_id = auth.uid()
$$ language sql security definer stable;

-- ============================================================
-- §3 業務テーブルの authenticated ポリシー差し替え
-- ============================================================

-- 0006 の tenant 雛形（current_setting('app.shipper_id') 方式）を撤去し、
-- auth.uid() 結合方式のポリシーへ差し替える。

-- shippers（自身の id = テナント境界）
drop policy if exists shippers_tenant on shippers;
create policy shippers_tenant on shippers to authenticated
  using (
    current_shipper_id() is null               -- admin/operator: 全参照
    or id = current_shipper_id()               -- shipper_user: 自社のみ
  )
  with check (
    current_shipper_id() is null
    or id = current_shipper_id()
  );

-- shipper_id 列を持つテーブル（一括）
do $$
declare t text;
begin
  foreach t in array array[
    'products','inventory_transactions','business_partners','rate_master',
    'shipper_product_code_map','inbound_plans',
    'inbound_inspections','putaway_recommendations','lots','audit_logs'
  ] loop
    -- 0006 の雛形を撤去
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    -- 実効ポリシーに差し替え
    execute format(
      'create policy %I on %I to authenticated '
      'using ( current_shipper_id() is null or shipper_id = current_shipper_id() ) '
      'with check ( current_shipper_id() is null or shipper_id = current_shipper_id() )',
      t || '_tenant', t);
  end loop;
end $$;

-- master_revisions.shipper_id は nullable（横断マスタは NULL）。
-- NULL 行（横断マスタ）は admin/operator と同等に全 authenticated が参照可。
-- shipper_user は自社 shipper_id の行のみ参照可。
drop policy if exists master_revisions_tenant on master_revisions;
create policy master_revisions_tenant on master_revisions to authenticated
  using (
    current_shipper_id() is null               -- admin/operator: 全参照
    or shipper_id is null                      -- 横断マスタ行: 全 authenticated に公開
    or shipper_id = current_shipper_id()       -- shipper_user: 自社のみ
  )
  with check (
    current_shipper_id() is null
    or shipper_id is null
    or shipper_id = current_shipper_id()
  );

-- ============================================================
-- §4 横断テーブルのポリシー設計
-- ============================================================

-- roles: authenticated なら全 SELECT 可（ロール一覧は全員が参照する）
-- INSERT/UPDATE/DELETE は admin のみ（将来の admin ポリシーで制御）
-- Phase1-b では SELECT のみ全員許可とし CRUD は admin 判定を後回し
create policy roles_authenticated_select on roles to authenticated
  using (true);

-- locations: authenticated なら全 SELECT 可（ロケーション一覧は全員が参照する）
create policy locations_authenticated_select on locations to authenticated
  using (true);

-- users: admin（shipper_id IS NULL）= 全参照、shipper_user = 自分のレコードのみ
create policy users_tenant on users to authenticated
  using (
    current_shipper_id() is null               -- admin/operator: 全ユーザー参照
    or id = (select id from users where auth_user_id = auth.uid())  -- shipper_user: 自分のみ
  )
  with check (
    current_shipper_id() is null
    or id = (select id from users where auth_user_id = auth.uid())
  );

-- inbound_plan_lines: shipper_id 列なし。親 inbound_plans の shipper_id で解決。
-- FK列: inbound_plan_lines.inbound_plan_id → inbound_plans(id)
create policy inbound_plan_lines_tenant on inbound_plan_lines to authenticated
  using (
    current_shipper_id() is null               -- admin/operator: 全参照
    or exists (
      select 1 from inbound_plans ip
      where ip.id = inbound_plan_id
        and ip.shipper_id = current_shipper_id()
    )
  )
  with check (
    current_shipper_id() is null
    or exists (
      select 1 from inbound_plans ip
      where ip.id = inbound_plan_id
        and ip.shipper_id = current_shipper_id()
    )
  );
