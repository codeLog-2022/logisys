// billing/service.ts — 請求書作成オーケストレーション
// 算定ロジック + repository を組み合わせて createBillingStatement を実装する。
// → rate_master / inventory / transactions を参照し、billing_statements + billing_line_items を作成する。

import type { SupabaseClient } from "@supabase/supabase-js";
import { listRateMasters } from "../rate_master/repository";
import { listInventoryCurrent } from "../inventory/repository";
import { listTransactions } from "../inventory_transactions/repository";
import { calculateStorageFee, calculateHandlingFee } from "./calculation";
import {
  createBillingStatement as createBillingStatementRow,
  createBillingLineItems,
} from "./repository";
import type { BillingStatement, BillingLineItem } from "./types";

export type CreateBillingStatementResult = {
  statement: BillingStatement;
  lineItems: BillingLineItem[];
};

/**
 * 請求書を算定・作成する
 *
 * @param supabase       SupabaseClient（service_role 推奨）
 * @param shipperId      対象荷主 ID
 * @param yearMonth      対象年月（yyyy-mm 形式）
 *
 * 手順:
 *  1. rate_master から対象荷主の保管料・荷役料レートを取得
 *  2. 月末在庫（inventory_current_v2）を取得
 *  3. 当月入出庫（inventory_transactions）を取得
 *  4. 保管料・荷役料を算定
 *  5. billing_statements を作成（status=draft）
 *  6. billing_line_items を一括作成
 *
 * 対象年月の取引期間絞り込み:
 *   created_at が yearMonth の月初〜月末（含む）の行を対象とする。
 */
export async function createBillingStatementWithItems(
  supabase: SupabaseClient,
  shipperId: string,
  yearMonth: string, // yyyy-mm
): Promise<CreateBillingStatementResult> {
  // 対象年月の開始・終了日を計算
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // 月末日
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  // 1. rate_master 取得（対象荷主・有効期間内）
  const allRates = await listRateMasters(supabase);
  const shipperRates = allRates.filter(
    (r) =>
      r.shipper_id === shipperId &&
      r.effective_from <= endDate &&
      (r.effective_to === null || r.effective_to >= startDate),
  );

  const storageRates = shipperRates.filter((r) => r.rate_type === "storage");
  const handlingRates = shipperRates.filter((r) => r.rate_type === "handling");

  // 2. 在庫取得（月末時点の在庫 = 対象荷主の現在在庫を月末近似として使用）
  const inventory = await listInventoryCurrent(supabase, {
    shipper_id: shipperId,
  });

  // 3. 当月入出庫取得
  const transactions = await listTransactions(supabase, {
    shipper_id: shipperId,
  });
  // yearMonth の月に作成されたトランザクションのみ絞り込む
  const monthTransactions = transactions.filter((t) => {
    const txnDate = t.created_at.slice(0, 7); // yyyy-mm
    return txnDate === yearMonth;
  });

  // 4. 算定
  const storageFee = calculateStorageFee(storageRates, inventory);
  const handlingFee = calculateHandlingFee(handlingRates, monthTransactions);

  const totalAmount = storageFee.totalAmount + handlingFee.totalAmount;

  // 5. billing_statements 作成
  const statement = await createBillingStatementRow(supabase, {
    shipper_id: shipperId,
    billing_year_month: yearMonth,
    total_amount: totalAmount,
    status: "draft",
  });

  // 6. billing_line_items 一括作成
  const lineItemInputs = [
    ...storageFee.lineItems,
    ...handlingFee.lineItems,
  ].map((item) => ({
    ...item,
    statement_id: statement.id,
  }));

  const lineItems = await createBillingLineItems(supabase, lineItemInputs);

  return { statement, lineItems };
}
