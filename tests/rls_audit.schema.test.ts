import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済みであること）。
// 0006_rls_audit.sql を実 DB に対して検証する。
//   - roles: code unique
//   - users: email unique・auth_user_id unique・role_id FK(restrict)・shipper_id nullable(横断運営)・
//            is_active default true・updated_at トリガ
//   - audit_logs: action/entity_type not null・before/after jsonb・actor_user_id FK(set null)・shipper_id FK(set null)
//   - 前方参照FKの後付け(3件):
//       inbound_inspections.inspected_by → users(set null)
//       master_revisions.changed_by      → users(set null)
//       putaway_recommendations.lot_id    → lots(restrict)
//   - RLS: 全業務テーブルで row level security が有効化されていること
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する（痕跡を残さない）。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";
const NOT_NULL_VIOLATION = "23502";

let client: Client;
let shipperId: string;
let productId: string;
let locationId: string;
let adminRoleId: string;

// 期待どおりに失敗するクエリを SAVEPOINT で包む（後続クエリを実行可能に保つ）。
async function expectQueryError(
  sql: string,
  params: unknown[],
  expectedCode: string,
): Promise<void> {
  await client.query("SAVEPOINT sp");
  let caughtCode: string | undefined;
  try {
    await client.query(sql, params as never[]);
  } catch (e) {
    caughtCode = (e as { code?: string }).code;
  }
  await client.query("ROLLBACK TO SAVEPOINT sp");
  await client.query("RELEASE SAVEPOINT sp");
  expect(caughtCode).toBe(expectedCode);
}

// users を 1 件作って id を返す（email はテストごとに一意に）。
async function makeUser(
  email: string,
  shipper: string | null,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email, name, role_id, shipper_id)
     values ($1, $2, $3, $4) returning id`,
    [email, `テスト利用者 ${email}`, adminRoleId, shipper],
  );
  return r.rows[0].id;
}

describe("0006 rls_audit schema (roles/users/audit_logs, back-fill FKs, RLS)", () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");

    const shipper = await client.query<{ id: string }>(
      "insert into shippers (code, name) values ($1, $2) returning id",
      ["SHIP-0006", "0006テスト荷主"],
    );
    shipperId = shipper.rows[0].id;
    const product = await client.query<{ id: string }>(
      "insert into products (shipper_id, code, name) values ($1, $2, $3) returning id",
      [shipperId, "P-0006", "0006テスト商品"],
    );
    productId = product.rows[0].id;
    const location = await client.query<{ id: string }>(
      "insert into locations (code) values ($1) returning id",
      ["LOC-0006"],
    );
    locationId = location.rows[0].id;

    // 既定ロール（0006 migration がシードする 'admin' を利用）。
    const role = await client.query<{ id: string }>(
      "select id from roles where code = 'admin'",
    );
    adminRoleId = role.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("seeds the baseline roles (admin/operator/shipper_user) with unique codes", async () => {
    const r = await client.query<{ code: string }>(
      "select code from roles where code in ('admin','operator','shipper_user') order by code",
    );
    expect(r.rows.map((x) => x.code)).toEqual([
      "admin",
      "operator",
      "shipper_user",
    ]);
    // code は unique
    await expectQueryError(
      "insert into roles (code, name) values ('admin', '重複')",
      [],
      UNIQUE_VIOLATION,
    );
  });

  it("creates a user with defaults and enforces email/auth_user_id uniqueness", async () => {
    const r = await client.query<{ is_active: boolean; shipper_id: string | null }>(
      `insert into users (email, name, role_id, shipper_id, auth_user_id)
       values ('u1@example.com', '利用者1', $1, $2, gen_random_uuid())
       returning is_active, shipper_id`,
      [adminRoleId, shipperId],
    );
    // is_active は default true
    expect(r.rows[0].is_active).toBe(true);
    expect(r.rows[0].shipper_id).toBe(shipperId);

    // email 重複は unique 違反
    await expectQueryError(
      `insert into users (email, name, role_id) values ('u1@example.com', '重複', $1)`,
      [adminRoleId],
      UNIQUE_VIOLATION,
    );

    // auth_user_id 重複は unique 違反
    const sharedAuth = "a0000000-0000-4000-8000-0000000000a1";
    await client.query(
      `insert into users (email, name, role_id, auth_user_id) values ('u2@example.com', '利用者2', $1, $2)`,
      [adminRoleId, sharedAuth],
    );
    await expectQueryError(
      `insert into users (email, name, role_id, auth_user_id) values ('u3@example.com', '利用者3', $1, $2)`,
      [adminRoleId, sharedAuth],
      UNIQUE_VIOLATION,
    );
  });

  it("allows a cross-org user with NULL shipper_id and requires role_id", async () => {
    // shipper_id NULL = 横断（運営）ユーザー
    const r = await client.query<{ shipper_id: string | null }>(
      `insert into users (email, name, role_id) values ('ops@example.com', '運営', $1)
       returning shipper_id`,
      [adminRoleId],
    );
    expect(r.rows[0].shipper_id).toBeNull();

    // role_id は not null
    await expectQueryError(
      `insert into users (email, name) values ('norole@example.com', 'ロール無')`,
      [],
      NOT_NULL_VIOLATION,
    );
  });

  it("blocks deleting a role still referenced by a user (role_id on delete restrict)", async () => {
    await makeUser("restrict@example.com", shipperId);
    await expectQueryError(
      "delete from roles where id = $1",
      [adminRoleId],
      FK_VIOLATION,
    );
  });

  it("attaches the set_updated_at trigger to users (trigger present)", async () => {
    // updated_at の実時刻前進は users.repository.test.ts（別トランザクション）で検証する。
    // ここでは「トリガが users に張られている」ことをカタログで確認する
    // （schema test は単一 BEGIN 内＝now() がトランザクション開始時刻で固定のため時刻前進は検証しない）。
    const r = await client.query<{ tgname: string }>(
      `select t.tgname
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = 'users' and t.tgname = 'trg_users_updated' and not t.tgisinternal`,
    );
    expect(r.rows).toHaveLength(1);
  });

  it("records an audit_log with before/after jsonb and nullable actor", async () => {
    const r = await client.query<{ before: unknown; after: unknown; actor_user_id: string | null }>(
      `insert into audit_logs (action, entity_type, entity_id, before, after, shipper_id)
       values ('update', 'products', $1, $2::jsonb, $3::jsonb, $4)
       returning before, after, actor_user_id`,
      [
        productId,
        JSON.stringify({ name: "旧" }),
        JSON.stringify({ name: "新" }),
        shipperId,
      ],
    );
    expect(r.rows[0].after).toEqual({ name: "新" });
    // actor_user_id は未認証時 NULL を許容
    expect(r.rows[0].actor_user_id).toBeNull();

    // action / entity_type は not null
    await expectQueryError(
      "insert into audit_logs (entity_type) values ('products')",
      [],
      NOT_NULL_VIOLATION,
    );
  });

  it("sets audit_logs.actor_user_id to NULL when the referenced user is deleted (on delete set null)", async () => {
    const userId = await makeUser("actor@example.com", shipperId);
    const log = await client.query<{ id: string }>(
      `insert into audit_logs (actor_user_id, action, entity_type) values ($1, 'create', 'shippers') returning id`,
      [userId],
    );
    await client.query("delete from users where id = $1", [userId]);
    const after = await client.query<{ actor_user_id: string | null }>(
      "select actor_user_id from audit_logs where id = $1",
      [log.rows[0].id],
    );
    expect(after.rows[0].actor_user_id).toBeNull();
  });

  // ---- 前方参照FKの後付け（3件） ----

  it("back-fills FK inbound_inspections.inspected_by → users (reject unknown, set null on delete)", async () => {
    // 不在 user uuid は 23503
    await expectQueryError(
      `insert into inbound_inspections
         (shipper_id, product_id, inspection_method, inspected_qty, good_qty, inspected_by)
       values ($1, $2, '全数', 1, 1, gen_random_uuid())`,
      [shipperId, productId],
      FK_VIOLATION,
    );
    // 実在 user なら通り、user 削除で inspected_by が NULL 化（on delete set null）
    const userId = await makeUser("inspector@example.com", shipperId);
    const insp = await client.query<{ id: string }>(
      `insert into inbound_inspections
         (shipper_id, product_id, inspection_method, inspected_qty, good_qty, inspected_by)
       values ($1, $2, '全数', 5, 5, $3) returning id`,
      [shipperId, productId, userId],
    );
    await client.query("delete from users where id = $1", [userId]);
    const after = await client.query<{ inspected_by: string | null }>(
      "select inspected_by from inbound_inspections where id = $1",
      [insp.rows[0].id],
    );
    expect(after.rows[0].inspected_by).toBeNull();
  });

  it("back-fills FK master_revisions.changed_by → users (reject unknown, set null on delete)", async () => {
    await expectQueryError(
      `insert into master_revisions
         (entity_type, entity_id, effective_from, snapshot, changed_by)
       values ('product', $1, '2026-01-01', '{}'::jsonb, gen_random_uuid())`,
      [productId],
      FK_VIOLATION,
    );
    const userId = await makeUser("reviser@example.com", shipperId);
    const rev = await client.query<{ id: string }>(
      `insert into master_revisions
         (entity_type, entity_id, effective_from, snapshot, changed_by)
       values ('product', $1, '2026-01-01', '{"name":"x"}'::jsonb, $2) returning id`,
      [productId, userId],
    );
    await client.query("delete from users where id = $1", [userId]);
    const after = await client.query<{ changed_by: string | null }>(
      "select changed_by from master_revisions where id = $1",
      [rev.rows[0].id],
    );
    expect(after.rows[0].changed_by).toBeNull();
  });

  it("back-fills FK putaway_recommendations.lot_id → lots (reject unknown, restrict on delete)", async () => {
    // 不在 lot uuid は 23503（0005 までは素uuidで通っていたが 0006 で FK 化される）
    await expectQueryError(
      `insert into putaway_recommendations (shipper_id, product_id, lot_id)
       values ($1, $2, gen_random_uuid())`,
      [shipperId, productId],
      FK_VIOLATION,
    );
    // 実在 lot なら通り、参照中 lot の削除は restrict（23503）
    const lot = await client.query<{ id: string }>(
      `insert into lots (shipper_id, product_id, lot_no) values ($1, $2, 'LOT-0006') returning id`,
      [shipperId, productId],
    );
    await client.query(
      `insert into putaway_recommendations (shipper_id, product_id, lot_id) values ($1, $2, $3)`,
      [shipperId, productId, lot.rows[0].id],
    );
    await expectQueryError(
      "delete from lots where id = $1",
      [lot.rows[0].id],
      FK_VIOLATION,
    );
  });

  // ---- RLS 有効化 ----

  it("enables row level security on all business tables", async () => {
    const tables = [
      "shippers",
      "products",
      "locations",
      "inventory_transactions",
      "business_partners",
      "rate_master",
      "master_revisions",
      "shipper_product_code_map",
      "inbound_plans",
      "inbound_plan_lines",
      "inbound_inspections",
      "putaway_recommendations",
      "lots",
      "roles",
      "users",
      "audit_logs",
    ];
    const r = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1)`,
      [tables],
    );
    const map = new Map(r.rows.map((x) => [x.relname, x.relrowsecurity]));
    for (const t of tables) {
      expect(map.get(t), `RLS should be enabled on ${t}`).toBe(true);
    }
  });

  it("has an anon-all policy on every RLS-enabled business table (so anon CRUD survives)", async () => {
    // 各テーブルに anon ロール向けの全許可ポリシーが存在すること（機能1を壊さない土台）。
    const tables = [
      "shippers",
      "products",
      "locations",
      "inventory_transactions",
      "business_partners",
      "rate_master",
      "master_revisions",
      "shipper_product_code_map",
      "inbound_plans",
      "inbound_plan_lines",
      "inbound_inspections",
      "putaway_recommendations",
      "lots",
      "roles",
      "users",
      "audit_logs",
    ];
    const r = await client.query<{ tablename: string }>(
      `select distinct tablename from pg_policies
       where schemaname = 'public' and 'anon' = any(roles)`,
    );
    const withAnon = new Set(r.rows.map((x) => x.tablename));
    for (const t of tables) {
      expect(withAnon.has(t), `anon policy should exist on ${t}`).toBe(true);
    }
  });
});
