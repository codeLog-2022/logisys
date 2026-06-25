import { describe, expect, it } from "vitest";
import { validateLocationInput } from "../src/lib/locations/types";

// ロケーション入力バリデーション（純ロジック）の検証。
// DB 制約（code 必須・temp_zone/usage 列挙値・owner_shipper_id nullable）を
// ミラーし、UI で先に弾けることを確認する。

describe("validateLocationInput", () => {
  const valid = {
    code: "A-01-01",
    temp_zone: "冷蔵",
    usage: "dedicated",
    owner_shipper_id: "11111111-1111-1111-1111-111111111111",
  };

  it("accepts valid input and normalizes/trims", () => {
    const r = validateLocationInput({ ...valid, code: "  A-01-01  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.code).toBe("A-01-01"); // trim 済み
      expect(r.value.temp_zone).toBe("冷蔵");
      expect(r.value.usage).toBe("dedicated");
      expect(r.value.owner_shipper_id).toBe(valid.owner_shipper_id);
    }
  });

  it("treats empty owner_shipper_id as null (共用ロケーション)", () => {
    const r = validateLocationInput({ ...valid, owner_shipper_id: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.owner_shipper_id).toBeNull(); // 空 -> null
    }
  });

  it("treats a missing owner_shipper_id as null", () => {
    const { owner_shipper_id: _omit, ...withoutOwner } = valid;
    const r = validateLocationInput(withoutOwner);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.owner_shipper_id).toBeNull();
    }
  });

  it("rejects an empty code", () => {
    const r = validateLocationInput({ ...valid, code: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.code).toBeTruthy();
    }
  });

  it("rejects an invalid temp_zone enum value", () => {
    const r = validateLocationInput({ ...valid, temp_zone: "冷凍庫" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.temp_zone).toBeTruthy();
    }
  });

  it("rejects an invalid usage enum value", () => {
    const r = validateLocationInput({ ...valid, usage: "共用" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.usage).toBeTruthy();
    }
  });

  it("accepts both usage enum boundaries (shared / dedicated)", () => {
    const shared = validateLocationInput({ ...valid, usage: "shared" });
    expect(shared.ok).toBe(true);
    if (shared.ok) expect(shared.value.usage).toBe("shared");

    const dedicated = validateLocationInput({ ...valid, usage: "dedicated" });
    expect(dedicated.ok).toBe(true);
    if (dedicated.ok) expect(dedicated.value.usage).toBe("dedicated");
  });
});
