import { describe, expect, it } from "vitest";
import { validateInboundInspectionInput } from "../src/lib/inbound_inspections/types";

// 入荷検品入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/product_id 必須・inspection_method/exception_type 列挙・数量 >= 0・各種 nullable）をミラー。

describe("validateInboundInspectionInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    inbound_plan_line_id: "22222222-2222-2222-2222-222222222222",
    product_id: "33333333-3333-3333-3333-333333333333",
    inspection_method: "全数",
    planned_qty: 10,
    inspected_qty: 10,
    good_qty: 9,
    defect_qty: 1,
    lot_no: "LOT-A",
    expiry_date: "2026-12-31",
    manufacture_date: "2026-01-01",
    exception_type: "qty_short",
    note: "1個破損",
    inspected_by: "44444444-4444-4444-4444-444444444444",
  };

  it("accepts valid input and normalizes", () => {
    const r = validateInboundInspectionInput({ ...valid, note: "  1個破損  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.inspection_method).toBe("全数");
      expect(r.value.inspected_qty).toBe(10);
      expect(r.value.good_qty).toBe(9);
      expect(r.value.defect_qty).toBe(1);
      expect(r.value.exception_type).toBe("qty_short");
      expect(r.value.note).toBe("1個破損");
      expect(r.value.inspected_by).toBe(valid.inspected_by);
    }
  });

  it("defaults defect_qty to 0 and treats optional fields as null when omitted", () => {
    const r = validateInboundInspectionInput({
      shipper_id: valid.shipper_id,
      product_id: valid.product_id,
      inspection_method: "抜取り",
      inspected_qty: 5,
      good_qty: 5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.defect_qty).toBe(0);
      expect(r.value.planned_qty).toBeNull();
      expect(r.value.inbound_plan_line_id).toBeNull();
      expect(r.value.exception_type).toBeNull();
      expect(r.value.note).toBeNull();
      expect(r.value.inspected_by).toBeNull();
    }
  });

  it("rejects empty shipper_id and product_id", () => {
    const r = validateInboundInspectionInput({
      ...valid,
      shipper_id: "",
      product_id: "  ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.product_id).toBeTruthy();
    }
  });

  it("rejects an invalid inspection_method enum value", () => {
    const r = validateInboundInspectionInput({ ...valid, inspection_method: "一部" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.inspection_method).toBeTruthy();
  });

  it("rejects an invalid exception_type enum value", () => {
    const r = validateInboundInspectionInput({ ...valid, exception_type: "broken" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.exception_type).toBeTruthy();
  });

  it("rejects negative or non-integer quantities (boundary)", () => {
    const rNeg = validateInboundInspectionInput({ ...valid, inspected_qty: -1 });
    expect(rNeg.ok).toBe(false);
    if (!rNeg.ok) expect(rNeg.errors.inspected_qty).toBeTruthy();

    const rDefect = validateInboundInspectionInput({ ...valid, defect_qty: -1 });
    expect(rDefect.ok).toBe(false);
    if (!rDefect.ok) expect(rDefect.errors.defect_qty).toBeTruthy();

    const rFloat = validateInboundInspectionInput({ ...valid, good_qty: 1.5 });
    expect(rFloat.ok).toBe(false);
    if (!rFloat.ok) expect(rFloat.errors.good_qty).toBeTruthy();
  });

  it("accepts zero quantities (lower boundary >= 0)", () => {
    const r = validateInboundInspectionInput({
      ...valid,
      inspected_qty: 0,
      good_qty: 0,
      defect_qty: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.inspected_qty).toBe(0);
      expect(r.value.good_qty).toBe(0);
      expect(r.value.defect_qty).toBe(0);
    }
  });

  it("accepts all inspection_method and exception_type boundaries", () => {
    for (const m of ["全数", "抜取り"] as const) {
      const r = validateInboundInspectionInput({ ...valid, inspection_method: m });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.inspection_method).toBe(m);
    }
    for (const e of [
      "none",
      "qty_short",
      "qty_over",
      "damaged",
      "expiry_violation",
      "lot_mismatch",
    ] as const) {
      const r = validateInboundInspectionInput({ ...valid, exception_type: e });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.exception_type).toBe(e);
    }
  });
});
