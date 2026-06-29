import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済みであること）。
// 0004_inbound_asn_inspection.sql の CREATE（CHECK・unique・FK・cascade・set null・default）を実 DB で検証する。
//   - inbound_plans: status/source CHECK・default・unique(shipper_id, plan_no)
//   - inbound_plan_lines: planned_qty > 0・unique(inbound_plan_id, product_id, lot_no)・plan削除でcascade
//   - inbound_inspections: inspection_method/exception_type CHECK・数量 >= 0・default・plan_line削除でset null
//   - putaway_recommendations: deviated default・ロケ削除でset null・lot_id は素uuid（FKなし＝任意値可）
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する（痕跡を残さない）。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

let client: Client;
let shipperId: string;
let productId: string;

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

describe("0004 inbound_asn_inspection schema (constraints, FK, cascade, set null)", () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");

    // 親 FK（shipper → product）を 1 件ずつ用意（ロールバックで消える）。
    const shipper = await client.query<{ id: string }>(
      "insert into shippers (code, name) values ($1, $2) returning id",
      ["SHIP-0004", "0004テスト荷主"],
    );
    shipperId = shipper.rows[0].id;
    const product = await client.query<{ id: string }>(
      "insert into products (shipper_id, code, name) values ($1, $2, $3) returning id",
      [shipperId, "P-0004", "0004テスト商品"],
    );
    productId = product.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("applies inbound_plans defaults (status/source) and enforces unique(shipper_id, plan_no)", async () => {
    const res = await client.query<{ status: string; source: string }>(
      `insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-1')
       returning status, source`,
      [shipperId],
    );
    expect(res.rows[0].status).toBe("planned");
    expect(res.rows[0].source).toBe("manual");

    // 同一荷主で plan_no 重複は unique 違反
    await expectQueryError(
      "insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-1')",
      [shipperId],
      UNIQUE_VIOLATION,
    );
  });

  it("rejects invalid inbound_plans.status and .source with check_violation (23514)", async () => {
    await expectQueryError(
      "insert into inbound_plans (shipper_id, plan_no, status) values ($1, 'ASN-ST', 'done')",
      [shipperId],
      CHECK_VIOLATION,
    );
    await expectQueryError(
      "insert into inbound_plans (shipper_id, plan_no, source) values ($1, 'ASN-SRC', 'api')",
      [shipperId],
      CHECK_VIOLATION,
    );
  });

  it("cascades deletes from inbound_plans to inbound_plan_lines and rejects planned_qty <= 0", async () => {
    const plan = await client.query<{ id: string }>(
      "insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-CASCADE') returning id",
      [shipperId],
    );
    const planId = plan.rows[0].id;

    const line = await client.query<{ id: string }>(
      `insert into inbound_plan_lines (inbound_plan_id, product_id, planned_qty)
       values ($1, $2, 10) returning id`,
      [planId, productId],
    );
    const lineId = line.rows[0].id;

    // planned_qty <= 0 は CHECK 違反
    await expectQueryError(
      "insert into inbound_plan_lines (inbound_plan_id, product_id, planned_qty) values ($1, $2, 0)",
      [planId, productId],
      CHECK_VIOLATION,
    );

    // ヘッダ削除で明細が cascade 削除される
    await client.query("delete from inbound_plans where id = $1", [planId]);
    const remaining = await client.query<{ count: string }>(
      "select count(*)::text as count from inbound_plan_lines where id = $1",
      [lineId],
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it("enforces unique(inbound_plan_id, product_id, lot_no) on inbound_plan_lines", async () => {
    const plan = await client.query<{ id: string }>(
      "insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-UNIQ') returning id",
      [shipperId],
    );
    const planId = plan.rows[0].id;
    await client.query(
      "insert into inbound_plan_lines (inbound_plan_id, product_id, planned_qty, lot_no) values ($1, $2, 5, 'L1')",
      [planId, productId],
    );
    await expectQueryError(
      "insert into inbound_plan_lines (inbound_plan_id, product_id, planned_qty, lot_no) values ($1, $2, 7, 'L1')",
      [planId, productId],
      UNIQUE_VIOLATION,
    );
  });

  it("applies inbound_inspections defaults and rejects invalid enums / negative quantities", async () => {
    const ins = await client.query<{ defect_qty: number; inspected_at: string }>(
      `insert into inbound_inspections
         (shipper_id, product_id, inspection_method, inspected_qty, good_qty)
       values ($1, $2, '全数', 10, 10)
       returning defect_qty, inspected_at`,
      [shipperId, productId],
    );
    // default: defect_qty=0・inspected_at=now()
    expect(ins.rows[0].defect_qty).toBe(0);
    expect(ins.rows[0].inspected_at).toBeTruthy();

    // inspection_method 不正
    await expectQueryError(
      `insert into inbound_inspections (shipper_id, product_id, inspection_method, inspected_qty, good_qty)
       values ($1, $2, '一部', 1, 1)`,
      [shipperId, productId],
      CHECK_VIOLATION,
    );
    // exception_type 不正
    await expectQueryError(
      `insert into inbound_inspections (shipper_id, product_id, inspection_method, inspected_qty, good_qty, exception_type)
       values ($1, $2, '全数', 1, 1, 'unknown')`,
      [shipperId, productId],
      CHECK_VIOLATION,
    );
    // inspected_qty 負数
    await expectQueryError(
      `insert into inbound_inspections (shipper_id, product_id, inspection_method, inspected_qty, good_qty)
       values ($1, $2, '全数', -1, 0)`,
      [shipperId, productId],
      CHECK_VIOLATION,
    );
    // defect_qty 負数
    await expectQueryError(
      `insert into inbound_inspections (shipper_id, product_id, inspection_method, inspected_qty, good_qty, defect_qty)
       values ($1, $2, '全数', 1, 1, -1)`,
      [shipperId, productId],
      CHECK_VIOLATION,
    );
  });

  it("sets inbound_inspections.inbound_plan_line_id to NULL when the referenced plan line is deleted", async () => {
    const plan = await client.query<{ id: string }>(
      "insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-SETNULL') returning id",
      [shipperId],
    );
    const line = await client.query<{ id: string }>(
      "insert into inbound_plan_lines (inbound_plan_id, product_id, planned_qty) values ($1, $2, 3) returning id",
      [plan.rows[0].id, productId],
    );
    const lineId = line.rows[0].id;
    const insp = await client.query<{ id: string }>(
      `insert into inbound_inspections
         (shipper_id, product_id, inbound_plan_line_id, inspection_method, inspected_qty, good_qty)
       values ($1, $2, $3, '抜取り', 2, 2) returning id`,
      [shipperId, productId, lineId],
    );

    // 明細削除で検品の参照は set null（検品行は残る）
    await client.query("delete from inbound_plan_lines where id = $1", [lineId]);
    const after = await client.query<{ inbound_plan_line_id: string | null }>(
      "select inbound_plan_line_id from inbound_inspections where id = $1",
      [insp.rows[0].id],
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].inbound_plan_line_id).toBeNull();
  });

  it("accepts putaway_recommendations referencing a real lot and applies deviated default false", async () => {
    // lot_id は 0005 では素uuidだったが 0006 で lots(id) への FK が後付けされた＝実在 lot を参照する。
    const lot = await client.query<{ id: string }>(
      `insert into lots (shipper_id, product_id, lot_no) values ($1, $2, 'LOT-0004-PUT') returning id`,
      [shipperId, productId],
    );
    const lotId = lot.rows[0].id;
    const rec = await client.query<{ deviated: boolean; lot_id: string }>(
      `insert into putaway_recommendations (shipper_id, product_id, lot_id)
       values ($1, $2, $3) returning deviated, lot_id`,
      [shipperId, productId, lotId],
    );
    expect(rec.rows[0].deviated).toBe(false);
    expect(rec.rows[0].lot_id).toBe(lotId);
  });

  it("sets putaway_recommendations location refs to NULL when the location is deleted", async () => {
    const loc = await client.query<{ id: string }>(
      "insert into locations (code) values ('LOC-0004') returning id",
    );
    const locId = loc.rows[0].id;
    const rec = await client.query<{ id: string }>(
      `insert into putaway_recommendations (shipper_id, product_id, recommended_location_id, actual_location_id)
       values ($1, $2, $3, $3) returning id`,
      [shipperId, productId, locId],
    );

    await client.query("delete from locations where id = $1", [locId]);
    const after = await client.query<{
      recommended_location_id: string | null;
      actual_location_id: string | null;
    }>(
      "select recommended_location_id, actual_location_id from putaway_recommendations where id = $1",
      [rec.rows[0].id],
    );
    expect(after.rows[0].recommended_location_id).toBeNull();
    expect(after.rows[0].actual_location_id).toBeNull();
  });

  it("sets putaway_recommendations.inbound_inspection_id to NULL when the inspection is deleted", async () => {
    const insp = await client.query<{ id: string }>(
      `insert into inbound_inspections (shipper_id, product_id, inspection_method, inspected_qty, good_qty)
       values ($1, $2, '全数', 4, 4) returning id`,
      [shipperId, productId],
    );
    const rec = await client.query<{ id: string }>(
      `insert into putaway_recommendations (shipper_id, product_id, inbound_inspection_id)
       values ($1, $2, $3) returning id`,
      [shipperId, productId, insp.rows[0].id],
    );

    await client.query("delete from inbound_inspections where id = $1", [
      insp.rows[0].id,
    ]);
    const after = await client.query<{ inbound_inspection_id: string | null }>(
      "select inbound_inspection_id from putaway_recommendations where id = $1",
      [rec.rows[0].id],
    );
    expect(after.rows[0].inbound_inspection_id).toBeNull();
  });

  it("blocks deleting a shipper that still has inbound_plans (on delete restrict)", async () => {
    await client.query(
      "insert into inbound_plans (shipper_id, plan_no) values ($1, 'ASN-RESTRICT')",
      [shipperId],
    );
    // shipper は on delete restrict のため、子が残っていると削除できない（23503 foreign_key_violation）。
    await expectQueryError(
      "delete from shippers where id = $1",
      [shipperId],
      "23503",
    );
  });
});
