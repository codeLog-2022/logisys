import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { deleteShipperAction } from "./actions";

// 荷主一覧（サーバーコンポーネント）。常に最新を表示するため動的レンダリング。
export const dynamic = "force-dynamic";

export default async function ShippersPage() {
  const supabase = await createClient();
  const shippers = await listShippers(supabase);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">荷主マスタ</h1>
        <Link
          href="/shippers/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規登録
        </Link>
      </div>

      {shippers.length === 0 ? (
        <p className="text-zinc-500">荷主が登録されていません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">コード</th>
              <th className="py-2 pr-4">名称</th>
              <th className="py-2 pr-4">検品方法</th>
              <th className="py-2 pr-4">ピッキング</th>
              <th className="py-2 pr-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {shippers.map((s) => (
              <tr key={s.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4 font-mono">{s.code}</td>
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4">{s.inspection_method}</td>
                <td className="py-2 pr-4">{s.picking_rule}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/shippers/${s.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteShipperAction}>
                      <input type="hidden" name="id" value={s.id} />
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
