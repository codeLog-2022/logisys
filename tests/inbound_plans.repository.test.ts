import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createInboundPlan,
  deleteInboundPlan,
  DuplicateCodeError,
  getInboundPlan,
  listInboundPlans,
  updateInboundPlan,
} from "../src/lib/inbound_plans/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { InboundPlanInput } from "../src/lib/inbound_plans/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 入荷予定ASN CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0004 末尾の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//
// inbound_plans は shipper_id 必須（荷主×plan_no で一意）。親荷主を beforeAll で 1 件作成。
// 親子 FK 順序（shipper は on delete restrict）を守り、入荷予定削除後に荷主を消す。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_PREFIX = "VITEST-IP-";
const SHIPPER_PREFIX = "VITEST-IP-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（入荷予定テスト用 ${suffix}）`,
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

function baseInput(suffix: string): InboundPlanInput {
  return {
    shipper_id: shipperId,
    plan_no: `${TEST_PREFIX}${suffix}`,
    supplier_id: null,
    scheduled_date: "2026-07-01",
    status: "planned",
    source: "manual",
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("inbound_plans repository (REST CRUD against real local DB)", () => {
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
      await deleteInboundPlan(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("inbound_plans")
      .select("id")
      .like("plan_no", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates an inbound plan with defaults and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createInboundPlan(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.plan_no).toBe(input.plan_no);
    expect(created.status).toBe("planned");
    expect(created.source).toBe("manual");
    expect(created.supplier_id).toBeNull();

    const fetched = await getInboundPlan(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.plan_no).toBe(input.plan_no);

    const all = await listInboundPlans(supabase);
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (shipper_id, plan_no) with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createInboundPlan(supabase, input));
    await expect(createInboundPlan(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("updates status/source and advances updated_at", async () => {
    const created = await track(createInboundPlan(supabase, baseInput("UPD")));
    const originalUpdatedAt = created.updated_at;
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateInboundPlan(supabase, created.id, {
      ...baseInput("UPD"),
      status: "arrived",
      source: "edi",
    });

    expect(updated.status).toBe("arrived");
    expect(updated.source).toBe("edi");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it("deletes an inbound plan so it can no longer be read", async () => {
    const created = await createInboundPlan(supabase, baseInput("DEL"));
    await deleteInboundPlan(supabase, created.id);
    const fetched = await getInboundPlan(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
