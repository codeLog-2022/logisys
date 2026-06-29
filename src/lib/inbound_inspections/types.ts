// 入荷検品(inbound_inspections) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.7（#9/#12）
// 調整（Hiro承認済み）: inspected_by は users への FK にしない（素の uuid）。

// 検品方式（0004 の CHECK 制約とミラー）: 全数/抜取り
export const INSPECTION_METHODS = ["全数", "抜取り"] as const;

export type InspectionMethod = (typeof INSPECTION_METHODS)[number];

// 差異/例外種別（0004 の CHECK 制約とミラー）。NULL も許容（未設定）。
export const EXCEPTION_TYPES = [
  "none",
  "qty_short",
  "qty_over",
  "damaged",
  "expiry_violation",
  "lot_mismatch",
] as const;

export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

// DB の inbound_inspections 行に対応する型
export type InboundInspection = {
  id: string;
  shipper_id: string;
  inbound_plan_line_id: string | null;
  product_id: string;
  inspection_method: InspectionMethod;
  planned_qty: number | null;
  inspected_qty: number;
  good_qty: number;
  defect_qty: number;
  lot_no: string | null;
  expiry_date: string | null; // date (ISO yyyy-mm-dd)
  manufacture_date: string | null;
  exception_type: ExceptionType | null;
  note: string | null;
  inspected_by: string | null; // FK なしの素の uuid
  inspected_at: string;
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない・inspected_at は DB default now()）
export type InboundInspectionInput = {
  shipper_id: string;
  inbound_plan_line_id: string | null;
  product_id: string;
  inspection_method: InspectionMethod;
  planned_qty: number | null;
  inspected_qty: number;
  good_qty: number;
  defect_qty: number;
  lot_no: string | null;
  expiry_date: string | null;
  manufacture_date: string | null;
  exception_type: ExceptionType | null;
  note: string | null;
  inspected_by: string | null;
};

export type ValidationResult =
  | { ok: true; value: InboundInspectionInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの InboundInspectionInput を返す。
// DB の制約（shipper_id/product_id 必須・inspection_method/exception_type 列挙・数量 >= 0）とミラー。
export function validateInboundInspectionInput(raw: {
  shipper_id?: unknown;
  inbound_plan_line_id?: unknown;
  product_id?: unknown;
  inspection_method?: unknown;
  planned_qty?: unknown;
  inspected_qty?: unknown;
  good_qty?: unknown;
  defect_qty?: unknown;
  lot_no?: unknown;
  expiry_date?: unknown;
  manufacture_date?: unknown;
  exception_type?: unknown;
  note?: unknown;
  inspected_by?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  const inspection_method =
    typeof raw.inspection_method === "string" ? raw.inspection_method : "";
  if (!INSPECTION_METHODS.includes(inspection_method as InspectionMethod)) {
    errors.inspection_method = "検品方式が不正です";
  }

  // 数量系（DB CHECK: inspected_qty/good_qty/defect_qty >= 0）。defect_qty は未指定=0。
  const inspected_qty = parseNonNegativeInteger(raw.inspected_qty);
  if (inspected_qty === "invalid") {
    errors.inspected_qty = "検品数は0以上の整数で入力してください";
  }

  const good_qty = parseNonNegativeInteger(raw.good_qty);
  if (good_qty === "invalid") {
    errors.good_qty = "良品数は0以上の整数で入力してください";
  }

  // defect_qty は未指定なら DB default 0。指定時は 0 以上の整数。
  const defectProvided =
    raw.defect_qty !== undefined &&
    raw.defect_qty !== null &&
    !(typeof raw.defect_qty === "string" && raw.defect_qty.trim() === "");
  const defectParsed = defectProvided
    ? parseNonNegativeInteger(raw.defect_qty)
    : 0;
  if (defectParsed === "invalid") {
    errors.defect_qty = "不良数は0以上の整数で入力してください";
  }

  // planned_qty は任意（NULL 可）。指定時は 0 以上の整数。
  const plannedProvided =
    raw.planned_qty !== undefined &&
    raw.planned_qty !== null &&
    !(typeof raw.planned_qty === "string" && raw.planned_qty.trim() === "");
  const plannedParsed = plannedProvided
    ? parseNonNegativeInteger(raw.planned_qty)
    : null;
  if (plannedParsed === "invalid") {
    errors.planned_qty = "予定数は0以上の整数で入力してください";
  }

  // exception_type は任意（NULL 可）。指定時のみ列挙チェック。
  const rawException =
    typeof raw.exception_type === "string" ? raw.exception_type.trim() : "";
  if (rawException && !EXCEPTION_TYPES.includes(rawException as ExceptionType)) {
    errors.exception_type = "例外種別が不正です";
  }

  // 日付系（任意）。指定時のみ検証。
  const rawExpiry =
    typeof raw.expiry_date === "string" ? raw.expiry_date.trim() : "";
  if (rawExpiry && !isIsoDate(rawExpiry)) {
    errors.expiry_date = "賞味期限はYYYY-MM-DD形式で入力してください";
  }
  const rawMfg =
    typeof raw.manufacture_date === "string" ? raw.manufacture_date.trim() : "";
  if (rawMfg && !isIsoDate(rawMfg)) {
    errors.manufacture_date = "製造日はYYYY-MM-DD形式で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // 任意の参照 / 文字列フィールドを正規化（空文字 → null）。
  const rawLineId =
    typeof raw.inbound_plan_line_id === "string"
      ? raw.inbound_plan_line_id.trim()
      : "";
  const rawInspectedBy =
    typeof raw.inspected_by === "string" ? raw.inspected_by.trim() : "";

  return {
    ok: true,
    value: {
      shipper_id,
      inbound_plan_line_id: rawLineId || null,
      product_id,
      inspection_method: inspection_method as InspectionMethod,
      planned_qty: plannedParsed as number | null,
      inspected_qty: inspected_qty as number,
      good_qty: good_qty as number,
      defect_qty: defectParsed as number,
      lot_no: normalizeOptionalText(raw.lot_no),
      expiry_date: rawExpiry || null,
      manufacture_date: rawMfg || null,
      exception_type: (rawException as ExceptionType) || null,
      note: normalizeOptionalText(raw.note),
      inspected_by: rawInspectedBy || null,
    },
  };
}

// 0 以上の整数 → その値、それ以外 → "invalid"
function parseNonNegativeInteger(v: unknown): number | "invalid" {
  let n: number;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return "invalid";
    n = Number(s);
  } else if (typeof v === "number") {
    n = v;
  } else {
    return "invalid";
  }
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

// 空文字/未指定 → null、それ以外は trim 済み文字列
function normalizeOptionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

// YYYY-MM-DD 形式かつ実在日付かを検証
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
