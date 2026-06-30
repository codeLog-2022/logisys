import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { BillingForm } from "../BillingForm";
import { createBillingStatementAction } from "../actions";

export default async function NewBillingPage() {
  const supabase = await createClient();
  const shippers = await listShippers(supabase);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">請求書作成</h1>
      <p className="mb-6 text-sm text-zinc-600">
        荷主と対象年月を選択して算定を実行します。確定前は内容を削除できます。
      </p>
      <BillingForm action={createBillingStatementAction} shippers={shippers} />
    </main>
  );
}
