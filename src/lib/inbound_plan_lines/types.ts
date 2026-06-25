// 入荷予定明細(inbound_plan_lines) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.6（#8）

// DB の inbound_plan_lines 行に対応する型
export type InboundPlanLine = {
  id: string;
  inbound_plan_id: string;
  product_id: string;
  planned_qty: number;
  lot_no: string | null;
  expiry_date: string | null; // date (ISO yyyy-mm-dd)
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type InboundPlanLineInput = {
  inbound_plan_id: string;
  product_id: string;
  planned_qty: number;
  lot_no: string | null;
  expiry_date: string | null;
};

export type ValidationResult =
  | { ok: true; value: InboundPlanLineInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの InboundPlanLineInput を返す。
// DB の制約（inbound_plan_id/product_id 必須・planned_qty > 0・lot_no/expiry_date 任意）とミラー。
export function validateInboundPlanLineInput(raw: {
  inbound_plan_id?: unknown;
  product_id?: unknown;
  planned_qty?: unknown;
  lot_no?: unknown;
  expiry_date?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const inbound_plan_id =
    typeof raw.inbound_plan_id === "string" ? raw.inbound_plan_id.trim() : "";
  if (!inbound_plan_id) errors.inbound_plan_id = "入荷予定は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  // planned_qty は 1 以上の整数（DB CHECK: planned_qty > 0）
  const planned_qty = parsePositiveInteger(raw.planned_qty);
  if (planned_qty === "invalid") {
    errors.planned_qty = "予定数は1以上の整数で入力してください";
  }

  // expiry_date は任意（NULL 可）。指定時のみ日付検証。
  const rawExpiry =
    typeof raw.expiry_date === "string" ? raw.expiry_date.trim() : "";
  if (rawExpiry && !isIsoDate(rawExpiry)) {
    errors.expiry_date = "賞味期限はYYYY-MM-DD形式で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // lot_no は任意。空文字は null に正規化。
  const rawLot = typeof raw.lot_no === "string" ? raw.lot_no.trim() : "";
  const lot_no = rawLot || null;

  return {
    ok: true,
    value: {
      inbound_plan_id,
      product_id,
      planned_qty: planned_qty as number,
      lot_no,
      expiry_date: rawExpiry || null,
    },
  };
}

// 1 以上の整数 → その値、それ以外 → "invalid"
function parsePositiveInteger(v: unknown): number | "invalid" {
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
  if (!Number.isInteger(n) || n <= 0) return "invalid";
  return n;
}

// YYYY-MM-DD 形式かつ実在日付かを検証
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
