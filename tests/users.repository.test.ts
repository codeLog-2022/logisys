import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createUser,
  deleteUser,
  DuplicateEmailError,
  getUser,
  listUsers,
  updateUser,
} from "../src/lib/users/repository";
import { listRoles } from "../src/lib/users/roles.repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { ShipperInput } from "../src/lib/shippers/types";
import type { UserInput } from "../src/lib/users/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// 利用者 CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0006 末尾の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//   RLS 有効化後も anon 全許可ポリシーで anon CRUD が通ることの確認も兼ねる。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

const TEST_PREFIX = "vitest-users-";
const SHIPPER_PREFIX = "VITEST-USER-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
let roleId: string;
const createdIds = new Set<string>();

function shipperInput(suffix: string): ShipperInput {
  return {
    code: `${SHIPPER_PREFIX}${suffix}`,
    name: `テスト荷主（利用者テスト用 ${suffix}）`,
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

function baseInput(suffix: string): UserInput {
  return {
    email: `${TEST_PREFIX}${suffix}@example.com`,
    name: `テスト利用者 ${suffix}`,
    role_id: roleId,
    shipper_id: shipperId,
    auth_user_id: null,
    is_active: true,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("users repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);
    const shipper = await createShipper(supabase, shipperInput("OWNER"));
    shipperId = shipper.id;
    // 0006 がシードする 'admin' ロールを使う。
    const roles = await listRoles(supabase);
    const admin = roles.find((r) => r.code === "admin");
    expect(admin, "0006 should seed an 'admin' role").toBeTruthy();
    roleId = admin!.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteUser(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .like("email", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a user and reads it back", async () => {
    const input = baseInput("create");
    const created = await track(createUser(supabase, input));
    expect(created.id).toBeTruthy();
    expect(created.email).toBe(input.email);
    expect(created.shipper_id).toBe(shipperId);
    expect(created.is_active).toBe(true);

    const fetched = await getUser(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.email).toBe(input.email);

    const all = await listUsers(supabase);
    expect(all.some((u) => u.id === created.id)).toBe(true);
  });

  it("rejects a duplicate email with DuplicateEmailError", async () => {
    const input = baseInput("dup");
    await track(createUser(supabase, input));
    await expect(createUser(supabase, input)).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("supports a cross-org user with null shipper_id", async () => {
    const created = await track(
      createUser(supabase, { ...baseInput("ops"), shipper_id: null }),
    );
    expect(created.shipper_id).toBeNull();
  });

  it("updates fields and advances updated_at", async () => {
    const created = await track(createUser(supabase, baseInput("upd")));
    const original = created.updated_at;
    await new Promise((r) => setTimeout(r, 1100));
    const updated = await updateUser(supabase, created.id, {
      ...baseInput("upd"),
      name: "更新後の利用者名",
      is_active: false,
    });
    expect(updated.name).toBe("更新後の利用者名");
    expect(updated.is_active).toBe(false);
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(original).getTime(),
    );
  });

  it("deletes a user so it can no longer be read", async () => {
    const created = await createUser(supabase, baseInput("del"));
    await deleteUser(supabase, created.id);
    const fetched = await getUser(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
