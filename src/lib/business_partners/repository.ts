import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessPartner, BusinessPartnerInput } from "./types";

// 取引先(business_partners) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`取引先コード「${code}」は既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listBusinessPartners(
  supabase: SupabaseClient,
): Promise<BusinessPartner[]> {
  const { data, error } = await supabase
    .from("business_partners")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessPartner[];
}

export async function getBusinessPartner(
  supabase: SupabaseClient,
  id: string,
): Promise<BusinessPartner | null> {
  const { data, error } = await supabase
    .from("business_partners")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BusinessPartner) ?? null;
}

export async function createBusinessPartner(
  supabase: SupabaseClient,
  input: BusinessPartnerInput,
): Promise<BusinessPartner> {
  const { data, error } = await supabase
    .from("business_partners")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as BusinessPartner;
}

export async function updateBusinessPartner(
  supabase: SupabaseClient,
  id: string,
  input: BusinessPartnerInput,
): Promise<BusinessPartner> {
  const { data, error } = await supabase
    .from("business_partners")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as BusinessPartner;
}

export async function deleteBusinessPartner(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("business_partners")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
