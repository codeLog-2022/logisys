import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createBusinessPartner,
  deleteBusinessPartner,
  DuplicateCodeError,
  getBusinessPartner,
  listBusinessPartners,
  updateBusinessPartner,
} from "../src/lib/business_partners/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { BusinessPartnerInput } from "../src/lib/business_partners/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 取引先 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0003 末尾の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//
// business_partners は shipper_id 必須（荷主×コードで一意）。親荷主を beforeAll で 1 件作成。
// 親子 FK 順序（shipper は on delete restrict）を守り、取引先削除後に荷主を消す。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_PREFIX = "VITEST-BP-";
const SHIPPER_PREFIX = "VITEST-BP-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（取引先テスト用 ${suffix}）`,
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

function baseInput(suffix: string): BusinessPartnerInput {
  return {
    shipper_id: shipperId,
    code: `${TEST_PREFIX}${suffix}`,
    name: `テスト取引先 ${suffix}`,
    partner_type: "ship_to",
    parent_id: null,
    postal_code: null,
    address: null,
    tel: null,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("business_partners repository (REST CRUD against real local DB)", () => {
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
    // parent_id 自己参照（on delete set null）があるため任意順で削除可。
    for (const id of createdIds) {
      await deleteBusinessPartner(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("business_partners")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a business partner and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createBusinessPartner(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.code).toBe(input.code);
    expect(created.partner_type).toBe("ship_to");
    expect(created.parent_id).toBeNull();

    const fetched = await getBusinessPartner(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.code).toBe(input.code);

    const all = await listBusinessPartners(supabase);
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (shipper_id, code) with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createBusinessPartner(supabase, input));
    await expect(
      createBusinessPartner(supabase, input),
    ).rejects.toBeInstanceOf(DuplicateCodeError);
  });

  it("supports a self-referencing parent_id (chain hierarchy)", async () => {
    const head = await track(
      createBusinessPartner(supabase, {
        ...baseInput("HEAD"),
        partner_type: "bill_to",
      }),
    );
    const store = await track(
      createBusinessPartner(supabase, {
        ...baseInput("STORE"),
        parent_id: head.id,
      }),
    );
    expect(store.parent_id).toBe(head.id);
  });

  it("updates fields and advances updated_at", async () => {
    const created = await track(createBusinessPartner(supabase, baseInput("UPD")));
    const originalUpdatedAt = created.updated_at;
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateBusinessPartner(supabase, created.id, {
      ...baseInput("UPD"),
      name: "更新後の取引先名",
      partner_type: "supplier",
      tel: "03-1234-5678",
    });

    expect(updated.name).toBe("更新後の取引先名");
    expect(updated.partner_type).toBe("supplier");
    expect(updated.tel).toBe("03-1234-5678");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it("deletes a business partner so it can no longer be read", async () => {
    const created = await createBusinessPartner(supabase, baseInput("DEL"));
    await deleteBusinessPartner(supabase, created.id);
    const fetched = await getBusinessPartner(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
