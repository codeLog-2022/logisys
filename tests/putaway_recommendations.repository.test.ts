import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createPutawayRecommendation,
  deletePutawayRecommendation,
  getPutawayRecommendation,
  listPutawayRecommendations,
  updatePutawayRecommendation,
} from "../src/lib/putaway_recommendations/repository";
import { createProduct, deleteProduct } from "../src/lib/products/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { ProductInput } from "../src/lib/products/types";
import type { PutawayRecommendationInput } from "../src/lib/putaway_recommendations/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 格納推奨 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// このテーブルは業務 unique なし＝23505 変換なし（DuplicateCodeError は出さない）。
// 親子 FK 順序（shipper → product → putaway）を守り、削除は逆順。
// lot_id は FK なしの素 uuid（0005 の lots 前方参照を避ける調整）であることを確認する。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const PREFIX = "VITEST-PUT-";
// FK なしを示すため実在しない uuid を lot_id に使う。
const FAKE_LOT_ID = "9f000000-0000-4000-8000-0000000000ee";

let supabase: SupabaseClient;
let shipperId: string;
let productId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${PREFIX}SHIP-${suffix}`,
    name: `テスト荷主（格納推奨テスト用 ${suffix}）`,
    lot_managed: false,
    expiry_managed: false,
    serial_managed: false,
    inspection_method: "全数",
    picking_rule: "FIFO",
    storage_billing_method: "個建て",
    storage_billing_cycle: "3期制",
    storage_basis: "期末",
    closing_day: 99,
    expiry_acceptance_ratio: 0,
    inventory_mixing: "allowed",
  };
}

function productInput(suffix: string): ProductInput {
  return {
    shipper_id: shipperId,
    code: `${PREFIX}PROD-${suffix}`,
    name: `テスト商品 ${suffix}`,
    unit: "個",
    units_per_case: null,
    temp_zone: "常温",
    hazard_class: null,
    jan_code: null,
    lot_managed: null,
    expiry_managed: null,
    serial_managed: null,
    units_per_ball: null,
  };
}

function baseInput(overrides: Partial<PutawayRecommendationInput> = {}): PutawayRecommendationInput {
  return {
    shipper_id: shipperId,
    product_id: productId,
    lot_id: FAKE_LOT_ID,
    recommended_location_id: null,
    actual_location_id: null,
    reason: "温度帯一致",
    deviated: false,
    deviation_reason: null,
    inbound_inspection_id: null,
    ...overrides,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("putaway_recommendations repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);
    const shipper = await createShipper(supabase, shipperInput("OWNER"));
    shipperId = shipper.id;
    const product = await createProduct(supabase, productInput("OWNER"));
    productId = product.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deletePutawayRecommendation(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("putaway_recommendations")
      .select("id")
      .eq("shipper_id", shipperId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (productId) await deleteProduct(supabase, productId);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a recommendation with a non-FK lot_id and reads it back", async () => {
    const created = await track(createPutawayRecommendation(supabase, baseInput()));
    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.product_id).toBe(productId);
    // lot_id は FK なし＝実在しない uuid でも保存できる
    expect(created.lot_id).toBe(FAKE_LOT_ID);
    expect(created.deviated).toBe(false);
    expect(created.reason).toBe("温度帯一致");

    const fetched = await getPutawayRecommendation(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.lot_id).toBe(FAKE_LOT_ID);

    const all = await listPutawayRecommendations(supabase, shipperId);
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("records a deviation (deviated=true with reason)", async () => {
    const created = await track(
      createPutawayRecommendation(
        supabase,
        baseInput({ deviated: true, deviation_reason: "推奨ロケ満床" }),
      ),
    );
    expect(created.deviated).toBe(true);
    expect(created.deviation_reason).toBe("推奨ロケ満床");
  });

  it("updates deviated flag and reason", async () => {
    const created = await track(createPutawayRecommendation(supabase, baseInput()));
    const updated = await updatePutawayRecommendation(supabase, created.id, {
      ...baseInput(),
      deviated: true,
      deviation_reason: "温度帯不適合のため別区画へ",
    });
    expect(updated.deviated).toBe(true);
    expect(updated.deviation_reason).toBe("温度帯不適合のため別区画へ");
  });

  it("deletes a recommendation so it can no longer be read", async () => {
    const created = await createPutawayRecommendation(supabase, baseInput());
    await deletePutawayRecommendation(supabase, created.id);
    const fetched = await getPutawayRecommendation(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
