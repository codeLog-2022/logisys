"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createInboundPlan,
  DuplicateCodeError,
  updateInboundPlan,
} from "@/lib/inbound_plans/repository";
import { validateInboundPlanInput } from "@/lib/inbound_plans/types";
import {
  createInboundPlanLine,
  deleteInboundPlanLine,
} from "@/lib/inbound_plan_lines/repository";
import { validateInboundPlanLineInput } from "@/lib/inbound_plan_lines/types";
import { createInboundInspection } from "@/lib/inbound_inspections/repository";
import { validateInboundInspectionInput } from "@/lib/inbound_inspections/types";

// useActionState 用のフォーム状態
export type InboundPlanFormState = {
  errors?: Record<string, string>;
  message?: string;
};

export type InspectionFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

// ---- ASN 登録（ヘッダ + 明細複数行） ----
export async function createInboundPlanAction(
  _prev: InboundPlanFormState,
  formData: FormData,
): Promise<InboundPlanFormState> {
  // ヘッダのバリデーション
  const parsed = validateInboundPlanInput({
    shipper_id: formData.get("shipper_id"),
    plan_no: formData.get("plan_no"),
    supplier_id: formData.get("supplier_id"),
    scheduled_date: formData.get("scheduled_date"),
    status: formData.get("status") || "planned",
    source: formData.get("source") || "manual",
  });
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  let plan;
  try {
    plan = await createInboundPlan(supabase, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateCodeError) {
      return { errors: { plan_no: e.message } };
    }
    return { message: e instanceof Error ? e.message : "登録に失敗しました" };
  }

  // 明細行を登録（product_id_0, planned_qty_0, ... として FormData に格納）
  const indices = getLineIndices(formData);
  for (const i of indices) {
    const lineParsed = validateInboundPlanLineInput({
      inbound_plan_id: plan.id,
      product_id: formData.get(`product_id_${i}`),
      planned_qty: formData.get(`planned_qty_${i}`),
      lot_no: formData.get(`lot_no_${i}`),
      expiry_date: formData.get(`expiry_date_${i}`),
    });
    if (!lineParsed.ok) {
      // 明細エラー: ヘッダは登録済みだが明細が不正 → plan を消して返す
      // (UX: 全体をやり直し)
      await supabase.from("inbound_plans").delete().eq("id", plan.id);
      const lineErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(lineParsed.errors)) {
        lineErrors[`line_${i}_${k}`] = v;
      }
      return { errors: lineErrors };
    }
    try {
      await createInboundPlanLine(supabase, lineParsed.value);
    } catch (e) {
      await supabase.from("inbound_plans").delete().eq("id", plan.id);
      return { message: e instanceof Error ? e.message : "明細登録に失敗しました" };
    }
  }

  revalidatePath("/inbound-plans");
  redirect("/inbound-plans");
}

// ---- ASN ステータス更新 ----
export async function updateInboundPlanStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !id) return;
  if (typeof status !== "string" || !status) return;

  const supabase = await createClient();
  // 現在の plan を取得して他フィールドを維持したまま status だけ変える
  const { data } = await supabase
    .from("inbound_plans")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) return;

  await updateInboundPlan(supabase, id, {
    shipper_id: data.shipper_id,
    plan_no: data.plan_no,
    supplier_id: data.supplier_id,
    scheduled_date: data.scheduled_date,
    status,
    source: data.source,
  } as Parameters<typeof updateInboundPlan>[2]);

  revalidatePath(`/inbound-plans/${id}`);
}

// ---- 明細削除 ----
export async function deleteInboundPlanLineAction(formData: FormData): Promise<void> {
  const lineId = formData.get("line_id");
  const planId = formData.get("plan_id");
  if (typeof lineId !== "string" || !lineId) return;
  const supabase = await createClient();
  await deleteInboundPlanLine(supabase, lineId);
  if (typeof planId === "string" && planId) {
    revalidatePath(`/inbound-plans/${planId}`);
  }
}

// ---- 検品登録（複数明細まとめて） ----
export async function createInspectionsAction(
  planId: string,
  shipperId: string,
  _prev: InspectionFormState,
  formData: FormData,
): Promise<InspectionFormState> {
  const lineIds = formData.getAll("line_id") as string[];
  const productIds = formData.getAll("product_id") as string[];
  const plannedQtys = formData.getAll("planned_qty") as string[];

  const allErrors: Record<string, string[]> = {};
  const inputs = [];

  for (let i = 0; i < lineIds.length; i++) {
    const parsed = validateInboundInspectionInput({
      shipper_id: shipperId,
      inbound_plan_line_id: lineIds[i],
      product_id: productIds[i],
      inspection_method: formData.get(`inspection_method_${i}`) || "全数",
      planned_qty: plannedQtys[i],
      inspected_qty: formData.get(`inspected_qty_${i}`),
      good_qty: formData.get(`good_qty_${i}`),
      defect_qty: formData.get(`defect_qty_${i}`) || "0",
      lot_no: formData.get(`lot_no_${i}`),
      expiry_date: formData.get(`expiry_date_${i}`),
      manufacture_date: formData.get(`manufacture_date_${i}`),
      exception_type: formData.get(`exception_type_${i}`) || null,
      note: formData.get(`note_${i}`),
      inspected_by: null,
    });
    if (!parsed.ok) {
      for (const [k, v] of Object.entries(parsed.errors)) {
        const key = `line_${i}_${k}`;
        allErrors[key] = [v];
      }
    } else {
      inputs.push(parsed.value);
    }
  }

  if (Object.keys(allErrors).length > 0) {
    return { errors: allErrors };
  }

  const supabase = await createClient();
  for (const input of inputs) {
    try {
      await createInboundInspection(supabase, input);
    } catch (e) {
      return { message: e instanceof Error ? e.message : "検品登録に失敗しました" };
    }
  }

  revalidatePath(`/inbound-plans/${planId}`);
  redirect(`/inbound-plans/${planId}`);
}

// ---- ヘルパー ----
function getLineIndices(formData: FormData): number[] {
  const indices: number[] = [];
  let i = 0;
  while (formData.has(`product_id_${i}`)) {
    indices.push(i);
    i++;
  }
  return indices;
}
