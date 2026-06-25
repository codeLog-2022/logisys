import { describe, expect, it } from "vitest";
import { validateProductInput } from "../src/lib/products/types";

// 商品入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/code/name 必須・temp_zone 列挙値・units_per_case nullable）を
// ミラーし、UI で先に弾けることを確認する。

describe("validateProductInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    code: "P-001",
    name: "テスト商品",
    unit: "ケース",
    temp_zone: "冷蔵",
    units_per_case: "12",
    hazard_class: "クラス3",
  };

  it("accepts valid input and normalizes/trims", () => {
    const r = validateProductInput({ ...valid, code: "  P-001  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.code).toBe("P-001"); // trim 済み
      expect(r.value.shipper_id).toBe(valid.shipper_id);
      expect(r.value.unit).toBe("ケース");
      expect(r.value.temp_zone).toBe("冷蔵");
      expect(r.value.units_per_case).toBe(12); // "12" -> 12
      expect(r.value.hazard_class).toBe("クラス3");
    }
  });

  it("defaults empty unit to 'バラ' and empty hazard_class to null", () => {
    const r = validateProductInput({
      ...valid,
      unit: "   ",
      hazard_class: "",
      units_per_case: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.unit).toBe("バラ"); // 未入力 -> default
      expect(r.value.hazard_class).toBeNull(); // 空 -> null
      expect(r.value.units_per_case).toBeNull(); // 空 -> null
    }
  });

  it("rejects empty shipper_id, code and name", () => {
    const r = validateProductInput({
      ...valid,
      shipper_id: "",
      code: "   ",
      name: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.code).toBeTruthy();
      expect(r.errors.name).toBeTruthy();
    }
  });

  it("rejects an invalid temp_zone enum value", () => {
    const r = validateProductInput({ ...valid, temp_zone: "冷凍庫" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.temp_zone).toBeTruthy();
    }
  });

  it("rejects a non-positive or non-integer units_per_case", () => {
    const zero = validateProductInput({ ...valid, units_per_case: "0" });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.errors.units_per_case).toBeTruthy();

    const fraction = validateProductInput({ ...valid, units_per_case: "1.5" });
    expect(fraction.ok).toBe(false);
    if (!fraction.ok) expect(fraction.errors.units_per_case).toBeTruthy();
  });
});
