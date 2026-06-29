import type { SupabaseClient } from "@supabase/supabase-js";
import type { Shipper, ShipperInput } from "./types";

// 荷主(shippers) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`荷主コード「${code}」は既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listShippers(
  supabase: SupabaseClient,
): Promise<Shipper[]> {
  const { data, error } = await supabase
    .from("shippers")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Shipper[];
}

export async function getShipper(
  supabase: SupabaseClient,
  id: string,
): Promise<Shipper | null> {
  const { data, error } = await supabase
    .from("shippers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Shipper) ?? null;
}

export async function createShipper(
  supabase: SupabaseClient,
  input: ShipperInput,
): Promise<Shipper> {
  const { data, error } = await supabase
    .from("shippers")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Shipper;
}

export async function updateShipper(
  supabase: SupabaseClient,
  id: string,
  input: ShipperInput,
): Promise<Shipper> {
  const { data, error } = await supabase
    .from("shippers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Shipper;
}

export async function deleteShipper(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("shippers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
