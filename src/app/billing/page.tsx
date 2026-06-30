import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listBillingStatements } from "@/lib/billing/repository";
import { listShippers } from "@/lib/shippers/repository";
import { deleteBillingStatementAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const [statements, shippers] = await Promise.all([
    listBillingStatements(supabase),
    listShippers(supabase),
  ]);

  // 荷主 ID → 名称のマップ
  const shipperMap = new Map(shippers.map((s) => [s.id, s.name]));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">請求一覧</h1>
        <Link
          href="/billing/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          請求書作成
        </Link>
      </div>

      {statements.length === 0 ? (
        <p className="text-zinc-500">請求書がありません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">荷主</th>
              <th className="py-2 pr-4">対象年月</th>
              <th className="py-2 pr-4 text-right">合計金額</th>
              <th className="py-2 pr-4">ステータス</th>
              <th className="py-2 pr-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr key={s.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4">
                  {shipperMap.get(s.shipper_id) ?? s.shipper_id}
                </td>
                <td className="py-2 pr-4 font-mono">{s.billing_year_month}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  {Number(s.total_amount).toLocaleString("ja-JP", {
                    style: "currency",
                    currency: "JPY",
                  })}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                      s.status === "confirmed"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {s.status === "confirmed" ? "確定" : "下書き"}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/billing/${s.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      詳細
                    </Link>
                    {s.status === "draft" && (
                      <form action={deleteBillingStatementAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="text-red-600 hover:underline"
                        >
                          削除
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
