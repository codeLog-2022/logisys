import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PutawayRecommendation,
  PutawayRecommendationInput,
} from "./types";

// 格納推奨(putaway_recommendations) のデータアクセス層。
// SupabaseClient を引数に取り、REST(PostgREST) 経由で CRUD する。
// → サーバーアクション（anon クライアント）からも、テスト（anon クライアント直結）からも同一コードを通す。
// このテーブルは業務 unique を持たない（推奨は積み上げ）。よって 23505 変換は不要
// （0003 の master_revisions と同じ判断）。

export async function listPutawayRecommendations(
  supabase: SupabaseClient,
  shipperId: string,
): Promise<PutawayRecommendation[]> {
  const { data, error } = await supabase
    .from("putaway_recommendations")
    .select("*")
    .eq("shipper_id", shipperId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PutawayRecommendation[];
}

export async function getPutawayRecommendation(
  supabase: SupabaseClient,
  id: string,
): Promise<PutawayRecommendation | null> {
  const { data, error } = await supabase
    .from("putaway_recommendations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PutawayRecommendation) ?? null;
}

export async function createPutawayRecommendation(
  supabase: SupabaseClient,
  input: PutawayRecommendationInput,
): Promise<PutawayRecommendation> {
  const { data, error } = await supabase
    .from("putaway_recommendations")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PutawayRecommendation;
}

export async function updatePutawayRecommendation(
  supabase: SupabaseClient,
  id: string,
  input: PutawayRecommendationInput,
): Promise<PutawayRecommendation> {
  const { data, error } = await supabase
    .from("putaway_recommendations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PutawayRecommendation;
}

export async function deletePutawayRecommendation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("putaway_recommendations")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
