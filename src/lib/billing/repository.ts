// billing/repository.ts — 請求機能のデータアクセス層
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// 確定済み（status='confirmed'）の請求書は更新・削除できない（DB の RLS で制御、アプリ層でも検証）。

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BillingStatement,
  BillingLineItem,
  CreateBillingStatementInput,
  CreateBillingLineItemInput,
} from "./types";

// PostgreSQL unique_violation エラーコード
export const UNIQUE_VIOLATION = "23505";

// 同一荷主・同一年月の請求書が既に存在する場合に投げる
export class DuplicateBillingStatementError extends Error {
  constructor(shipperId: string, yearMonth: string) {
    super(`荷主「${shipperId}」の ${yearMonth} 請求書は既に存在します`);
    this.name = "DuplicateBillingStatementError";
  }
}

// 確定済み請求書を変更しようとした場合に投げる
export class ConfirmedStatementError extends Error {
  constructor() {
    super("確定済みの請求書は変更できません");
    this.name = "ConfirmedStatementError";
  }
}

// ============================================================
// billing_statements CRUD
// ============================================================

export async function listBillingStatements(
  supabase: SupabaseClient,
  filter?: { shipper_id?: string },
): Promise<BillingStatement[]> {
  let query = supabase
    .from("billing_statements")
    .select("*")
    .order("billing_year_month", { ascending: false });

  if (filter?.shipper_id) {
    query = query.eq("shipper_id", filter.shipper_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BillingStatement[];
}

export async function getBillingStatement(
  supabase: SupabaseClient,
  id: string,
): Promise<BillingStatement | null> {
  const { data, error } = await supabase
    .from("billing_statements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BillingStatement) ?? null;
}

export async function createBillingStatement(
  supabase: SupabaseClient,
  input: CreateBillingStatementInput,
): Promise<BillingStatement> {
  const { data, error } = await supabase
    .from("billing_statements")
    .insert(input)
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new DuplicateBillingStatementError(
        input.shipper_id,
        input.billing_year_month,
      );
    }
    throw new Error(error.message);
  }
  return data as BillingStatement;
}

export async function confirmBillingStatement(
  supabase: SupabaseClient,
  id: string,
): Promise<BillingStatement> {
  // 現在のステータスを確認
  const current = await getBillingStatement(supabase, id);
  if (!current) throw new Error("請求書が見つかりません");
  if (current.status === "confirmed") throw new ConfirmedStatementError();

  const { data, error } = await supabase
    .from("billing_statements")
    .update({ status: "confirmed" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as BillingStatement;
}

export async function deleteBillingStatement(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  // 確定済みは削除禁止
  const current = await getBillingStatement(supabase, id);
  if (!current) return;
  if (current.status === "confirmed") throw new ConfirmedStatementError();

  const { error } = await supabase
    .from("billing_statements")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// billing_line_items CRUD
// ============================================================

export async function listBillingLineItems(
  supabase: SupabaseClient,
  statementId: string,
): Promise<BillingLineItem[]> {
  const { data, error } = await supabase
    .from("billing_line_items")
    .select("*")
    .eq("statement_id", statementId)
    .order("line_type", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BillingLineItem[];
}

export async function createBillingLineItem(
  supabase: SupabaseClient,
  input: CreateBillingLineItemInput,
): Promise<BillingLineItem> {
  const { data, error } = await supabase
    .from("billing_line_items")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as BillingLineItem;
}

export async function createBillingLineItems(
  supabase: SupabaseClient,
  inputs: CreateBillingLineItemInput[],
): Promise<BillingLineItem[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase
    .from("billing_line_items")
    .insert(inputs)
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as BillingLineItem[];
}
