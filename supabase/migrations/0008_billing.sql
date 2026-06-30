-- 0008_billing.sql — 請求機能（保管料・荷役料自動算定）
-- 設計: billing_statements（請求書ヘッダ）+ billing_line_items（明細）
-- 依存: 0001-0007（shippers/rate_master/users/RLS 設定済み前提）
-- スコープ: billing_statements / billing_line_items の CREATE + RLS + GRANT のみ（UI/算定ロジックは対象外）

-- ============================================================
-- §1 請求書ヘッダ — billing_statements
-- 荷主・対象年月・合計金額・ステータスを保持する。
-- ステータス: draft（作成直後）→ confirmed（確定、変更禁止）
-- ============================================================
create table billing_statements (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references shippers(id) on delete restrict,
  billing_year_month text not null,                  -- 対象年月 yyyy-mm 形式
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 同一荷主・同一年月の請求書は 1 件（重複算定禁止）
  unique (shipper_id, billing_year_month)
);

create index billing_statements_shipper_idx on billing_statements (shipper_id);
create index billing_statements_status_idx on billing_statements (status);

create trigger trg_billing_statements_updated before update on billing_statements
  for each row execute function set_updated_at();

-- ============================================================
-- §2 請求明細 — billing_line_items
-- billing_statements の明細行。種別（storage/handling/incidental）・数量・単価・金額を保持。
-- ============================================================
create table billing_line_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references billing_statements(id) on delete cascade,
  line_type text not null
    check (line_type in ('storage', 'handling', 'incidental')),  -- 保管料/荷役料/諸掛
  description text not null,                         -- 明細名称（料金名称等）
  quantity numeric(14,3) not null check (quantity >= 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  amount numeric(14,2) not null check (amount >= 0), -- = quantity * unit_price（アプリ層で計算）
  rate_master_id uuid references rate_master(id) on delete set null, -- 使用した料金マスタ（任意）
  created_at timestamptz not null default now()
);

create index billing_line_items_statement_idx on billing_line_items (statement_id);

-- ============================================================
-- §3 RLS 有効化 + ポリシー（0007 踏襲の authenticated + shipper_id テナント分離）
-- ============================================================
alter table billing_statements enable row level security;
alter table billing_line_items enable row level security;

-- billing_statements: authenticated のみ（anon 禁止）、shipper テナント分離
create policy billing_statements_auth_select on billing_statements
  for select to authenticated
  using (
    (select shipper_id from users where auth_user_id = auth.uid()) is null
    or shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
  );

create policy billing_statements_auth_insert on billing_statements
  for insert to authenticated
  with check (
    (select shipper_id from users where auth_user_id = auth.uid()) is null
    or shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
  );

create policy billing_statements_auth_update on billing_statements
  for update to authenticated
  using (
    status = 'draft'  -- 確定済みは更新不可
    and (
      (select shipper_id from users where auth_user_id = auth.uid()) is null
      or shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
    )
  );

create policy billing_statements_auth_delete on billing_statements
  for delete to authenticated
  using (
    status = 'draft'
    and (
      (select shipper_id from users where auth_user_id = auth.uid()) is null
      or shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
    )
  );

-- billing_line_items: statement_id を経由して billing_statements のテナント分離に準拠
create policy billing_line_items_auth_select on billing_line_items
  for select to authenticated
  using (
    exists (
      select 1 from billing_statements s
      where s.id = statement_id
        and (
          (select shipper_id from users where auth_user_id = auth.uid()) is null
          or s.shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
        )
    )
  );

create policy billing_line_items_auth_insert on billing_line_items
  for insert to authenticated
  with check (
    exists (
      select 1 from billing_statements s
      where s.id = statement_id
        and s.status = 'draft'
        and (
          (select shipper_id from users where auth_user_id = auth.uid()) is null
          or s.shipper_id = (select shipper_id from users where auth_user_id = auth.uid())
        )
    )
  );

create policy billing_line_items_auth_delete on billing_line_items
  for delete to authenticated
  using (
    exists (
      select 1 from billing_statements s
      where s.id = statement_id
        and s.status = 'draft'
    )
  );

-- ============================================================
-- §4 GRANT（0007 踏襲）: authenticated + service_role に CRUD 付与
-- ============================================================
grant select, insert, update, delete on table billing_statements to authenticated;
grant select, insert, update, delete on table billing_line_items to authenticated;
grant select, insert, update, delete on table billing_statements to service_role;
grant select, insert, update, delete on table billing_line_items to service_role;
