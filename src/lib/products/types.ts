// 商品(products) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）

export const TEMP_ZONES = ["常温", "冷蔵", "冷凍"] as const;

export type TempZone = (typeof TEMP_ZONES)[number];

// DB の products 行に対応する型
export type Product = {
  id: string;
  shipper_id: string;
  code: string;
  name: string;
  unit: string;
  units_per_case: number | null;
  temp_zone: TempZone;
  hazard_class: string | null;
  // 0003 追加
  jan_code: string | null;
  // 管理要否の三値（null=荷主フラグ継承 / true|false=商品で上書き）
  lot_managed: boolean | null;
  expiry_managed: boolean | null;
  serial_managed: boolean | null;
  units_per_ball: number | null;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type ProductInput = {
  shipper_id: string;
  code: string;
  name: string;
  unit: string;
  units_per_case: number | null;
  temp_zone: TempZone;
  hazard_class: string | null;
  // 0003 追加
  jan_code: string | null;
  lot_managed: boolean | null;
  expiry_managed: boolean | null;
  serial_managed: boolean | null;
  units_per_ball: number | null;
};

export type ValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの ProductInput を返す。
// DB の制約（shipper_id/code/name 必須・temp_zone 列挙値・units_per_case/ball 正整数）とミラーし、UI で先に弾く。
export function validateProductInput(raw: {
  shipper_id?: unknown;
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  units_per_case?: unknown;
  temp_zone?: unknown;
  hazard_class?: unknown;
  jan_code?: unknown;
  lot_managed?: unknown;
  expiry_managed?: unknown;
  serial_managed?: unknown;
  units_per_ball?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) errors.code = "コードは必須です";

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.name = "名称は必須です";

  // unit は DB で NOT NULL（default 'バラ'）。空入力は default にフォールバック。
  const rawUnit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  const unit = rawUnit || "バラ";

  const temp_zone = typeof raw.temp_zone === "string" ? raw.temp_zone : "";
  if (!TEMP_ZONES.includes(temp_zone as TempZone)) {
    errors.temp_zone = "温度帯が不正です";
  }

  // units_per_case は任意（DB は nullable）。入力時のみ正の整数として検証。
  const units_per_case = parsePositiveInt(raw.units_per_case);
  if (units_per_case === "invalid") {
    errors.units_per_case = "入数は正の整数で入力してください";
  }

  // units_per_ball も任意・正の整数（DB CHECK: null or > 0）#2
  const units_per_ball = parsePositiveInt(raw.units_per_ball);
  if (units_per_ball === "invalid") {
    errors.units_per_ball = "ボール入数は正の整数で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // hazard_class は任意。空文字は null に正規化。
  const rawHazard =
    typeof raw.hazard_class === "string" ? raw.hazard_class.trim() : "";
  const hazard_class = rawHazard || null;

  // jan_code は任意（DB nullable・荷主内部分unique）。空文字は null に正規化。
  const rawJan = typeof raw.jan_code === "string" ? raw.jan_code.trim() : "";
  const jan_code = rawJan || null;

  return {
    ok: true,
    value: {
      shipper_id,
      code,
      name,
      unit,
      units_per_case: units_per_case as number | null,
      temp_zone: temp_zone as TempZone,
      hazard_class,
      jan_code,
      // 三値 boolean: 未指定 → null（荷主フラグ継承）
      lot_managed: toTriBool(raw.lot_managed),
      expiry_managed: toTriBool(raw.expiry_managed),
      serial_managed: toTriBool(raw.serial_managed),
      units_per_ball: units_per_ball as number | null,
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

// 三値 boolean: 未指定(undefined/null/"") → null（荷主フラグ継承） / true 系 → true / それ以外 → false
function toTriBool(v: unknown): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  return v === true || v === "true" || v === "on" || v === "1";
}
