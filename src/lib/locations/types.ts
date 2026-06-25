// ロケーション(locations) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）

// 温度帯（0001_init.sql の check 制約とミラー）
export const TEMP_ZONES = ["常温", "冷蔵", "冷凍"] as const;
// 用途（0001_init.sql の check 制約とミラー）
export const USAGES = ["shared", "dedicated"] as const;

export type TempZone = (typeof TEMP_ZONES)[number];
export type Usage = (typeof USAGES)[number];

// DB の locations 行に対応する型。
// locations には updated_at カラム / トリガが無いため含めない（shippers/products と異なる点）。
export type Location = {
  id: string;
  code: string;
  temp_zone: TempZone;
  usage: Usage;
  owner_shipper_id: string | null;
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type LocationInput = {
  code: string;
  temp_zone: TempZone;
  usage: Usage;
  owner_shipper_id: string | null;
};

export type ValidationResult =
  | { ok: true; value: LocationInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの LocationInput を返す。
// DB の制約（code 必須・temp_zone/usage 列挙値・owner_shipper_id 任意）とミラーし、UI で先に弾く。
export function validateLocationInput(raw: {
  code?: unknown;
  temp_zone?: unknown;
  usage?: unknown;
  owner_shipper_id?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) errors.code = "コードは必須です";

  const temp_zone = typeof raw.temp_zone === "string" ? raw.temp_zone : "";
  if (!TEMP_ZONES.includes(temp_zone as TempZone)) {
    errors.temp_zone = "温度帯が不正です";
  }

  const usage = typeof raw.usage === "string" ? raw.usage : "";
  if (!USAGES.includes(usage as Usage)) {
    errors.usage = "用途が不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // owner_shipper_id は任意（DB は nullable・on delete set null）。空文字は null に正規化（共用ロケーション）。
  const rawOwner =
    typeof raw.owner_shipper_id === "string" ? raw.owner_shipper_id.trim() : "";
  const owner_shipper_id = rawOwner || null;

  return {
    ok: true,
    value: {
      code,
      temp_zone: temp_zone as TempZone,
      usage: usage as Usage,
      owner_shipper_id,
    },
  };
}
