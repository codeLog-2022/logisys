import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lot, LotInput } from "./types";

// ロット(lots) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// 業務 unique (shipper_id, product_id, lot_no) があるため 23505 → DuplicateCodeError に変換する。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

// unique (shipper_id, product_id, lot_no) 重複時に投げる。
export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`ロット番号「${code}」は同一荷主・商品で既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listLots(
  supabase: SupabaseClient,
  shipperId: string,
): Promise<Lot[]> {
  const { data, error } = await supabase
    .from("lots")
    .select("*")
    .eq("shipper_id", shipperId)
    .order("lot_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lot[];
}

// 商品単位でロットを期限昇順（FEFO/期限別在庫の軸）に取得する。
export async function listLotsForProduct(
  supabase: SupabaseClient,
  shipperId: string,
  productId: string,
): Promise<Lot[]> {
  const { data, error } = await supabase
    .from("lots")
    .select("*")
    .eq("shipper_id", shipperId)
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lot[];
}

export async function getLot(
  supabase: SupabaseClient,
  id: string,
): Promise<Lot | null> {
  const { data, error } = await supabase
    .from("lots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Lot) ?? null;
}

export async function createLot(
  supabase: SupabaseClient,
  input: LotInput,
): Promise<Lot> {
  const { data, error } = await supabase
    .from("lots")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.lot_no);
    }
    throw new Error(error.message);
  }
  return data as Lot;
}

export async function updateLot(
  supabase: SupabaseClient,
  id: string,
  input: LotInput,
): Promise<Lot> {
  const { data, error } = await supabase
    .from("lots")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.lot_no);
    }
    throw new Error(error.message);
  }
  return data as Lot;
}

export async function deleteLot(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("lots").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
