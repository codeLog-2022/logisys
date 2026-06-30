import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { listProducts } from "@/lib/products/repository";
import { listLocations } from "@/lib/locations/repository";
import { TransactionForm } from "../TransactionForm";
import { createTransactionAction } from "../actions";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const txnType = type === "out" ? "OUT" : "IN";

  const supabase = await createClient();
  const [shippers, products, locations] = await Promise.all([
    listShippers(supabase),
    listProducts(supabase),
    listLocations(supabase),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {txnType === "IN" ? "入庫登録" : "出庫登録"}
      </h1>
      <TransactionForm
        action={createTransactionAction}
        submitLabel="登録"
        defaultTxnType={txnType}
        shippers={shippers}
        products={products}
        locations={locations}
      />
    </main>
  );
}
