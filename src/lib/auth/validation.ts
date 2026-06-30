// 認証フォーム入力バリデーション（純ロジック・DB/ブラウザ非依存）

export type LoginInput = {
  email: string;
  password: string;
};

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export function validateLoginInput(input: LoginInput): Result<LoginInput> {
  const email = input.email.trim();
  const password = input.password;

  if (!email) {
    return { ok: false, error: "email is required" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "email format is invalid" };
  }
  if (!password) {
    return { ok: false, error: "password is required" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  return { ok: true, value: { email, password } };
}
