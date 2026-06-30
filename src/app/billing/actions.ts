"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBillingStatementWithItems } from "@/lib/billing/service";
import {
  confirmBillingStatement,
  deleteBillingStatement,
  DuplicateBillingStatementError,
  ConfirmedStatementError,
} from "@/lib/billing/repository";

// フォーム状態型
export type BillingFormState = {
  errors?: Record<string, string>;
  message?: string;
};

// 算定プレビュー用: DB に保存せずに算定結果を返すアクション
export type BillingPreviewResult = {
  errors?: Record<string, string>;
  message?: string;
  preview?: {
    shipper_id: string;
    billing_year_month: string;
    lineItems: {
      line_type: string;
      description: string;
      quantity: number;
      unit_price: number;
      amount: number;
      rate_master_id: string | null;
    }[];
    totalAmount: number;
  };
};

/**
 * 請求書作成アクション
 * 荷主・対象年月を受け取り、算定・保存を実行して詳細画面にリダイレクト。
 */
export async function createBillingStatementAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const shipperId = formData.get("shipper_id");
  const yearMonth = formData.get("billing_year_month");

  const errors: Record<string, string> = {};
  if (typeof shipperId !== "string" || !shipperId.trim()) {
    errors.shipper_id = "荷主を選択してください";
  }
  if (
    typeof yearMonth !== "string" ||
    !/^\d{4}-\d{2}$/.test(yearMonth.trim())
  ) {
    errors.billing_year_month = "対象年月を yyyy-mm 形式で入力してください";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const supabase = await createClient();
  let statementId: string;

  try {
    const result = await createBillingStatementWithItems(
      supabase,
      (shipperId as string).trim(),
      (yearMonth as string).trim(),
    );
    statementId = result.statement.id;
  } catch (e) {
    if (e instanceof DuplicateBillingStatementError) {
      return {
        errors: { billing_year_month: e.message },
      };
    }
    return {
      message: e instanceof Error ? e.message : "請求書の作成に失敗しました",
    };
  }

  revalidatePath("/billing");
  redirect(`/billing/${statementId}`);
}

/**
 * 請求書確定アクション（draft → confirmed）
 */
export async function confirmBillingStatementAction(
  formData: FormData,
): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  try {
    await confirmBillingStatement(supabase, id);
  } catch (e) {
    if (e instanceof ConfirmedStatementError) {
      // 既に確定済みの場合はそのまま続行
    } else {
      throw e;
    }
  }
  revalidatePath(`/billing/${id}`);
  revalidatePath("/billing");
}

/**
 * 請求書削除アクション（draft のみ）
 */
export async function deleteBillingStatementAction(
  formData: FormData,
): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await deleteBillingStatement(supabase, id);
  revalidatePath("/billing");
  redirect("/billing");
}
