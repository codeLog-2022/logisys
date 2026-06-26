import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済みであること）。
// 0005_lots_inventory_derive.sql を実 DB に対して検証する。
//   - lots: unique(shipper_id, product_id, lot_no)
//   - inventory_transactions ALTER: txn_type 拡張 / 符号付き数量(quantity<>0) / lot_id FK(restrict) / reference_type CHECK
//   - 導出VIEW: inventory_current_v2（lot_id/status 軸・符号付き集計）・inventory_by_expiry（良品の期限別）
//   - 旧 inventory_current の回帰（IN10/OUT3→7・不変）
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する（痕跡を残さない）。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

let client: Client;
let shipperId: string;
let productId: string;
let locationId: string;

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

// lots を 1 件作って id を返す（lot_no はテストごとに一意に）。
async function makeLot(
  lotNo: string,
  expiry: string | null,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into lots (shipper_id, product_id, lot_no, expiry_date)
     values ($1, $2, $3, $4) returning id`,
    [shipperId, productId, lotNo, expiry],
  );
  return r.rows[0].id;
}

// inventory_current_v2 から (lot_id, status) の qty を取得（他テストのロットと混ざらないよう lot で絞る）。
async function v2Qty(lotId: string, status: string): Promise<number | null> {
  const r = await client.query<{ qty: string }>(
    `select qty from inventory_current_v2
     where shipper_id = $1 and product_id = $2 and lot_id = $3 and status = $4`,
    [shipperId, productId, lotId, status],
  );
  return r.rows.length ? Number(r.rows[0].qty) : null;
}

describe("0005 lots / inventory_transactions ALTER / derived views", () => {
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
      ["SHIP-0005", "0005テスト荷主"],
    );
    shipperId = shipper.rows[0].id;
    const product = await client.query<{ id: string }>(
      "insert into products (shipper_id, code, name) values ($1, $2, $3) returning id",
      [shipperId, "P-0005", "0005テスト商品"],
    );
    productId = product.rows[0].id;
    const location = await client.query<{ id: string }>(
      "insert into locations (code) values ($1) returning id",
      ["LOC-0005"],
    );
    locationId = location.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("enforces unique(shipper_id, product_id, lot_no) on lots", async () => {
    await makeLot("LOT-UNIQ", "2026-12-31");
    await expectQueryError(
      `insert into lots (shipper_id, product_id, lot_no) values ($1, $2, 'LOT-UNIQ')`,
      [shipperId, productId],
      UNIQUE_VIOLATION,
    );
  });

  it("accepts the expanded txn_type values and rejects an unknown one", async () => {
    const lotId = await makeLot("LOT-TXNTYPE", null);
    for (const t of ["RETURN_IN", "DISPOSAL", "ADJUST", "COUNT_ADJUST", "TRANSFER"]) {
      const r = await client.query<{ txn_type: string }>(
        `insert into inventory_transactions
           (shipper_id, product_id, location_id, txn_type, quantity, lot_id)
         values ($1, $2, $3, $4, 1, $5) returning txn_type`,
        [shipperId, productId, locationId, t, lotId],
      );
      expect(r.rows[0].txn_type).toBe(t);
    }
    await expectQueryError(
      `insert into inventory_transactions (shipper_id, product_id, location_id, txn_type, quantity)
       values ($1, $2, $3, 'SHIP', 1)`,
      [shipperId, productId, locationId],
      CHECK_VIOLATION,
    );
  });

  it("allows a signed (negative) quantity but rejects zero", async () => {
    const lotId = await makeLot("LOT-SIGNED", null);
    const r = await client.query<{ quantity: number }>(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, lot_id)
       values ($1, $2, $3, 'ADJUST', -5, $4) returning quantity`,
      [shipperId, productId, locationId, lotId],
    );
    expect(r.rows[0].quantity).toBe(-5);

    await expectQueryError(
      `insert into inventory_transactions (shipper_id, product_id, location_id, txn_type, quantity)
       values ($1, $2, $3, 'IN', 0)`,
      [shipperId, productId, locationId],
      CHECK_VIOLATION,
    );
  });

  it("blocks deleting a lot still referenced by inventory_transactions (lot_id on delete restrict)", async () => {
    const lotId = await makeLot("LOT-FK", null);
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, lot_id)
       values ($1, $2, $3, 'IN', 1, $4)`,
      [shipperId, productId, locationId, lotId],
    );
    await expectQueryError(
      "delete from lots where id = $1",
      [lotId],
      FK_VIOLATION,
    );
  });

  it("rejects an invalid reference_type via check constraint", async () => {
    await expectQueryError(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, reference_type)
       values ($1, $2, $3, 'IN', 1, 'purchase_order')`,
      [shipperId, productId, locationId],
      CHECK_VIOLATION,
    );
    // 妥当な参照は通る（FKなし多態 reference_id も任意uuidで受ける）
    const r = await client.query<{ reference_type: string }>(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, reference_type, reference_id)
       values ($1, $2, $3, 'IN', 1, 'inbound_plan', gen_random_uuid()) returning reference_type`,
      [shipperId, productId, locationId],
    );
    expect(r.rows[0].reference_type).toBe("inbound_plan");
  });

  it("derives inventory_current_v2 with signed sums, separated by status", async () => {
    const lotId = await makeLot("LOT-V2", "2026-12-31");
    // 良品: IN 10 - OUT 3 + RETURN_IN 2 = 9
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, status, lot_id)
       values
         ($1,$2,$3,'IN',10,'良品',$4),
         ($1,$2,$3,'OUT',3,'良品',$4),
         ($1,$2,$3,'RETURN_IN',2,'良品',$4),
         ($1,$2,$3,'IN',5,'保留',$4)`,
      [shipperId, productId, locationId, lotId],
    );
    expect(await v2Qty(lotId, "良品")).toBe(9);
    // ステータス別に分離（保留は別行）
    expect(await v2Qty(lotId, "保留")).toBe(5);

    // ADJUST -4（符号付き）で良品が 9 → 5 に
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, status, lot_id)
       values ($1,$2,$3,'ADJUST',-4,'良品',$4)`,
      [shipperId, productId, locationId, lotId],
    );
    expect(await v2Qty(lotId, "良品")).toBe(5);
  });

  it("excludes net-zero rows from inventory_current_v2 (having <> 0)", async () => {
    const lotId = await makeLot("LOT-ZERO", null);
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, status, lot_id)
       values
         ($1,$2,$3,'IN',4,'良品',$4),
         ($1,$2,$3,'OUT',4,'良品',$4)`,
      [shipperId, productId, locationId, lotId],
    );
    expect(await v2Qty(lotId, "良品")).toBeNull();
  });

  it("aggregates good stock by expiry across locations in inventory_by_expiry", async () => {
    const lotId = await makeLot("LOT-EXP", "2027-03-31");
    const loc2 = await client.query<{ id: string }>(
      "insert into locations (code) values ('LOC-0005-2') returning id",
    );
    // 同一ロット(=同一期限)を2ロケに分けて良品で格納 → 期限別では合算される
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, status, lot_id)
       values
         ($1,$2,$3,'IN',6,'良品',$5),
         ($1,$2,$4,'IN',4,'良品',$5)`,
      [shipperId, productId, locationId, loc2.rows[0].id, lotId],
    );
    const r = await client.query<{ qty: string; expiry_date: string }>(
      `select qty, expiry_date from inventory_by_expiry
       where shipper_id = $1 and product_id = $2 and lot_id = $3`,
      [shipperId, productId, lotId],
    );
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].qty)).toBe(10);
  });

  it("keeps the legacy inventory_current view intact (IN10/OUT3 by lot_no → 7)", async () => {
    // 旧VIEWは lot_no(text) 軸・status='良品'・IN/OUT のみ。0005 で不変であることを回帰確認。
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, lot_no)
       values
         ($1,$2,$3,'IN',10,'LEGACY-LOT'),
         ($1,$2,$3,'OUT',3,'LEGACY-LOT')`,
      [shipperId, productId, locationId],
    );
    const r = await client.query<{ qty: string }>(
      `select qty from inventory_current
       where shipper_id = $1 and product_id = $2 and location_id = $3 and lot_no = 'LEGACY-LOT'`,
      [shipperId, productId, locationId],
    );
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].qty)).toBe(7);
  });
});
