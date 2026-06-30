import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInboundPlan } from "@/lib/inbound_plans/repository";
import { listInboundPlanLines } from "@/lib/inbound_plan_lines/repository";
import { listProducts } from "@/lib/products/repository";
import { createInspectionsAction } from "../../actions";
import type { InspectionFormState } from "../../actions";
import { InspectionForm } from "./InspectionForm";

export const dynamic = "force-dynamic";

export default async function InspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [plan, lines, products] = await Promise.all([
    getInboundPlan(supabase, id),
    listInboundPlanLines(supabase, id),
    listProducts(supabase),
  ]);

  if (!plan) notFound();

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href={`/inbound-plans/${id}`} className="text-sm text-zinc-500 hover:underline">
            &larr; ASN詳細へ戻る
          </Link>
          <h1 className="text-2xl font-semibold">検品登録</h1>
        </div>
        <p className="text-zinc-500">明細がないため検品を登録できません。</p>
      </main>
    );
  }

  const productMap = new Map(products.map((p) => [p.id, `${p.name} (${p.code})`]));

  // サーバーアクションに planId と shipperId を束縛
  async function boundAction(
    prev: InspectionFormState,
    formData: FormData,
  ): Promise<InspectionFormState> {
    "use server";
    return createInspectionsAction(plan!.id, plan!.shipper_id, prev, formData);
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/inbound-plans/${id}`} className="text-sm text-zinc-500 hover:underline">
          &larr; ASN詳細へ戻る
        </Link>
        <h1 className="text-2xl font-semibold">検品登録: {plan.plan_no}</h1>
      </div>

      <InspectionForm
        action={boundAction}
        planId={plan.id}
        lines={lines}
        productMap={productMap}
      />
    </main>
  );
}
