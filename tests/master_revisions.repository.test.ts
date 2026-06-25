import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createMasterRevision,
  deleteMasterRevision,
  getMasterRevision,
  listRevisionsForEntity,
} from "../src/lib/master_revisions/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { MasterRevisionInput } from "../src/lib/master_revisions/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// マスタ改定履歴 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// changed_by は FK なしの素の uuid（0006 の users 前方参照を避ける調整）であることを確認する。
// entity_id も多態（FKなし）＝実在しない uuid でも登録できる。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const SHIPPER_PREFIX = "VITEST-REV-SHIP-";
// entity_id をテスト識別子として使い、afterAll で残骸ゼロを検証する。
const ENTITY_ID = "9f000000-0000-4000-8000-0000000000aa";
// FK なしを示すため実在しない uuid を changed_by に使う。
const CHANGED_BY = "9f000000-0000-4000-8000-0000000000bb";

let supabase: SupabaseClient;
let shipperId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（改定履歴テスト用 ${suffix}）`,
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

function baseInput(overrides: Partial<MasterRevisionInput> = {}): MasterRevisionInput {
  return {
    shipper_id: shipperId,
    entity_type: "product",
    entity_id: ENTITY_ID,
    effective_from: "2026-04-01",
    effective_to: null,
    snapshot: { code: "P-001", name: "改定前" },
    changed_by: CHANGED_BY,
    ...overrides,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("master_revisions repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);
    const shipper = await createShipper(supabase, shipperInput("OWNER"));
    shipperId = shipper.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteMasterRevision(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("master_revisions")
      .select("id")
      .eq("entity_id", ENTITY_ID);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("records a revision with a JSON snapshot and a non-FK changed_by uuid", async () => {
    const created = await track(createMasterRevision(supabase, baseInput()));

    expect(created.id).toBeTruthy();
    expect(created.entity_type).toBe("product");
    expect(created.entity_id).toBe(ENTITY_ID);
    // changed_by は FK なし＝実在しない uuid でも保存できる
    expect(created.changed_by).toBe(CHANGED_BY);
    expect(created.snapshot).toEqual({ code: "P-001", name: "改定前" });

    const fetched = await getMasterRevision(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.snapshot).toEqual({ code: "P-001", name: "改定前" });
  });

  it("allows a null shipper_id (横断マスタ) and a null changed_by", async () => {
    const created = await track(
      createMasterRevision(supabase, {
        ...baseInput(),
        shipper_id: null,
        changed_by: null,
        entity_type: "location",
        snapshot: { code: "LOC-1" },
      }),
    );
    expect(created.shipper_id).toBeNull();
    expect(created.changed_by).toBeNull();
    expect(created.entity_type).toBe("location");
  });

  it("lists revisions for an entity ordered by effective_from", async () => {
    await track(
      createMasterRevision(supabase, {
        ...baseInput(),
        effective_from: "2027-04-01",
      }),
    );
    await track(
      createMasterRevision(supabase, {
        ...baseInput(),
        effective_from: "2026-04-01",
      }),
    );

    const rows = await listRevisionsForEntity(supabase, "product", ENTITY_ID);
    expect(rows).toHaveLength(2);
    expect(rows[0].effective_from).toBe("2026-04-01");
    expect(rows[1].effective_from).toBe("2027-04-01");
  });

  it("deletes a revision so it can no longer be read", async () => {
    const created = await createMasterRevision(supabase, baseInput());
    await deleteMasterRevision(supabase, created.id);
    const fetched = await getMasterRevision(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
