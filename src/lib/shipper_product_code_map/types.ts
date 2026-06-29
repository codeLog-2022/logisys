// 読替表(shipper_product_code_map) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.5（#3・論点8=C 社内統一コード正＋読替表）

// 出所（0003 の CHECK 制約とミラー）: 荷主/EDI/モール/その他
export const CODE_MAP_SOURCES = ["shipper", "edi", "mall", "other"] as const;

export type CodeMapSource = (typeof CODE_MAP_SOURCES)[number];

// DB の shipper_product_code_map 行に対応する型
export type ShipperProductCodeMap = {
  id: string;
  shipper_id: string;
  product_id: string;
  external_code: string;
  source: CodeMapSource;
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type ShipperProductCodeMapInput = {
  shipper_id: string;
  product_id: string;
  external_code: string;
  source: CodeMapSource;
};

export type ValidationResult =
  | { ok: true; value: ShipperProductCodeMapInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの ShipperProductCodeMapInput を返す。
// DB の制約（shipper_id/product_id/external_code 必須・source 列挙値）とミラー。
export function validateShipperProductCodeMapInput(raw: {
  shipper_id?: unknown;
  product_id?: unknown;
  external_code?: unknown;
  source?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const product_id =
    typeof raw.product_id === "string" ? raw.product_id.trim() : "";
  if (!product_id) errors.product_id = "商品は必須です";

  const external_code =
    typeof raw.external_code === "string" ? raw.external_code.trim() : "";
  if (!external_code) errors.external_code = "外部コードは必須です";

  // source は NOT NULL default 'shipper'。空入力は default にフォールバック。
  const source =
    raw.source === undefined || raw.source === null || raw.source === ""
      ? "shipper"
      : String(raw.source);
  if (!CODE_MAP_SOURCES.includes(source as CodeMapSource)) {
    errors.source = "出所が不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      shipper_id,
      product_id,
      external_code,
      source: source as CodeMapSource,
    },
  };
}
