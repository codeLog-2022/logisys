// billing/calculation.ts — 保管料・荷役料の純関数算定ロジック（Next.js 非依存）
// DB 接続・副作用なし。テストしやすい純関数として実装する。
//
// 設計方針:
//   - 保管料 (storage): rate_master の storage 行 × 月末在庫の合計数量
//   - 荷役料 (handling): rate_master の handling 行 × 当月入出庫の件数
//   - 1 つの料金マスタ = 1 つの明細行

import type { RateMaster } from "../rate_master/types";
import type { InventoryCurrentRow } from "../inventory/types";
import type { InventoryTransaction } from "../inventory_transactions/types";

// 明細行（billing_line_items に挿入する値のサブセット）
export type BillingLineItemInput = {
  line_type: "storage" | "handling" | "incidental";
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  rate_master_id: string | null;
};

// 算定結果（合計金額 + 明細行一覧）
export type FeeCalculationResult = {
  totalAmount: number;
  lineItems: BillingLineItemInput[];
};

/**
 * 保管料算定
 *
 * @param storageRates rate_master の rate_type='storage' 行
 * @param inventory    月末時点の在庫行（billing 対象の荷主の全在庫）
 * @returns            合計金額と明細行一覧
 *
 * 算定式: unit_price × Σqty（在庫数量合計）
 * 複数の保管料マスタがある場合はそれぞれ独立した明細行を生成する。
 */
export function calculateStorageFee(
  storageRates: RateMaster[],
  inventory: InventoryCurrentRow[],
): FeeCalculationResult {
  // 在庫数量の合計（InventoryCurrentRow.qty は Supabase の bigint sum → 文字列）
  const totalQty = inventory.reduce((sum, row) => sum + Number(row.qty), 0);

  const lineItems: BillingLineItemInput[] = [];

  for (const rate of storageRates) {
    if (rate.rate_type !== "storage") continue;
    const quantity = totalQty;
    const amount = round2(quantity * Number(rate.unit_price));
    lineItems.push({
      line_type: "storage",
      description: rate.name,
      quantity,
      unit_price: Number(rate.unit_price),
      amount,
      rate_master_id: rate.id,
    });
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  return { totalAmount, lineItems };
}

/**
 * 荷役料算定
 *
 * @param handlingRates rate_master の rate_type='handling' 行
 * @param transactions  対象月の入出庫トランザクション一覧
 * @returns             合計金額と明細行一覧
 *
 * 算定式: unit_price × 件数（トランザクション行数）
 * 複数の荷役料マスタがある場合はそれぞれ独立した明細行を生成する。
 */
export function calculateHandlingFee(
  handlingRates: RateMaster[],
  transactions: InventoryTransaction[],
): FeeCalculationResult {
  const txnCount = transactions.length;

  const lineItems: BillingLineItemInput[] = [];

  for (const rate of handlingRates) {
    if (rate.rate_type !== "handling") continue;
    const quantity = txnCount;
    const amount = round2(quantity * Number(rate.unit_price));
    lineItems.push({
      line_type: "handling",
      description: rate.name,
      quantity,
      unit_price: Number(rate.unit_price),
      amount,
      rate_master_id: rate.id,
    });
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  return { totalAmount, lineItems };
}

// 浮動小数点誤差を避けるため小数点 2 桁で四捨五入
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
