import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listInboundPlans } from "@/lib/inbound_plans/repository";
import { listShippers } from "@/lib/shippers/repository";
import type { InboundPlanStatus } from "@/lib/inbound_plans/types";

// ASN 一覧（サーバーコンポーネント）
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InboundPlanStatus, string> = {
  planned: "予定",
  arrived: "入荷済",
  inspecting: "検品中",
  completed: "完了",
  cancelled: "キャンセル",
};

const STATUS_COLORS: Record<InboundPlanStatus, string> = {
  planned: "bg-blue-100 text-blue-700",
  arrived: "bg-yellow-100 text-yellow-700",
  inspecting: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export default async function InboundPlansPage() {
  const supabase = await createClient();
  const [plans, shippers] = await Promise.all([
    listInboundPlans(supabase),
    listShippers(supabase),
  ]);

  const shipperMap = new Map(shippers.map((s) => [s.id, s.name]));

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">入荷予定 (ASN) 一覧</h1>
        <Link
          href="/inbound-plans/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規ASN登録
        </Link>
      </div>

      {plans.length === 0 ? (
        <p className="text-zinc-500">入荷予定が登録されていません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2 pr-4">ASN番号</th>
              <th className="py-2 pr-4">荷主</th>
              <th className="py-2 pr-4">予定入荷日</th>
              <th className="py-2 pr-4">ステータス</th>
              <th className="py-2 pr-4">取込元</th>
              <th className="py-2 pr-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const status = p.status as InboundPlanStatus;
              return (
                <tr key={p.id} className="border-b border-zinc-200">
                  <td className="py-2 pr-4 font-mono">{p.plan_no}</td>
                  <td className="py-2 pr-4">{shipperMap.get(p.shipper_id) ?? p.shipper_id}</td>
                  <td className="py-2 pr-4">{p.scheduled_date ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{p.source}</td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/inbound-plans/${p.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
