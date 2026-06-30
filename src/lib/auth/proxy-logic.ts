// proxy.ts から分離したリダイレクト判定ロジック（純関数・テスト可能）

export type SessionState = {
  hasSession: boolean;
  pathname: string;
};

/**
 * セッション状態とリクエストパスに基づきリダイレクト先を返す。
 * - 未認証 + /login 以外 → "/login"
 * - 認証済み + /login   → "/"
 * - それ以外              → null（リダイレクト不要）
 */
export function getRedirectTarget(state: SessionState): string | null {
  const { hasSession, pathname } = state;

  if (!hasSession && pathname !== "/login") {
    return "/login";
  }
  if (hasSession && pathname === "/login") {
    return "/";
  }
  return null;
}
