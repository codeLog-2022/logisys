import { describe, expect, it } from "vitest";
import { validateAuditLogInput } from "../src/lib/audit_logs/types";

// 監査ログ(audit_logs) 入力バリデーション（純ロジック）の検証。
// DB 制約（action/entity_type 必須・before/after は任意 jsonb・actor_user_id/shipper_id nullable）をミラー。
// 設計: Phase1-DataModel-Design.md §3.10（#61）。

describe("validateAuditLogInput", () => {
  const valid = {
    action: "update",
    entity_type: "products",
    entity_id: "11111111-1111-1111-1111-111111111111",
    actor_user_id: "22222222-2222-2222-2222-222222222222",
    shipper_id: "33333333-3333-3333-3333-333333333333",
    before: { name: "旧" },
    after: { name: "新" },
  };

  it("accepts valid input and keeps before/after diff payloads", () => {
    const r = validateAuditLogInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.action).toBe("update");
      expect(r.value.entity_type).toBe("products");
      expect(r.value.before).toEqual({ name: "旧" });
      expect(r.value.after).toEqual({ name: "新" });
    }
  });

  it("treats empty actor/shipper/entity_id as null (unauthenticated allowed)", () => {
    const r = validateAuditLogInput({
      action: "create",
      entity_type: "shippers",
      entity_id: "",
      actor_user_id: "  ",
      shipper_id: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.actor_user_id).toBeNull();
      expect(r.value.shipper_id).toBeNull();
      expect(r.value.entity_id).toBeNull();
      expect(r.value.before).toBeNull();
      expect(r.value.after).toBeNull();
    }
  });

  it("rejects empty action and entity_type", () => {
    const r = validateAuditLogInput({ action: "  ", entity_type: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.action).toBeTruthy();
      expect(r.errors.entity_type).toBeTruthy();
    }
  });

  it("rejects an action outside the known set", () => {
    const r = validateAuditLogInput({ ...valid, action: "frobnicate" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.action).toBeTruthy();
  });

  it("accepts all known action boundaries", () => {
    for (const a of ["create", "update", "delete", "inspect"] as const) {
      const r = validateAuditLogInput({ ...valid, action: a });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.action).toBe(a);
    }
  });
});
