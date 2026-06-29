import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocation } from "@/lib/locations/repository";
import { listShippers } from "@/lib/shippers/repository";
import { updateLocationAction, type LocationFormState } from "../../actions";
import { LocationForm } from "../../LocationForm";

// Next 16: params は Promise。await して解決する。
export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [location, shippers] = await Promise.all([
    getLocation(supabase, id),
    listShippers(supabase),
  ]);
  if (!location) notFound();

  // id を束縛したサーバーアクションをクライアントフォームへ渡す
  async function action(
    prev: LocationFormState,
    formData: FormData,
  ): Promise<LocationFormState> {
    "use server";
    return updateLocationAction(id, prev, formData);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ロケーションの編集</h1>
      <LocationForm
        action={action}
        submitLabel="更新"
        shippers={shippers}
        initial={location}
      />
    </main>
  );
}
