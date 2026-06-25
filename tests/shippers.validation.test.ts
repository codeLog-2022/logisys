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
});
