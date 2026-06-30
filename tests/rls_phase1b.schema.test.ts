import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 0007_rls_phase1b.sql を実 DB に対して検証する。
//   - anon_all ポリシーが全テーブルから撤去されていること
//   - current_shipper_id() 関数が存在すること
//   - authenticated テナントポリシーが正しく設定されていること
//     - 業務テーブル（shipper_id あり）: <table>_tenant ポリシーが authenticated に付与
//     - roles: authenticated_select ポリシーが authenticated に付与
//     - locations: authenticated_select ポリシーが authenticated に付与
//     - users: users_tenant ポリシーが authenticated に付与
//     - inbound_plan_lines: inbound_plan_lines_tenant ポリシーが authenticated に付与
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する（痕跡を残さない）。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

let client: Client;

describe("0007 rls_phase1b schema (anon撤去・authenticated ポリシー実効化)", () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  // ---- anon_all ポリシーの撤去確認 ----

  it("removes all anon_all policies from every business table", async () => {
    const r = await client.query<{ policyname: string; tablename: string }>(
      `select policyname, tablename from pg_policies
       where schemaname = 'public' and policyname like '%_anon_all'`,
    );
    expect(
      r.rows,
      `anon_all ポリシーが残っています: ${r.rows.map((x) => `${x.tablename}.${x.policyname}`).join(", ")}`,
    ).toHaveLength(0);
  });

  it("has no anon role in any policy after Phase1-b", async () => {
    const r = await client.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where schemaname = 'public' and 'anon' = any(roles)`,
    );
    expect(
      r.rows,
      `anon ロール向けポリシーが残っています: ${r.rows.map((x) => `${x.tablename}.${x.policyname}`).join(", ")}`,
    ).toHaveLength(0);
  });

  // ---- current_shipper_id() 関数の存在確認 ----

  it("creates the current_shipper_id() helper function", async () => {
    const r = await client.query<{ proname: string; prosecdef: boolean }>(
      `select p.proname, p.prosecdef
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'current_shipper_id'`,
    );
    expect(r.rows).toHaveLength(1);
    // security definer であること（auth.uid() を信頼できるコンテキストで呼ぶ）
    expect(r.rows[0].prosecdef).toBe(true);
  });

  // ---- authenticated テナントポリシーの存在確認 ----

  it("has authenticated tenant policies on all shipper_id business tables", async () => {
    const tables = [
      "shippers",
      "products",
      "inventory_transactions",
      "business_partners",
      "rate_master",
      "master_revisions",
      "shipper_product_code_map",
      "inbound_plans",
      "inbound_inspections",
      "putaway_recommendations",
      "lots",
      "audit_logs",
    ];
    const r = await client.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
       where schemaname = 'public'
         and 'authenticated' = any(roles)
         and policyname like '%_tenant'`,
    );
    const policyMap = new Map<string, string[]>();
    for (const row of r.rows) {
      const existing = policyMap.get(row.tablename) ?? [];
      existing.push(row.policyname);
      policyMap.set(row.tablename, existing);
    }
    for (const t of tables) {
      expect(
        policyMap.has(t),
        `authenticated tenant ポリシーが ${t} に存在しません`,
      ).toBe(true);
    }
  });

  it("has authenticated select policy on roles (all authenticated can read roles)", async () => {
    const r = await client.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'roles'
         and 'authenticated' = any(roles)`,
    );
    expect(
      r.rows.length,
      "roles テーブルに authenticated ポリシーが存在しません",
    ).toBeGreaterThan(0);
  });

  it("has authenticated select policy on locations (all authenticated can read locations)", async () => {
    const r = await client.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'locations'
         and 'authenticated' = any(roles)`,
    );
    expect(
      r.rows.length,
      "locations テーブルに authenticated ポリシーが存在しません",
    ).toBeGreaterThan(0);
  });

  it("has authenticated tenant policy on users", async () => {
    const r = await client.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'users'
         and 'authenticated' = any(roles)`,
    );
    expect(
      r.rows.length,
      "users テーブルに authenticated ポリシーが存在しません",
    ).toBeGreaterThan(0);
  });

  it("has authenticated tenant policy on inbound_plan_lines (parent-join based)", async () => {
    const r = await client.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'inbound_plan_lines'
         and 'authenticated' = any(roles)`,
    );
    expect(
      r.rows.length,
      "inbound_plan_lines テーブルに authenticated ポリシーが存在しません",
    ).toBeGreaterThan(0);
  });

  // ---- 0006 の current_setting 雛形が除去されていることの確認 ----

  it("replaces the app.shipper_id setting-based policies with auth.uid()-based ones", async () => {
    // app.shipper_id を参照するポリシーが残っていないことを確認
    const r = await client.query<{ relname: string; polname: string; qual: string }>(
      `select pc.relname, pp.polname, pg_get_expr(pp.polqual, pc.oid) as qual
       from pg_policy pp
       join pg_class pc on pc.oid = pp.polrelid
       join pg_namespace pn on pn.oid = pc.relnamespace
       where pn.nspname = 'public'
         and pg_get_expr(pp.polqual, pc.oid) like '%app.shipper_id%'`,
    );
    expect(
      r.rows,
      `current_setting('app.shipper_id') を参照するポリシーが残っています: ${r.rows.map((x) => `${x.relname}.${x.polname}`).join(", ")}`,
    ).toHaveLength(0);
  });
});
