"use client";

import { useActionState } from "react";
import type { Shipper } from "@/lib/shippers/types";
import type { BillingFormState } from "./actions";

type Props = {
  action: (prev: BillingFormState, formData: FormData) => Promise<BillingFormState>;
  shippers: Shipper[];
};

export function BillingForm({ action, shippers }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});

  // 対象年月のデフォルト: 先月（yyyy-mm）
  const now = new Date();
  const defaultYearMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

  return (
    <form action={formAction} className="max-w-md space-y-6">
      {state.message && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div>
        <label
          htmlFor="shipper_id"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          荷主 <span className="text-red-500">*</span>
        </label>
        <select
          id="shipper_id"
          name="shipper_id"
          required
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">-- 選択してください --</option>
          {shippers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {state.errors?.shipper_id && (
          <p className="mt-1 text-xs text-red-600">{state.errors.shipper_id}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="billing_year_month"
          className="mb-1 block text-sm font-medium text-zinc-700"
        >
          対象年月 <span className="text-red-500">*</span>
        </label>
        <input
          type="month"
          id="billing_year_month"
          name="billing_year_month"
          required
          defaultValue={defaultYearMonth}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm font-mono"
        />
        {state.errors?.billing_year_month && (
          <p className="mt-1 text-xs text-red-600">
            {state.errors.billing_year_month}
          </p>
        )}
      </div>

      <div className="rounded border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <p className="font-medium text-zinc-700">算定ルール</p>
        <ul className="mt-1 list-inside list-disc space-y-1">
          <li>保管料: 料金マスタ（保管料率）× 月末在庫数量</li>
          <li>荷役料: 料金マスタ（荷役料率）× 当月入出庫件数</li>
        </ul>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "算定中..." : "算定・作成"}
      </button>
    </form>
  );
}
