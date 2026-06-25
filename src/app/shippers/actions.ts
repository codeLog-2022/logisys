"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createShipper,
  deleteShipper,
  DuplicateCodeError,
  updateShipper,
} from "@/lib/shippers/repository";
import { validateShipperInput } from "@/lib/shippers/types";

// useActionState 用のフォーム状態。errors はフィールド名→メッセージ。
export type ShipperFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function parse(formData: FormData) {
  return validateShipperInput({
    code: formData.get("code"),
    name: formData.get("name"),
    lot_managed: formData.get("lot_managed"),
    expiry_managed: formData.get("expiry_managed"),
    serial_managed: formData.get("serial_managed"),
    inspection_method: formData.get("inspection_method"),
    picking_rule: formData.get("picking_rule"),
  });
}

export async function createShipperAction(
  _prev: ShipperFormState,
  formData: FormData,
): Promise<ShipperFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await createShipper(supabase, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "登録に失敗しました" };
  }

  revalidatePath("/shippers");
  redirect("/shippers");
}

export async function updateShipperAction(
  id: string,
  _prev: ShipperFormState,
  formData: FormData,
): Promise<ShipperFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await updateShipper(supabase, id, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "更新に失敗しました" };
  }

  revalidatePath("/shippers");
  redirect("/shippers");
}

export async function deleteShipperAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await deleteShipper(supabase, id);
  revalidatePath("/shippers");
}
