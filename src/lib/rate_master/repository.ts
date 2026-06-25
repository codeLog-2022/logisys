import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateMaster, RateMasterInput } from "./types";

// 料金マスタ(rate_master) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

// unique (shipper_id, code, effective_from) 重複時に投げる。
// code 単独でなくバージョン（effective_from）込みの重複を表す。
export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(
      `料金コード「${code}」は同一有効開始日で既に登録されています`,
    );
    this.name = "DuplicateCodeError";
  }
}

export async function listRateMasters(
  supabase: SupabaseClient,
): Promise<RateMaster[]> {
  const { data, error } = await supabase
    .from("rate_master")
    .select("*")
    .order("code", { ascending: true })
    .order("effective_from", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RateMaster[];
}

export async function getRateMaster(
  supabase: SupabaseClient,
  id: string,
): Promise<RateMaster | null> {
  const { data, error } = await supabase
    .from("rate_master")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RateMaster) ?? null;
}

export async function createRateMaster(
  supabase: SupabaseClient,
  input: RateMasterInput,
): Promise<RateMaster> {
  const { data, error } = await supabase
    .from("rate_master")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as RateMaster;
}

export async function updateRateMaster(
  supabase: SupabaseClient,
  id: string,
  input: RateMasterInput,
): Promise<RateMaster> {
  const { data, error } = await supabase
    .from("rate_master")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as RateMaster;
}

export async function deleteRateMaster(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("rate_master").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
