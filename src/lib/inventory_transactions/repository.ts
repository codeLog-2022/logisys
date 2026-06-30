import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateTransactionInput, InventoryTransaction } from "./types";

// 入出庫トランザクション(inventory_transactions) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

export type ListTransactionsFilter = {
  shipper_id?: string;
  txn_type?: "IN" | "OUT";
  limit?: number;
};

export async function listTransactions(
  supabase: SupabaseClient,
  filter: ListTransactionsFilter = {},
): Promise<InventoryTransaction[]> {
  let query = supabase
    .from("inventory_transactions")
    .select("*")
    .order("created_at", { ascending: false });

  if (filter.shipper_id) {
    query = query.eq("shipper_id", filter.shipper_id);
  }
  if (filter.txn_type) {
    query = query.eq("txn_type", filter.txn_type);
  }
  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryTransaction[];
}

export async function getTransaction(
  supabase: SupabaseClient,
  id: string,
): Promise<InventoryTransaction | null> {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InventoryTransaction) ?? null;
}

export async function createTransaction(
  supabase: SupabaseClient,
  input: CreateTransactionInput,
): Promise<InventoryTransaction> {
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryTransaction;
}

export async function deleteTransaction(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
