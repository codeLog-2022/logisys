import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProduct } from "@/lib/products/repository";
import { listShippers } from "@/lib/shippers/repository";
import { updateProductAction, type ProductFormState } from "../../actions";
import { ProductForm } from "../../ProductForm";

// Next 16: params は Promise。await して解決する。
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [product, shippers] = await Promise.all([
    getProduct(supabase, id),
    listShippers(supabase),
  ]);
  if (!product) notFound();

  // id を束縛したサーバーアクションをクライアントフォームへ渡す
  async function action(
    prev: ProductFormState,
    formData: FormData,
  ): Promise<ProductFormState> {
    "use server";
    return updateProductAction(id, prev, formData);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">商品の編集</h1>
      <ProductForm
        action={action}
        submitLabel="更新"
        shippers={shippers}
        initial={product}
      />
    </main>
  );
}
