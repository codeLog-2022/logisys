import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createInboundInspection,
  deleteInboundInspection,
  getInboundInspection,
  listInboundInspections,
  listInspectionsForPlanLine,
  updateInboundInspection,
} from "../src/lib/inbound_inspections/repository";
import {
  createInboundPlanLine,
  deleteInboundPlanLine,
} from "../src/lib/inbound_plan_lines/repository";
import {
  createInboundPlan,
  deleteInboundPlan,
} from "../src/lib/inbound_plans/repository";
import { createProduct, deleteProduct } from "../src/lib/products/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import { createUser, deleteUser } from "../src/lib/users/repository";
import { listRoles } from "../src/lib/users/roles.repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { ProductInput } from "../src/lib/products/types";
import type { InboundInspectionInput } from "../src/lib/inbound_inspections/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 入荷検品 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// このテーブルは業務 unique なし＝23505 変換なし（DuplicateCodeError は出さない）。
// 親子 FK 順序（shipper → product → inbound_plan → line → inspection / user）を守り、削除は逆順。
// inspected_by は 0006 で users(id) への FK（on delete set null）が後付けされた＝実在 user を参照する。

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PREFIX = "VITEST-INSP-";

let supabase: SupabaseClient;
let shipperId: string;
let productId: string;
let planId: string;
let planLineId: string;
let inspectedBy: string; // 0006 で inspected_by が FK 化されたため実在 user を参照する。
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${PREFIX}SHIP-${suffix}`,
    name: `テスト荷主（検品テスト用 ${suffix}）`,
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

function baseInput(overrides: Partial<InboundInspectionInput> = {}): InboundInspectionInput {
  return {
    shipper_id: shipperId,
    inbound_plan_line_id: planLineId,
    product_id: productId,
    inspection_method: "全数",
    planned_qty: 10,
    inspected_qty: 10,
    good_qty: 10,
    defect_qty: 0,
    lot_no: "L-INSP",
    expiry_date: "2026-12-31",
    manufacture_date: "2026-01-01",
    exception_type: null,
    note: null,
    inspected_by: inspectedBy,
    ...overrides,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("inbound_inspections repository (REST CRUD against real local DB)", () => {
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
    const plan = await createInboundPlan(supabase, {
      shipper_id: shipperId,
      plan_no: `${PREFIX}ASN-OWNER`,
      supplier_id: null,
      scheduled_date: null,
      status: "planned",
      source: "manual",
    });
    planId = plan.id;
    const line = await createInboundPlanLine(supabase, {
      inbound_plan_id: planId,
      product_id: productId,
      planned_qty: 10,
      lot_no: null,
      expiry_date: null,
    });
    planLineId = line.id;
    // 0006 で inspected_by が users(id) への FK になったため、実在 user を 1 件用意する。
    const roles = await listRoles(supabase);
    const admin = roles.find((r) => r.code === "admin");
    const user = await createUser(supabase, {
      email: `${PREFIX.toLowerCase()}inspector@example.com`,
      name: "検品者",
      role_id: admin!.id,
      shipper_id: shipperId,
      auth_user_id: null,
      is_active: true,
    });
    inspectedBy = user.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteInboundInspection(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("inbound_inspections")
      .select("id")
      .eq("shipper_id", shipperId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    // 逆順で親を削除（inspected_by は set null なので user は検品削除後に消せる）
    if (planLineId) await deleteInboundPlanLine(supabase, planLineId);
    if (planId) await deleteInboundPlan(supabase, planId);
    if (inspectedBy) await deleteUser(supabase, inspectedBy);
    if (productId) await deleteProduct(supabase, productId);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates an inspection referencing a real inspected_by user and reads it back", async () => {
    const created = await track(createInboundInspection(supabase, baseInput()));
    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.inbound_plan_line_id).toBe(planLineId);
    expect(created.inspection_method).toBe("全数");
    expect(created.good_qty).toBe(10);
    expect(created.defect_qty).toBe(0);
    // inspected_by は 0006 で FK 化＝実在 user を参照する
    expect(created.inspected_by).toBe(inspectedBy);
    expect(created.inspected_at).toBeTruthy();

    const fetched = await getInboundInspection(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.inspected_by).toBe(inspectedBy);
  });

  it("records an exception (qty_short with defect_qty) and lists by shipper", async () => {
    const created = await track(
      createInboundInspection(
        supabase,
        baseInput({
          inspected_qty: 8,
          good_qty: 6,
          defect_qty: 2,
          exception_type: "qty_short",
          note: "2個破損・2個不足",
        }),
      ),
    );
    expect(created.exception_type).toBe("qty_short");
    expect(created.defect_qty).toBe(2);

    const all = await listInboundInspections(supabase, shipperId);
    expect(all.some((i) => i.id === created.id)).toBe(true);
  });

  it("lists inspections for a plan line (予実照合キー)", async () => {
    const created = await track(createInboundInspection(supabase, baseInput()));
    const rows = await listInspectionsForPlanLine(supabase, planLineId);
    expect(rows.some((i) => i.id === created.id)).toBe(true);
  });

  it("updates good/defect quantities and exception_type", async () => {
    const created = await track(createInboundInspection(supabase, baseInput()));
    const updated = await updateInboundInspection(supabase, created.id, {
      ...baseInput(),
      good_qty: 7,
      defect_qty: 3,
      exception_type: "damaged",
    });
    expect(updated.good_qty).toBe(7);
    expect(updated.defect_qty).toBe(3);
    expect(updated.exception_type).toBe("damaged");
  });

  it("deletes an inspection so it can no longer be read", async () => {
    const created = await createInboundInspection(supabase, baseInput());
    await deleteInboundInspection(supabase, created.id);
    const fetched = await getInboundInspection(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
