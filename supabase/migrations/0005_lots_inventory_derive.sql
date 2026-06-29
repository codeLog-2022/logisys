-- 0005_lots_inventory_derive.sql — Phase1 ロット/在庫導出
-- 設計: Phase1-DataModel-Design.md §3.8（lots #10/#15/#19）・§2.4（inventory_transactions ALTER）・
--       §4.2（在庫導出VIEW拡張 inventory_current_v2 / inventory_by_expiry）・§6（migration分割 0005）。
-- 依存: 0001/0002/0003/0004。命名規約・GRANT作法・set_updated_at() は既存踏襲。
-- スコープ: lots CREATE ＋ inventory_transactions ALTER ＋ 在庫導出VIEW追加 ＋ GRANT のみ（UI/入出庫の書込ロジック=機能2は対象外）。
--
-- 確定設計（Hiro confirmed）:
--   - 在庫txn ADJUST/COUNT_ADJUST/TRANSFER は符号付き数量 → 既存 quantity>0 CHECK を quantity<>0 に緩和。
--   - lot_no/expiry_date は Phase1 両持ち（inventory_transactions の既存列は残し lot_id を追加）。
--   - シリアルは lots.serial_no 列で最小対応。
--   - 在庫は VIEW継続（inventory_current_v2 を追加し、旧 inventory_current は後方互換で不変のまま残置）。
--   - lots は 0005 に配置（0004 の入荷検品/格納推奨は lots へFKなしで紐付け済み）。

-- ============================================================
-- §3.8 ロット/期限/シリアル（#10/#15/#19）— lots
-- 在庫導出キー: inventory_transactions.lot_id → lots。期限別/ロット別在庫(#15)の集計軸。
-- ============================================================
create table lots (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  lot_no text not null,
  expiry_date date,                                 -- 賞味期限（FEFO/#19キー）
  manufacture_date date,
  serial_no text,                                   -- シリアル（serial管理品）#10
  created_at timestamptz not null default now(),
  -- 荷主×商品×ロット番号で一意
  unique (shipper_id, product_id, lot_no)
);
create index lots_expiry_idx on lots (shipper_id, product_id, expiry_date); -- FEFO/期限別在庫

-- ============================================================
-- §2.4 inventory_transactions 拡張（lot_id・txn_type拡張・符号付き数量・参照・シリアル/製造日）
-- ============================================================
alter table inventory_transactions
  add column serial_no text,                        -- シリアル #10
  add column manufacture_date date,                 -- 製造日 #10
  add column reference_type text                     -- 参照種別（入荷予定/出荷指示 等）#8/#27
    check (reference_type is null or reference_type in
      ('inbound_plan','shipping_instruction','return','stock_count')),
  add column reference_id uuid,                       -- 参照先ID（多態・FKなし）#8
  add column lot_id uuid references lots(id) on delete restrict; -- ロット紐付け #10（lots作成後）

-- 数量: ADJUST/COUNT_ADJUST/TRANSFER を符号付きで持つため quantity>0 を緩和（0は無意味）。
alter table inventory_transactions drop constraint inventory_transactions_quantity_check;
alter table inventory_transactions add constraint inventory_transactions_quantity_check
  check (quantity <> 0);

-- txn_type 拡張（返品入庫/廃棄/在庫調整/棚卸調整/拠点間移動）#12/#35/#22
alter table inventory_transactions drop constraint inventory_transactions_txn_type_check;
alter table inventory_transactions add constraint inventory_transactions_txn_type_check
  check (txn_type in ('IN','OUT','RETURN_IN','DISPOSAL','ADJUST','COUNT_ADJUST','TRANSFER'));

create index inventory_transactions_lot_idx on inventory_transactions (lot_id);
create index inventory_transactions_ref_idx on inventory_transactions (reference_type, reference_id);

-- ============================================================
-- §4.2 在庫導出VIEW拡張: lot_id/status 軸＋符号付き集計（inventory_current_v2）
-- 旧 inventory_current は不変で残置（後方互換・段階移行）。
-- ============================================================
create view inventory_current_v2 as
select
  t.shipper_id, t.product_id, t.location_id,
  t.lot_id, l.lot_no, l.expiry_date,            -- ロット/期限別（lots join）
  t.status,                                      -- ステータス別（検品待/良品/保留/不良）
  sum(case
        when t.txn_type in ('IN','RETURN_IN') then t.quantity
        when t.txn_type in ('OUT','DISPOSAL') then -t.quantity
        when t.txn_type in ('ADJUST','COUNT_ADJUST','TRANSFER') then t.quantity -- 符号付き
        else 0 end) as qty
from inventory_transactions t
left join lots l on l.id = t.lot_id
group by t.shipper_id, t.product_id, t.location_id, t.lot_id, l.lot_no, l.expiry_date, t.status
having sum(case
        when t.txn_type in ('IN','RETURN_IN') then t.quantity
        when t.txn_type in ('OUT','DISPOSAL') then -t.quantity
        when t.txn_type in ('ADJUST','COUNT_ADJUST','TRANSFER') then t.quantity
        else 0 end) <> 0;

-- 期限別サマリ（ロケ横断・荷主別の良品在庫を期限で集約）#15/#19
create view inventory_by_expiry as
select shipper_id, product_id, lot_id, lot_no, expiry_date, sum(qty) as qty
from inventory_current_v2
where status = '良品'
group by shipper_id, product_id, lot_id, lot_no, expiry_date;

-- ============================================================
-- GRANT（0002/0003/0004踏襲）: lots に CRUD、新VIEWに SELECT
-- ============================================================
grant select, insert, update, delete on table lots to anon, authenticated;
grant select on table inventory_current_v2 to anon, authenticated;
grant select on table inventory_by_expiry to anon, authenticated;
