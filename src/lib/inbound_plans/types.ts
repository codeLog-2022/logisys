// 入荷予定ASN(inbound_plans) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.6（#8）

// 入荷予定ステータス（0004 の CHECK 制約とミラー）
export const INBOUND_PLAN_STATUSES = [
  "planned",
  "arrived",
  "inspecting",
  "completed",
  "cancelled",
] as const;

export type InboundPlanStatus = (typeof INBOUND_PLAN_STATUSES)[number];

// 取込元（0004 の CHECK 制約とミラー）
export const INBOUND_PLAN_SOURCES = ["manual", "csv", "edi"] as const;

export type InboundPlanSource = (typeof INBOUND_PLAN_SOURCES)[number];

// DB の inbound_plans 行に対応する型
export type InboundPlan = {
  id: string;
  shipper_id: string;
  plan_no: string;
  supplier_id: string | null;
  scheduled_date: string | null; // date (ISO yyyy-mm-dd)
  status: InboundPlanStatus;
  source: InboundPlanSource;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type InboundPlanInput = {
  shipper_id: string;
  plan_no: string;
  supplier_id: string | null;
  scheduled_date: string | null;
  status: InboundPlanStatus;
  source: InboundPlanSource;
};

export type ValidationResult =
  | { ok: true; value: InboundPlanInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの InboundPlanInput を返す。
// DB の制約（shipper_id/plan_no 必須・status/source 列挙値・supplier_id/scheduled_date 任意）とミラー。
export function validateInboundPlanInput(raw: {
  shipper_id?: unknown;
  plan_no?: unknown;
  supplier_id?: unknown;
  scheduled_date?: unknown;
  status?: unknown;
  source?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const plan_no = typeof raw.plan_no === "string" ? raw.plan_no.trim() : "";
  if (!plan_no) errors.plan_no = "ASN番号は必須です";

  // status は未指定なら DB default 'planned' を採用。指定時は列挙チェック。
  const rawStatus = typeof raw.status === "string" ? raw.status.trim() : "";
  const status = rawStatus || "planned";
  if (!INBOUND_PLAN_STATUSES.includes(status as InboundPlanStatus)) {
    errors.status = "ステータスが不正です";
  }

  // source は未指定なら DB default 'manual' を採用。指定時は列挙チェック。
  const rawSource = typeof raw.source === "string" ? raw.source.trim() : "";
  const source = rawSource || "manual";
  if (!INBOUND_PLAN_SOURCES.includes(source as InboundPlanSource)) {
    errors.source = "取込元が不正です";
  }

  // scheduled_date は任意（NULL 可）。指定時のみ日付検証。
  const rawDate =
    typeof raw.scheduled_date === "string" ? raw.scheduled_date.trim() : "";
  if (rawDate && !isIsoDate(rawDate)) {
    errors.scheduled_date = "入荷予定日はYYYY-MM-DD形式で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // supplier_id は任意（on delete set null）。空文字は null に正規化。
  const rawSupplier =
    typeof raw.supplier_id === "string" ? raw.supplier_id.trim() : "";
  const supplier_id = rawSupplier || null;

  return {
    ok: true,
    value: {
      shipper_id,
      plan_no,
      supplier_id,
      scheduled_date: rawDate || null,
      status: status as InboundPlanStatus,
      source: source as InboundPlanSource,
    },
  };
}

// YYYY-MM-DD 形式かつ実在日付かを検証
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
