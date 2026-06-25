"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createProduct,
  deleteProduct,
  DuplicateCodeError,
  updateProduct,
} from "@/lib/products/repository";
import { validateProductInput } from "@/lib/products/types";

// useActionState 用のフォーム状態。errors はフィールド名→メッセージ。
export type ProductFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function parse(formData: FormData) {
  return validateProductInput({
    shipper_id: formData.get("shipper_id"),
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    units_per_case: formData.get("units_per_case"),
    temp_zone: formData.get("temp_zone"),
    hazard_class: formData.get("hazard_class"),
  });
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await createProduct(supabase, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "登録に失敗しました" };
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProductAction(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await updateProduct(supabase, id, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "更新に失敗しました" };
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await deleteProduct(supabase, id);
  revalidatePath("/products");
}
