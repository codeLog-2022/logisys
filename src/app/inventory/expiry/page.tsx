import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listInventoryByExpiry } from "@/lib/inventory/repository";

// 賞味期限別在庫（サーバーコンポーネント）。常に最新を表示するため動的レンダリング。
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ shipper_id?: string }>;
};

export default async function InventoryExpiryPage({ searchParams }: Props) {
  const { shipper_id } = await searchParams;
  const supabase = await createClient();

  const rows = await listInventoryByExpiry(
    supabase,
    shipper_id ? { shipper_id } : undefined,
  );

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">賞味期限別在庫</h1>
        <Link
          href="/inventory"
          className="rounded bg-zinc-600 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          在庫一覧へ戻る
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-zinc-500">対象の良品在庫がありません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">荷主ID</th>
              <th className="py-2 pr-4">商品ID</th>
              <th className="py-2 pr-4">ロット番号</th>
              <th className="py-2 pr-4">賞味期限</th>
              <th className="py-2 pr-4 text-right">数量（良品）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-200">
                <td className="py-2 pr-4 font-mono text-xs">{row.shipper_id}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.product_id}</td>
                <td className="py-2 pr-4">{row.lot_no ?? "-"}</td>
                <td className="py-2 pr-4">
                  {row.expiry_date ?? (
                    <span className="text-zinc-400">期限なし</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {Number(row.qty).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
