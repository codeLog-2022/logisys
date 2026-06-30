import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createProduct,
  deleteProduct,
  DuplicateCodeError,
  getProduct,
  listProducts,
  updateProduct,
} from "../src/lib/products/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ProductInput } from "../src/lib/products/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 商品 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0002_grants.sql の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//
// products は shipper_id 必須（荷主×コードで一意）。テスト用の親荷主を beforeAll で
// 1件作成し、その id を全テストで使う。荷主は afterAll で削除する。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。
// 作成した商品は afterEach で明示削除し、DB に痕跡を残さない（最後に残骸ゼロを検証）。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// テストデータは固有プレフィックスで識別し、後始末漏れを検出できるようにする
const TEST_PREFIX = "VITEST-PROD-";
const SHIPPER_PREFIX = "VITEST-PROD-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
// 作成した商品 id を記録 → afterEach でまとめて削除
const createdIds = new Set<string>();

function baseInput(suffix: string): ProductInput {
  return {
    shipper_id: shipperId,
    code: `${TEST_PREFIX}${suffix}`,
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

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("products repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_SERVICE_ROLE_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, serviceRoleKey);

    // 親荷主を 1 件用意（products.shipper_id の参照先）
    const shipper = await createShipper(supabase, {
      code: `${SHIPPER_PREFIX}OWNER`,
      name: "テスト荷主（商品テスト用）",
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
    });
    shipperId = shipper.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteProduct(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    // 残骸ゼロを検証（プレフィックス一致の商品が DB に残っていないこと）
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // 親荷主を後始末（on delete restrict のため商品削除後に消す）
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a product and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createProduct(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.code).toBe(input.code);
    expect(created.name).toBe(input.name);
    expect(created.unit).toBe("バラ");
    expect(created.temp_zone).toBe("常温");
    expect(created.units_per_case).toBeNull();
    expect(created.hazard_class).toBeNull();

    const fetched = await getProduct(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.code).toBe(input.code);

    const all = await listProducts(supabase);
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (shipper_id, code) with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createProduct(supabase, input));

    await expect(createProduct(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("updates fields and advances updated_at", async () => {
    const created = await track(createProduct(supabase, baseInput("UPD")));
    const originalUpdatedAt = created.updated_at;

    // updated_at はトリガで now() に更新される。now() の分解能差で同値になり得るため待機。
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateProduct(supabase, created.id, {
      ...baseInput("UPD"),
      name: "更新後の商品名",
      unit: "ケース",
      units_per_case: 24,
      temp_zone: "冷蔵",
    });

    expect(updated.name).toBe("更新後の商品名");
    expect(updated.unit).toBe("ケース");
    expect(updated.units_per_case).toBe(24);
    expect(updated.temp_zone).toBe("冷蔵");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it("deletes a product so it can no longer be read", async () => {
    const created = await createProduct(supabase, baseInput("DEL"));
    await deleteProduct(supabase, created.id);

    const fetched = await getProduct(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
