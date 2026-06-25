-- 0003_master_expansion.sql — Phase1 本番版マスタ拡張
-- 設計: Phase1-DataModel-Design.md §2（既存ALTER）・§3.2-3.5（新規4テーブル）・§6（migration分割）
-- 依存: 0001/0002。命名規約・GRANT作法・set_updated_at() 関数・CHECK制約名は 0001/0002 を踏襲。
-- スコープ: shippers/products/locations の ALTER と、business_partners/rate_master/
--           master_revisions/shipper_product_code_map の CREATE のみ（UIは対象外）。

-- ============================================================
-- §2.1 ALTER shippers（#1/#16/#17/#19/#38）
-- ============================================================
alter table shippers
  -- 保管料計算方式（坪/パレット/個建て）#38
  add column storage_billing_method text not null default '個建て'
    check (storage_billing_method in ('坪建て','パレット建て','個建て')),
  -- 保管料算定方式（3期制 / 日割）#38/#39
  add column storage_billing_cycle text not null default '3期制'
    check (storage_billing_cycle in ('3期制','日割')),
  -- 保管料基準時点（論点9=A期末既定・荷主別切替）#43
  add column storage_basis text not null default '期末'
    check (storage_basis in ('期末','平均')),
  -- 締日（1-28 or 99=末日）#1
  add column closing_day smallint not null default 99
    check (closing_day between 1 and 28 or closing_day = 99),
  -- 賞味期限受入ルール（残日数。1/2・1/3 を分母で保持。0=制約なし）#19
  add column expiry_acceptance_ratio smallint not null default 0
    check (expiry_acceptance_ratio in (0,2,3)),
  -- 共用ロケでの荷主混在可否ポリシー #16
  add column inventory_mixing text not null default 'allowed'
    check (inventory_mixing in ('allowed','denied'));

-- picking_rule の CHECK を拡張（論点2=荷主別 優先順位付き の布石）#17
-- 既存: ('FIFO','FEFO') → 'ロット指定','受注優先' を追加
alter table shippers drop constraint shippers_picking_rule_check;
alter table shippers add constraint shippers_picking_rule_check
  check (picking_rule in ('FIFO','FEFO','ロット指定','受注優先'));

-- ============================================================
-- §2.2 ALTER products（#2/#10）
-- ============================================================
alter table products
  add column jan_code text,                       -- JAN/品番（スキャン検品キー）#2
  -- 商品単位の管理要否（NULL=荷主フラグ継承 / true/false=商品で上書き）#2/#10
  add column lot_managed boolean,
  add column expiry_managed boolean,
  add column serial_managed boolean,
  add column units_per_ball integer check (units_per_ball is null or units_per_ball > 0); -- ボール入数 #2
-- 既存 units_per_case はケース入数として継続利用（リネームしない＝機能1影響回避）

-- JAN は荷主内で一意（任意・NULL複数可）#2
create unique index products_shipper_jan_uidx
  on products (shipper_id, jan_code) where jan_code is not null;

-- ============================================================
-- §2.3 ALTER locations（#5/#64）
-- ============================================================
alter table locations
  add column zone text,                            -- ゾーン #5
  add column aisle text,                           -- 通路 #5
  add column bay text,                             -- 間口 #5
  add column level text,                           -- 段 #5
  add column assignment_type text not null default 'free'
    check (assignment_type in ('fixed','free')),   -- 固定/フリー #5
  add column storable_unit_types text[] not null default '{}', -- 保管可能荷姿 #5
  add column hazard_allowed boolean not null default false,     -- 危険物可否 #64
  add column updated_at timestamptz not null default now();     -- 機能1では未保持→追加

create trigger trg_locations_updated before update on locations
  for each row execute function set_updated_at();

-- ============================================================
-- §3.2 取引先マスタ（#4）— business_partners
-- 依存順: business_partners → rate_master → master_revisions → shipper_product_code_map
-- ============================================================
create table business_partners (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  code text not null,
  name text not null,
  partner_type text not null
    check (partner_type in ('ship_to','supplier','bill_to')), -- 出荷先/仕入先/請求先
  parent_id uuid references business_partners(id) on delete set null, -- チェーン本部↔店舗の階層
  postal_code text, address text, tel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipper_id, code)
);
create index business_partners_shipper_idx on business_partners (shipper_id);
create index business_partners_parent_idx on business_partners (parent_id);
create trigger trg_business_partners_updated before update on business_partners
  for each row execute function set_updated_at();

-- ============================================================
-- §3.4 料金マスタ（#6）— rate_master
-- ============================================================
create table rate_master (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  rate_type text not null
    check (rate_type in ('storage','handling','incidental')), -- 保管料/荷役料/諸掛
  code text not null,                               -- 料金項目コード（荷主内一意）
  name text not null,
  unit text not null,                               -- 坪/パレット/個/件/時 等
  unit_price numeric(12,2) not null check (unit_price >= 0),
  currency text not null default 'JPY',
  effective_from date not null,
  effective_to date,                                -- NULL=現行
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 同一料金コードは有効開始日でバージョン管理（重複開始日を禁止）
  unique (shipper_id, code, effective_from)
);
create index rate_master_lookup_idx on rate_master (shipper_id, rate_type, effective_from);
create trigger trg_rate_master_updated before update on rate_master
  for each row execute function set_updated_at();

-- ============================================================
-- §3.3 マスタ改定履歴（#7）— master_revisions
-- 調整（Hiro承認済み）: changed_by は users への FK にしない（users 作成は0006のため前方参照回避）。
--                       entity_id も多態のため FK なし（設計どおり）。
-- ============================================================
create table master_revisions (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid references shippers(id) on delete restrict, -- 横断マスタは NULL 可
  entity_type text not null
    check (entity_type in ('shipper','product','location','business_partner','rate')),
  entity_id uuid not null,                          -- 対象行（多態・FKなし）
  effective_from date not null,                     -- 有効開始
  effective_to date,                                -- 有効終了（NULL=現行）
  snapshot jsonb not null,                          -- 改定時点の値スナップショット
  changed_by uuid,                                  -- 変更者（FKなし＝0006のusers前方参照を避ける）
  created_at timestamptz not null default now()
);
create index master_revisions_entity_idx on master_revisions (entity_type, entity_id, effective_from);

-- ============================================================
-- §3.5 読替表（#3）— shipper_product_code_map
-- ============================================================
create table shipper_product_code_map (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  product_id uuid not null references products(id) on delete cascade, -- 商品削除で読替も消す
  external_code text not null,                      -- 荷主既存コード（エイリアス）
  source text not null default 'shipper'            -- 出所（荷主/EDI/モール 等）
    check (source in ('shipper','edi','mall','other')),
  created_at timestamptz not null default now(),
  -- 同一荷主・同一出所で外部コードは一意（社内コードへ一意解決）
  unique (shipper_id, source, external_code)
);
create index shipper_product_code_map_product_idx on shipper_product_code_map (product_id);

-- ============================================================
-- GRANT（0002踏襲）: 新規4テーブルに anon/authenticated の CRUD を付与
-- ============================================================
grant select, insert, update, delete on table business_partners to anon, authenticated;
grant select, insert, update, delete on table rate_master to anon, authenticated;
grant select, insert, update, delete on table master_revisions to anon, authenticated;
grant select, insert, update, delete on table shipper_product_code_map to anon, authenticated;
