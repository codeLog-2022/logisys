import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getRedirectTarget } from "./lib/auth/proxy-logic";

// Next.js 16: ファイル名は proxy.ts、export 関数名は proxy（middleware は deprecated）
// runtime は nodejs（edge は proxy で非サポート）

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  // Supabase SSR: セッション Cookie を自動リフレッシュしつつ session を取得
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() で Auth サーバーに検証を委ねる（getSession() は検証なしのため使わない）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const redirectTarget = getRedirectTarget({
    hasSession: !!user,
    pathname,
  });

  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 以下を除く全リクエストに対して proxy を実行:
     * - /login（ログインページは認証不要）
     * - /auth/signout（Route Handler は認証不要）
     * - _next/static・_next/image（静的アセット）
     * - favicon.ico（ファビコン）
     */
    "/((?!login|auth/signout|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
