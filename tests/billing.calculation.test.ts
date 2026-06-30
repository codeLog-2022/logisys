// billing.calculation.test.ts
// 算定ロジック（calculateStorageFee / calculateHandlingFee）の純関数ユニットテスト。
// DB 接続不要。実際の数値計算をブラックボックスで検証する。

import { describe, expect, it } from "vitest";
import {
  calculateStorageFee,
  calculateHandlingFee,
} from "../src/lib/billing/calculation";
import type { RateMaster } from "../src/lib/rate_master/types";
import type { InventoryCurrentRow } from "../src/lib/inventory/types";
import type { InventoryTransaction } from "../src/lib/inventory_transactions/types";

// テスト用フィクスチャヘルパー
function makeStorageRate(overrides: Partial<RateMaster> = {}): RateMaster {
  return {
    id: "rate-storage-1",
    shipper_id: "shipper-1",
    rate_type: "storage",
    code: "STG-001",
    name: "保管料",
    unit: "個",
    unit_price: 10,
    currency: "JPY",
    effective_from: "2026-01-01",
    effective_to: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHandlingRate(overrides: Partial<RateMaster> = {}): RateMaster {
  return {
    id: "rate-handling-1",
    shipper_id: "shipper-1",
    rate_type: "handling",
    code: "HDL-001",
    name: "荷役料",
    unit: "件",
    unit_price: 50,
    currency: "JPY",
    effective_from: "2026-01-01",
    effective_to: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeInventoryRow(overrides: Partial<InventoryCurrentRow> = {}): InventoryCurrentRow {
  return {
    shipper_id: "shipper-1",
    product_id: "product-1",
    location_id: "location-1",
    lot_id: null,
    lot_no: null,
    expiry_date: null,
    status: "良品",
    qty: "100",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<InventoryTransaction> = {}): InventoryTransaction {
  return {
    id: "txn-1",
    shipper_id: "shipper-1",
    product_id: "product-1",
    location_id: "location-1",
    txn_type: "IN",
    quantity: 10,
    status: "良品",
    lot_no: null,
    expiry_date: null,
    note: null,
    created_at: "2026-06-15T00:00:00Z",
    created_by: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateStorageFee
// ---------------------------------------------------------------------------
describe("calculateStorageFee", () => {
  it("単一の料金マスタ × 在庫数量で金額を算定する", () => {
    const rates = [makeStorageRate({ unit_price: 10 })];
    const inventory = [makeInventoryRow({ qty: "100" })];

    const result = calculateStorageFee(rates, inventory);

    // 10 円 × 100 個 = 1,000 円
    expect(result.totalAmount).toBe(1000);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].line_type).toBe("storage");
    expect(result.lineItems[0].quantity).toBe(100);
    expect(result.lineItems[0].unit_price).toBe(10);
    expect(result.lineItems[0].amount).toBe(1000);
  });

  it("複数の在庫行の数量合計を用いて算定する", () => {
    const rates = [makeStorageRate({ unit_price: 5 })];
    const inventory = [
      makeInventoryRow({ qty: "200", product_id: "p1" }),
      makeInventoryRow({ qty: "50", product_id: "p2" }),
    ];

    const result = calculateStorageFee(rates, inventory);

    // 5 円 × (200 + 50) = 1,250 円
    expect(result.totalAmount).toBe(1250);
    expect(result.lineItems[0].quantity).toBe(250);
  });

  it("料金マスタが空のとき金額は 0 で明細なし", () => {
    const result = calculateStorageFee([], [makeInventoryRow()]);
    expect(result.totalAmount).toBe(0);
    expect(result.lineItems).toHaveLength(0);
  });

  it("在庫が空のとき金額は 0", () => {
    const rates = [makeStorageRate({ unit_price: 10 })];
    const result = calculateStorageFee(rates, []);
    expect(result.totalAmount).toBe(0);
  });

  it("複数の保管料マスタがある場合、それぞれ明細行を作成する", () => {
    const rates = [
      makeStorageRate({ id: "r1", code: "STG-001", name: "保管料A", unit_price: 10 }),
      makeStorageRate({ id: "r2", code: "STG-002", name: "保管料B", unit_price: 20 }),
    ];
    const inventory = [makeInventoryRow({ qty: "100" })];

    const result = calculateStorageFee(rates, inventory);

    // 各料金マスタが 1 行ずつ生成される
    expect(result.lineItems).toHaveLength(2);
    expect(result.totalAmount).toBe(1000 + 2000); // 3,000
  });

  it("qty が文字列として渡されても正しく数値として扱う", () => {
    const rates = [makeStorageRate({ unit_price: 1 })];
    const inventory = [makeInventoryRow({ qty: "999" })];
    const result = calculateStorageFee(rates, inventory);
    expect(result.totalAmount).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// calculateHandlingFee
// ---------------------------------------------------------------------------
describe("calculateHandlingFee", () => {
  it("単一の料金マスタ × 入出庫件数で金額を算定する", () => {
    const rates = [makeHandlingRate({ unit_price: 50 })];
    const transactions = [
      makeTransaction({ txn_type: "IN", quantity: 10 }),
      makeTransaction({ txn_type: "OUT", quantity: 5 }),
    ];

    const result = calculateHandlingFee(rates, transactions);

    // 50 円 × 2 件 = 100 円（数量でなく件数ベース）
    expect(result.totalAmount).toBe(100);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].line_type).toBe("handling");
    expect(result.lineItems[0].quantity).toBe(2);
    expect(result.lineItems[0].unit_price).toBe(50);
    expect(result.lineItems[0].amount).toBe(100);
  });

  it("荷役料マスタが空のとき金額は 0 で明細なし", () => {
    const txns = [makeTransaction()];
    const result = calculateHandlingFee([], txns);
    expect(result.totalAmount).toBe(0);
    expect(result.lineItems).toHaveLength(0);
  });

  it("トランザクションが空のとき金額は 0", () => {
    const rates = [makeHandlingRate({ unit_price: 50 })];
    const result = calculateHandlingFee(rates, []);
    expect(result.totalAmount).toBe(0);
  });

  it("複数の荷役料マスタがある場合、それぞれ明細行を作成する", () => {
    const rates = [
      makeHandlingRate({ id: "r1", code: "HDL-001", name: "荷役料A", unit_price: 30 }),
      makeHandlingRate({ id: "r2", code: "HDL-002", name: "荷役料B", unit_price: 70 }),
    ];
    const transactions = [makeTransaction(), makeTransaction()];

    const result = calculateHandlingFee(rates, transactions);

    // 各料金マスタ 2 件ずつ
    expect(result.lineItems).toHaveLength(2);
    expect(result.totalAmount).toBe(30 * 2 + 70 * 2); // 200
  });

  it("IN / OUT 以外の txn_type（ADJUST等）も件数としてカウントする", () => {
    const rates = [makeHandlingRate({ unit_price: 50 })];
    const transactions = [
      makeTransaction({ txn_type: "IN" }),
      makeTransaction({ txn_type: "OUT" }),
      makeTransaction({ txn_type: "ADJUST" as unknown as "IN" }),
    ];

    const result = calculateHandlingFee(rates, transactions);

    // 3 件すべてカウント
    expect(result.lineItems[0].quantity).toBe(3);
    expect(result.totalAmount).toBe(150);
  });
});
