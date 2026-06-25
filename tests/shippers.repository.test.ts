import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createShipper,
  deleteShipper,
  DuplicateCodeError,
  getShipper,
  listShippers,
  updateShipper,
} from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 荷主 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0002_grants.sql の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。
// テストで作成した荷主は afterEach で明示削除し、DB に痕跡を残さない（最後に残骸ゼロを検証）。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

// テストデータは固有プレフィックスで識別し、後始末漏れを検出できるようにする
const TEST_PREFIX = "VITEST-SHIP-";

let supabase: SupabaseClient;
// 作成した荷主 id を記録 → afterEach でまとめて削除
const createdIds = new Set<string>();

function baseInput(suffix: string): ShipperInput {
  return {
    code: `${TEST_PREFIX}${suffix}`,
    name: `テスト荷主 ${suffix}`,
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

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("shippers repository (REST CRUD against real local DB)", () => {
  beforeAll(() => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteShipper(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    // 残骸ゼロを検証（プレフィックス一致の荷主が DB に残っていないこと）
    const { data, error } = await supabase
      .from("shippers")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("creates a shipper and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createShipper(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.code).toBe(input.code);
    expect(created.name).toBe(input.name);
    expect(created.inspection_method).toBe("全数");
    expect(created.picking_rule).toBe("FIFO");

    const fetched = await getShipper(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.code).toBe(input.code);

    const all = await listShippers(supabase);
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it("rejects a duplicate code with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createShipper(supabase, input));

    await expect(createShipper(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("updates a field and advances updated_at", async () => {
    const created = await track(createShipper(supabase, baseInput("UPD")));
    const originalUpdatedAt = created.updated_at;

    // updated_at はトリガで now() に更新される。now() の分解能差で同値になり得るため待機。
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateShipper(supabase, created.id, {
      ...baseInput("UPD"),
      name: "更新後の荷主名",
      picking_rule: "FEFO",
    });

    expect(updated.name).toBe("更新後の荷主名");
    expect(updated.picking_rule).toBe("FEFO");
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime(),
    );
  });

  it("deletes a shipper so it can no longer be read", async () => {
    const created = await createShipper(supabase, baseInput("DEL"));
    await deleteShipper(supabase, created.id);

    const fetched = await getShipper(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
