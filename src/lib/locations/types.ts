// ロケーション(locations) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）

// 温度帯（0001_init.sql の check 制約とミラー）
export const TEMP_ZONES = ["常温", "冷蔵", "冷凍"] as const;
// 用途（0001_init.sql の check 制約とミラー）
export const USAGES = ["shared", "dedicated"] as const;
// 区分（0003 追加・固定/フリー。DB CHECK とミラー）
export const ASSIGNMENT_TYPES = ["fixed", "free"] as const;

export type TempZone = (typeof TEMP_ZONES)[number];
export type Usage = (typeof USAGES)[number];
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

// DB の locations 行に対応する型。
// 0003 で updated_at カラム / トリガ（trg_locations_updated）を追加した
// （機能1時点では未保持だったが、他マスタと揃えて追加）。
export type Location = {
  id: string;
  code: string;
  temp_zone: TempZone;
  usage: Usage;
  owner_shipper_id: string | null;
  // 0003 追加
  zone: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  assignment_type: AssignmentType;
  storable_unit_types: string[];
  hazard_allowed: boolean;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type LocationInput = {
  code: string;
  temp_zone: TempZone;
  usage: Usage;
  owner_shipper_id: string | null;
  // 0003 追加
  zone: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  assignment_type: AssignmentType;
  storable_unit_types: string[];
  hazard_allowed: boolean;
};

export type ValidationResult =
  | { ok: true; value: LocationInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの LocationInput を返す。
// DB の制約（code 必須・temp_zone/usage/assignment_type 列挙値・owner_shipper_id 任意）とミラーし、UI で先に弾く。
export function validateLocationInput(raw: {
  code?: unknown;
  temp_zone?: unknown;
  usage?: unknown;
  owner_shipper_id?: unknown;
  zone?: unknown;
  aisle?: unknown;
  bay?: unknown;
  level?: unknown;
  assignment_type?: unknown;
  storable_unit_types?: unknown;
  hazard_allowed?: unknown;
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

  // assignment_type は NOT NULL default 'free'。未指定は default にフォールバック。
  const assignment_type =
    raw.assignment_type === undefined ||
    raw.assignment_type === null ||
    raw.assignment_type === ""
      ? "free"
      : String(raw.assignment_type);
  if (!ASSIGNMENT_TYPES.includes(assignment_type as AssignmentType)) {
    errors.assignment_type = "区分が不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // owner_shipper_id は任意（DB は nullable・on delete set null）。空文字は null に正規化（共用ロケーション）。
  const rawOwner =
    typeof raw.owner_shipper_id === "string" ? raw.owner_shipper_id.trim() : "";
  const owner_shipper_id = rawOwner || null;

  // zone/aisle/bay/level は任意の text。空文字は null に正規化。
  const zone = normalizeOptionalText(raw.zone);
  const aisle = normalizeOptionalText(raw.aisle);
  const bay = normalizeOptionalText(raw.bay);
  const level = normalizeOptionalText(raw.level);

  return {
    ok: true,
    value: {
      code,
      temp_zone: temp_zone as TempZone,
      usage: usage as Usage,
      owner_shipper_id,
      zone,
      aisle,
      bay,
      level,
      assignment_type: assignment_type as AssignmentType,
      storable_unit_types: normalizeUnitTypes(raw.storable_unit_types),
      hazard_allowed: toBool(raw.hazard_allowed),
    },
  };
}

// 空文字/未指定 → null、それ以外は trim 済み文字列
function normalizeOptionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

// storable_unit_types: 文字列配列を trim・空要素除去・重複排除して正規化。
// 配列でなければ空配列（DB default '{}'）。
function normalizeUnitTypes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (s) seen.add(s);
  }
  return [...seen];
}

// チェックボックスは未チェック時 FormData に現れない → 存在＝true として扱う
function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}
