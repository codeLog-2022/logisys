import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  listInventoryByExpiry,
  listInventoryCurrent,
} from "../src/lib/inventory/repository";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 在庫照会 repository を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// テストデータは afterEach で明示削除し、DB に痕跡を残さない。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const TEST_PREFIX = "VITEST-INV-";

let supabase: SupabaseClient;

// テストで作成したリソースの id を記録して後始末する
const createdShipperIds: string[] = [];
const createdProductIds: string[] = [];
const createdLocationIds: string[] = [];

/** テスト用荷主を 1 件作成して id を返す */
async function makeShipper(suffix: string): Promise<string> {
  const { data, error } = await supabase
    .from("shippers")
    .insert({ code: `${TEST_PREFIX}${suffix}`, name: `テスト荷主-${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  createdShipperIds.push(id);
  return id;
}

/** テスト用商品を 1 件作成して id を返す */
async function makeProduct(
  shipperId: string,
  suffix: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      shipper_id: shipperId,
      code: `${TEST_PREFIX}PROD-${suffix}`,
      name: `テスト商品-${suffix}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  createdProductIds.push(id);
  return id;
}

/** テスト用ロケーションを 1 件作成して id を返す */
async function makeLocation(suffix: string): Promise<string> {
  const { data, error } = await supabase
    .from("locations")
    .insert({ code: `${TEST_PREFIX}LOC-${suffix}` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  createdLocationIds.push(id);
  return id;
}

/** テスト用ロットを 1 件作成して id を返す */
async function makeLot(
  shipperId: string,
  productId: string,
  lotNo: string,
  expiryDate: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from("lots")
    .insert({
      shipper_id: shipperId,
      product_id: productId,
      lot_no: lotNo,
      expiry_date: expiryDate,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** 在庫トランザクションを挿入する */
async function insertTxn(
  shipperId: string,
  productId: string,
  locationId: string,
  txnType: string,
  quantity: number,
  lotId: string | null,
  status = "良品",
): Promise<void> {
  const { error } = await supabase.from("inventory_transactions").insert({
    shipper_id: shipperId,
    product_id: productId,
    location_id: locationId,
    txn_type: txnType,
    quantity,
    lot_id: lotId,
    status,
  });
  if (error) throw new Error(error.message);
}

describe("inventory repository (REST against real local DB)", () => {
  beforeAll(() => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);
  });

  afterEach(async () => {
    // inventory_transactions → lots → products → shippers / locations の順に削除
    // (FK: inventory_transactions.lot_id → lots, inventory_transactions.shipper_id → shippers etc.)
    if (createdShipperIds.length > 0) {
      await supabase
        .from("inventory_transactions")
        .delete()
        .in("shipper_id", createdShipperIds);
      await supabase
        .from("lots")
        .delete()
        .in("shipper_id", createdShipperIds);
    }
    if (createdProductIds.length > 0) {
      await supabase
        .from("products")
        .delete()
        .in("id", createdProductIds);
    }
    if (createdLocationIds.length > 0) {
      await supabase
        .from("locations")
        .delete()
        .in("id", createdLocationIds);
    }
    if (createdShipperIds.length > 0) {
      await supabase
        .from("shippers")
        .delete()
        .in("id", createdShipperIds);
    }
    createdShipperIds.length = 0;
    createdProductIds.length = 0;
    createdLocationIds.length = 0;
  });

  afterAll(async () => {
    // 後始末漏れがないことを確認（プレフィックス一致の荷主が残っていないこと）
    const { data, error } = await supabase
      .from("shippers")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // listInventoryCurrent
  // ------------------------------------------------------------------

  describe("listInventoryCurrent", () => {
    it("IN 10, OUT 3 の在庫トランザクションで qty=7 が返る", async () => {
      const shipperId = await makeShipper("CURR-01");
      const productId = await makeProduct(shipperId, "CURR-01");
      const locationId = await makeLocation("CURR-01");
      const lotId = await makeLot(shipperId, productId, `${TEST_PREFIX}LOT-CURR-01`, null);

      await insertTxn(shipperId, productId, locationId, "IN", 10, lotId);
      await insertTxn(shipperId, productId, locationId, "OUT", 3, lotId);

      const rows = await listInventoryCurrent(supabase, { shipper_id: shipperId });

      expect(rows).toHaveLength(1);
      expect(rows[0].shipper_id).toBe(shipperId);
      expect(rows[0].product_id).toBe(productId);
      expect(rows[0].lot_id).toBe(lotId);
      expect(rows[0].status).toBe("良品");
      expect(Number(rows[0].qty)).toBe(7);
    });

    it("ステータスが異なる場合は別行で返る", async () => {
      const shipperId = await makeShipper("CURR-02");
      const productId = await makeProduct(shipperId, "CURR-02");
      const locationId = await makeLocation("CURR-02");
      const lotId = await makeLot(shipperId, productId, `${TEST_PREFIX}LOT-CURR-02`, null);

      await insertTxn(shipperId, productId, locationId, "IN", 10, lotId, "良品");
      await insertTxn(shipperId, productId, locationId, "IN", 5, lotId, "保留");

      const rows = await listInventoryCurrent(supabase, { shipper_id: shipperId });

      expect(rows).toHaveLength(2);
      const good = rows.find((r) => r.status === "良品");
      const hold = rows.find((r) => r.status === "保留");
      expect(good).toBeDefined();
      expect(hold).toBeDefined();
      expect(Number(good!.qty)).toBe(10);
      expect(Number(hold!.qty)).toBe(5);
    });

    it("荷主フィルタなしで複数荷主のデータを返す（フィルタ未指定）", async () => {
      const shipperId1 = await makeShipper("CURR-03A");
      const shipperId2 = await makeShipper("CURR-03B");
      const productId1 = await makeProduct(shipperId1, "CURR-03A");
      const productId2 = await makeProduct(shipperId2, "CURR-03B");
      const locationId = await makeLocation("CURR-03");
      const lotId1 = await makeLot(shipperId1, productId1, `${TEST_PREFIX}LOT-CURR-03A`, null);
      const lotId2 = await makeLot(shipperId2, productId2, `${TEST_PREFIX}LOT-CURR-03B`, null);

      await insertTxn(shipperId1, productId1, locationId, "IN", 3, lotId1);
      await insertTxn(shipperId2, productId2, locationId, "IN", 7, lotId2);

      const rows = await listInventoryCurrent(supabase);
      const ids = rows.map((r) => r.shipper_id);
      expect(ids).toContain(shipperId1);
      expect(ids).toContain(shipperId2);
    });

    it("荷主フィルタで他の荷主データは除外される", async () => {
      const shipperId1 = await makeShipper("CURR-04A");
      const shipperId2 = await makeShipper("CURR-04B");
      const productId1 = await makeProduct(shipperId1, "CURR-04A");
      const productId2 = await makeProduct(shipperId2, "CURR-04B");
      const locationId = await makeLocation("CURR-04");
      const lotId1 = await makeLot(shipperId1, productId1, `${TEST_PREFIX}LOT-CURR-04A`, null);
      const lotId2 = await makeLot(shipperId2, productId2, `${TEST_PREFIX}LOT-CURR-04B`, null);

      await insertTxn(shipperId1, productId1, locationId, "IN", 5, lotId1);
      await insertTxn(shipperId2, productId2, locationId, "IN", 8, lotId2);

      const rows = await listInventoryCurrent(supabase, { shipper_id: shipperId1 });
      expect(rows.every((r) => r.shipper_id === shipperId1)).toBe(true);
      expect(rows.some((r) => r.shipper_id === shipperId2)).toBe(false);
    });

    it("在庫が相殺されてゼロになった場合は VIEW に現れない（HAVING <> 0）", async () => {
      const shipperId = await makeShipper("CURR-05");
      const productId = await makeProduct(shipperId, "CURR-05");
      const locationId = await makeLocation("CURR-05");
      const lotId = await makeLot(shipperId, productId, `${TEST_PREFIX}LOT-CURR-05`, null);

      await insertTxn(shipperId, productId, locationId, "IN", 5, lotId);
      await insertTxn(shipperId, productId, locationId, "OUT", 5, lotId);

      const rows = await listInventoryCurrent(supabase, { shipper_id: shipperId });
      expect(rows).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // listInventoryByExpiry
  // ------------------------------------------------------------------

  describe("listInventoryByExpiry", () => {
    it("良品在庫がロット(=expiry_date)別に集計されて返る", async () => {
      const shipperId = await makeShipper("EXP-01");
      const productId = await makeProduct(shipperId, "EXP-01");
      const locationId = await makeLocation("EXP-01");
      const lotId = await makeLot(
        shipperId,
        productId,
        `${TEST_PREFIX}LOT-EXP-01`,
        "2027-06-30",
      );

      await insertTxn(shipperId, productId, locationId, "IN", 12, lotId, "良品");

      const rows = await listInventoryByExpiry(supabase, { shipper_id: shipperId });
      expect(rows).toHaveLength(1);
      expect(rows[0].lot_id).toBe(lotId);
      expect(rows[0].expiry_date).toBe("2027-06-30");
      expect(Number(rows[0].qty)).toBe(12);
    });

    it("保留ステータスは inventory_by_expiry に含まれない（良品のみ）", async () => {
      const shipperId = await makeShipper("EXP-02");
      const productId = await makeProduct(shipperId, "EXP-02");
      const locationId = await makeLocation("EXP-02");
      const lotId = await makeLot(
        shipperId,
        productId,
        `${TEST_PREFIX}LOT-EXP-02`,
        "2027-09-30",
      );

      // 良品 0 件、保留のみ
      await insertTxn(shipperId, productId, locationId, "IN", 5, lotId, "保留");

      const rows = await listInventoryByExpiry(supabase, { shipper_id: shipperId });
      expect(rows).toHaveLength(0);
    });

    it("期限が近い順（昇順）で返る", async () => {
      const shipperId = await makeShipper("EXP-03");
      const productId = await makeProduct(shipperId, "EXP-03");
      const locationId = await makeLocation("EXP-03");
      const lotFar = await makeLot(
        shipperId,
        productId,
        `${TEST_PREFIX}LOT-EXP-03-FAR`,
        "2028-12-31",
      );
      const lotNear = await makeLot(
        shipperId,
        productId,
        `${TEST_PREFIX}LOT-EXP-03-NEAR`,
        "2027-01-31",
      );

      await insertTxn(shipperId, productId, locationId, "IN", 3, lotFar, "良品");
      await insertTxn(shipperId, productId, locationId, "IN", 7, lotNear, "良品");

      const rows = await listInventoryByExpiry(supabase, { shipper_id: shipperId });
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // 期限近い方が先頭に来ること
      const nearIdx = rows.findIndex((r) => r.lot_id === lotNear);
      const farIdx = rows.findIndex((r) => r.lot_id === lotFar);
      expect(nearIdx).toBeLessThan(farIdx);
    });

    it("複数ロケーションにまたがる同一ロットの良品在庫は合算される", async () => {
      const shipperId = await makeShipper("EXP-04");
      const productId = await makeProduct(shipperId, "EXP-04");
      const locationId1 = await makeLocation("EXP-04-A");
      const locationId2 = await makeLocation("EXP-04-B");
      const lotId = await makeLot(
        shipperId,
        productId,
        `${TEST_PREFIX}LOT-EXP-04`,
        "2027-03-31",
      );

      await insertTxn(shipperId, productId, locationId1, "IN", 6, lotId, "良品");
      await insertTxn(shipperId, productId, locationId2, "IN", 4, lotId, "良品");

      const rows = await listInventoryByExpiry(supabase, { shipper_id: shipperId });
      const target = rows.find((r) => r.lot_id === lotId);
      expect(target).toBeDefined();
      expect(Number(target!.qty)).toBe(10);
    });
  });
});
