import { describe, expect, it } from "vitest";
import { validateMasterRevisionInput } from "../src/lib/master_revisions/types";

// マスタ改定履歴入力バリデーション（純ロジック）の検証。
// DB 制約（entity_type 列挙・entity_id/effective_from/snapshot 必須・shipper_id/changed_by 任意）をミラー。

describe("validateMasterRevisionInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    entity_type: "product",
    entity_id: "22222222-2222-2222-2222-222222222222",
    effective_from: "2026-04-01",
    effective_to: "2027-03-31",
    snapshot: { code: "P-001", name: "改定前商品" },
    changed_by: "33333333-3333-3333-3333-333333333333",
  };

  it("accepts valid input and preserves the snapshot object", () => {
    const r = validateMasterRevisionInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.entity_type).toBe("product");
      expect(r.value.entity_id).toBe(valid.entity_id);
      expect(r.value.snapshot).toEqual({ code: "P-001", name: "改定前商品" });
      expect(r.value.changed_by).toBe(valid.changed_by);
    }
  });

  it("treats empty shipper_id, changed_by and effective_to as null", () => {
    const r = validateMasterRevisionInput({
      ...valid,
      shipper_id: "  ",
      changed_by: "",
      effective_to: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shipper_id).toBeNull();
      expect(r.value.changed_by).toBeNull();
      expect(r.value.effective_to).toBeNull();
    }
  });

  it("rejects an invalid entity_type enum value", () => {
    const r = validateMasterRevisionInput({ ...valid, entity_type: "order" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.entity_type).toBeTruthy();
  });

  it("rejects a missing entity_id and an invalid effective_from", () => {
    const r = validateMasterRevisionInput({
      ...valid,
      entity_id: "  ",
      effective_from: "not-a-date",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.entity_id).toBeTruthy();
      expect(r.errors.effective_from).toBeTruthy();
    }
  });

  it("rejects a non-object snapshot", () => {
    const arr = validateMasterRevisionInput({ ...valid, snapshot: [1, 2, 3] });
    expect(arr.ok).toBe(false);
    if (!arr.ok) expect(arr.errors.snapshot).toBeTruthy();

    const missing = validateMasterRevisionInput({ ...valid, snapshot: undefined });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.snapshot).toBeTruthy();
  });
});
