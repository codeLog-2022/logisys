import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listInventoryCurrent } from "@/lib/inventory/repository";
import { listTransactions } from "@/lib/inventory_transactions/repository";

// サマリーダッシュボード（サーバーコンポーネント）。常に最新を表示するため動的レンダリング。
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const [inventoryRows, recentTxns] = await Promise.all([
    listInventoryCurrent(supabase),
    listTransactions(supabase, { limit: 5 }),
  ]);

  // 良品在庫の合計数量
  const goodStockTotal = inventoryRows
    .filter((row) => row.status === "良品")
    .reduce((sum, row) => sum + Number(row.qty), 0);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-2xl font-semibold">ダッシュボード</h1>

      {/* 在庫サマリーカード */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">在庫サマリー</h2>
        <div className="rounded border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">良品在庫 合計数量</p>
          <p className="mt-1 text-4xl font-bold text-zinc-900">
            {goodStockTotal.toLocaleString()}
          </p>
        </div>
      </section>

      {/* 直近の入出庫 */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">直近の入出庫（最新5件）</h2>
        {recentTxns.length === 0 ? (
          <p className="text-zinc-500">入出庫の記録がありません。</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left">
                <th className="py-2 pr-4">日時</th>
                <th className="py-2 pr-4">区分</th>
                <th className="py-2 pr-4">数量</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((txn) => (
                <tr key={txn.id} className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-600">
                    {new Date(txn.created_at).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        txn.txn_type === "IN"
                          ? "rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                          : "rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
                      }
                    >
                      {txn.txn_type === "IN" ? "入庫" : "出庫"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {txn.quantity.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* クイックリンク */}
      <section>
        <h2 className="mb-3 text-lg font-medium">クイックリンク</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href="/transactions/new?txn_type=IN"
            className="flex items-center justify-center rounded border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            入庫登録
          </Link>
          <Link
            href="/transactions/new?txn_type=OUT"
            className="flex items-center justify-center rounded border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            出庫登録
          </Link>
          <Link
            href="/inventory"
            className="flex items-center justify-center rounded border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            在庫照会
          </Link>
          <Link
            href="/shippers"
            className="flex items-center justify-center rounded border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            マスタ
          </Link>
        </div>
      </section>
    </main>
  );
}
