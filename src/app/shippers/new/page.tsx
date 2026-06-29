import { createShipperAction } from "../actions";
import { ShipperForm } from "../ShipperForm";

export default function NewShipperPage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">荷主の新規登録</h1>
      <ShipperForm action={createShipperAction} submitLabel="登録" />
    </main>
  );
}
