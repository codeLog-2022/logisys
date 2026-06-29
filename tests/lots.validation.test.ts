import { describe, expect, it } from "vitest";
import { validateLotInput } from "../src/lib/lots/types";

// 純ロジック（Next/DB非依存）: validateLotInput が DB 制約をミラーするか検証する。
// 必須: shipper_id / product_id / lot_no。任意: expiry_date / manufacture_date（ISO日付）/ serial_no。

describe("validateLotInput", () => {
  const valid = {
    shipper_id: "11111111-1111-4111-8111-111111111111",
    product_id: "22222222-2222-4222-8222-222222222222",
    lot_no: "LOT-001",
    expiry_date: "2026-12-31",
    manufacture_date: "2026-01-01",
    serial_no: "SN-001",
  };

  it("accepts a fully specified input and returns the normalized value", () => {
    const res = validateLotInput(valid);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual({
        shipper_id: valid.shipper_id,
        product_id: valid.product_id,
        lot_no: "LOT-001",
        expiry_date: "2026-12-31",
        manufacture_date: "2026-01-01",
        serial_no: "SN-001",
      });
    }
  });

  it("requires shipper_id, product_id and lot_no", () => {
    const res = validateLotInput({
      shipper_id: "  ",
      product_id: "",
      lot_no: "   ",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.shipper_id).toBeTruthy();
      expect(res.errors.product_id).toBeTruthy();
      expect(res.errors.lot_no).toBeTruthy();
    }
  });

  it("treats expiry_date / manufacture_date / serial_no as optional (empty → null)", () => {
    const res = validateLotInput({
      shipper_id: valid.shipper_id,
      product_id: valid.product_id,
      lot_no: "LOT-NOOPT",
      expiry_date: "",
      manufacture_date: "  ",
      serial_no: "",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.expiry_date).toBeNull();
      expect(res.value.manufacture_date).toBeNull();
      expect(res.value.serial_no).toBeNull();
    }
  });

  it("rejects a non-ISO expiry_date", () => {
    const res = validateLotInput({ ...valid, expiry_date: "2026/12/31" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.expiry_date).toBeTruthy();
  });

  it("rejects a calendar-invalid manufacture_date (Feb 30)", () => {
    const res = validateLotInput({ ...valid, manufacture_date: "2026-02-30" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.manufacture_date).toBeTruthy();
  });

  it("trims lot_no", () => {
    const res = validateLotInput({ ...valid, lot_no: "  LOT-TRIM  " });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.lot_no).toBe("LOT-TRIM");
  });
});
