import type { SupabaseClient } from "@supabase/supabase-js";
import type { User, UserInput } from "./types";

// 利用者(users) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

export class DuplicateEmailError extends Error {
  constructor(public readonly email: string) {
    super(`メールアドレス「${email}」は既に登録されています`);
    this.name = "DuplicateEmailError";
  }
}

export async function listUsers(supabase: SupabaseClient): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("email", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as User[];
}

export async function getUser(
  supabase: SupabaseClient,
  id: string,
): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as User) ?? null;
}

export async function createUser(
  supabase: SupabaseClient,
  input: UserInput,
): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateEmailError(input.email);
    throw new Error(error.message);
  }
  return data as User;
}

export async function updateUser(
  supabase: SupabaseClient,
  id: string,
  input: UserInput,
): Promise<User> {
  const { data, error } = await supabase
    .from("users")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new DuplicateEmailError(input.email);
    throw new Error(error.message);
  }
  return data as User;
}

export async function deleteUser(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
