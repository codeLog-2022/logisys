import { describe, expect, it } from "vitest";
import {
  TXN_STATUSES,
  TXN_TYPES,
  validateTransactionInput,
} from "../src/lib/inventory_transactions/types";

// ユニットテスト: validateTransactionInput のバリデーションロジックを検証する。
// 実 DB 不要・ローカル Supabase 未起動でも通る。

describe("validateTransactionInput", () => {
  const validBase = {
    shipper_id: "00000000-0000-0000-0000-000000000001",
    product_id: "00000000-0000-0000-0000-000000000002",
    location_id: "00000000-0000-0000-0000-000000000003",
    txn_type: "IN",
    quantity: "10",
    status: "良品",
    lot_no: "LOT-001",
    expiry_date: "2026-12-31",
    note: "テストノート",
    created_by: null,
  };

  it("accepts valid IN transaction input and normalizes it", () => {
    const result = validateTransactionInput(validBase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.shipper_id).toBe(validBase.shipper_id);
    expect(result.value.product_id).toBe(validBase.product_id);
    expect(result.value.location_id).toBe(validBase.location_id);
    expect(result.value.txn_type).toBe("IN");
    expect(result.value.quantity).toBe(10);
    expect(result.value.status).toBe("良品");
    expect(result.value.lot_no).toBe("LOT-001");
    expect(result.value.expiry_date).toBe("2026-12-31");
    expect(result.value.note).toBe("テストノート");
    expect(result.value.created_by).toBeNull();
  });

  it("accepts valid OUT transaction input", () => {
    const result = validateTransactionInput({ ...validBase, txn_type: "OUT" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.txn_type).toBe("OUT");
  });

  it("accepts all valid txn_type values", () => {
    for (const txn_type of TXN_TYPES) {
      const result = validateTransactionInput({ ...validBase, txn_type });
      expect(result.ok, `txn_type=${txn_type} should be valid`).toBe(true);
    }
  });

  it("accepts all valid status values", () => {
    for (const status of TXN_STATUSES) {
      const result = validateTransactionInput({ ...validBase, status });
      expect(result.ok, `status=${status} should be valid`).toBe(true);
    }
  });

  it("defaults status to 良品 when omitted", () => {
    const result = validateTransactionInput({ ...validBase, status: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("良品");
  });

  it("normalizes empty optional fields to null", () => {
    const result = validateTransactionInput({
      ...validBase,
      lot_no: "",
      expiry_date: "",
      note: "",
      created_by: undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lot_no).toBeNull();
    expect(result.value.expiry_date).toBeNull();
    expect(result.value.note).toBeNull();
    expect(result.value.created_by).toBeNull();
  });

  it("trims whitespace from string fields", () => {
    const result = validateTransactionInput({
      ...validBase,
      lot_no: "  LOT-TRIM  ",
      note: "  note with spaces  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lot_no).toBe("LOT-TRIM");
    expect(result.value.note).toBe("note with spaces");
  });

  it("rejects missing shipper_id", () => {
    const result = validateTransactionInput({ ...validBase, shipper_id: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.shipper_id).toBeTruthy();
  });

  it("rejects missing product_id", () => {
    const result = validateTransactionInput({ ...validBase, product_id: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.product_id).toBeTruthy();
  });

  it("rejects missing location_id", () => {
    const result = validateTransactionInput({ ...validBase, location_id: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.location_id).toBeTruthy();
  });

  it("rejects invalid txn_type", () => {
    const result = validateTransactionInput({
      ...validBase,
      txn_type: "TRANSFER",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.txn_type).toBeTruthy();
  });

  it("rejects quantity = 0", () => {
    const result = validateTransactionInput({ ...validBase, quantity: "0" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.quantity).toBeTruthy();
  });

  it("rejects negative quantity", () => {
    const result = validateTransactionInput({ ...validBase, quantity: "-5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.quantity).toBeTruthy();
  });

  it("rejects non-integer quantity", () => {
    const result = validateTransactionInput({ ...validBase, quantity: "1.5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.quantity).toBeTruthy();
  });

  it("rejects empty quantity", () => {
    const result = validateTransactionInput({ ...validBase, quantity: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.quantity).toBeTruthy();
  });

  it("accepts numeric quantity as number type", () => {
    const result = validateTransactionInput({ ...validBase, quantity: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quantity).toBe(5);
  });

  it("rejects invalid status", () => {
    const result = validateTransactionInput({
      ...validBase,
      status: "廃棄",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.status).toBeTruthy();
  });

  it("collects multiple errors at once", () => {
    const result = validateTransactionInput({
      shipper_id: "",
      product_id: "",
      location_id: "",
      txn_type: "INVALID",
      quantity: "0",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.shipper_id).toBeTruthy();
    expect(result.errors.product_id).toBeTruthy();
    expect(result.errors.location_id).toBeTruthy();
    expect(result.errors.txn_type).toBeTruthy();
    expect(result.errors.quantity).toBeTruthy();
  });
});
