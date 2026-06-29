// ロット(lots) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.8（#10/#15/#19）。在庫導出キー（inventory_transactions.lot_id → lots）。

// DB の lots 行に対応する型
export type Lot = {
  id: string;
  shipper_id: string;
  product_id: string;
  lot_no: string;
  expiry_date: string | null; // date (ISO yyyy-mm-dd)
  manufacture_date: string | null;
  serial_no: string | null;
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type LotInput = {
  shipper_id: string;
  product_id: string;
  lot_no: string;
  expiry_date: string | null;
  manufacture_date: string | null;
  serial_no: string | null;
};

export type ValidationResult =
  | { ok: true; value: LotInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの LotInput を返す。
// DB の制約（shipper_id/product_id/lot_no 必須・日付は任意・unique(shipper_id,product_id,lot_no)）とミラー。
export function validateLotInput(raw: {
  shipper_id?: unknown;
  product_id?: unknown;
  lot_no?: unknown;
  expiry_date?: unknown;
  manufacture_date?: unknown;
  serial_no?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  const lot_no = typeof raw.lot_no === "string" ? raw.lot_no.trim() : "";
  if (!lot_no) errors.lot_no = "ロット番号は必須です";

  // 日付系（任意・NULL 可）。指定時のみ検証。
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

  return {
    ok: true,
    value: {
      shipper_id,
      product_id,
      lot_no,
      expiry_date: rawExpiry || null,
      manufacture_date: rawMfg || null,
      serial_no: normalizeOptionalText(raw.serial_no),
    },
  };
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
