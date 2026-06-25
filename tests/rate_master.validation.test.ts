import { describe, expect, it } from "vitest";
import { validateRateMasterInput } from "../src/lib/rate_master/types";

// 料金マスタ入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/code/name/unit/effective_from 必須・rate_type 列挙・unit_price >= 0）をミラー。

describe("validateRateMasterInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    rate_type: "storage",
    code: "R-001",
    name: "保管料",
    unit: "坪",
    unit_price: "1500",
    currency: "JPY",
    effective_from: "2026-04-01",
    effective_to: "2027-03-31",
  };

  it("accepts valid input and normalizes numbers/trims", () => {
    const r = validateRateMasterInput({ ...valid, code: "  R-001  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.code).toBe("R-001");
      expect(r.value.rate_type).toBe("storage");
      expect(r.value.unit_price).toBe(1500);
      expect(r.value.effective_from).toBe("2026-04-01");
      expect(r.value.effective_to).toBe("2027-03-31");
    }
  });

  it("defaults empty currency to JPY and treats empty effective_to as null", () => {
    const r = validateRateMasterInput({
      ...valid,
      currency: "",
      effective_to: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.currency).toBe("JPY");
      expect(r.value.effective_to).toBeNull();
    }
  });

  it("rejects required fields when empty", () => {
    const r = validateRateMasterInput({
      ...valid,
      shipper_id: "",
      code: "  ",
      name: "",
      unit: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.code).toBeTruthy();
      expect(r.errors.name).toBeTruthy();
      expect(r.errors.unit).toBeTruthy();
    }
  });

  it("rejects an invalid rate_type enum value", () => {
    const r = validateRateMasterInput({ ...valid, rate_type: "tax" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.rate_type).toBeTruthy();
  });

  it("rejects a negative unit_price", () => {
    const r = validateRateMasterInput({ ...valid, unit_price: "-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.unit_price).toBeTruthy();
  });

  it("rejects an invalid effective_from date", () => {
    const bad = validateRateMasterInput({ ...valid, effective_from: "2026/04/01" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.effective_from).toBeTruthy();

    const overflow = validateRateMasterInput({
      ...valid,
      effective_from: "2026-02-31",
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.errors.effective_from).toBeTruthy();
  });
});
