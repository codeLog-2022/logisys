import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAuditLog,
  listAuditLogsForEntity,
} from "../src/lib/audit_logs/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 監査ログの記録/取得を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0006 末尾の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//   監査はアプリ層で明示記録する方式（案B）。before/after の差分 jsonb を保持する。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const SHIPPER_PREFIX = "VITEST-AUDIT-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（監査テスト用 ${suffix}）`,
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

describe("audit_logs repository (REST against real local DB)", () => {
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
      await supabase.from("audit_logs").delete().eq("id", id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("records an audit log with before/after diff and reads it back by entity", async () => {
    const entityId = crypto.randomUUID();
    const log = await createAuditLog(supabase, {
      action: "update",
      entity_type: "products",
      entity_id: entityId,
      actor_user_id: null, // 未認証時は NULL
      shipper_id: shipperId,
      before: { name: "旧名" },
      after: { name: "新名" },
    });
    createdIds.add(log.id);

    expect(log.id).toBeTruthy();
    expect(log.action).toBe("update");
    expect(log.actor_user_id).toBeNull();
    expect(log.before).toEqual({ name: "旧名" });
    expect(log.after).toEqual({ name: "新名" });

    const logs = await listAuditLogsForEntity(supabase, "products", entityId);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(log.id);
    expect(logs[0].after).toEqual({ name: "新名" });
  });

  it("records a create action without before payload", async () => {
    const entityId = crypto.randomUUID();
    const log = await createAuditLog(supabase, {
      action: "create",
      entity_type: "shippers",
      entity_id: entityId,
      actor_user_id: null,
      shipper_id: shipperId,
      before: null,
      after: { code: "X" },
    });
    createdIds.add(log.id);
    expect(log.before).toBeNull();
    expect(log.after).toEqual({ code: "X" });
  });
});
