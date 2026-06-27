// 利用者(users) / ロール(roles) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.1（#59）

// DB の roles 行に対応する型
export type Role = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

// DB の users 行に対応する型
export type User = {
  id: string;
  auth_user_id: string | null;
  shipper_id: string | null;
  role_id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type UserInput = {
  email: string;
  name: string;
  role_id: string;
  shipper_id: string | null;
  auth_user_id: string | null;
  is_active: boolean;
};

export type ValidationResult =
  | { ok: true; value: UserInput }
  | { ok: false; errors: Record<string, string> };

// 簡易メール形式チェック（DB に CHECK は無いがアプリ層で先に弾く）。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// FormData などの生入力を検証し、正規化済みの UserInput を返す。
// DB の制約（email/name/role_id 必須・email unique・shipper_id nullable・is_active default true）とミラー。
export function validateUserInput(raw: {
  email?: unknown;
  name?: unknown;
  role_id?: unknown;
  shipper_id?: unknown;
  auth_user_id?: unknown;
  is_active?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (!email) errors.email = "メールアドレスは必須です";
  else if (!EMAIL_RE.test(email)) errors.email = "メールアドレスの形式が不正です";

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.name = "名前は必須です";

  const role_id = typeof raw.role_id === "string" ? raw.role_id.trim() : "";
  if (!role_id) errors.role_id = "ロールは必須です";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // shipper_id は任意（NULL=横断運営）。空文字は null に正規化。
  const rawShipper =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  const shipper_id = rawShipper || null;

  // auth_user_id は任意（Supabase Auth 未配線のため）。空文字は null に正規化。
  const rawAuth =
    typeof raw.auth_user_id === "string" ? raw.auth_user_id.trim() : "";
  const auth_user_id = rawAuth || null;

  // is_active は省略時 true（DB default と一致）。明示 false のみ false。
  const is_active = raw.is_active === undefined ? true : raw.is_active === true;

  return {
    ok: true,
    value: { email, name, role_id, shipper_id, auth_user_id, is_active },
  };
}
