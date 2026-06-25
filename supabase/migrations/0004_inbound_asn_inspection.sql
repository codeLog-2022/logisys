-- 0004_inbound_asn_inspection.sql — Phase1 入荷ASN/検品/格納推奨
-- 設計: Phase1-DataModel-Design.md §3.6（inbound_plans/inbound_plan_lines）・
--       §3.7（inbound_inspections）・§3.9（putaway_recommendations）・§6（migration分割）。
-- 依存: 0001/0002/0003。命名規約・GRANT作法・set_updated_at() 関数は 0001/0002/0003 を踏襲。
-- スコープ: inbound_plans/inbound_plan_lines/inbound_inspections/putaway_recommendations の
--           CREATE のみ（UI は対象外）。
--
-- 前方参照の回避（Hiro承認済み）:
--   - inbound_inspections.inspected_by は users(id) への FK にしない＝素の uuid。
--     users は 0006 で作成するため。FK は後付け（将来 migration の ALTER ADD CONSTRAINT・今回は実装しない）。
--   - putaway_recommendations.lot_id は lots(id) への FK にしない＝素の uuid。
--     lots は 0005 で作成するため。FK は後付け（lots=0005・将来 migration で付与）。

-- ============================================================
-- §3.6 入荷予定 ASN（#8）— inbound_plans（ヘッダ）
-- 依存順: inbound_plans → inbound_plan_lines → inbound_inspections → putaway_recommendations
-- ============================================================
create table inbound_plans (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  plan_no text not null,                            -- ASN番号（荷主内一意）
  supplier_id uuid references business_partners(id) on delete set null, -- 仕入先
  scheduled_date date,                              -- 入荷予定日
  status text not null default 'planned'
    check (status in ('planned','arrived','inspecting','completed','cancelled')),
  source text not null default 'manual'             -- 取込元 #8
    check (source in ('manual','csv','edi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipper_id, plan_no)
);
create index inbound_plans_shipper_status_idx on inbound_plans (shipper_id, status);
create trigger trg_inbound_plans_updated before update on inbound_plans
  for each row execute function set_updated_at();

-- ============================================================
-- §3.6 ASN明細（予定数）— inbound_plan_lines
-- ============================================================
create table inbound_plan_lines (
  id uuid primary key default gen_random_uuid(),
  inbound_plan_id uuid not null references inbound_plans(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  planned_qty integer not null check (planned_qty > 0),
  lot_no text,                                      -- 事前通知があれば
  expiry_date date,                                 -- 事前通知があれば
  created_at timestamptz not null default now(),
  unique (inbound_plan_id, product_id, lot_no)
);

-- ============================================================
-- §3.7 入荷検品（#9/#12）— inbound_inspections
-- 調整（Hiro承認済み）: inspected_by は users への FK にしない（0006 の users 前方参照を避ける）＝素の uuid。
-- ============================================================
create table inbound_inspections (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  inbound_plan_line_id uuid references inbound_plan_lines(id) on delete set null, -- 予実照合キー
  product_id uuid not null references products(id) on delete restrict,
  inspection_method text not null                   -- 検品時点の方式（荷主既定のスナップ）#9
    check (inspection_method in ('全数','抜取り')),
  planned_qty integer,                              -- 予定（ASNから複写）
  inspected_qty integer not null check (inspected_qty >= 0),
  good_qty integer not null check (good_qty >= 0),  -- 良品
  defect_qty integer not null default 0 check (defect_qty >= 0), -- 不良
  lot_no text,
  expiry_date date,
  manufacture_date date,
  -- 差異/例外（#12）: 予実差・破損・期限割れ 等
  exception_type text
    check (exception_type is null or exception_type in
      ('none','qty_short','qty_over','damaged','expiry_violation','lot_mismatch')),
  note text,
  inspected_by uuid,                                -- 検品者（FKなし＝0006のusers前方参照を避ける）
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index inbound_inspections_plan_idx on inbound_inspections (inbound_plan_line_id);
create index inbound_inspections_shipper_idx on inbound_inspections (shipper_id, product_id);

-- ============================================================
-- §3.9 格納推奨（#11）— putaway_recommendations
-- 調整（Hiro承認済み）: lot_id は lots への FK にしない（0005 の lots 前方参照を避ける）＝素の uuid。
-- ============================================================
create table putaway_recommendations (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  lot_id uuid,                                      -- ロット（FKなし＝0005のlots前方参照を避ける）
  recommended_location_id uuid references locations(id) on delete set null, -- 推奨ロケ
  actual_location_id uuid references locations(id) on delete set null,      -- 実格納ロケ
  reason text,                                      -- 推奨根拠（温度帯/ABC/専用区画）
  deviated boolean not null default false,          -- 逸脱有無（H10）
  deviation_reason text,                            -- 逸脱理由
  inbound_inspection_id uuid references inbound_inspections(id) on delete set null,
  created_at timestamptz not null default now()
);
create index putaway_recommendations_product_idx on putaway_recommendations (product_id);

-- ============================================================
-- GRANT（0002/0003踏襲）: 新規4テーブルに anon/authenticated の CRUD を付与
-- ============================================================
grant select, insert, update, delete on table inbound_plans to anon, authenticated;
grant select, insert, update, delete on table inbound_plan_lines to anon, authenticated;
grant select, insert, update, delete on table inbound_inspections to anon, authenticated;
grant select, insert, update, delete on table putaway_recommendations to anon, authenticated;
