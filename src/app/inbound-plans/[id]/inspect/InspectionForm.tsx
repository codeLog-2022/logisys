"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { INSPECTION_METHODS, EXCEPTION_TYPES } from "@/lib/inbound_inspections/types";
import type { InboundPlanLine } from "@/lib/inbound_plan_lines/types";
import type { InspectionFormState } from "../../actions";

type Action = (
  prev: InspectionFormState,
  formData: FormData,
) => Promise<InspectionFormState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {pending ? "登録中..." : "検品結果を登録"}
    </button>
  );
}

export function InspectionForm({
  action,
  planId,
  lines,
  productMap,
}: {
  action: Action;
  planId: string;
  lines: InboundPlanLine[];
  productMap: Map<string, string>;
}) {
  const [state, formAction] = useActionState<InspectionFormState, FormData>(
    action,
    {},
  );
  const errs = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.message && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      {lines.map((line, idx) => (
        <div
          key={line.id}
          className="rounded border border-zinc-200 bg-zinc-50 p-5"
        >
          {/* 隠しフィールド（サーバーアクションで参照） */}
          <input type="hidden" name="line_id" value={line.id} />
          <input type="hidden" name="product_id" value={line.product_id} />
          <input type="hidden" name="planned_qty" value={line.planned_qty} />

          <h3 className="mb-4 font-medium">
            {productMap.get(line.product_id) ?? line.product_id}
            <span className="ml-2 text-xs text-zinc-500">
              (予定数: {line.planned_qty})
            </span>
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {/* 検品方式 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">検品方式</span>
              <select
                name={`inspection_method_${idx}`}
                defaultValue="全数"
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                {INSPECTION_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            {/* 検品数 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                検品数 <span className="text-red-600">*</span>
              </span>
              <input
                name={`inspected_qty_${idx}`}
                type="number"
                min={0}
                required
                defaultValue={line.planned_qty}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errs[`line_${idx}_inspected_qty`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_inspected_qty`][0]}
                </span>
              )}
            </label>

            {/* 良品数 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                良品数 <span className="text-red-600">*</span>
              </span>
              <input
                name={`good_qty_${idx}`}
                type="number"
                min={0}
                required
                defaultValue={line.planned_qty}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errs[`line_${idx}_good_qty`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_good_qty`][0]}
                </span>
              )}
            </label>

            {/* 不良品数 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">不良品数</span>
              <input
                name={`defect_qty_${idx}`}
                type="number"
                min={0}
                defaultValue={0}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errs[`line_${idx}_defect_qty`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_defect_qty`][0]}
                </span>
              )}
            </label>

            {/* ロット番号（事前通知があれば引き継ぐ） */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">ロット番号</span>
              <input
                name={`lot_no_${idx}`}
                defaultValue={line.lot_no ?? ""}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
                placeholder="任意"
              />
            </label>

            {/* 賞味期限 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">賞味期限</span>
              <input
                name={`expiry_date_${idx}`}
                type="date"
                defaultValue={line.expiry_date ?? ""}
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errs[`line_${idx}_expiry_date`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_expiry_date`][0]}
                </span>
              )}
            </label>

            {/* 製造日 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">製造日</span>
              <input
                name={`manufacture_date_${idx}`}
                type="date"
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errs[`line_${idx}_manufacture_date`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_manufacture_date`][0]}
                </span>
              )}
            </label>

            {/* 例外種別 */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">例外種別</span>
              <select
                name={`exception_type_${idx}`}
                defaultValue=""
                className="rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">なし</option>
                {EXCEPTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errs[`line_${idx}_exception_type`] && (
                <span className="text-xs text-red-600">
                  {errs[`line_${idx}_exception_type`][0]}
                </span>
              )}
            </label>
          </div>

          {/* 備考 */}
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-medium">備考</span>
            <textarea
              name={`note_${idx}`}
              rows={2}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              placeholder="任意"
            />
          </label>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <SubmitButton />
        <Link
          href={`/inbound-plans/${planId}`}
          className="text-sm text-zinc-600 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
