// マスタ改定履歴(master_revisions) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.3（#7）
// 調整（Hiro承認済み）: changed_by は users への FK にしない（素の uuid）。entity_id も多態（FKなし）。

// 対象エンティティ種別（0003 の CHECK 制約とミラー）
export const ENTITY_TYPES = [
  "shipper",
  "product",
  "location",
  "business_partner",
  "rate",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// 任意の JSON スナップショット（改定時点の値）
export type JsonObject = Record<string, unknown>;

// DB の master_revisions 行に対応する型
export type MasterRevision = {
  id: string;
  shipper_id: string | null; // 横断マスタは NULL 可
  entity_type: EntityType;
  entity_id: string;
  effective_from: string; // date (ISO yyyy-mm-dd)
  effective_to: string | null;
  snapshot: JsonObject;
  changed_by: string | null; // FK なしの素の uuid
  created_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type MasterRevisionInput = {
  shipper_id: string | null;
  entity_type: EntityType;
  entity_id: string;
  effective_from: string;
  effective_to: string | null;
  snapshot: JsonObject;
  changed_by: string | null;
};

export type ValidationResult =
  | { ok: true; value: MasterRevisionInput }
  | { ok: false; errors: Record<string, string> };

// 生入力を検証し、正規化済みの MasterRevisionInput を返す。
// DB の制約（entity_type 列挙・entity_id/effective_from/snapshot 必須・shipper_id/changed_by 任意）とミラー。
export function validateMasterRevisionInput(raw: {
  shipper_id?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
  snapshot?: unknown;
  changed_by?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const entity_type = typeof raw.entity_type === "string" ? raw.entity_type : "";
  if (!ENTITY_TYPES.includes(entity_type as EntityType)) {
    errors.entity_type = "対象エンティティ種別が不正です";
  }

  const entity_id = typeof raw.entity_id === "string" ? raw.entity_id.trim() : "";
  if (!entity_id) errors.entity_id = "対象行IDは必須です";

  const effective_from =
    typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
  if (!isIsoDate(effective_from)) {
    errors.effective_from = "有効開始日はYYYY-MM-DD形式で入力してください";
  }

  const rawTo =
    typeof raw.effective_to === "string" ? raw.effective_to.trim() : "";
  if (rawTo && !isIsoDate(rawTo)) {
    errors.effective_to = "有効終了日はYYYY-MM-DD形式で入力してください";
  }

  // snapshot は必須かつオブジェクト（DB は NOT NULL jsonb）
  const snapshot = raw.snapshot;
  if (!isPlainObject(snapshot)) {
    errors.snapshot = "スナップショットはオブジェクトで指定してください";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // shipper_id は任意（横断マスタは NULL）。空文字は null に正規化。
  const rawShipper =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  const shipper_id = rawShipper || null;

  // changed_by は任意（FK なし・本認証未配線のため null 可）。空文字は null に正規化。
  const rawChangedBy =
    typeof raw.changed_by === "string" ? raw.changed_by.trim() : "";
  const changed_by = rawChangedBy || null;

  return {
    ok: true,
    value: {
      shipper_id,
      entity_type: entity_type as EntityType,
      entity_id,
      effective_from,
      effective_to: rawTo || null,
      snapshot: snapshot as JsonObject,
      changed_by,
    },
  };
}

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// YYYY-MM-DD 形式かつ実在日付かを検証
function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}
