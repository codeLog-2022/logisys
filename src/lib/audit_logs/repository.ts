import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLog, AuditLogInput } from "./types";

// 監査ログ(audit_logs) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で記録/参照する。
// 監査はアプリ層で明示記録する方式（案B）。各書込み操作の確定時に createAuditLog を呼ぶ想定。

export async function createAuditLog(
  supabase: SupabaseClient,
  input: AuditLogInput,
): Promise<AuditLog> {
  const { data, error } = await supabase
    .from("audit_logs")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AuditLog;
}

// 対象エンティティの監査履歴を新しい順に取得（ロット遡及・差分確認）。
export async function listAuditLogsForEntity(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLog[];
}
