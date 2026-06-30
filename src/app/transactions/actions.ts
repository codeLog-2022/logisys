"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTransaction } from "@/lib/inventory_transactions/repository";
import { validateTransactionInput } from "@/lib/inventory_transactions/types";

// useActionState 用のフォーム状態。errors はフィールド名→メッセージ。
export type TransactionFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function parse(formData: FormData) {
  return validateTransactionInput({
    shipper_id: formData.get("shipper_id"),
    product_id: formData.get("product_id"),
    location_id: formData.get("location_id"),
    txn_type: formData.get("txn_type"),
    quantity: formData.get("quantity"),
    status: formData.get("status"),
    lot_no: formData.get("lot_no"),
    expiry_date: formData.get("expiry_date"),
    note: formData.get("note"),
    created_by: formData.get("created_by"),
  });
}

export async function createTransactionAction(
  _prev: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await createTransaction(supabase, parsed.value);
  } catch (e) {
    return { message: e instanceof Error ? e.message : "登録に失敗しました" };
  }

  revalidatePath("/transactions");
  redirect("/transactions");
}
