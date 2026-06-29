// 監査ログ(audit_logs) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.10（#61）。アプリ層で明示記録（案B）。

// 監査アクション（DB に CHECK は無いが、アプリ層で既知の集合に正規化する）。
export const AUDIT_ACTIONS = ["create", "update", "delete", "inspect"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// jsonb として保持される差分ペイロード。
export type JsonObject = Record<string, unknown>;

// DB の audit_logs 行に対応する型
export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  shipper_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: JsonObject | null;
  after: JsonObject | null;
  created_at: string;
};

// 記録時に渡す値（id/タイムスタンプは含まない）
export type AuditLogInput = {
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  shipper_id: string | null;
  before: JsonObject | null;
  after: JsonObject | null;
};

export type ValidationResult =
  | { ok: true; value: AuditLogInput }
  | { ok: false; errors: Record<string, string> };

function asJsonObject(v: unknown): JsonObject | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as JsonObject;
  return null;
}

// 生入力を検証し、正規化済みの AuditLogInput を返す。
// DB の制約（action/entity_type not null・actor/shipper/entity_id nullable・before/after は任意 jsonb）とミラー。
export function validateAuditLogInput(raw: {
  action?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  actor_user_id?: unknown;
  shipper_id?: unknown;
  before?: unknown;
  after?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!action) errors.action = "アクションは必須です";
  else if (!AUDIT_ACTIONS.includes(action as AuditAction)) {
    errors.action = "アクションが不正です";
  }

  const entity_type =
    typeof raw.entity_type === "string" ? raw.entity_type.trim() : "";
  if (!entity_type) errors.entity_type = "対象種別は必須です";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const norm = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || null;
  };

  return {
    ok: true,
    value: {
      action: action as AuditAction,
      entity_type,
      entity_id: norm(raw.entity_id),
      actor_user_id: norm(raw.actor_user_id),
      shipper_id: norm(raw.shipper_id),
      before: asJsonObject(raw.before),
      after: asJsonObject(raw.after),
    },
  };
}
