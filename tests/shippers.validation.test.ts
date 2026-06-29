import { describe, expect, it } from "vitest";
import { validateShipperInput } from "../src/lib/shippers/types";

// 荷主入力バリデーション（純ロジック）の検証。
// DB 制約（code/name 必須・列挙値）をミラーし、UI で先に弾けることを確認する。

describe("validateShipperInput", () => {
  const valid = {
    code: "ACME",
    name: "アクメ商事",
    inspection_method: "全数",
    picking_rule: "FIFO",
    lot_managed: "on",
  };

  it("accepts valid input and normalizes flags/trims", () => {
    const r = validateShipperInput({ ...valid, code: "  ACME  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.code).toBe("ACME"); // trim 済み
      expect(r.value.lot_managed).toBe(true); // "on" -> true
      expect(r.value.expiry_managed).toBe(false); // 未指定 -> false
      expect(r.value.inspection_method).toBe("全数");
    }
  });

  it("rejects empty code and name", () => {
    const r = validateShipperInput({ ...valid, code: "   ", name: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.code).toBeTruthy();
      expect(r.errors.name).toBeTruthy();
    }
  });

  it("rejects invalid enum values", () => {
    const r = validateShipperInput({
      ...valid,
      inspection_method: "全部",
      picking_rule: "LIFO",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.inspection_method).toBeTruthy();
      expect(r.errors.picking_rule).toBeTruthy();
    }
  });

  // 0003 追加: picking_rule の拡張値・新規列の検証

  it("accepts the expanded picking_rule values (ロット指定 / 受注優先)", () => {
    const lot = validateShipperInput({ ...valid, picking_rule: "ロット指定" });
    expect(lot.ok).toBe(true);
    if (lot.ok) expect(lot.value.picking_rule).toBe("ロット指定");

    const order = validateShipperInput({ ...valid, picking_rule: "受注優先" });
    expect(order.ok).toBe(true);
    if (order.ok) expect(order.value.picking_rule).toBe("受注優先");
  });

  it("defaults the new 0003 columns when omitted", () => {
    const r = validateShipperInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.storage_billing_method).toBe("個建て");
      expect(r.value.storage_billing_cycle).toBe("3期制");
      expect(r.value.storage_basis).toBe("期末");
      expect(r.value.closing_day).toBe(99);
      expect(r.value.expiry_acceptance_ratio).toBe(0);
      expect(r.value.inventory_mixing).toBe("allowed");
    }
  });

  it("accepts valid 0003 column values", () => {
    const r = validateShipperInput({
      ...valid,
      storage_billing_method: "坪建て",
      storage_billing_cycle: "日割",
      storage_basis: "平均",
      closing_day: "20",
      expiry_acceptance_ratio: "3",
      inventory_mixing: "denied",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.storage_billing_method).toBe("坪建て");
      expect(r.value.storage_billing_cycle).toBe("日割");
      expect(r.value.storage_basis).toBe("平均");
      expect(r.value.closing_day).toBe(20);
      expect(r.value.expiry_acceptance_ratio).toBe(3);
      expect(r.value.inventory_mixing).toBe("denied");
    }
  });

  it("rejects invalid 0003 enum values", () => {
    const r = validateShipperInput({
      ...valid,
      storage_billing_method: "重量建て",
      storage_billing_cycle: "月割",
      storage_basis: "期首",
      inventory_mixing: "mixed",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.storage_billing_method).toBeTruthy();
      expect(r.errors.storage_billing_cycle).toBeTruthy();
      expect(r.errors.storage_basis).toBeTruthy();
      expect(r.errors.inventory_mixing).toBeTruthy();
    }
  });

  it("rejects an out-of-range closing_day and an invalid expiry_acceptance_ratio", () => {
    const day = validateShipperInput({ ...valid, closing_day: "40" });
    expect(day.ok).toBe(false);
    if (!day.ok) expect(day.errors.closing_day).toBeTruthy();

    const day0 = validateShipperInput({ ...valid, closing_day: "0" });
    expect(day0.ok).toBe(false);
    if (!day0.ok) expect(day0.errors.closing_day).toBeTruthy();

    const ratio = validateShipperInput({ ...valid, expiry_acceptance_ratio: "5" });
    expect(ratio.ok).toBe(false);
    if (!ratio.ok) expect(ratio.errors.expiry_acceptance_ratio).toBeTruthy();
  });
});
