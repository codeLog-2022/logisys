import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductInput } from "./types";

// 商品(products) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`商品コード「${code}」は既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listProducts(
  supabase: SupabaseClient,
): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function getProduct(
  supabase: SupabaseClient,
  id: string,
): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Product) ?? null;
}

export async function createProduct(
  supabase: SupabaseClient,
  input: ProductInput,
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Product;
}

export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  input: ProductInput,
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateCodeError(input.code);
    throw new Error(error.message);
  }
  return data as Product;
}

export async function deleteProduct(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
