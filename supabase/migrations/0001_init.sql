-- 0001_init.sql — LogiSys MVP schema (Phase1: master + inventory transactions + derived stock)
-- マルチテナント: 業務テーブルは全て shipper_id を持つ（RLSは認証配線時に追加）。
create extension if not exists "pgcrypto";

-- 荷主マスタ(#1): 業務ルールをフラグで保持＝汎用化の核
create table shippers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  lot_managed boolean not null default false,
  expiry_managed boolean not null default false,
  serial_managed boolean not null default false,
  inspection_method text not null default '全数' check (inspection_method in ('全数','抜取り')),
  picking_rule text not null default 'FIFO' check (picking_rule in ('FIFO','FEFO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 商品マスタ(#2): 荷主×商品で一意
create table products (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  code text not null,
  name text not null,
  unit text not null default 'バラ',
  units_per_case integer,
  temp_zone text not null default '常温' check (temp_zone in ('常温','冷蔵','冷凍')),
  hazard_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipper_id, code)
);

-- ロケーションマスタ(#5, 最小)
create table locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  temp_zone text not null default '常温' check (temp_zone in ('常温','冷蔵','冷凍')),
  usage text not null default 'shared' check (usage in ('shared','dedicated')),
  owner_shipper_id uuid references shippers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 入出庫明細(Phase1の一次記録): 検品/数量/ステータス
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  location_id uuid not null references locations(id) on delete restrict,
  txn_type text not null check (txn_type in ('IN','OUT')),
  quantity integer not null check (quantity > 0),
  status text not null default '良品' check (status in ('検品待','良品','保留','不良')),
  lot_no text,
  expiry_date date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index on inventory_transactions (shipper_id, product_id, location_id);

-- 在庫 = 明細からの導出VIEW（在庫テーブルを二重に持たない＝二重管理回避）
create view inventory_current as
select shipper_id, product_id, location_id, lot_no,
  sum(case txn_type when 'IN' then quantity else -quantity end) as qty
from inventory_transactions
where status = '良品'
group by shipper_id, product_id, location_id, lot_no
having sum(case txn_type when 'IN' then quantity else -quantity end) <> 0;

-- updated_at 自動更新
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger trg_shippers_updated before update on shippers for each row execute function set_updated_at();
create trigger trg_products_updated before update on products for each row execute function set_updated_at();
