"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  INSPECTION_METHODS,
  PICKING_RULES,
  type Shipper,
} from "@/lib/shippers/types";
import type { ShipperFormState } from "./actions";

type Action = (
  prev: ShipperFormState,
  formData: FormData,
) => Promise<ShipperFormState>;

const FLAGS: { name: keyof Shipper; label: string }[] = [
  { name: "lot_managed", label: "ロット管理" },
  { name: "expiry_managed", label: "賞味期限管理" },
  { name: "serial_managed", label: "シリアル管理" },
];

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

export function ShipperForm({
  action,
  submitLabel,
  initial,
}: {
  action: Action;
  submitLabel: string;
  initial?: Shipper;
}) {
  const [state, formAction] = useActionState<ShipperFormState, FormData>(
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">管理フラグ</legend>
        {FLAGS.map((f) => (
          <label key={f.name} className="flex items-center gap-2">
            <input
              type="checkbox"
              name={f.name}
              defaultChecked={Boolean(initial?.[f.name])}
            />
            <span className="text-sm">{f.label}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">検品方法</span>
        <select
          name="inspection_method"
          defaultValue={initial?.inspection_method ?? INSPECTION_METHODS[0]}
          className="rounded border border-zinc-300 px-3 py-2"
        >
          {INSPECTION_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {err.inspection_method && (
          <span className="text-sm text-red-600">{err.inspection_method}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">ピッキングルール</span>
        <select
          name="picking_rule"
          defaultValue={initial?.picking_rule ?? PICKING_RULES[0]}
          className="rounded border border-zinc-300 px-3 py-2"
        >
          {PICKING_RULES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {err.picking_rule && (
          <span className="text-sm text-red-600">{err.picking_rule}</span>
        )}
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link href="/shippers" className="text-sm text-zinc-600 hover:underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
