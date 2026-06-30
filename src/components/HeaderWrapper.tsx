// Server Component: ユーザーセッションを取得し、クライアント Header と合成する
import { createClient } from "@/lib/supabase/server";
import { Header } from "./Header";
import { SignOutButton } from "./SignOutButton";

export async function HeaderWrapper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-0">
        {/* クライアントナビゲーション（既存） */}
        <Header />
        {/* ユーザー情報 + サインアウト */}
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{user.email}</span>
            <SignOutButton />
          </div>
        )}
      </div>
    </div>
  );
}
