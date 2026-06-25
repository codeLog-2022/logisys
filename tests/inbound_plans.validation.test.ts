import { describe, expect, it } from "vitest";
import { validateInboundPlanInput } from "../src/lib/inbound_plans/types";

// 入荷予定ASN入力バリデーション（純ロジック）の検証。
// DB 制約（shipper_id/plan_no 必須・status/source 列挙・supplier_id/scheduled_date nullable）をミラー。

describe("validateInboundPlanInput", () => {
  const valid = {
    shipper_id: "11111111-1111-1111-1111-111111111111",
    plan_no: "ASN-001",
    supplier_id: "22222222-2222-2222-2222-222222222222",
    scheduled_date: "2026-07-01",
    status: "planned",
    source: "csv",
  };

  it("accepts valid input and trims/normalizes", () => {
    const r = validateInboundPlanInput({ ...valid, plan_no: "  ASN-001  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.plan_no).toBe("ASN-001");
      expect(r.value.supplier_id).toBe(valid.supplier_id);
      expect(r.value.scheduled_date).toBe("2026-07-01");
      expect(r.value.status).toBe("planned");
      expect(r.value.source).toBe("csv");
    }
  });

  it("defaults status to 'planned' and source to 'manual' when omitted", () => {
    const r = validateInboundPlanInput({
      shipper_id: valid.shipper_id,
      plan_no: valid.plan_no,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("planned");
      expect(r.value.source).toBe("manual");
      expect(r.value.supplier_id).toBeNull();
      expect(r.value.scheduled_date).toBeNull();
    }
  });

  it("rejects empty shipper_id and plan_no", () => {
    const r = validateInboundPlanInput({ ...valid, shipper_id: "", plan_no: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.shipper_id).toBeTruthy();
      expect(r.errors.plan_no).toBeTruthy();
    }
  });

  it("rejects invalid status and source enum values", () => {
    const r = validateInboundPlanInput({
      ...valid,
      status: "done",
      source: "api",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.status).toBeTruthy();
      expect(r.errors.source).toBeTruthy();
    }
  });

  it("rejects a malformed scheduled_date", () => {
    const r = validateInboundPlanInput({ ...valid, scheduled_date: "2026/07/01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.scheduled_date).toBeTruthy();
  });

  it("accepts all status and source boundaries", () => {
    for (const status of [
      "planned",
      "arrived",
      "inspecting",
      "completed",
      "cancelled",
    ] as const) {
      const r = validateInboundPlanInput({ ...valid, status });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe(status);
    }
    for (const source of ["manual", "csv", "edi"] as const) {
      const r = validateInboundPlanInput({ ...valid, source });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.source).toBe(source);
    }
  });
});
