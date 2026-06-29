import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ShipperProductCodeMap,
  ShipperProductCodeMapInput,
} from "./types";

// 読替表(shipper_product_code_map) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

// unique (shipper_id, source, external_code) 重複時に投げる。
export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`外部コード「${code}」は同一荷主・出所で既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listShipperProductCodeMaps(
  supabase: SupabaseClient,
): Promise<ShipperProductCodeMap[]> {
  const { data, error } = await supabase
    .from("shipper_product_code_map")
    .select("*")
    .order("external_code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShipperProductCodeMap[];
}

export async function getShipperProductCodeMap(
  supabase: SupabaseClient,
  id: string,
): Promise<ShipperProductCodeMap | null> {
  const { data, error } = await supabase
    .from("shipper_product_code_map")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShipperProductCodeMap) ?? null;
}

export async function createShipperProductCodeMap(
  supabase: SupabaseClient,
  input: ShipperProductCodeMapInput,
): Promise<ShipperProductCodeMap> {
  const { data, error } = await supabase
    .from("shipper_product_code_map")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.external_code);
    }
    throw new Error(error.message);
  }
  return data as ShipperProductCodeMap;
}

export async function updateShipperProductCodeMap(
  supabase: SupabaseClient,
  id: string,
  input: ShipperProductCodeMapInput,
): Promise<ShipperProductCodeMap> {
  const { data, error } = await supabase
    .from("shipper_product_code_map")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.external_code);
    }
    throw new Error(error.message);
  }
  return data as ShipperProductCodeMap;
}

export async function deleteShipperProductCodeMap(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("shipper_product_code_map")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
