// 荷主(shippers) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）

export const INSPECTION_METHODS = ["全数", "抜取り"] as const;
export const PICKING_RULES = ["FIFO", "FEFO"] as const;

export type InspectionMethod = (typeof INSPECTION_METHODS)[number];
export type PickingRule = (typeof PICKING_RULES)[number];

// DB の shippers 行に対応する型
export type Shipper = {
  id: string;
  code: string;
  name: string;
  lot_managed: boolean;
  expiry_managed: boolean;
  serial_managed: boolean;
  inspection_method: InspectionMethod;
  picking_rule: PickingRule;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type ShipperInput = {
  code: string;
  name: string;
  lot_managed: boolean;
  expiry_managed: boolean;
  serial_managed: boolean;
  inspection_method: InspectionMethod;
  picking_rule: PickingRule;
};

export type ValidationResult =
  | { ok: true; value: ShipperInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの ShipperInput を返す。
// DB の制約（code/name 必須・列挙値）とミラーし、UI で先に弾く。
export function validateShipperInput(raw: {
  code?: unknown;
  name?: unknown;
  lot_managed?: unknown;
  expiry_managed?: unknown;
  serial_managed?: unknown;
  inspection_method?: unknown;
  picking_rule?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) errors.code = "コードは必須です";

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.name = "名称は必須です";

  const inspection_method =
    typeof raw.inspection_method === "string" ? raw.inspection_method : "";
  if (!INSPECTION_METHODS.includes(inspection_method as InspectionMethod)) {
    errors.inspection_method = "検品方法が不正です";
  }

  const picking_rule =
    typeof raw.picking_rule === "string" ? raw.picking_rule : "";
  if (!PICKING_RULES.includes(picking_rule as PickingRule)) {
    errors.picking_rule = "ピッキングルールが不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      code,
      name,
      lot_managed: toBool(raw.lot_managed),
      expiry_managed: toBool(raw.expiry_managed),
      serial_managed: toBool(raw.serial_managed),
      inspection_method: inspection_method as InspectionMethod,
      picking_rule: picking_rule as PickingRule,
    },
  };
}

// チェックボックスは未チェック時 FormData に現れない → 存在＝true として扱う
function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}
