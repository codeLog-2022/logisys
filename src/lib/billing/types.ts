// billing/types.ts — 請求機能のドメイン型（Next.js 非依存）

export const BILLING_STATUSES = ["draft", "confirmed"] as const;
export const BILLING_LINE_TYPES = ["storage", "handling", "incidental"] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type BillingLineType = (typeof BILLING_LINE_TYPES)[number];

// billing_statements テーブルの 1 行
export type BillingStatement = {
  id: string;
  shipper_id: string;
  billing_year_month: string; // yyyy-mm
  total_amount: number;
  status: BillingStatus;
  created_at: string;
  updated_at: string;
};

// billing_line_items テーブルの 1 行
export type BillingLineItem = {
  id: string;
  statement_id: string;
  line_type: BillingLineType;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  rate_master_id: string | null;
  created_at: string;
};

// 請求書作成時の入力（ヘッダ）
export type CreateBillingStatementInput = {
  shipper_id: string;
  billing_year_month: string; // yyyy-mm
  total_amount: number;
  status: BillingStatus;
};

// 明細行作成時の入力
export type CreateBillingLineItemInput = {
  statement_id: string;
  line_type: BillingLineType;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  rate_master_id: string | null;
};
