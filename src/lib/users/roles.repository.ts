import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./types";

// ロール(roles) の参照データアクセス層。
// roles は 0006 でシードされる固定マスタ（admin/operator/shipper_user）。
// 利用者登録時のロール選択に使う（READ 中心）。

export async function listRoles(supabase: SupabaseClient): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}
