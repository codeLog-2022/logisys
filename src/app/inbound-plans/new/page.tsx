import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { listProducts } from "@/lib/products/repository";
import { createInboundPlanAction } from "../actions";
import { InboundPlanForm } from "../InboundPlanForm";

export default async function NewInboundPlanPage() {
  const supabase = await createClient();
  const [shippers, products] = await Promise.all([
    listShippers(supabase),
    listProducts(supabase),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ASN 新規登録</h1>
      <InboundPlanForm
        action={createInboundPlanAction}
        submitLabel="登録"
        shippers={shippers}
        products={products}
      />
    </main>
  );
}
