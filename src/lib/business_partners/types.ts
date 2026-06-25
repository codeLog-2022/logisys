// 取引先(business_partners) のドメイン型・バリデーション（Next 非依存の純ロジック＝テスト容易）
// 設計: Phase1-DataModel-Design.md §3.2（#4）

// 取引先区分（0003 の CHECK 制約とミラー）: 出荷先/仕入先/請求先
export const PARTNER_TYPES = ["ship_to", "supplier", "bill_to"] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

// DB の business_partners 行に対応する型
export type BusinessPartner = {
  id: string;
  shipper_id: string;
  code: string;
  name: string;
  partner_type: PartnerType;
  parent_id: string | null;
  postal_code: string | null;
  address: string | null;
  tel: string | null;
  created_at: string;
  updated_at: string;
};

// 登録/更新でユーザーが入力する値（id/タイムスタンプは含まない）
export type BusinessPartnerInput = {
  shipper_id: string;
  code: string;
  name: string;
  partner_type: PartnerType;
  parent_id: string | null;
  postal_code: string | null;
  address: string | null;
  tel: string | null;
};

export type ValidationResult =
  | { ok: true; value: BusinessPartnerInput }
  | { ok: false; errors: Record<string, string> };

// FormData などの生入力を検証し、正規化済みの BusinessPartnerInput を返す。
// DB の制約（shipper_id/code/name 必須・partner_type 列挙値）とミラーし、UI で先に弾く。
export function validateBusinessPartnerInput(raw: {
  shipper_id?: unknown;
  code?: unknown;
  name?: unknown;
  partner_type?: unknown;
  parent_id?: unknown;
  postal_code?: unknown;
  address?: unknown;
  tel?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  const shipper_id =
    typeof raw.shipper_id === "string" ? raw.shipper_id.trim() : "";
  if (!shipper_id) errors.shipper_id = "荷主は必須です";

  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) errors.code = "コードは必須です";

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.name = "名称は必須です";

  const partner_type =
    typeof raw.partner_type === "string" ? raw.partner_type : "";
  if (!PARTNER_TYPES.includes(partner_type as PartnerType)) {
    errors.partner_type = "取引先区分が不正です";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // parent_id は任意（自己参照・on delete set null）。空文字は null に正規化。
  const rawParent = typeof raw.parent_id === "string" ? raw.parent_id.trim() : "";
  const parent_id = rawParent || null;

  return {
    ok: true,
    value: {
      shipper_id,
      code,
      name,
      partner_type: partner_type as PartnerType,
      parent_id,
      postal_code: normalizeOptionalText(raw.postal_code),
      address: normalizeOptionalText(raw.address),
      tel: normalizeOptionalText(raw.tel),
    },
  };
}

// 空文字/未指定 → null、それ以外は trim 済み文字列
function normalizeOptionalText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
