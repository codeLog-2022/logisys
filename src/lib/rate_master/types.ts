// 料金マスタ(rate_master) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.4（#6）

// 料金種別（0003 の CHECK 制約とミラー）: 保管料/荷役料/諸掛
export const RATE_TYPES = ["storage", "handling", "incidental"] as const;

export type RateType = (typeof RATE_TYPES)[number];

// DB の rate_master 行に対応する型
export type RateMaster = {
  id: string;
  shipper_id: string;
  rate_type: RateType;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  currency: string;
  effective_from: string; // date (ISO yyyy-mm-dd)
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type RateMasterInput = {
  shipper_id: string;
  rate_type: RateType;
  code: string;
  name: string;
  unit: string;
  unit_price: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
};

export type ValidationResult =
  | { ok: true; value: RateMasterInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの RateMasterInput を返す。
// DB の制約（shipper_id/code/name/unit/effective_from 必須・rate_type 列挙値・unit_price >= 0）とミラー。
export function validateRateMasterInput(raw: {
  shipper_id?: unknown;
  rate_type?: unknown;
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  currency?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const rate_type = typeof raw.rate_type === "string" ? raw.rate_type : "";
  if (!RATE_TYPES.includes(rate_type as RateType)) {
    errors.rate_type = "料金種別が不正です";
  }

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) errors.code = "コードは必須です";

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.name = "名称は必須です";

  const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  if (!unit) errors.unit = "単位は必須です";

  // unit_price は 0 以上の数値（DB CHECK: unit_price >= 0）
  const unit_price = parseNonNegativeNumber(raw.unit_price);
  if (unit_price === "invalid") {
    errors.unit_price = "単価は0以上の数値で入力してください";
  }

  // effective_from は必須（DB NOT NULL）。yyyy-mm-dd 形式を要求。
  const effective_from =
    typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
  if (!isIsoDate(effective_from)) {
    errors.effective_from = "有効開始日はYYYY-MM-DD形式で入力してください";
  }

  // effective_to は任意（NULL=現行）。指定時のみ日付検証。
  const rawTo =
    typeof raw.effective_to === "string" ? raw.effective_to.trim() : "";
  if (rawTo && !isIsoDate(rawTo)) {
    errors.effective_to = "有効終了日はYYYY-MM-DD形式で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // currency は NOT NULL default 'JPY'。空入力は default にフォールバック。
  const rawCurrency =
    typeof raw.currency === "string" ? raw.currency.trim() : "";
  const currency = rawCurrency || "JPY";

  return {
    ok: true,
    value: {
      shipper_id,
      rate_type: rate_type as RateType,
      code,
      name,
      unit,
      unit_price: unit_price as number,
      currency,
      effective_from,
      effective_to: rawTo || null,
    },
  };
}

// 0 以上の数値 → その値、それ以外 → "invalid"
function parseNonNegativeNumber(v: unknown): number | "invalid" {
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
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

// YYYY-MM-DD 形式かつ実在日付かを検証
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // 桁あふれ（例: 2026-02-31）を弾く
  return d.toISOString().slice(0, 10) === s;
}
