// billing.repository.test.ts
// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// billing_statements / billing_line_items CRUD を REST 経由で実 DB に対して検証する。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createBillingStatement,
  getBillingStatement,
  listBillingStatements,
  deleteBillingStatement,
  confirmBillingStatement,
  createBillingLineItem,
  createBillingLineItems,
  listBillingLineItems,
  DuplicateBillingStatementError,
  ConfirmedStatementError,
} from "../src/lib/billing/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { CreateBillingStatementInput } from "../src/lib/billing/types";

const apiUrl = process.env.SUPABASE_API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SHIPPER_PREFIX = "VITEST-BILL-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
const createdStatementIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（請求テスト用 ${suffix}）`,
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

function baseStatementInput(yearMonth: string): CreateBillingStatementInput {
  return {
    shipper_id: shipperId,
    billing_year_month: yearMonth,
    total_amount: 5000,
    status: "draft",
  };
}

async function trackStatement<T extends { id: string }>(
  p: Promise<T>,
): Promise<T> {
  const row = await p;
  createdStatementIds.add(row.id);
  return row;
}

describe("billing repository (REST CRUD against real local DB)", () => {
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
    // 作成した請求書（とカスケード削除される明細）を削除
    for (const id of createdStatementIds) {
      // confirmed の場合はステータスをリセットしてから削除（テスト専用クリーンアップ）
      await supabase
        .from("billing_statements")
        .update({ status: "draft" })
        .eq("id", id);
      await supabase.from("billing_statements").delete().eq("id", id);
    }
    createdStatementIds.clear();
  });

  afterAll(async () => {
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  // ============================================================
  // billing_statements CRUD
  // ============================================================

  it("creates a statement and reads it back", async () => {
    const input = baseStatementInput("2026-06");
    const created = await trackStatement(
      createBillingStatement(supabase, input),
    );

    expect(created.id).toBeTruthy();
    expect(created.shipper_id).toBe(shipperId);
    expect(created.billing_year_month).toBe("2026-06");
    expect(Number(created.total_amount)).toBe(5000);
    expect(created.status).toBe("draft");

    const fetched = await getBillingStatement(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.billing_year_month).toBe("2026-06");

    const all = await listBillingStatements(supabase);
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it("rejects duplicate (shipper_id, billing_year_month) with DuplicateBillingStatementError", async () => {
    await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-07")),
    );
    await expect(
      createBillingStatement(supabase, baseStatementInput("2026-07")),
    ).rejects.toBeInstanceOf(DuplicateBillingStatementError);
  });

  it("confirms a draft statement and cannot confirm again", async () => {
    const created = await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-08")),
    );
    const confirmed = await confirmBillingStatement(supabase, created.id);
    expect(confirmed.status).toBe("confirmed");

    await expect(
      confirmBillingStatement(supabase, created.id),
    ).rejects.toBeInstanceOf(ConfirmedStatementError);
  });

  it("deletes a draft statement", async () => {
    const created = await createBillingStatement(
      supabase,
      baseStatementInput("2026-09"),
    );
    await deleteBillingStatement(supabase, created.id);
    const fetched = await getBillingStatement(supabase, created.id);
    expect(fetched).toBeNull();
  });

  it("cannot delete a confirmed statement", async () => {
    const created = await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-10")),
    );
    await confirmBillingStatement(supabase, created.id);
    await expect(
      deleteBillingStatement(supabase, created.id),
    ).rejects.toBeInstanceOf(ConfirmedStatementError);
  });

  it("filters listBillingStatements by shipper_id", async () => {
    const created = await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-11")),
    );
    const result = await listBillingStatements(supabase, {
      shipper_id: shipperId,
    });
    expect(result.some((s) => s.id === created.id)).toBe(true);
  });

  // ============================================================
  // billing_line_items CRUD
  // ============================================================

  it("creates a line item and reads it back", async () => {
    const statement = await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-01")),
    );

    const lineItem = await createBillingLineItem(supabase, {
      statement_id: statement.id,
      line_type: "storage",
      description: "保管料",
      quantity: 100,
      unit_price: 10,
      amount: 1000,
      rate_master_id: null,
    });

    expect(lineItem.id).toBeTruthy();
    expect(lineItem.statement_id).toBe(statement.id);
    expect(lineItem.line_type).toBe("storage");
    expect(Number(lineItem.quantity)).toBe(100);
    expect(Number(lineItem.amount)).toBe(1000);

    const items = await listBillingLineItems(supabase, statement.id);
    expect(items.some((i) => i.id === lineItem.id)).toBe(true);
  });

  it("bulk-creates line items", async () => {
    const statement = await trackStatement(
      createBillingStatement(supabase, baseStatementInput("2026-02")),
    );

    const items = await createBillingLineItems(supabase, [
      {
        statement_id: statement.id,
        line_type: "storage",
        description: "保管料",
        quantity: 200,
        unit_price: 5,
        amount: 1000,
        rate_master_id: null,
      },
      {
        statement_id: statement.id,
        line_type: "handling",
        description: "荷役料",
        quantity: 10,
        unit_price: 50,
        amount: 500,
        rate_master_id: null,
      },
    ]);

    expect(items).toHaveLength(2);
    const fetched = await listBillingLineItems(supabase, statement.id);
    expect(fetched).toHaveLength(2);
  });

  it("line items are cascade-deleted when statement is deleted", async () => {
    const statement = await createBillingStatement(
      supabase,
      baseStatementInput("2026-03"),
    );
    await createBillingLineItem(supabase, {
      statement_id: statement.id,
      line_type: "storage",
      description: "保管料",
      quantity: 10,
      unit_price: 10,
      amount: 100,
      rate_master_id: null,
    });

    await deleteBillingStatement(supabase, statement.id);
    const items = await listBillingLineItems(supabase, statement.id);
    expect(items).toHaveLength(0);
  });
});
