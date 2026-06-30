// 入出庫トランザクション(inventory_transactions) のドメイン型・バリデーション（Next 非依存の純ロジック）

export const TXN_TYPES = ["IN", "OUT"] as const;
export const TXN_STATUSES = ["検品待", "良品", "保留", "不良"] as const;

export type TxnType = (typeof TXN_TYPES)[number];
export type TxnStatus = (typeof TXN_STATUSES)[number];

// DB の inventory_transactions 行に対応する型
export type InventoryTransaction = {
  id: string;
  shipper_id: string;
  product_id: string;
  location_id: string;
  txn_type: TxnType;
  quantity: number;
  status: TxnStatus;
  lot_no: string | null;
  expiry_date: string | null; // ISO date string (YYYY-MM-DD)
  note: string | null;
  created_at: string;
  created_by: string | null;
};

// 登録でユーザーが入力する値（id/タイムスタンプは含まない）
export type CreateTransactionInput = {
  shipper_id: string;
  product_id: string;
  location_id: string;
  txn_type: TxnType;
  quantity: number;
  status: TxnStatus;
  lot_no: string | null;
  expiry_date: string | null;
  note: string | null;
  created_by: string | null;
};

export type TransactionValidationResult =
  | { ok: true; value: CreateTransactionInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの CreateTransactionInput を返す。
// DB の制約（必須外部キー・txn_type 列挙値・quantity > 0・status 列挙値）とミラーし、UI で先に弾く。
export function validateTransactionInput(raw: {
  shipper_id?: unknown;
  product_id?: unknown;
  location_id?: unknown;
  txn_type?: unknown;
  quantity?: unknown;
  status?: unknown;
  lot_no?: unknown;
  expiry_date?: unknown;
  note?: unknown;
  created_by?: unknown;
}): TransactionValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  const location_id =
    typeof raw.location_id === "string" ? raw.location_id.trim() : "";
  if (!location_id) errors.location_id = "ロケーションは必須です";

  const txn_type = typeof raw.txn_type === "string" ? raw.txn_type.trim() : "";
  if (!TXN_TYPES.includes(txn_type as TxnType)) {
    errors.txn_type = "区分は IN または OUT を指定してください";
  }

  const quantity = parsePositiveInt(raw.quantity);
  if (quantity === null || quantity === "invalid") {
    errors.quantity = "数量は1以上の整数で入力してください";
  }

  const rawStatus =
    typeof raw.status === "string" ? raw.status.trim() : "";
  // 未指定時は DB default '良品' にフォールバック
  const status: TxnStatus =
    rawStatus === "" ? "良品" : (rawStatus as TxnStatus);
  if (!TXN_STATUSES.includes(status)) {
    errors.status = "ステータスが不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // 任意フィールド: 空文字は null に正規化
  const rawLotNo = typeof raw.lot_no === "string" ? raw.lot_no.trim() : "";
  const lot_no = rawLotNo || null;

  const rawExpiry =
    typeof raw.expiry_date === "string" ? raw.expiry_date.trim() : "";
  const expiry_date = rawExpiry || null;

  const rawNote = typeof raw.note === "string" ? raw.note.trim() : "";
  const note = rawNote || null;

  const rawCreatedBy =
    typeof raw.created_by === "string" ? raw.created_by.trim() : "";
  const created_by = rawCreatedBy || null;

  return {
    ok: true,
    value: {
      shipper_id,
      product_id,
      location_id,
      txn_type: txn_type as TxnType,
      quantity: quantity as number,
      status,
      lot_no,
      expiry_date,
      note,
      created_by,
    },
  };
}

// 未入力 → null、正の整数 → その値、それ以外 → "invalid"
function parsePositiveInt(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return "invalid";
    return n;
  }
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v <= 0) return "invalid";
    return v;
  }
  return "invalid";
}
