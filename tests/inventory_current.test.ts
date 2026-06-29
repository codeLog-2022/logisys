import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済みであること）。
// 導出在庫 VIEW `inventory_current` の正しさを実 DB に対して検証する。
//   荷主1 / 商品1 / ロケ1 を作り、同一(荷主/商品/ロケ/ロット)に
//   IN 10 と OUT 3 を記録 → inventory_current.qty が 7 になること。
//
// DB へ直接接続し、テスト全体を 1 トランザクションで包んで最後に ROLLBACK する。
// → 実テーブル・実 VIEW を経由した本物の検証でありながら、DB に痕跡を残さない。
// 接続情報（DATABASE_URL）は vitest.config.ts が `supabase status` から実行時に注入する。

const databaseUrl = process.env.DATABASE_URL;

let client: Client;

describe("inventory_current (derived stock view)", () => {
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
      // 挿入した全データを破棄（DB をテスト前の状態へ戻す）
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("records IN 10 and OUT 3 for the same key, yielding qty = 7", async () => {
    // 1. 荷主
    const shipper = await client.query<{ id: string }>(
      "insert into shippers (code, name) values ($1, $2) returning id",
      ["SHIP-TEST", "テスト荷主"],
    );
    const shipperId = shipper.rows[0].id;
    expect(shipperId).toBeTruthy();

    // 2. 商品（荷主×コードで一意）
    const product = await client.query<{ id: string }>(
      "insert into products (shipper_id, code, name) values ($1, $2, $3) returning id",
      [shipperId, "PROD-TEST", "テスト商品"],
    );
    const productId = product.rows[0].id;

    // 3. ロケーション
    const location = await client.query<{ id: string }>(
      "insert into locations (code) values ($1) returning id",
      ["LOC-TEST"],
    );
    const locationId = location.rows[0].id;

    // 4. IN 10 / OUT 3（status は default '良品' = VIEW 集計対象）
    const lotNo = "LOT-TEST";
    await client.query(
      `insert into inventory_transactions
         (shipper_id, product_id, location_id, txn_type, quantity, lot_no)
       values
         ($1, $2, $3, 'IN', 10, $4),
         ($1, $2, $3, 'OUT', 3, $4)`,
      [shipperId, productId, locationId, lotNo],
    );

    // 5. 導出在庫 VIEW を読む（IN 10 - OUT 3 = 7 になるはず）
    const view = await client.query<{ qty: string }>(
      `select qty from inventory_current
       where shipper_id = $1 and product_id = $2
         and location_id = $3 and lot_no = $4`,
      [shipperId, productId, locationId, lotNo],
    );
    expect(view.rows).toHaveLength(1);
    // pg は bigint(sum の結果) を文字列で返すため数値化して比較
    expect(Number(view.rows[0].qty)).toBe(7);
  });
});
