import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// POST /auth/signout — サインアウトして /login にリダイレクト
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
