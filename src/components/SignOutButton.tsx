"use client";

// サインアウトフォーム（クライアントコンポーネント）
// POST /auth/signout を呼び出す
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="POST">
      <button
        type="submit"
        className="rounded px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        サインアウト
      </button>
    </form>
  );
}
