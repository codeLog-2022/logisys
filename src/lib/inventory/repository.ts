import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryByExpiryFilter,
  InventoryByExpiryRow,
  InventoryCurrentFilter,
  InventoryCurrentRow,
} from "./types";

// 在庫照会のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で VIEW を SELECT する。
// 書き込みなし（在庫照会は参照専用）。

/**
 * inventory_current_v2 VIEW を参照して在庫一覧を取得する。
 * 荷主フィルタを指定した場合は該当荷主のみを返す。
 * 並び順: shipper_id / product_id / location_id / status の昇順。
 */
export async function listInventoryCurrent(
  supabase: SupabaseClient,
  filter?: InventoryCurrentFilter,
): Promise<InventoryCurrentRow[]> {
  let query = supabase
    .from("inventory_current_v2")
    .select(
      "shipper_id, product_id, location_id, lot_id, lot_no, expiry_date, status, qty",
    )
    .order("shipper_id", { ascending: true })
    .order("product_id", { ascending: true })
    .order("location_id", { ascending: true })
    .order("status", { ascending: true });

  if (filter?.shipper_id) {
    query = query.eq("shipper_id", filter.shipper_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryCurrentRow[];
}

/**
 * inventory_by_expiry VIEW を参照して賞味期限別在庫を取得する。
 * 期限切れ間近順（expiry_date 昇順）で返す。
 * 荷主フィルタを指定した場合は該当荷主のみを返す。
 */
export async function listInventoryByExpiry(
  supabase: SupabaseClient,
  filter?: InventoryByExpiryFilter,
): Promise<InventoryByExpiryRow[]> {
  let query = supabase
    .from("inventory_by_expiry")
    .select("shipper_id, product_id, lot_id, lot_no, expiry_date, qty")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (filter?.shipper_id) {
    query = query.eq("shipper_id", filter.shipper_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryByExpiryRow[];
}
