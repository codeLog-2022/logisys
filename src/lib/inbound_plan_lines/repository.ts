import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundPlanLine, InboundPlanLineInput } from "./types";

// 入荷予定明細(inbound_plan_lines) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// 業務 unique (inbound_plan_id, product_id, lot_no) があるため 23505 → DuplicateCodeError に変換する。

// PostgreSQL unique_violation のエラーコード（PostgREST はこれを透過する）
export const UNIQUE_VIOLATION = "23505";

// unique (inbound_plan_id, product_id, lot_no) 重複時に投げる。
export class DuplicateCodeError extends Error {
  constructor(public readonly code: string) {
    super(`商品「${code}」は同一入荷予定・ロットで既に明細登録されています`);
    this.name = "DuplicateCodeError";
  }
}

export async function listInboundPlanLines(
  supabase: SupabaseClient,
  inboundPlanId: string,
): Promise<InboundPlanLine[]> {
  const { data, error } = await supabase
    .from("inbound_plan_lines")
    .select("*")
    .eq("inbound_plan_id", inboundPlanId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundPlanLine[];
}

export async function getInboundPlanLine(
  supabase: SupabaseClient,
  id: string,
): Promise<InboundPlanLine | null> {
  const { data, error } = await supabase
    .from("inbound_plan_lines")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InboundPlanLine) ?? null;
}

export async function createInboundPlanLine(
  supabase: SupabaseClient,
  input: InboundPlanLineInput,
): Promise<InboundPlanLine> {
  const { data, error } = await supabase
    .from("inbound_plan_lines")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.product_id);
    }
    throw new Error(error.message);
  }
  return data as InboundPlanLine;
}

export async function updateInboundPlanLine(
  supabase: SupabaseClient,
  id: string,
  input: InboundPlanLineInput,
): Promise<InboundPlanLine> {
  const { data, error } = await supabase
    .from("inbound_plan_lines")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateCodeError(input.product_id);
    }
    throw new Error(error.message);
  }
  return data as InboundPlanLine;
}

export async function deleteInboundPlanLine(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("inbound_plan_lines")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
