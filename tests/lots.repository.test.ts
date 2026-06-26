import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createLot,
  deleteLot,
  DuplicateCodeError,
  getLot,
  listLots,
  listLotsForProduct,
  updateLot,
} from "../src/lib/lots/repository";
import { createProduct, deleteProduct } from "../src/lib/products/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { ProductInput } from "../src/lib/products/types";
import type { LotInput } from "../src/lib/lots/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// ロット CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0005 末尾の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
// 親子 FK 順序（shipper → product → lot）を守り、削除は逆順。
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const PREFIX = "VITEST-LOT-";

let supabase: SupabaseClient;
let shipperId: string;
let productId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${PREFIX}SHIP-${suffix}`,
    name: `テスト荷主（ロットテスト用 ${suffix}）`,
    lot_managed: true,
    expiry_managed: true,
    serial_managed: false,
    inspection_method: "全数",
    picking_rule: "FEFO",
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
    temp_zone: "冷蔵",
    hazard_class: null,
    jan_code: null,
    lot_managed: null,
    expiry_managed: null,
    serial_managed: null,
    units_per_ball: null,
  };
}

function baseInput(overrides: Partial<LotInput> = {}): LotInput {
  return {
    shipper_id: shipperId,
    product_id: productId,
    lot_no: `${PREFIX}L-001`,
    expiry_date: "2026-12-31",
    manufacture_date: "2026-01-01",
    serial_no: null,
    ...overrides,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("lots repository (REST CRUD against real local DB)", () => {
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
      await deleteLot(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("lots")
      .select("id")
      .eq("shipper_id", shipperId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    // 逆順で親を削除（products/shippers は on delete restrict）
    if (productId) await deleteProduct(supabase, productId);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a lot and reads it back", async () => {
    const created = await track(createLot(supabase, baseInput()));
    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.product_id).toBe(productId);
    expect(created.lot_no).toBe(`${PREFIX}L-001`);
    expect(created.expiry_date).toBe("2026-12-31");
    expect(created.manufacture_date).toBe("2026-01-01");
    expect(created.serial_no).toBeNull();

    const fetched = await getLot(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.lot_no).toBe(`${PREFIX}L-001`);
  });

  it("rejects a duplicate (shipper_id, product_id, lot_no) with DuplicateCodeError", async () => {
    const input = baseInput({ lot_no: `${PREFIX}DUP` });
    await track(createLot(supabase, input));
    await expect(createLot(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("lists lots for a product ordered by expiry_date (FEFO axis)", async () => {
    const later = await track(
      createLot(supabase, { lot_no: `${PREFIX}LATE`, expiry_date: "2027-06-01", manufacture_date: null, serial_no: null, shipper_id: shipperId, product_id: productId }),
    );
    const earlier = await track(
      createLot(supabase, { lot_no: `${PREFIX}EARLY`, expiry_date: "2026-06-01", manufacture_date: null, serial_no: null, shipper_id: shipperId, product_id: productId }),
    );

    const rows = await listLotsForProduct(supabase, shipperId, productId);
    const ids = rows.map((r) => r.id);
    // 期限が早い EARLY が LATE より前に並ぶ
    expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));
  });

  it("lists lots for a shipper", async () => {
    const created = await track(createLot(supabase, baseInput({ lot_no: `${PREFIX}LIST` })));
    const all = await listLots(supabase, shipperId);
    expect(all.some((l) => l.id === created.id)).toBe(true);
  });

  it("updates expiry_date and serial_no", async () => {
    const created = await track(createLot(supabase, baseInput({ lot_no: `${PREFIX}UPD` })));
    const updated = await updateLot(supabase, created.id, {
      ...baseInput({ lot_no: `${PREFIX}UPD` }),
      expiry_date: "2028-03-31",
      serial_no: "SN-UPDATED",
    });
    expect(updated.expiry_date).toBe("2028-03-31");
    expect(updated.serial_no).toBe("SN-UPDATED");
  });

  it("deletes a lot so it can no longer be read", async () => {
    const created = await createLot(supabase, baseInput({ lot_no: `${PREFIX}DEL` }));
    await deleteLot(supabase, created.id);
    const fetched = await getLot(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
