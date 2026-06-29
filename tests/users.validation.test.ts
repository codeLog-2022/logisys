import { describe, expect, it } from "vitest";
import { validateUserInput } from "../src/lib/users/types";

// 利用者(users) 入力バリデーション（純ロジック）の検証。
// DB 制約（email/name/role_id 必須・email 形式・shipper_id nullable=横断運営・is_active default true）をミラー。
// 設計: Phase1-DataModel-Design.md §3.1（#59）。

describe("validateUserInput", () => {
  const valid = {
    email: "user@example.com",
    name: "テスト利用者",
    role_id: "11111111-1111-1111-1111-111111111111",
    shipper_id: "22222222-2222-2222-2222-222222222222",
    auth_user_id: "33333333-3333-3333-3333-333333333333",
    is_active: true,
  };

  it("accepts valid input and trims/normalizes", () => {
    const r = validateUserInput({ ...valid, email: "  user@example.com  ", name: "  名前  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("user@example.com");
      expect(r.value.name).toBe("名前");
      expect(r.value.role_id).toBe(valid.role_id);
      expect(r.value.shipper_id).toBe(valid.shipper_id);
      expect(r.value.auth_user_id).toBe(valid.auth_user_id);
      expect(r.value.is_active).toBe(true);
    }
  });

  it("treats empty shipper_id / auth_user_id as null (cross-org / auth not wired)", () => {
    const r = validateUserInput({ ...valid, shipper_id: "  ", auth_user_id: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shipper_id).toBeNull();
      expect(r.value.auth_user_id).toBeNull();
    }
  });

  it("defaults is_active to true when omitted", () => {
    const r = validateUserInput({
      email: valid.email,
      name: valid.name,
      role_id: valid.role_id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.is_active).toBe(true);
  });

  it("accepts is_active=false explicitly", () => {
    const r = validateUserInput({ ...valid, is_active: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.is_active).toBe(false);
  });

  it("rejects empty email, name and role_id", () => {
    const r = validateUserInput({ email: "  ", name: "", role_id: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBeTruthy();
      expect(r.errors.name).toBeTruthy();
      expect(r.errors.role_id).toBeTruthy();
    }
  });

  it("rejects a malformed email", () => {
    const r = validateUserInput({ ...valid, email: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });
});
