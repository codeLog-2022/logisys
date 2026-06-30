import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/proxy";
import {
  getRedirectTarget,
  type SessionState,
} from "../src/lib/auth/proxy-logic";

// proxy.ts のルーティングロジック検証
// - matcher が期待するパスを正しくフィルタするかを確認
// - セッション判定によるリダイレクト先ロジックを純関数で確認

describe("proxy matcher", () => {
  it("matches a protected page", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/" })
    ).toBe(true);
  });

  it("matches /transactions", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/transactions" })
    ).toBe(true);
  });

  it("does not match /login (pass-through)", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/login" })
    ).toBe(false);
  });

  it("does not match _next/static (static assets)", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/_next/static/chunks/main.js",
      })
    ).toBe(false);
  });

  it("does not match _next/image", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/_next/image?url=foo",
      })
    ).toBe(false);
  });

  it("does not match favicon.ico", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/favicon.ico" })
    ).toBe(false);
  });

  it("does not match /auth/signout route handler", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/auth/signout" })
    ).toBe(false);
  });
});

describe("getRedirectTarget (redirect logic)", () => {
  it("returns /login when session is absent and path is not /login", () => {
    const state: SessionState = { hasSession: false, pathname: "/" };
    expect(getRedirectTarget(state)).toBe("/login");
  });

  it("returns /login for protected nested path without session", () => {
    const state: SessionState = { hasSession: false, pathname: "/transactions/123" };
    expect(getRedirectTarget(state)).toBe("/login");
  });

  it("returns / when authenticated user visits /login", () => {
    const state: SessionState = { hasSession: true, pathname: "/login" };
    expect(getRedirectTarget(state)).toBe("/");
  });

  it("returns null when authenticated user visits a protected page", () => {
    const state: SessionState = { hasSession: true, pathname: "/" };
    expect(getRedirectTarget(state)).toBe(null);
  });

  it("returns null when authenticated user visits /transactions", () => {
    const state: SessionState = { hasSession: true, pathname: "/transactions" };
    expect(getRedirectTarget(state)).toBe(null);
  });
});
