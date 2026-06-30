import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
} from "../src/lib/inventory_transactions/repository";
import type { CreateTransactionInput } from "../src/lib/inventory_transactions/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// inventory_transactions CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
//
// 前提データ（荷主/商品/ロケーション）はトランザクション本体と同じ Supabase anon client で作成し、
// afterAll で削除して DB に痕跡を残さない。
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// テストデータは固有プレフィックスで識別し、後始末漏れを検出できるようにする
const TEST_PREFIX = "VITEST-TXN-";

let supabase: SupabaseClient;

// 前提データ（テスト用の荷主・商品・ロケーション）
let shipperId: string;
let productId: string;
let locationId: string;

// 作成したトランザクション id を記録 → afterEach でまとめて削除
const createdTxnIds = new Set<string>();

function baseInput(): CreateTransactionInput {
  return {
    shipper_id: shipperId,
    product_id: productId,
    location_id: locationId,
    txn_type: "IN",
    quantity: 10,
    status: "良品",
    lot_no: `${TEST_PREFIX}LOT`,
    expiry_date: null,
    note: null,
    created_by: null,
  };
}

async function track(
  p: Promise<{ id: string }>,
): Promise<ReturnType<typeof createTransaction>> {
  const row = await p;
  createdTxnIds.add(row.id);
  return row as Awaited<ReturnType<typeof createTransaction>>;
}

describe("inventory_transactions repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_SERVICE_ROLE_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, serviceRoleKey);

    // 前提: テスト用荷主を作成
    const { data: shipperData, error: shipperError } = await supabase
      .from("shippers")
      .insert({ code: `${TEST_PREFIX}SHIP`, name: "テスト荷主（TXN）" })
      .select("id")
      .single();
    if (shipperError) throw new Error(`荷主作成失敗: ${shipperError.message}`);
    shipperId = shipperData.id;

    // 前提: テスト用商品を作成
    const { data: productData, error: productError } = await supabase
      .from("products")
      .insert({
        shipper_id: shipperId,
        code: `${TEST_PREFIX}PROD`,
        name: "テスト商品（TXN）",
      })
      .select("id")
      .single();
    if (productError) throw new Error(`商品作成失敗: ${productError.message}`);
    productId = productData.id;

    // 前提: テスト用ロケーションを作成
    const { data: locationData, error: locationError } = await supabase
      .from("locations")
      .insert({ code: `${TEST_PREFIX}LOC` })
      .select("id")
      .single();
    if (locationError)
      throw new Error(`ロケーション作成失敗: ${locationError.message}`);
    locationId = locationData.id;
  });

  afterEach(async () => {
    // 各テストで作成したトランザクションを削除
    for (const id of createdTxnIds) {
      await deleteTransaction(supabase, id);
    }
    createdTxnIds.clear();
  });

  afterAll(async () => {
    // 前提データを削除（外部キー制約順: txn → product → shipper / location は独立）
    // トランザクションが残っていると product/shipper は ON DELETE RESTRICT で消せないため、
    // テストプレフィックスに一致するものを全て先に掃除する
    await supabase
      .from("inventory_transactions")
      .delete()
      .eq("shipper_id", shipperId);

    if (productId) {
      await supabase.from("products").delete().eq("id", productId);
    }
    if (locationId) {
      await supabase.from("locations").delete().eq("id", locationId);
    }
    if (shipperId) {
      await supabase.from("shippers").delete().eq("id", shipperId);
    }

    // 残骸ゼロを検証（テスト用荷主が消えていること）
    const { data } = await supabase
      .from("shippers")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(data ?? []).toHaveLength(0);
  });

  it("creates an IN transaction and reads it back", async () => {
    const input = baseInput();
    const created = await track(createTransaction(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.product_id).toBe(productId);
    expect(created.location_id).toBe(locationId);
    expect(created.txn_type).toBe("IN");
    expect(created.quantity).toBe(10);
    expect(created.status).toBe("良品");
    expect(created.lot_no).toBe(`${TEST_PREFIX}LOT`);

    const fetched = await getTransaction(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.txn_type).toBe("IN");
    expect(fetched!.quantity).toBe(10);
  });

  it("creates an OUT transaction with status 保留", async () => {
    const input: CreateTransactionInput = {
      ...baseInput(),
      txn_type: "OUT",
      quantity: 3,
      status: "保留",
      note: "出庫保留テスト",
    };
    const created = await track(createTransaction(supabase, input));

    expect(created.txn_type).toBe("OUT");
    expect(created.quantity).toBe(3);
    expect(created.status).toBe("保留");
    expect(created.note).toBe("出庫保留テスト");
  });

  it("lists transactions and returns the created ones", async () => {
    const input1 = { ...baseInput(), quantity: 5 };
    const input2: CreateTransactionInput = {
      ...baseInput(),
      txn_type: "OUT",
      quantity: 2,
    };
    const t1 = await track(createTransaction(supabase, input1));
    const t2 = await track(createTransaction(supabase, input2));

    const all = await listTransactions(supabase, { shipper_id: shipperId });
    const ids = all.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  it("filters list by txn_type IN", async () => {
    const inTxn = await track(
      createTransaction(supabase, { ...baseInput(), txn_type: "IN" }),
    );
    const outTxn = await track(
      createTransaction(supabase, { ...baseInput(), txn_type: "OUT" }),
    );

    const inOnly = await listTransactions(supabase, {
      shipper_id: shipperId,
      txn_type: "IN",
    });
    const inIds = inOnly.map((t) => t.id);
    expect(inIds).toContain(inTxn.id);
    expect(inIds).not.toContain(outTxn.id);
  });

  it("filters list by txn_type OUT", async () => {
    const inTxn = await track(
      createTransaction(supabase, { ...baseInput(), txn_type: "IN" }),
    );
    const outTxn = await track(
      createTransaction(supabase, { ...baseInput(), txn_type: "OUT" }),
    );

    const outOnly = await listTransactions(supabase, {
      shipper_id: shipperId,
      txn_type: "OUT",
    });
    const outIds = outOnly.map((t) => t.id);
    expect(outIds).toContain(outTxn.id);
    expect(outIds).not.toContain(inTxn.id);
  });

  it("respects the limit option", async () => {
    // 3件作成して limit: 2 で絞れることを確認
    await track(createTransaction(supabase, { ...baseInput(), quantity: 1 }));
    await track(createTransaction(supabase, { ...baseInput(), quantity: 2 }));
    await track(createTransaction(supabase, { ...baseInput(), quantity: 3 }));

    const limited = await listTransactions(supabase, {
      shipper_id: shipperId,
      limit: 2,
    });
    expect(limited.length).toBeLessThanOrEqual(2);
  });

  it("returns null for a non-existent transaction id", async () => {
    const fetched = await getTransaction(
      supabase,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(fetched).toBeNull();
  });

  it("deletes a transaction so it can no longer be read", async () => {
    const created = await createTransaction(supabase, baseInput());
    await deleteTransaction(supabase, created.id);

    const fetched = await getTransaction(supabase, created.id);
    expect(fetched).toBeNull();
  });

  it("stores and retrieves expiry_date and created_by", async () => {
    const input: CreateTransactionInput = {
      ...baseInput(),
      expiry_date: "2027-06-30",
      created_by: null, // anon テストでは UUID なし
      note: "賞味期限テスト",
    };
    const created = await track(createTransaction(supabase, input));

    expect(created.expiry_date).toBe("2027-06-30");
    expect(created.note).toBe("賞味期限テスト");
  });
});
