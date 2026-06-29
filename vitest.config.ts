import { execFileSync } from "node:child_process";
import { defineConfig } from "vitest/config";

// 統合テストはローカル Supabase スタック前提（`supabase start` で起動）。
// 接続情報は `supabase status -o env` から実行時に取得する（秘密鍵をファイルに残さない）。
// 実テーブル / 実 VIEW を検証するため DB へ直接接続する（DB_URL = postgres スーパーユーザー）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: loadSupabaseEnv(),
    // ローカル DB への接続待ちを考慮して余裕を持たせる
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

function loadSupabaseEnv(): Record<string, string> {
  try {
    const raw = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: __dirname,
      encoding: "utf8",
    });
    const map: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) map[m[1]] = m[2];
    }
    // DB 直結（VIEW 検証用）と、REST(PostgREST) 経由検証用（supabase-js）の両方を注入。
    // いずれも `supabase status` 由来でファイルに秘密鍵を残さない。
    return {
      DATABASE_URL: map.DB_URL ?? "",
      SUPABASE_API_URL: map.API_URL ?? "",
      SUPABASE_ANON_KEY: map.ANON_KEY ?? "",
    };
  } catch {
    // supabase 未起動などで取得できない場合はテスト側で明示エラーにする
    return { DATABASE_URL: "" };
  }
}
