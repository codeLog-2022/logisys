"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { TXN_STATUSES, TXN_TYPES } from "@/lib/inventory_transactions/types";
import type { Shipper } from "@/lib/shippers/types";
import type { Product } from "@/lib/products/types";
import type { Location } from "@/lib/locations/types";
import type { TransactionFormState } from "./actions";

type Action = (
  prev: TransactionFormState,
  formData: FormData,
) => Promise<TransactionFormState>;

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

export function TransactionForm({
  action,
  submitLabel,
  defaultTxnType,
  shippers,
  products,
  locations,
}: {
  action: Action;
  submitLabel: string;
  defaultTxnType?: "IN" | "OUT";
  shippers: Shipper[];
  products: Product[];
  locations: Location[];
}) {
  const [state, formAction] = useActionState<TransactionFormState, FormData>(
    action,
    {},
  );
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-lg">
      {state.message && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          区分 <span className="text-red-500">*</span>
        </label>
        <select
          name="txn_type"
          defaultValue={defaultTxnType ?? "IN"}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          {TXN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "IN" ? "入庫" : "出庫"}
            </option>
          ))}
        </select>
        {err.txn_type && (
          <p className="mt-1 text-xs text-red-600">{err.txn_type}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          荷主 <span className="text-red-500">*</span>
        </label>
        <select
          name="shipper_id"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">選択してください</option>
          {shippers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        {err.shipper_id && (
          <p className="mt-1 text-xs text-red-600">{err.shipper_id}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          商品 <span className="text-red-500">*</span>
        </label>
        <select
          name="product_id"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">選択してください</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        {err.product_id && (
          <p className="mt-1 text-xs text-red-600">{err.product_id}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          ロケーション <span className="text-red-500">*</span>
        </label>
        <select
          name="location_id"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">選択してください</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
            </option>
          ))}
        </select>
        {err.location_id && (
          <p className="mt-1 text-xs text-red-600">{err.location_id}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          数量 <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="quantity"
          min={1}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        {err.quantity && (
          <p className="mt-1 text-xs text-red-600">{err.quantity}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">ステータス</label>
        <select
          name="status"
          defaultValue="良品"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          {TXN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">ロット番号</label>
        <input
          type="text"
          name="lot_no"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">賞味期限</label>
        <input
          type="date"
          name="expiry_date"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">備考</label>
        <textarea
          name="note"
          rows={2}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-3">
        <SubmitButton label={submitLabel} />
        <a
          href="/transactions"
          className="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
        >
          キャンセル
        </a>
      </div>
    </form>
  );
}
