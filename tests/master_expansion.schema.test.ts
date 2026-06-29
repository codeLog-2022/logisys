import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済みであること）。
// 0003_master_expansion.sql の ALTER（CHECK拡張・default・部分unique）を実 DB で検証する。
//   - shippers.picking_rule の拡張値（'ロット指定'/'受注優先'）が通り、不正値は 23514 で落ちる
//   - shippers の新規列の default 値
//   - products の部分unique index（(shipper_id, jan_code) where jan_code is not null）
//   - locations の新規列 default と updated_at トリガ
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する（痕跡を残さない）。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

// PostgreSQL check_violation / unique_violation のエラーコード
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

let client: Client;

// 期待どおりに失敗するクエリを SAVEPOINT で包む。
// PostgreSQL は 1 つの制約違反でトランザクション全体が中断状態（25P02）になるため、
// SAVEPOINT → 失敗 → ROLLBACK TO で巻き戻し、後続クエリを実行可能に保つ。
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

describe("0003 master_expansion schema (ALTER constraints & defaults)", () => {
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

  it("accepts the expanded picking_rule values and applies new shippers defaults", async () => {
    const res = await client.query<{
      picking_rule: string;
      storage_billing_method: string;
      storage_billing_cycle: string;
      storage_basis: string;
      closing_day: number;
      expiry_acceptance_ratio: number;
      inventory_mixing: string;
    }>(
      `insert into shippers (code, name, picking_rule)
       values ($1, $2, 'ロット指定')
       returning picking_rule, storage_billing_method, storage_billing_cycle,
                 storage_basis, closing_day, expiry_acceptance_ratio, inventory_mixing`,
      ["SHIP-0003-OK", "拡張ピッキングルール荷主"],
    );
    const row = res.rows[0];
    // 拡張値が通ること
    expect(row.picking_rule).toBe("ロット指定");
    // 設計どおりの default 値（§2.1）
    expect(row.storage_billing_method).toBe("個建て");
    expect(row.storage_billing_cycle).toBe("3期制");
    expect(row.storage_basis).toBe("期末");
    expect(row.closing_day).toBe(99);
    expect(row.expiry_acceptance_ratio).toBe(0);
    expect(row.inventory_mixing).toBe("allowed");
  });

  it("rejects an invalid picking_rule with check_violation (23514)", async () => {
    await expectQueryError(
      `insert into shippers (code, name, picking_rule) values ($1, $2, 'LIFO')`,
      ["SHIP-0003-NG", "不正ピッキングルール荷主"],
      CHECK_VIOLATION,
    );
  });

  it("rejects an out-of-range closing_day with check_violation (23514)", async () => {
    await expectQueryError(
      `insert into shippers (code, name, closing_day) values ($1, $2, 40)`,
      ["SHIP-0003-DAY", "締日範囲外荷主"],
      CHECK_VIOLATION,
    );
  });

  it("enforces the partial unique index on (shipper_id, jan_code) and allows multiple NULL JANs", async () => {
    const shipper = await client.query<{ id: string }>(
      "insert into shippers (code, name) values ($1, $2) returning id",
      ["SHIP-0003-JAN", "JAN荷主"],
    );
    const shipperId = shipper.rows[0].id;

    // 同一 JAN は荷主内で重複不可
    await client.query(
      "insert into products (shipper_id, code, name, jan_code) values ($1, 'P1', '商品1', '4900000000001')",
      [shipperId],
    );
    await expectQueryError(
      "insert into products (shipper_id, code, name, jan_code) values ($1, 'P2', '商品2', '4900000000001')",
      [shipperId],
      UNIQUE_VIOLATION,
    );

    // jan_code が NULL の商品は複数登録できる（部分 unique のため）
    await client.query(
      "insert into products (shipper_id, code, name) values ($1, 'P3', '商品3')",
      [shipperId],
    );
    await client.query(
      "insert into products (shipper_id, code, name) values ($1, 'P4', '商品4')",
      [shipperId],
    );
    const nullJan = await client.query<{ count: string }>(
      "select count(*)::text as count from products where shipper_id = $1 and jan_code is null",
      [shipperId],
    );
    expect(Number(nullJan.rows[0].count)).toBe(2);
  });

  it("rejects a non-positive units_per_ball with check_violation (23514)", async () => {
    const shipper = await client.query<{ id: string }>(
      "insert into shippers (code, name) values ($1, $2) returning id",
      ["SHIP-0003-BALL", "ボール入数荷主"],
    );
    await expectQueryError(
      "insert into products (shipper_id, code, name, units_per_ball) values ($1, 'PB', '商品B', 0)",
      [shipper.rows[0].id],
      CHECK_VIOLATION,
    );
  });

  it("applies locations defaults and bumps updated_at via trigger", async () => {
    const ins = await client.query<{
      id: string;
      assignment_type: string;
      storable_unit_types: string[];
      hazard_allowed: boolean;
      updated_at: string;
    }>(
      `insert into locations (code) values ('LOC-0003')
       returning id, assignment_type, storable_unit_types, hazard_allowed, updated_at`,
    );
    const row = ins.rows[0];
    // 設計どおりの default（§2.3）
    expect(row.assignment_type).toBe("free");
    expect(row.storable_unit_types).toEqual([]);
    expect(row.hazard_allowed).toBe(false);
    expect(row.updated_at).toBeTruthy();

    // updated_at トリガ（trg_locations_updated）が更新時に now() を入れることを検証する。
    // 単一トランザクション内では now() が固定のため、まず updated_at を過去日に手動で
    // ずらし（トリガは UPDATE 時に発火するので、その UPDATE 後の値で確認する）、
    // 続く UPDATE でトリガが now()（= トランザクション時刻）へ上書きすることを確認する。
    await client.query(
      "update locations set updated_at = timestamptz '2000-01-01 00:00:00+00' where id = $1",
      [row.id],
    );
    // 直前の UPDATE でトリガが now() を入れているはずなので、過去日にはならない。
    const stale = await client.query<{ updated_at: string }>(
      "select updated_at from locations where id = $1",
      [row.id],
    );
    const txnNow = await client.query<{ now: string }>("select now() as now");
    // トリガが効いていれば updated_at は手動指定の 2000 年ではなく now()（=トランザクション時刻）になる。
    expect(new Date(stale.rows[0].updated_at).getTime()).toBe(
      new Date(txnNow.rows[0].now).getTime(),
    );
    expect(new Date(stale.rows[0].updated_at).getFullYear()).not.toBe(2000);
  });

  it("rejects an invalid locations.assignment_type with check_violation (23514)", async () => {
    await expectQueryError(
      "insert into locations (code, assignment_type) values ('LOC-0003-NG', 'semi')",
      [],
      CHECK_VIOLATION,
    );
  });
});
