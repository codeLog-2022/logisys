import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listProducts } from "@/lib/products/repository";
import { listShippers } from "@/lib/shippers/repository";
import { deleteProductAction } from "./actions";

// 商品一覧（サーバーコンポーネント）。常に最新を表示するため動的レンダリング。
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = await createClient();
  const [products, shippers] = await Promise.all([
    listProducts(supabase),
    listShippers(supabase),
  ]);
  // 商品の shipper_id → 荷主コードを引くための索引
  const shipperById = new Map(shippers.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品マスタ</h1>
        <Link
          href="/products/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規登録
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-zinc-500">商品が登録されていません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">荷主</th>
              <th className="py-2 pr-4">コード</th>
              <th className="py-2 pr-4">名称</th>
              <th className="py-2 pr-4">単位</th>
              <th className="py-2 pr-4">温度帯</th>
              <th className="py-2 pr-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4 font-mono">
                  {shipperById.get(p.shipper_id)?.code ?? p.shipper_id}
                </td>
                <td className="py-2 pr-4 font-mono">{p.code}</td>
                <td className="py-2 pr-4">{p.name}</td>
                <td className="py-2 pr-4">{p.unit}</td>
                <td className="py-2 pr-4">{p.temp_zone}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/products/${p.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="text-red-600 hover:underline"
                      >
                        削除
                      </button>
                    </form>
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
