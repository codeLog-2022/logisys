import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createShipperProductCodeMap,
  deleteShipperProductCodeMap,
  DuplicateCodeError,
  getShipperProductCodeMap,
  listShipperProductCodeMaps,
  updateShipperProductCodeMap,
} from "../src/lib/shipper_product_code_map/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import { createProduct, deleteProduct } from "../src/lib/products/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { ProductInput } from "../src/lib/products/types";
import type { ShipperProductCodeMapInput } from "../src/lib/shipper_product_code_map/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 読替表 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// unique は (shipper_id, source, external_code)。product_id は on delete cascade。
//
// 親子 FK 順序: shipper(restrict) → product(restrict) を張るため、
//   後始末は code_map → product → shipper の順で削除する。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_PREFIX = "VITEST-MAP-";
const SHIPPER_PREFIX = "VITEST-MAP-SHIP-";
const PRODUCT_PREFIX = "VITEST-MAP-PROD-";

let supabase: SupabaseClient;
let shipperId: string;
let productId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（読替表テスト用 ${suffix}）`,
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
    code: `${PRODUCT_PREFIX}${suffix}`,
    name: `テスト商品 ${suffix}`,
    unit: "バラ",
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

function baseInput(suffix: string): ShipperProductCodeMapInput {
  return {
    shipper_id: shipperId,
    product_id: productId,
    external_code: `${TEST_PREFIX}${suffix}`,
    source: "shipper",
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("shipper_product_code_map repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_SERVICE_ROLE_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, serviceRoleKey);
    const shipper = await createShipper(supabase, shipperInput("OWNER"));
    shipperId = shipper.id;
    const product = await createProduct(supabase, productInput("OWNER"));
    productId = product.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteShipperProductCodeMap(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("shipper_product_code_map")
      .select("id")
      .like("external_code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // 親子 FK 順序: code_map → product → shipper の順で削除（restrict のため）
    if (productId) await deleteProduct(supabase, productId);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a code map and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createShipperProductCodeMap(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.product_id).toBe(productId);
    expect(created.external_code).toBe(input.external_code);
    expect(created.source).toBe("shipper");

    const fetched = await getShipperProductCodeMap(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.external_code).toBe(input.external_code);

    const all = await listShipperProductCodeMaps(supabase);
    expect(all.some((m) => m.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (shipper_id, source, external_code) with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createShipperProductCodeMap(supabase, input));
    await expect(
      createShipperProductCodeMap(supabase, input),
    ).rejects.toBeInstanceOf(DuplicateCodeError);
  });

  it("allows the same external_code under a different source", async () => {
    const shipperScoped = await track(
      createShipperProductCodeMap(supabase, {
        ...baseInput("SRC"),
        source: "shipper",
      }),
    );
    const ediScoped = await track(
      createShipperProductCodeMap(supabase, {
        ...baseInput("SRC"),
        source: "edi",
      }),
    );
    expect(shipperScoped.external_code).toBe(ediScoped.external_code);
    expect(ediScoped.source).toBe("edi");
  });

  it("updates the source and external_code", async () => {
    const created = await track(
      createShipperProductCodeMap(supabase, baseInput("UPD")),
    );
    const updated = await updateShipperProductCodeMap(supabase, created.id, {
      ...baseInput("UPD"),
      external_code: `${TEST_PREFIX}UPD2`,
      source: "mall",
    });
    expect(updated.external_code).toBe(`${TEST_PREFIX}UPD2`);
    expect(updated.source).toBe("mall");
  });

  it("deletes a code map so it can no longer be read", async () => {
    const created = await createShipperProductCodeMap(supabase, baseInput("DEL"));
    await deleteShipperProductCodeMap(supabase, created.id);
    const fetched = await getShipperProductCodeMap(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
