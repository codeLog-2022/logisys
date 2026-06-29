import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundInspection, InboundInspectionInput } from "./types";

// 入荷検品(inbound_inspections) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// このテーブルは業務 unique を持たない（検品は積み上げ）。よって 23505 変換は不要
// （0003 の master_revisions と同じ判断）。

export async function listInboundInspections(
  supabase: SupabaseClient,
  shipperId: string,
): Promise<InboundInspection[]> {
  const { data, error } = await supabase
    .from("inbound_inspections")
    .select("*")
    .eq("shipper_id", shipperId)
    .order("inspected_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundInspection[];
}

// 入荷予定明細（予実照合キー）に紐づく検品を取得する。
export async function listInspectionsForPlanLine(
  supabase: SupabaseClient,
  inboundPlanLineId: string,
): Promise<InboundInspection[]> {
  const { data, error } = await supabase
    .from("inbound_inspections")
    .select("*")
    .eq("inbound_plan_line_id", inboundPlanLineId)
    .order("inspected_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundInspection[];
}

export async function getInboundInspection(
  supabase: SupabaseClient,
  id: string,
): Promise<InboundInspection | null> {
  const { data, error } = await supabase
    .from("inbound_inspections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InboundInspection) ?? null;
}

export async function createInboundInspection(
  supabase: SupabaseClient,
  input: InboundInspectionInput,
): Promise<InboundInspection> {
  const { data, error } = await supabase
    .from("inbound_inspections")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as InboundInspection;
}

export async function updateInboundInspection(
  supabase: SupabaseClient,
  id: string,
  input: InboundInspectionInput,
): Promise<InboundInspection> {
  const { data, error } = await supabase
    .from("inbound_inspections")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as InboundInspection;
}

export async function deleteInboundInspection(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("inbound_inspections")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
