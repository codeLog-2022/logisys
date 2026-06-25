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
};

export type ValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの ProductInput を返す。
// DB の制約（shipper_id/code/name 必須・temp_zone 列挙値）とミラーし、UI で先に弾く。
export function validateProductInput(raw: {
  shipper_id?: unknown;
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  units_per_case?: unknown;
  temp_zone?: unknown;
  hazard_class?: unknown;
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
  const units_per_case = parseUnitsPerCase(raw.units_per_case);
  if (units_per_case === "invalid") {
    errors.units_per_case = "入数は正の整数で入力してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // hazard_class は任意。空文字は null に正規化。
  const rawHazard =
    typeof raw.hazard_class === "string" ? raw.hazard_class.trim() : "";
  const hazard_class = rawHazard || null;

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
    },
  };
}

// 未入力 → null、正の整数 → その値、それ以外 → "invalid"
function parseUnitsPerCase(v: unknown): number | null | "invalid" {
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
