"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { INBOUND_PLAN_STATUSES, INBOUND_PLAN_SOURCES } from "@/lib/inbound_plans/types";
import type { Shipper } from "@/lib/shippers/types";
import type { Product } from "@/lib/products/types";
import type { InboundPlanFormState } from "./actions";

type Action = (
  prev: InboundPlanFormState,
  formData: FormData,
) => Promise<InboundPlanFormState>;

type LineRow = { id: number };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "送信中..." : label}
    </button>
  );
}

export function InboundPlanForm({
  action,
  submitLabel,
  shippers,
  products,
}: {
  action: Action;
  submitLabel: string;
  shippers: Shipper[];
  products: Product[];
}) {
  const [state, formAction] = useActionState<InboundPlanFormState, FormData>(
    action,
    {},
  );
  const err = state.errors ?? {};

  // 明細行の動的追加
  const [lines, setLines] = useState<LineRow[]>([{ id: 0 }]);

  const addLine = () => setLines((prev) => [...prev, { id: prev.length }]);
  const removeLine = (id: number) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {state.message && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      {/* ヘッダ */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-medium text-zinc-700">基本情報</h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            荷主 <span className="text-red-600">*</span>
          </span>
          <select
            name="shipper_id"
            required
            className="rounded border border-zinc-300 px-3 py-2"
          >
            <option value="">— 選択してください —</option>
            {shippers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {err.shipper_id && (
            <span className="text-sm text-red-600">{err.shipper_id}</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            ASN番号 <span className="text-red-600">*</span>
          </span>
          <input
            name="plan_no"
            required
            className="rounded border border-zinc-300 px-3 py-2"
            placeholder="例: ASN-2026-001"
          />
          {err.plan_no && (
            <span className="text-sm text-red-600">{err.plan_no}</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">予定入荷日</span>
          <input
            name="scheduled_date"
            type="date"
            className="rounded border border-zinc-300 px-3 py-2"
          />
          {err.scheduled_date && (
            <span className="text-sm text-red-600">{err.scheduled_date}</span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ステータス</span>
          <select
            name="status"
            defaultValue="planned"
            className="rounded border border-zinc-300 px-3 py-2"
          >
            {INBOUND_PLAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">取込元</span>
          <select
            name="source"
            defaultValue="manual"
            className="rounded border border-zinc-300 px-3 py-2"
          >
            {INBOUND_PLAN_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* 明細 */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-zinc-700">明細</h2>
          <button
            type="button"
            onClick={addLine}
            className="rounded border border-blue-400 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50"
          >
            + 行追加
          </button>
        </div>

        {lines.map((line, idx) => (
          <div
            key={line.id}
            className="rounded border border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">
                明細 {idx + 1}
              </span>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  削除
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  商品 <span className="text-red-600">*</span>
                </span>
                <select
                  name={`product_id_${idx}`}
                  required
                  className="rounded border border-zinc-300 px-3 py-2"
                >
                  <option value="">— 選択してください —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
                {err[`line_${idx}_product_id`] && (
                  <span className="text-sm text-red-600">
                    {err[`line_${idx}_product_id`]}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  予定数 <span className="text-red-600">*</span>
                </span>
                <input
                  name={`planned_qty_${idx}`}
                  type="number"
                  min={1}
                  required
                  className="rounded border border-zinc-300 px-3 py-2"
                />
                {err[`line_${idx}_planned_qty`] && (
                  <span className="text-sm text-red-600">
                    {err[`line_${idx}_planned_qty`]}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">ロット番号</span>
                <input
                  name={`lot_no_${idx}`}
                  className="rounded border border-zinc-300 px-3 py-2"
                  placeholder="任意"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">賞味期限</span>
                <input
                  name={`expiry_date_${idx}`}
                  type="date"
                  className="rounded border border-zinc-300 px-3 py-2"
                />
              </label>
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link
          href="/inbound-plans"
          className="text-sm text-zinc-600 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
