import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listTransactions } from "@/lib/inventory_transactions/repository";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const txns = await listTransactions(supabase, { limit: 100 });

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">入出庫一覧</h1>
        <div className="flex gap-3">
          <Link
            href="/transactions/new?type=in"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            入庫登録
          </Link>
          <Link
            href="/transactions/new?type=out"
            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            出庫登録
          </Link>
        </div>
      </div>

      {txns.length === 0 ? (
        <p className="text-zinc-500">入出庫記録がありません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">日時</th>
              <th className="py-2 pr-4">区分</th>
              <th className="py-2 pr-4">数量</th>
              <th className="py-2 pr-4">ステータス</th>
              <th className="py-2 pr-4">ロット</th>
              <th className="py-2 pr-4">備考</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4 font-mono text-xs">
                  {new Date(t.created_at).toLocaleString("ja-JP")}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      t.txn_type === "IN"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {t.txn_type === "IN" ? "入庫" : "出庫"}
                  </span>
                </td>
                <td className="py-2 pr-4">{t.quantity}</td>
                <td className="py-2 pr-4">{t.status}</td>
                <td className="py-2 pr-4">{t.lot_no ?? "—"}</td>
                <td className="py-2 pr-4 text-zinc-500">{t.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
