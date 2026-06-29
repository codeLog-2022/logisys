// 格納推奨(putaway_recommendations) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.9（#11）
// 調整（Hiro承認済み）: lot_id は lots への FK にしない（素の uuid）。

// DB の putaway_recommendations 行に対応する型
export type PutawayRecommendation = {
  id: string;
  shipper_id: string;
  product_id: string;
  lot_id: string | null; // FK なしの素の uuid（lots は 0005）
  recommended_location_id: string | null;
  actual_location_id: string | null;
  reason: string | null;
  deviated: boolean;
  deviation_reason: string | null;
  inbound_inspection_id: string | null;
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type PutawayRecommendationInput = {
  shipper_id: string;
  product_id: string;
  lot_id: string | null;
  recommended_location_id: string | null;
  actual_location_id: string | null;
  reason: string | null;
  deviated: boolean;
  deviation_reason: string | null;
  inbound_inspection_id: string | null;
};

export type ValidationResult =
  | { ok: true; value: PutawayRecommendationInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの PutawayRecommendationInput を返す。
// DB の制約（shipper_id/product_id 必須・deviated boolean・各参照 nullable）とミラー。
export function validatePutawayRecommendationInput(raw: {
  shipper_id?: unknown;
  product_id?: unknown;
  lot_id?: unknown;
  recommended_location_id?: unknown;
  actual_location_id?: unknown;
  reason?: unknown;
  deviated?: unknown;
  deviation_reason?: unknown;
  inbound_inspection_id?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  // deviated は boolean（未指定なら DB default false）。文字列 'true'/'false' も受ける。
  const deviated = parseBoolean(raw.deviated);
  if (deviated === "invalid") {
    errors.deviated = "逸脱有無は真偽値で指定してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      shipper_id,
      product_id,
      lot_id: normalizeOptionalText(raw.lot_id),
      recommended_location_id: normalizeOptionalText(raw.recommended_location_id),
      actual_location_id: normalizeOptionalText(raw.actual_location_id),
      reason: normalizeOptionalText(raw.reason),
      deviated: deviated as boolean,
      deviation_reason: normalizeOptionalText(raw.deviation_reason),
      inbound_inspection_id: normalizeOptionalText(raw.inbound_inspection_id),
    },
  };
}

// boolean / 'true'/'false' 文字列 → boolean、未指定 → false、それ以外 → "invalid"
function parseBoolean(v: unknown): boolean | "invalid" {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "") return false;
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return "invalid";
}

// 空文字/未指定 → null、それ以外は trim 済み文字列
function normalizeOptionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
