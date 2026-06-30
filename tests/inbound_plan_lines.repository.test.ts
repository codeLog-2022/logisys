import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createInboundPlanLine,
  deleteInboundPlanLine,
  DuplicateCodeError,
  getInboundPlanLine,
  listInboundPlanLines,
  updateInboundPlanLine,
} from "../src/lib/inbound_plan_lines/repository";
import {
  createInboundPlan,
  deleteInboundPlan,
} from "../src/lib/inbound_plans/repository";
import { createProduct, deleteProduct } from "../src/lib/products/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { ProductInput } from "../src/lib/products/types";
import type { InboundPlanInput } from "../src/lib/inbound_plans/types";
import type { InboundPlanLineInput } from "../src/lib/inbound_plan_lines/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 入荷予定明細 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// 親子 FK 順序（shipper → product → inbound_plan → line）を守って作成し、削除は逆順。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PREFIX = "VITEST-IPL-";

let supabase: SupabaseClient;
let shipperId: string;
let productId: string;
let planId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${PREFIX}SHIP-${suffix}`,
    name: `テスト荷主（明細テスト用 ${suffix}）`,
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

function planInput(suffix: string): InboundPlanInput {
  return {
    shipper_id: shipperId,
    plan_no: `${PREFIX}ASN-${suffix}`,
    supplier_id: null,
    scheduled_date: null,
    status: "planned",
    source: "manual",
  };
}

function lineInput(overrides: Partial<InboundPlanLineInput> = {}): InboundPlanLineInput {
  return {
    inbound_plan_id: planId,
    product_id: productId,
    planned_qty: 10,
    lot_no: null,
    expiry_date: null,
    ...overrides,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("inbound_plan_lines repository (REST CRUD against real local DB)", () => {
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
    const plan = await createInboundPlan(supabase, planInput("OWNER"));
    planId = plan.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteInboundPlanLine(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("inbound_plan_lines")
      .select("id")
      .eq("inbound_plan_id", planId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    // 逆順で親を削除（line → plan → product → shipper）
    if (planId) await deleteInboundPlan(supabase, planId);
    if (productId) await deleteProduct(supabase, productId);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a plan line and reads it back", async () => {
    const created = await track(
      createInboundPlanLine(supabase, lineInput({ planned_qty: 25, lot_no: "L-1" })),
    );
    expect(created.id).toBeTruthy();
    expect(created.inbound_plan_id).toBe(planId);
    expect(created.product_id).toBe(productId);
    expect(created.planned_qty).toBe(25);
    expect(created.lot_no).toBe("L-1");

    const fetched = await getInboundPlanLine(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.planned_qty).toBe(25);

    const lines = await listInboundPlanLines(supabase, planId);
    expect(lines.some((l) => l.id === created.id)).toBe(true);
  });

  it("rejects a duplicate (inbound_plan_id, product_id, lot_no) with DuplicateCodeError", async () => {
    const input = lineInput({ lot_no: "DUP-LOT" });
    await track(createInboundPlanLine(supabase, input));
    await expect(createInboundPlanLine(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("updates planned_qty and lot_no", async () => {
    const created = await track(createInboundPlanLine(supabase, lineInput({ lot_no: "UPD" })));
    const updated = await updateInboundPlanLine(supabase, created.id, {
      ...lineInput({ lot_no: "UPD" }),
      planned_qty: 99,
      expiry_date: "2027-01-31",
    });
    expect(updated.planned_qty).toBe(99);
    expect(updated.expiry_date).toBe("2027-01-31");
  });

  it("deletes a plan line so it can no longer be read", async () => {
    const created = await createInboundPlanLine(supabase, lineInput({ lot_no: "DEL" }));
    await deleteInboundPlanLine(supabase, created.id);
    const fetched = await getInboundPlanLine(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
