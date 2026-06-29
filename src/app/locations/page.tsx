import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listLocations } from "@/lib/locations/repository";
import { listShippers } from "@/lib/shippers/repository";
import { deleteLocationAction } from "./actions";

// ロケーション一覧（サーバーコンポーネント）。常に最新を表示するため動的レンダリング。
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const supabase = await createClient();
  const [locations, shippers] = await Promise.all([
    listLocations(supabase),
    listShippers(supabase),
  ]);
  // ロケーションの owner_shipper_id → 荷主コードを引くための索引
  const shipperById = new Map(shippers.map((s) => [s.id, s]));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ロケーションマスタ</h1>
        <Link
          href="/locations/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規登録
        </Link>
      </div>

      {locations.length === 0 ? (
        <p className="text-zinc-500">ロケーションが登録されていません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">コード</th>
              <th className="py-2 pr-4">温度帯</th>
              <th className="py-2 pr-4">用途</th>
              <th className="py-2 pr-4">専用荷主</th>
              <th className="py-2 pr-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4 font-mono">{l.code}</td>
                <td className="py-2 pr-4">{l.temp_zone}</td>
                <td className="py-2 pr-4">{l.usage}</td>
                <td className="py-2 pr-4 font-mono">
                  {l.owner_shipper_id
                    ? (shipperById.get(l.owner_shipper_id)?.code ??
                      l.owner_shipper_id)
                    : "共用"}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/locations/${l.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteLocationAction}>
                      <input type="hidden" name="id" value={l.id} />
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
