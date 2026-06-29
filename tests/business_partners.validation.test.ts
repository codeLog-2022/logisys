import { describe, expect, it } from "vitest";
import { validateBusinessPartnerInput } from "../src/lib/business_partners/types";

// 取引先入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/code/name 必須・partner_type 列挙値・parent_id nullable）をミラー。

describe("validateBusinessPartnerInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    code: "BP-001",
    name: "テスト取引先",
    partner_type: "ship_to",
    parent_id: "22222222-2222-2222-2222-222222222222",
    postal_code: "100-0001",
    address: "東京都千代田区",
    tel: "03-0000-0000",
  };

  it("accepts valid input and trims/normalizes", () => {
    const r = validateBusinessPartnerInput({ ...valid, code: "  BP-001  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.code).toBe("BP-001");
      expect(r.value.partner_type).toBe("ship_to");
      expect(r.value.parent_id).toBe(valid.parent_id);
      expect(r.value.postal_code).toBe("100-0001");
    }
  });

  it("treats empty parent_id and optional fields as null", () => {
    const r = validateBusinessPartnerInput({
      ...valid,
      parent_id: "  ",
      postal_code: "",
      address: "   ",
      tel: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.parent_id).toBeNull();
      expect(r.value.postal_code).toBeNull();
      expect(r.value.address).toBeNull();
      expect(r.value.tel).toBeNull();
    }
  });

  it("rejects empty shipper_id, code and name", () => {
    const r = validateBusinessPartnerInput({
      ...valid,
      shipper_id: "",
      code: "  ",
      name: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.code).toBeTruthy();
      expect(r.errors.name).toBeTruthy();
    }
  });

  it("rejects an invalid partner_type enum value", () => {
    const r = validateBusinessPartnerInput({ ...valid, partner_type: "vendor" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.partner_type).toBeTruthy();
  });

  it("accepts all partner_type boundaries", () => {
    for (const t of ["ship_to", "supplier", "bill_to"] as const) {
      const r = validateBusinessPartnerInput({ ...valid, partner_type: t });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.partner_type).toBe(t);
    }
  });
});
