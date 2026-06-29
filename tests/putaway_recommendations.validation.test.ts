import { describe, expect, it } from "vitest";
import { validatePutawayRecommendationInput } from "../src/lib/putaway_recommendations/types";

// 格納推奨入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/product_id 必須・deviated boolean・各参照 nullable）をミラー。

describe("validatePutawayRecommendationInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    product_id: "22222222-2222-2222-2222-222222222222",
    lot_id: "33333333-3333-3333-3333-333333333333",
    recommended_location_id: "44444444-4444-4444-4444-444444444444",
    actual_location_id: "55555555-5555-5555-5555-555555555555",
    reason: "温度帯一致",
    deviated: true,
    deviation_reason: "推奨ロケ満床",
    inbound_inspection_id: "66666666-6666-6666-6666-666666666666",
  };

  it("accepts valid input and normalizes", () => {
    const r = validatePutawayRecommendationInput({ ...valid, reason: "  温度帯一致  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lot_id).toBe(valid.lot_id);
      expect(r.value.recommended_location_id).toBe(valid.recommended_location_id);
      expect(r.value.deviated).toBe(true);
      expect(r.value.reason).toBe("温度帯一致");
      expect(r.value.deviation_reason).toBe("推奨ロケ満床");
    }
  });

  it("defaults deviated to false and treats optional refs as null when omitted", () => {
    const r = validatePutawayRecommendationInput({
      shipper_id: valid.shipper_id,
      product_id: valid.product_id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.deviated).toBe(false);
      expect(r.value.lot_id).toBeNull();
      expect(r.value.recommended_location_id).toBeNull();
      expect(r.value.actual_location_id).toBeNull();
      expect(r.value.reason).toBeNull();
      expect(r.value.deviation_reason).toBeNull();
      expect(r.value.inbound_inspection_id).toBeNull();
    }
  });

  it("rejects empty shipper_id and product_id", () => {
    const r = validatePutawayRecommendationInput({
      ...valid,
      shipper_id: "",
      product_id: "  ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.product_id).toBeTruthy();
    }
  });

  it("parses 'true'/'false' string deviated and rejects an invalid value", () => {
    const rTrue = validatePutawayRecommendationInput({ ...valid, deviated: "true" });
    expect(rTrue.ok).toBe(true);
    if (rTrue.ok) expect(rTrue.value.deviated).toBe(true);

    const rFalse = validatePutawayRecommendationInput({ ...valid, deviated: "false" });
    expect(rFalse.ok).toBe(true);
    if (rFalse.ok) expect(rFalse.value.deviated).toBe(false);

    const rBad = validatePutawayRecommendationInput({ ...valid, deviated: "maybe" });
    expect(rBad.ok).toBe(false);
    if (!rBad.ok) expect(rBad.errors.deviated).toBeTruthy();
  });
});
