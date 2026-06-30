import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createRateMaster,
  deleteRateMaster,
  DuplicateCodeError,
  getRateMaster,
  listRateMasters,
  updateRateMaster,
} from "../src/lib/rate_master/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { RateMasterInput } from "../src/lib/rate_master/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 料金マスタ CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// unique は (shipper_id, code, effective_from)＝有効開始日込みのバージョン管理。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_PREFIX = "VITEST-RATE-";
const SHIPPER_PREFIX = "VITEST-RATE-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（料金テスト用 ${suffix}）`,
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

function baseInput(suffix: string): RateMasterInput {
  return {
    shipper_id: shipperId,
    rate_type: "storage",
    code: `${TEST_PREFIX}${suffix}`,
    name: `テスト料金 ${suffix}`,
    unit: "坪",
    unit_price: 1500,
    currency: "JPY",
    effective_from: "2026-04-01",
    effective_to: null,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("rate_master repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_SERVICE_ROLE_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, serviceRoleKey);
    const shipper = await createShipper(supabase, shipperInput("OWNER"));
    shipperId = shipper.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteRateMaster(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("rate_master")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a rate and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createRateMaster(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.code).toBe(input.code);
    expect(created.rate_type).toBe("storage");
    expect(Number(created.unit_price)).toBe(1500);
    expect(created.currency).toBe("JPY");
    expect(created.effective_from).toBe("2026-04-01");
    expect(created.effective_to).toBeNull();

    const fetched = await getRateMaster(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.code).toBe(input.code);

    const all = await listRateMasters(supabase);
    expect(all.some((r) => r.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (shipper_id, code, effective_from) with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createRateMaster(supabase, input));
    await expect(createRateMaster(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("allows the same code with a different effective_from (versioning)", async () => {
    const v1 = await track(
      createRateMaster(supabase, {
        ...baseInput("VER"),
        effective_from: "2026-04-01",
      }),
    );
    const v2 = await track(
      createRateMaster(supabase, {
        ...baseInput("VER"),
        effective_from: "2027-04-01",
        unit_price: 1600,
      }),
    );
    expect(v1.code).toBe(v2.code);
    expect(Number(v2.unit_price)).toBe(1600);
  });

  it("updates fields and advances updated_at", async () => {
    const created = await track(createRateMaster(supabase, baseInput("UPD")));
    const originalUpdatedAt = created.updated_at;
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateRateMaster(supabase, created.id, {
      ...baseInput("UPD"),
      name: "更新後の料金名",
      rate_type: "handling",
      unit_price: 80,
      unit: "件",
    });

    expect(updated.name).toBe("更新後の料金名");
    expect(updated.rate_type).toBe("handling");
    expect(Number(updated.unit_price)).toBe(80);
    expect(updated.unit).toBe("件");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it("deletes a rate so it can no longer be read", async () => {
    const created = await createRateMaster(supabase, baseInput("DEL"));
    await deleteRateMaster(supabase, created.id);
    const fetched = await getRateMaster(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
