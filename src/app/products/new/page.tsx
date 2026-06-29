import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { createProductAction } from "../actions";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const supabase = await createClient();
  const shippers = await listShippers(supabase);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">商品の新規登録</h1>
      <ProductForm
        action={createProductAction}
        submitLabel="登録"
        shippers={shippers}
      />
    </main>
  );
}
