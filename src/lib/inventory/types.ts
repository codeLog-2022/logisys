// 在庫照会のドメイン型（Next 非依存の純型定義）

// inventory_current_v2 VIEW の 1 行に対応する型
export type InventoryCurrentRow = {
  shipper_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  lot_no: string | null;
  expiry_date: string | null; // date → ISO8601 文字列（YYYY-MM-DD）
  status: string;
  qty: string; // Supabase/PostgREST は bigint(sum) を文字列で返す
};

// inventory_by_expiry VIEW の 1 行に対応する型
export type InventoryByExpiryRow = {
  shipper_id: string;
  product_id: string;
  lot_id: string | null;
  lot_no: string | null;
  expiry_date: string | null; // date → ISO8601 文字列（YYYY-MM-DD）
  qty: string; // bigint(sum) → 文字列
};

// listInventoryCurrent に渡せるフィルタ
export type InventoryCurrentFilter = {
  shipper_id?: string;
};

// listInventoryByExpiry に渡せるフィルタ
export type InventoryByExpiryFilter = {
  shipper_id?: string;
};
