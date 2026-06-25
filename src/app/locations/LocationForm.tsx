"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Shipper } from "@/lib/shippers/types";
import { TEMP_ZONES, USAGES, type Location } from "@/lib/locations/types";
import type { LocationFormState } from "./actions";

type Action = (
  prev: LocationFormState,
  formData: FormData,
) => Promise<LocationFormState>;

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

export function LocationForm({
  action,
  submitLabel,
  shippers,
  initial,
}: {
  action: Action;
  submitLabel: string;
  shippers: Shipper[];
  initial?: Location;
}) {
  const [state, formAction] = useActionState<LocationFormState, FormData>(
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
        <span className="text-sm font-medium">用途</span>
        <select
          name="usage"
          defaultValue={initial?.usage ?? USAGES[0]}
          className="rounded border border-zinc-300 px-3 py-2"
        >
          {USAGES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {err.usage && <span className="text-sm text-red-600">{err.usage}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">専用荷主（任意）</span>
        <select
          name="owner_shipper_id"
          defaultValue={initial?.owner_shipper_id ?? ""}
          className="rounded border border-zinc-300 px-3 py-2"
        >
          <option value="">未指定（共用）</option>
          {shippers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} / {s.name}
            </option>
          ))}
        </select>
        {err.owner_shipper_id && (
          <span className="text-sm text-red-600">{err.owner_shipper_id}</span>
        )}
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <Link
          href="/locations"
          className="text-sm text-zinc-600 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
