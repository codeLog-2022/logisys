import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createLocation,
  deleteLocation,
  DuplicateCodeError,
  getLocation,
  listLocations,
  updateLocation,
} from "../src/lib/locations/repository";
import { createShipper, deleteShipper } from "../src/lib/shippers/repository";
import type { LocationInput } from "../src/lib/locations/types";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// ロケーション CRUD を REST(PostgREST/supabase-js) 経由で実 DB に対して検証する。
// → 0002_grants.sql の GRANT が効いていなければ permission denied で失敗する（GRANT の検証も兼ねる）。
//
// locations は code 単独で unique。owner_shipper_id は nullable（on delete set null）＝任意。
// owner を使うケース用に親荷主を beforeAll で 1 件作成し、その id を使う。荷主は afterAll で削除する
// （locations.owner_shipper_id は on delete set null のため、子削除を待たずとも消せるが、
//  後始末順序を明示するためロケーション削除後に消す）。
//
// 接続情報（API_URL / ANON_KEY）は vitest.config.ts が `supabase status` から実行時に注入する。
// 作成したロケーションは afterEach で明示削除し、DB に痕跡を残さない（最後に残骸ゼロを検証）。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

// テストデータは固有プレフィックスで識別し、後始末漏れを検出できるようにする
const TEST_PREFIX = "VITEST-LOC-";
const SHIPPER_PREFIX = "VITEST-LOC-SHIP-";

let supabase: SupabaseClient;
let shipperId: string;
// 作成したロケーション id を記録 → afterEach でまとめて削除
const createdIds = new Set<string>();

// owner なし（共用）の基準入力
function baseInput(suffix: string): LocationInput {
  return {
    code: `${TEST_PREFIX}${suffix}`,
    temp_zone: "常温",
    usage: "shared",
    owner_shipper_id: null,
    zone: null,
    aisle: null,
    bay: null,
    level: null,
    assignment_type: "free",
    storable_unit_types: [],
    hazard_allowed: false,
  };
}

async function track<T extends { id: string }>(p: Promise<T>): Promise<T> {
  const row = await p;
  createdIds.add(row.id);
  return row;
}

describe("locations repository (REST CRUD against real local DB)", () => {
  beforeAll(async () => {
    if (!apiUrl || !anonKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY が未取得です。`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    supabase = createClient(apiUrl, anonKey);

    // 専用ロケーション用の親荷主を 1 件用意（owner_shipper_id の参照先）
    const shipper = await createShipper(supabase, {
      code: `${SHIPPER_PREFIX}OWNER`,
      name: "テスト荷主（ロケーションテスト用）",
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
    });
    shipperId = shipper.id;
  });

  afterEach(async () => {
    for (const id of createdIds) {
      await deleteLocation(supabase, id);
    }
    createdIds.clear();
  });

  afterAll(async () => {
    // 残骸ゼロを検証（プレフィックス一致のロケーションが DB に残っていないこと）
    const { data, error } = await supabase
      .from("locations")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // 親荷主を後始末
    if (shipperId) await deleteShipper(supabase, shipperId);
  });

  it("creates a shared location (owner null) and reads it back", async () => {
    const input = baseInput("CREATE");
    const created = await track(createLocation(supabase, input));

    expect(created.id).toBeTruthy();
    expect(created.code).toBe(input.code);
    expect(created.temp_zone).toBe("常温");
    expect(created.usage).toBe("shared");
    expect(created.owner_shipper_id).toBeNull();

    const fetched = await getLocation(supabase, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.code).toBe(input.code);

    const all = await listLocations(supabase);
    expect(all.some((l) => l.id === created.id)).toBe(true);
  });

  it("creates a dedicated location with an owner_shipper_id", async () => {
    const created = await track(
      createLocation(supabase, {
        ...baseInput("OWNED"),
        temp_zone: "冷蔵",
        usage: "dedicated",
        owner_shipper_id: shipperId,
      }),
    );

    expect(created.usage).toBe("dedicated");
    expect(created.temp_zone).toBe("冷蔵");
    expect(created.owner_shipper_id).toBe(shipperId);
  });

  it("rejects a duplicate code with DuplicateCodeError", async () => {
    const input = baseInput("DUP");
    await track(createLocation(supabase, input));

    await expect(createLocation(supabase, input)).rejects.toBeInstanceOf(
      DuplicateCodeError,
    );
  });

  it("updates fields including owner_shipper_id", async () => {
    const created = await track(createLocation(supabase, baseInput("UPD")));
    expect(created.owner_shipper_id).toBeNull();

    const updated = await updateLocation(supabase, created.id, {
      ...baseInput("UPD"),
      temp_zone: "冷凍",
      usage: "dedicated",
      owner_shipper_id: shipperId,
    });

    expect(updated.temp_zone).toBe("冷凍");
    expect(updated.usage).toBe("dedicated");
    expect(updated.owner_shipper_id).toBe(shipperId);

    // 専用 → 共用（owner を null に戻す）も検証
    const cleared = await updateLocation(supabase, created.id, baseInput("UPD"));
    expect(cleared.owner_shipper_id).toBeNull();
    expect(cleared.usage).toBe("shared");
  });

  it("deletes a location so it can no longer be read", async () => {
    const created = await createLocation(supabase, baseInput("DEL"));
    await deleteLocation(supabase, created.id);

    const fetched = await getLocation(supabase, created.id);
    expect(fetched).toBeNull();
  });
});
