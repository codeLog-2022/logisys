import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterRevision, MasterRevisionInput } from "./types";

// マスタ改定履歴(master_revisions) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// このテーブルは業務 unique を持たない（改定履歴は積み上げ）。よって 23505 変換は不要。

export async function listMasterRevisions(
  supabase: SupabaseClient,
): Promise<MasterRevision[]> {
  const { data, error } = await supabase
    .from("master_revisions")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MasterRevision[];
}

// 対象エンティティ（種別＋ID）の改定履歴を有効開始日順で取得する。
export async function listRevisionsForEntity(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<MasterRevision[]> {
  const { data, error } = await supabase
    .from("master_revisions")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("effective_from", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MasterRevision[];
}

export async function getMasterRevision(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterRevision | null> {
  const { data, error } = await supabase
    .from("master_revisions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MasterRevision) ?? null;
}

export async function createMasterRevision(
  supabase: SupabaseClient,
  input: MasterRevisionInput,
): Promise<MasterRevision> {
  const { data, error } = await supabase
    .from("master_revisions")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MasterRevision;
}

export async function deleteMasterRevision(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("master_revisions")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
