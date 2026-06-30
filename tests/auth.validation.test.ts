import { describe, expect, it } from "vitest";
import {
  validateLoginInput,
  type LoginInput,
} from "../src/lib/auth/validation";

// 認証 (auth) 入力バリデーション（純ロジック）の検証。
// /login フォームの入力値を検証する。ブラウザ不要の純ロジックテスト。

describe("validateLoginInput", () => {
  const valid: LoginInput = {
    email: "test@example.com",
    password: "password123",
  };

  it("accepts valid email and password", () => {
    const r = validateLoginInput(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("test@example.com");
      expect(r.value.password).toBe("password123");
    }
  });

  it("trims whitespace from email", () => {
    const r = validateLoginInput({ ...valid, email: "  test@example.com  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("test@example.com");
    }
  });

  it("rejects empty email", () => {
    const r = validateLoginInput({ ...valid, email: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/email/i);
    }
  });

  it("rejects whitespace-only email", () => {
    const r = validateLoginInput({ ...valid, email: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/email/i);
    }
  });

  it("rejects invalid email format", () => {
    const r = validateLoginInput({ ...valid, email: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/email/i);
    }
  });

  it("rejects empty password", () => {
    const r = validateLoginInput({ ...valid, password: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/password/i);
    }
  });

  it("rejects password shorter than 6 characters", () => {
    const r = validateLoginInput({ ...valid, password: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/password/i);
    }
  });

  it("accepts password of exactly 6 characters", () => {
    const r = validateLoginInput({ ...valid, password: "abcdef" });
    expect(r.ok).toBe(true);
  });
});
