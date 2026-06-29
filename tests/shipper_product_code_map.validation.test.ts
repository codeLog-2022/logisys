import { describe, expect, it } from "vitest";
import { validateShipperProductCodeMapInput } from "../src/lib/shipper_product_code_map/types";

// 読替表入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/product_id/external_code 必須・source 列挙値）をミラー。

describe("validateShipperProductCodeMapInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    product_id: "22222222-2222-2222-2222-222222222222",
    external_code: "EXT-001",
    source: "edi",
  };

  it("accepts valid input and trims", () => {
    const r = validateShipperProductCodeMapInput({
      ...valid,
      external_code: "  EXT-001  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.external_code).toBe("EXT-001");
      expect(r.value.source).toBe("edi");
    }
  });

  it("defaults source to 'shipper' when omitted", () => {
    const { source: _omit, ...withoutSource } = valid;
    const r = validateShipperProductCodeMapInput(withoutSource);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.source).toBe("shipper");
  });

  it("rejects empty required fields", () => {
    const r = validateShipperProductCodeMapInput({
      ...valid,
      shipper_id: "",
      product_id: "  ",
      external_code: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.product_id).toBeTruthy();
      expect(r.errors.external_code).toBeTruthy();
    }
  });

  it("rejects an invalid source enum value", () => {
    const r = validateShipperProductCodeMapInput({ ...valid, source: "ftp" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.source).toBeTruthy();
  });

  it("accepts all source boundaries", () => {
    for (const s of ["shipper", "edi", "mall", "other"] as const) {
      const r = validateShipperProductCodeMapInput({ ...valid, source: s });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.source).toBe(s);
    }
  });
});
