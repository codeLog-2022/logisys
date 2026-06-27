-- 0006_rls_audit.sql — Phase1 アクセス制御 / 監査 / RLS雛形 / 前方参照FKの後付け
-- 設計: Phase1-DataModel-Design.md §3.1（roles/users #59）・§3.10（audit_logs #61）・
--       §5（RLS方針 Phase1-a）・§6（migration分割 0006）。
-- 依存: 0001-0005。命名規約・GRANT作法・set_updated_at() 関数は既存踏襲。
-- スコープ: roles/users/audit_logs の CREATE ＋ 既定ロールのシード ＋
--           前方参照FKの後付け3件 ＋ 全業務テーブルの RLS有効化＋ポリシー雛形 ＋ GRANT のみ（UIは対象外）。
--
-- 確定設計（Hiro confirmed）:
--   - users は独自テーブルを新設（Supabase Auth 未配線のため auth_user_id は nullable）。
--   - 監査は独立 audit_logs テーブル＋アプリ層で明示記録（before/after jsonb）。トリガ方式・列追加は不採用。
--   - 前方参照FKは 3件まとめて後付け:
--       inbound_inspections.inspected_by → users(set null)
--       master_revisions.changed_by      → users(set null)
--       putaway_recommendations.lot_id    → lots(restrict)
--   - RLS は 0006 で「有効化＋ポリシー雛形」まで（Phase1-a）。anon は従来どおり全許可ポリシーで機能1を温存。
--     実効的な荷主分離（anon全許可の撤去）は本認証（Supabase Auth）配線後＝0007以降（Phase1-b）。
--   - テナント解決は current_setting('app.shipper_id') 方式で土台を置く（配線時に auth.uid() 結合へ差し替え）。
-- 安全ガード: 各テーブルの enable row level security と anon 全許可ポリシーは
--             本 migration 内で必ず同時に投入する（全アクセス遮断事故の回避）。

-- ============================================================
-- §3.1 アクセス制御（#59）— roles / users
-- ============================================================
create table roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                          -- 'admin','operator','shipper_user'
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  -- 将来 Supabase Auth と連携する場合の auth.users.id（現状未配線=nullable・配線時に NOT NULL 化）
  auth_user_id uuid unique,
  shipper_id uuid references shippers(id) on delete restrict, -- NULL=横断(運営) / 非NULL=荷主スコープ
  role_id uuid not null references roles(id) on delete restrict,
  email text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index users_shipper_idx on users (shipper_id);
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

-- 既定ロールのシード（#59）。code は unique。
insert into roles (code, name) values
  ('admin', '管理者'),
  ('operator', '作業者'),
  ('shipper_user', '荷主ユーザー');

-- ============================================================
-- §3.10 操作ログ（#61）— audit_logs
-- 記録方式: アプリ層で明示記録（案B確定）。before/after jsonb で差分・ロット遡及。
-- ============================================================
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null, -- 誰が（未認証時 NULL）
  shipper_id uuid references shippers(id) on delete set null, -- 対象荷主スコープ
  action text not null,                             -- 'create'/'update'/'delete'/'inspect' 等
  entity_type text not null,                        -- 対象テーブル名
  entity_id uuid,                                   -- 対象行
  before jsonb, after jsonb,                        -- 変更前後（ロット遡及・差分）
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs (actor_user_id, created_at);

-- ============================================================
-- 前方参照FKの後付け（ALTER ADD CONSTRAINT）= 3件
-- 0003/0004 で「FKなし＝素uuid」にしてあった列に、users / lots 作成後の今 FK を張る。
-- ============================================================
-- 0004: inbound_inspections.inspected_by → users（検品者・利用者削除で NULL 化）
alter table inbound_inspections
  add constraint inbound_inspections_inspected_by_fkey
  foreign key (inspected_by) references users(id) on delete set null;

-- 0003: master_revisions.changed_by → users（変更者・利用者削除で NULL 化）
alter table master_revisions
  add constraint master_revisions_changed_by_fkey
  foreign key (changed_by) references users(id) on delete set null;

-- 0004: putaway_recommendations.lot_id → lots（在庫キーのため restrict）
alter table putaway_recommendations
  add constraint putaway_recommendations_lot_id_fkey
  foreign key (lot_id) references lots(id) on delete restrict;

-- ============================================================
-- §5 RLS方針（Phase1-a）: 全業務テーブルで RLS 有効化＋ポリシー雛形
--   - <table>_anon_all      : anon 全許可（機能1を壊さない土台。Phase1-b で撤去予定）
--   - <table>_tenant        : authenticated は自社荷主のみ（current_setting('app.shipper_id')）
--                             認証配線後に有効化される土台。今は authenticated 経路が無いため実害なし。
-- shipper_id 列を持つ業務テーブルにはテナント雛形を張る。
-- shipper_id を持たない横断テーブル（roles/locations/users）は anon 全許可のみ
--   （users はテナント解決の起点でありポリシーは Phase1-b で設計＝今は全許可で温存）。
-- ============================================================

-- shipper_id を持つテーブル: anon 全許可 ＋ テナント雛形
do $$
declare t text;
begin
  foreach t in array array[
    'shippers',                  -- shippers は自身が id=shipper（下で個別に張る）
    'products','inventory_transactions','business_partners','rate_master',
    'master_revisions','shipper_product_code_map','inbound_plans',
    'inbound_inspections','putaway_recommendations','lots','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I to anon using (true) with check (true)',
      t || '_anon_all', t);
  end loop;
end $$;

-- テナント雛形（shipper_id 列を持つテーブルのみ。配線後に効く土台）。
-- shippers は自身の id がテナント境界。
create policy shippers_tenant on shippers to authenticated
  using (id::text = current_setting('app.shipper_id', true))
  with check (id::text = current_setting('app.shipper_id', true));

do $$
declare t text;
begin
  foreach t in array array[
    'products','inventory_transactions','business_partners','rate_master',
    'shipper_product_code_map','inbound_plans',
    'inbound_inspections','putaway_recommendations','lots','audit_logs'
  ] loop
    -- master_revisions は shipper_id nullable のため下で個別に張る（この配列には含めない）。
    execute format(
      'create policy %I on %I to authenticated '
      'using (shipper_id::text = current_setting(''app.shipper_id'', true)) '
      'with check (shipper_id::text = current_setting(''app.shipper_id'', true))',
      t || '_tenant', t);
  end loop;
end $$;

-- master_revisions.shipper_id は nullable（横断マスタは NULL）。
-- NULL 行は横断扱いで authenticated にも見せる土台にする。
create policy master_revisions_tenant on master_revisions to authenticated
  using (shipper_id is null or shipper_id::text = current_setting('app.shipper_id', true))
  with check (shipper_id is null or shipper_id::text = current_setting('app.shipper_id', true));

-- shipper_id を持たない横断/子テーブル: anon 全許可のみ（テナント雛形は Phase1-b で設計）。
--   inbound_plan_lines は inbound_plans(shipper_id) の子＝自身に shipper_id 列を持たないため
--   テナント雛形は親経由の解決になる。Phase1-a では anon 全許可のみとし Phase1-b で設計する。
do $$
declare t text;
begin
  foreach t in array array['roles','locations','users','inbound_plan_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I to anon using (true) with check (true)',
      t || '_anon_all', t);
  end loop;
end $$;

-- ============================================================
-- GRANT（0002-0005踏襲）: 新規3テーブルに anon/authenticated の CRUD を付与
-- ============================================================
grant select, insert, update, delete on table roles to anon, authenticated;
grant select, insert, update, delete on table users to anon, authenticated;
grant select, insert, update, delete on table audit_logs to anon, authenticated;
