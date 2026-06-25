import { describe, expect, it } from "vitest";
import { validateInboundPlanLineInput } from "../src/lib/inbound_plan_lines/types";

// 入荷予定明細入力バリデーション（純ロジック）の検証。
// DB 制約（inbound_plan_id/product_id 必須・planned_qty > 0・lot_no/expiry_date nullable）をミラー。

describe("validateInboundPlanLineInput", () => {
  const valid = {
    inbound_plan_id: "11111111-1111-1111-1111-111111111111",
    product_id: "22222222-2222-2222-2222-222222222222",
    planned_qty: 10,
    lot_no: "LOT-A",
    expiry_date: "2026-12-31",
  };

  it("accepts valid input and normalizes", () => {
    const r = validateInboundPlanLineInput({ ...valid, lot_no: "  LOT-A  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.planned_qty).toBe(10);
      expect(r.value.lot_no).toBe("LOT-A");
      expect(r.value.expiry_date).toBe("2026-12-31");
    }
  });

  it("treats empty lot_no and expiry_date as null", () => {
    const r = validateInboundPlanLineInput({
      ...valid,
      lot_no: "  ",
      expiry_date: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lot_no).toBeNull();
      expect(r.value.expiry_date).toBeNull();
    }
  });

  it("rejects empty inbound_plan_id and product_id", () => {
    const r = validateInboundPlanLineInput({
      ...valid,
      inbound_plan_id: "",
      product_id: "  ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.inbound_plan_id).toBeTruthy();
      expect(r.errors.product_id).toBeTruthy();
    }
  });

  it("rejects non-positive or non-integer planned_qty (boundary)", () => {
    for (const bad of [0, -1, 1.5, "abc", ""]) {
      const r = validateInboundPlanLineInput({ ...valid, planned_qty: bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.planned_qty).toBeTruthy();
    }
  });

  it("accepts planned_qty = 1 (lower boundary)", () => {
    const r = validateInboundPlanLineInput({ ...valid, planned_qty: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.planned_qty).toBe(1);
  });

  it("rejects a malformed expiry_date", () => {
    const r = validateInboundPlanLineInput({ ...valid, expiry_date: "2026-13-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.expiry_date).toBeTruthy();
  });
});
