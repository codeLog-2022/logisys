import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getBillingStatement,
  listBillingLineItems,
} from "@/lib/billing/repository";
import { listShippers } from "@/lib/shippers/repository";
import {
  confirmBillingStatementAction,
  deleteBillingStatementAction,
} from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BillingDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [statement, lineItems, shippers] = await Promise.all([
    getBillingStatement(supabase, id),
    listBillingLineItems(supabase, id),
    listShippers(supabase),
  ]);

  if (!statement) notFound();

  const shipperMap = new Map(shippers.map((s) => [s.id, s.name]));
  const shipperName = shipperMap.get(statement.shipper_id) ?? statement.shipper_id;

  const lineTypeLabel: Record<string, string> = {
    storage: "保管料",
    handling: "荷役料",
    incidental: "諸掛",
  };

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">請求書詳細</h1>
        <Link href="/billing" className="text-sm text-blue-600 hover:underline">
          ← 請求一覧
        </Link>
      </div>

      {/* 請求書ヘッダ */}
      <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-500">荷主</dt>
            <dd className="mt-1 text-zinc-900">{shipperName}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">対象年月</dt>
            <dd className="mt-1 font-mono text-zinc-900">
              {statement.billing_year_month}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">合計金額</dt>
            <dd className="mt-1 font-mono text-zinc-900">
              {Number(statement.total_amount).toLocaleString("ja-JP", {
                style: "currency",
                currency: "JPY",
              })}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">ステータス</dt>
            <dd className="mt-1">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                  statement.status === "confirmed"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {statement.status === "confirmed" ? "確定" : "下書き"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* 明細一覧 */}
      <h2 className="mb-3 text-lg font-semibold">明細</h2>
      {lineItems.length === 0 ? (
        <p className="mb-6 text-zinc-500">明細がありません。</p>
      ) : (
        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">種別</th>
              <th className="py-2 pr-4">名称</th>
              <th className="py-2 pr-4 text-right">数量</th>
              <th className="py-2 pr-4 text-right">単価</th>
              <th className="py-2 pr-4 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => (
              <tr key={item.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4">
                  {lineTypeLabel[item.line_type] ?? item.line_type}
                </td>
                <td className="py-2 pr-4">{item.description}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  {Number(item.quantity).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {Number(item.unit_price).toLocaleString("ja-JP", {
                    style: "currency",
                    currency: "JPY",
                  })}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {Number(item.amount).toLocaleString("ja-JP", {
                    style: "currency",
                    currency: "JPY",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-400">
              <td colSpan={4} className="py-2 pr-4 text-right font-semibold">
                合計
              </td>
              <td className="py-2 pr-4 text-right font-mono font-semibold">
                {Number(statement.total_amount).toLocaleString("ja-JP", {
                  style: "currency",
                  currency: "JPY",
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* アクション */}
      {statement.status === "draft" && (
        <div className="flex items-center gap-4">
          <form action={confirmBillingStatementAction}>
            <input type="hidden" name="id" value={statement.id} />
            <button
              type="submit"
              className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              請求確定
            </button>
          </form>
          <form action={deleteBillingStatementAction}>
            <input type="hidden" name="id" value={statement.id} />
            <button
              type="submit"
              className="rounded border border-red-300 px-6 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              削除
            </button>
          </form>
        </div>
      )}

      {statement.status === "confirmed" && (
        <p className="rounded bg-green-50 px-4 py-3 text-sm text-green-700">
          この請求書は確定済みです。変更・削除はできません。
        </p>
      )}
    </main>
  );
}
