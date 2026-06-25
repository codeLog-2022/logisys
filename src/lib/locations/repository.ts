import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location, LocationInput } from "./types";

// ロケーション(locations) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`ロケーションコード「${code}」は既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listLocations(
  supabase: SupabaseClient,
): Promise<Location[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Location[];
}

export async function getLocation(
  supabase: SupabaseClient,
  id: string,
): Promise<Location | null> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Location) ?? null;
}

export async function createLocation(
  supabase: SupabaseClient,
  input: LocationInput,
): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Location;
}

export async function updateLocation(
  supabase: SupabaseClient,
  id: string,
  input: LocationInput,
): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Location;
}

export async function deleteLocation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
