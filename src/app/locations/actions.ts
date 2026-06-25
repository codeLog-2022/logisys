"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createLocation,
  deleteLocation,
  DuplicateCodeError,
  updateLocation,
} from "@/lib/locations/repository";
import { validateLocationInput } from "@/lib/locations/types";

// useActionState 用のフォーム状態。errors はフィールド名→メッセージ。
export type LocationFormState = {
  errors?: Record<string, string>;
  message?: string;
};

function parse(formData: FormData) {
  return validateLocationInput({
    code: formData.get("code"),
    temp_zone: formData.get("temp_zone"),
    usage: formData.get("usage"),
    owner_shipper_id: formData.get("owner_shipper_id"),
  });
}

export async function createLocationAction(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await createLocation(supabase, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "登録に失敗しました" };
  }

  revalidatePath("/locations");
  redirect("/locations");
}

export async function updateLocationAction(
  id: string,
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const parsed = parse(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  try {
    await updateLocation(supabase, id, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { code: e.message } };
    }
    return { message: e instanceof Error ? e.message : "更新に失敗しました" };
  }

  revalidatePath("/locations");
  redirect("/locations");
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await deleteLocation(supabase, id);
  revalidatePath("/locations");
}
