"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateLoginInput } from "@/lib/auth/validation";

export type LoginState = {
  error: string | null;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = {
    email: (formData.get("email") as string) ?? "",
    password: (formData.get("password") as string) ?? "",
  };

  const validated = validateLoginInput(raw);
  if (!validated.ok) {
    return { error: validated.error };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validated.value);

  if (error) {
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }

  redirect("/");
}
