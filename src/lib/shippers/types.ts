// 荷主(shippers) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）

export const INSPECTION_METHODS = ["全数", "抜取り"] as const;
// 0003 で CHECK 拡張（FIFO/FEFO → ロット指定/受注優先 を追加）
export const PICKING_RULES = ["FIFO", "FEFO", "ロット指定", "受注優先"] as const;
// 0003 追加: 保管料計算方式/算定方式/基準時点/混在ポリシー（DB の CHECK とミラー）
export const STORAGE_BILLING_METHODS = ["坪建て", "パレット建て", "個建て"] as const;
export const STORAGE_BILLING_CYCLES = ["3期制", "日割"] as const;
export const STORAGE_BASES = ["期末", "平均"] as const;
export const INVENTORY_MIXING = ["allowed", "denied"] as const;
// 賞味期限受入ルール（残日数の分母。0=制約なし / 2=1/2 / 3=1/3）DB CHECK in (0,2,3)
export const EXPIRY_ACCEPTANCE_RATIOS = [0, 2, 3] as const;

export type InspectionMethod = (typeof INSPECTION_METHODS)[number];
export type PickingRule = (typeof PICKING_RULES)[number];
export type StorageBillingMethod = (typeof STORAGE_BILLING_METHODS)[number];
export type StorageBillingCycle = (typeof STORAGE_BILLING_CYCLES)[number];
export type StorageBasis = (typeof STORAGE_BASES)[number];
export type InventoryMixing = (typeof INVENTORY_MIXING)[number];
export type ExpiryAcceptanceRatio = (typeof EXPIRY_ACCEPTANCE_RATIOS)[number];

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
  // 0003 追加
  storage_billing_method: StorageBillingMethod;
  storage_billing_cycle: StorageBillingCycle;
  storage_basis: StorageBasis;
  closing_day: number;
  expiry_acceptance_ratio: ExpiryAcceptanceRatio;
  inventory_mixing: InventoryMixing;
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
  // 0003 追加
  storage_billing_method: StorageBillingMethod;
  storage_billing_cycle: StorageBillingCycle;
  storage_basis: StorageBasis;
  closing_day: number;
  expiry_acceptance_ratio: ExpiryAcceptanceRatio;
  inventory_mixing: InventoryMixing;
};

export type ValidationResult =
  | { ok: true; value: ShipperInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの ShipperInput を返す。
// DB の制約（code/name 必須・列挙値・closing_day 範囲）とミラーし、UI で先に弾く。
export function validateShipperInput(raw: {
  code?: unknown;
  name?: unknown;
  lot_managed?: unknown;
  expiry_managed?: unknown;
  serial_managed?: unknown;
  inspection_method?: unknown;
  picking_rule?: unknown;
  storage_billing_method?: unknown;
  storage_billing_cycle?: unknown;
  storage_basis?: unknown;
  closing_day?: unknown;
  expiry_acceptance_ratio?: unknown;
  inventory_mixing?: unknown;
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

  // 0003 追加列。未指定時は DB default と同じ値にフォールバック（NOT NULL default 列）。
  const storage_billing_method =
    raw.storage_billing_method === undefined ||
    raw.storage_billing_method === null ||
    raw.storage_billing_method === ""
      ? "個建て"
      : String(raw.storage_billing_method);
  if (
    !STORAGE_BILLING_METHODS.includes(
      storage_billing_method as StorageBillingMethod,
    )
  ) {
    errors.storage_billing_method = "保管料計算方式が不正です";
  }

  const storage_billing_cycle =
    raw.storage_billing_cycle === undefined ||
    raw.storage_billing_cycle === null ||
    raw.storage_billing_cycle === ""
      ? "3期制"
      : String(raw.storage_billing_cycle);
  if (
    !STORAGE_BILLING_CYCLES.includes(
      storage_billing_cycle as StorageBillingCycle,
    )
  ) {
    errors.storage_billing_cycle = "保管料算定方式が不正です";
  }

  const storage_basis =
    raw.storage_basis === undefined ||
    raw.storage_basis === null ||
    raw.storage_basis === ""
      ? "期末"
      : String(raw.storage_basis);
  if (!STORAGE_BASES.includes(storage_basis as StorageBasis)) {
    errors.storage_basis = "保管料基準時点が不正です";
  }

  const inventory_mixing =
    raw.inventory_mixing === undefined ||
    raw.inventory_mixing === null ||
    raw.inventory_mixing === ""
      ? "allowed"
      : String(raw.inventory_mixing);
  if (!INVENTORY_MIXING.includes(inventory_mixing as InventoryMixing)) {
    errors.inventory_mixing = "混在ポリシーが不正です";
  }

  // closing_day: 1-28 または 99（末日）。未指定は default 99。
  const closing_day = parseClosingDay(raw.closing_day);
  if (closing_day === "invalid") {
    errors.closing_day = "締日は1〜28または99で入力してください";
  }

  // expiry_acceptance_ratio: 0/2/3 のみ。未指定は default 0。
  const expiry_acceptance_ratio = parseExpiryRatio(raw.expiry_acceptance_ratio);
  if (expiry_acceptance_ratio === "invalid") {
    errors.expiry_acceptance_ratio = "賞味期限受入ルールが不正です";
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
      storage_billing_method: storage_billing_method as StorageBillingMethod,
      storage_billing_cycle: storage_billing_cycle as StorageBillingCycle,
      storage_basis: storage_basis as StorageBasis,
      closing_day: closing_day as number,
      expiry_acceptance_ratio: expiry_acceptance_ratio as ExpiryAcceptanceRatio,
      inventory_mixing: inventory_mixing as InventoryMixing,
    },
  };
}

// チェックボックスは未チェック時 FormData に現れない → 存在＝true として扱う
function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}

// 未入力 → default 99、1-28 or 99 → その値、それ以外 → "invalid"
function parseClosingDay(v: unknown): number | "invalid" {
  if (v === undefined || v === null || v === "") return 99;
  let n: number;
  if (typeof v === "string") {
    n = Number(v.trim());
  } else if (typeof v === "number") {
    n = v;
  } else {
    return "invalid";
  }
  if (!Number.isInteger(n)) return "invalid";
  if (n === 99) return 99;
  if (n >= 1 && n <= 28) return n;
  return "invalid";
}

// 未入力 → default 0、0/2/3 → その値、それ以外 → "invalid"
function parseExpiryRatio(v: unknown): ExpiryAcceptanceRatio | "invalid" {
  if (v === undefined || v === null || v === "") return 0;
  let n: number;
  if (typeof v === "string") {
    n = Number(v.trim());
  } else if (typeof v === "number") {
    n = v;
  } else {
    return "invalid";
  }
  if (EXPIRY_ACCEPTANCE_RATIOS.includes(n as ExpiryAcceptanceRatio)) {
    return n as ExpiryAcceptanceRatio;
  }
  return "invalid";
}
