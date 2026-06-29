import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundPlan, InboundPlanInput } from "./types";

// 入荷予定ASN(inbound_plans) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// 業務 unique (shipper_id, plan_no) があるため 23505 → DuplicateCodeError に変換する。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

// unique (shipper_id, plan_no) 重複時に投げる。
export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`ASN番号「${code}」は同一荷主で既に登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listInboundPlans(
  supabase: SupabaseClient,
): Promise<InboundPlan[]> {
  const { data, error } = await supabase
    .from("inbound_plans")
    .select("*")
    .order("plan_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundPlan[];
}

export async function getInboundPlan(
  supabase: SupabaseClient,
  id: string,
): Promise<InboundPlan | null> {
  const { data, error } = await supabase
    .from("inbound_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InboundPlan) ?? null;
}

export async function createInboundPlan(
  supabase: SupabaseClient,
  input: InboundPlanInput,
): Promise<InboundPlan> {
  const { data, error } = await supabase
    .from("inbound_plans")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.plan_no);
    }
    throw new Error(error.message);
  }
  return data as InboundPlan;
}

export async function updateInboundPlan(
  supabase: SupabaseClient,
  id: string,
  input: InboundPlanInput,
): Promise<InboundPlan> {
  const { data, error } = await supabase
    .from("inbound_plans")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.plan_no);
    }
    throw new Error(error.message);
  }
  return data as InboundPlan;
}

export async function deleteInboundPlan(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("inbound_plans")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
