"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Shipper } from "@/lib/shippers/types";
import { TEMP_ZONES, type Product } from "@/lib/products/types";
import type { ProductFormState } from "./actions";

type Action = (
  prev: ProductFormState,
  formData: FormData,
) => Promise<ProductFormState>;

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

export function ProductForm({
  action,
  submitLabel,
  shippers,
  initial,
}: {
  action: Action;
  submitLabel: string;
  shippers: Shipper[];
  initial?: Product;
}) {
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    action,
    {},
  );
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {state.message && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          荷主 <span className="text-red-600">*</span>
        </span>
        <select
          name="shipper_id"
          defaultValue={initial?.shipper_id ?? ""}
          required
          className="rounded border border-zinc-300 px-3 py-2"
        >
          <option value="" disabled>
            選択してください
          </option>
          {shippers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} / {s.name}
            </option>
          ))}
        </select>
        {err.shipper_id && (
          <span className="text-sm text-red-600">{err.shipper_id}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          コード <span className="text-red-600">*</span>
        </span>
        <input
          name="code"
          defaultValue={initial?.code ?? ""}
          required
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {err.code && <span className="text-sm text-red-600">{err.code}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          名称 <span className="text-red-600">*</span>
        </span>
        <input
          name="name"
          defaultValue={initial?.name ?? ""}
          required
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {err.name && <span className="text-sm text-red-600">{err.name}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">単位</span>
        <input
          name="unit"
          defaultValue={initial?.unit ?? "バラ"}
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {err.unit && <span className="text-sm text-red-600">{err.unit}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">入数（ケースあたり）</span>
        <input
          name="units_per_case"
          type="number"
          min="1"
          step="1"
          defaultValue={initial?.units_per_case ?? ""}
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {err.units_per_case && (
          <span className="text-sm text-red-600">{err.units_per_case}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">温度帯</span>
        <select
          name="temp_zone"
          defaultValue={initial?.temp_zone ?? TEMP_ZONES[0]}
          className="rounded border border-zinc-300 px-3 py-2"
        >
          {TEMP_ZONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {err.temp_zone && (
          <span className="text-sm text-red-600">{err.temp_zone}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">危険物クラス</span>
        <input
          name="hazard_class"
          defaultValue={initial?.hazard_class ?? ""}
          className="rounded border border-zinc-300 px-3 py-2"
        />
        {err.hazard_class && (
          <span className="text-sm text-red-600">{err.hazard_class}</span>
        )}
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link href="/products" className="text-sm text-zinc-600 hover:underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
