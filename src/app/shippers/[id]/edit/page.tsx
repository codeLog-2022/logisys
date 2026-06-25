import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShipper } from "@/lib/shippers/repository";
import { updateShipperAction, type ShipperFormState } from "../../actions";
import { ShipperForm } from "../../ShipperForm";

// Next 16: params は Promise。await して解決する。
export default async function EditShipperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const shipper = await getShipper(supabase, id);
  if (!shipper) notFound();

  // id を束縛したサーバーアクションをクライアントフォームへ渡す
  async function action(
    prev: ShipperFormState,
    formData: FormData,
  ): Promise<ShipperFormState> {
    "use server";
    return updateShipperAction(id, prev, formData);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">荷主の編集</h1>
      <ShipperForm action={action} submitLabel="更新" initial={shipper} />
    </main>
  );
}
