import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInboundPlan } from "@/lib/inbound_plans/repository";
import { listInboundPlanLines } from "@/lib/inbound_plan_lines/repository";
import { listShippers } from "@/lib/shippers/repository";
import { listProducts } from "@/lib/products/repository";
import {
  deleteInboundPlanLineAction,
  updateInboundPlanStatusAction,
} from "../actions";
import type { InboundPlanStatus } from "@/lib/inbound_plans/types";

// Next 16: params は Promise
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InboundPlanStatus, string> = {
  planned: "予定",
  arrived: "入荷済",
  inspecting: "検品中",
  completed: "完了",
  cancelled: "キャンセル",
};

// ステータス遷移の許可マップ（現在 → 次の許可ステータス一覧）
const NEXT_STATUSES: Record<InboundPlanStatus, readonly InboundPlanStatus[]> = {
  planned: ["arrived", "cancelled"],
  arrived: ["inspecting", "cancelled"],
  inspecting: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export default async function InboundPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [plan, lines, shippers, products] = await Promise.all([
    getInboundPlan(supabase, id),
    listInboundPlanLines(supabase, id),
    listShippers(supabase),
    listProducts(supabase),
  ]);

  if (!plan) notFound();

  const shipperMap = new Map(shippers.map((s) => [s.id, s.name]));
  const productMap = new Map(products.map((p) => [p.id, `${p.name} (${p.code})`]));
  const status = plan.status as InboundPlanStatus;
  const nextStatuses = NEXT_STATUSES[status];
  const canInspect = status === "arrived" || status === "inspecting";

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/inbound-plans" className="text-sm text-zinc-500 hover:underline">
          &larr; 一覧へ戻る
        </Link>
        <h1 className="text-2xl font-semibold">
          ASN詳細: {plan.plan_no}
        </h1>
      </div>

      {/* 基本情報 */}
      <section className="mb-8 rounded border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="mb-3 text-base font-medium">基本情報</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="font-medium text-zinc-500">荷主</dt>
          <dd>{shipperMap.get(plan.shipper_id) ?? plan.shipper_id}</dd>
          <dt className="font-medium text-zinc-500">予定入荷日</dt>
          <dd>{plan.scheduled_date ?? "—"}</dd>
          <dt className="font-medium text-zinc-500">ステータス</dt>
          <dd>{STATUS_LABELS[status]}</dd>
          <dt className="font-medium text-zinc-500">取込元</dt>
          <dd>{plan.source}</dd>
        </dl>
      </section>

      {/* ステータス変更 */}
      {nextStatuses.length > 0 && (
        <section className="mb-6 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-zinc-600">ステータス変更:</span>
          {nextStatuses.map((s) => (
            <form key={s} action={updateInboundPlanStatusAction}>
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
              >
                {STATUS_LABELS[s]} にする
              </button>
            </form>
          ))}
        </section>
      )}

      {/* 明細一覧 */}
      <section className="mb-6">
        <h2 className="mb-3 text-base font-medium">明細一覧</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">明細が登録されていません。</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left">
                <th className="py-2 pr-4">商品</th>
                <th className="py-2 pr-4">予定数</th>
                <th className="py-2 pr-4">ロット番号</th>
                <th className="py-2 pr-4">賞味期限</th>
                <th className="py-2 pr-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-200">
                  <td className="py-2 pr-4">
                    {productMap.get(line.product_id) ?? line.product_id}
                  </td>
                  <td className="py-2 pr-4">{line.planned_qty}</td>
                  <td className="py-2 pr-4">{line.lot_no ?? "—"}</td>
                  <td className="py-2 pr-4">{line.expiry_date ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <form action={deleteInboundPlanLineAction}>
                      <input type="hidden" name="line_id" value={line.id} />
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <button
                        type="submit"
                        className="text-red-600 hover:underline text-xs"
                      >
                        削除
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 検品登録へボタン */}
      {canInspect && lines.length > 0 && (
        <div className="mt-4">
          <Link
            href={`/inbound-plans/${plan.id}/inspect`}
            className="inline-block rounded bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            検品登録へ
          </Link>
        </div>
      )}
    </main>
  );
}
