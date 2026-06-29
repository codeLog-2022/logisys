import { createClient } from "@/lib/supabase/server";
import { listShippers } from "@/lib/shippers/repository";
import { createLocationAction } from "../actions";
import { LocationForm } from "../LocationForm";

export default async function NewLocationPage() {
  const supabase = await createClient();
  const shippers = await listShippers(supabase);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ロケーションの新規登録</h1>
      <LocationForm
        action={createLocationAction}
        submitLabel="登録"
        shippers={shippers}
      />
    </main>
  );
}
