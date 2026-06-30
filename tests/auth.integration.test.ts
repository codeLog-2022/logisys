import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// 統合テスト: ローカル Supabase スタック前提（`supabase start` 済み）。
// JWT 認証フロー + RLS アクセス制御を supabase-js クライアント経由で検証する。
// ブラウザなし: signInWithPassword でセッション取得 → RLS をリアルに通す。
//
// 前提:
//   - PR#5: Supabase Auth 配線済み（auth.uid() が使用可能）
//   - PR#6: 0007_rls_phase1b.sql で RLS 実効化済み（anon 全許可撤去・authenticated ポリシー適用）
//
// テストケース:
//   1. 未認証(anon)クライアントで shippers を SELECT → 0件または permission denied
//   2. Auth ユーザーで signInWithPassword → shippers SELECT 成功
//   3. 荷主スコープ RLS: 荷主 A ユーザーは荷主 A のデータのみ参照可、荷主 B は見えない
//   4. admin ユーザー(shipper_id IS NULL): 全荷主データ参照可
//
// 接続情報は vitest.config.ts が `supabase status` から実行時に注入する。
// テストデータは afterEach/afterAll で削除する（DB に痕跡を残さない）。

const apiUrl = process.env.SUPABASE_API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// テストデータ識別用プレフィックス
const TEST_PREFIX = "VITEST-AUTH-";

// service_role クライアント（テストセットアップ / teardown 用）
let serviceClient: SupabaseClient;

// テスト中に作成した auth ユーザー ID を記録 → afterEach で削除
const createdAuthUserIds: string[] = [];
// テスト中に作成した users テーブル行 ID を記録 → afterEach で削除
const createdUserRowIds: string[] = [];
// テスト中に作成した shippers テーブル行 ID を記録 → afterEach で削除
const createdShipperIds: string[] = [];

// 荷主スコープ RLS テスト用に beforeAll で作成する永続テストデータ
let shipperAId: string;
let shipperBId: string;

// テスト用 auth ユーザーを作成し、ID を createdAuthUserIds に追加する
async function createAuthUser(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // メール確認をスキップしてすぐログイン可能にする
  });
  if (error || !data.user) {
    throw new Error(`Auth ユーザー作成失敗: ${error?.message}`);
  }
  createdAuthUserIds.push(data.user.id);
  return data.user.id;
}

// users テーブルに行を挿入し、ID を createdUserRowIds に追加する
async function insertUserRow(params: {
  email: string;
  name: string;
  roleId: string;
  shipperId: string | null;
  authUserId: string;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("users")
    .insert({
      email: params.email,
      name: params.name,
      role_id: params.roleId,
      shipper_id: params.shipperId,
      auth_user_id: params.authUserId,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`users 行挿入失敗: ${error?.message}`);
  }
  createdUserRowIds.push(data.id);
  return data.id;
}

// shippers テーブルにテスト用荷主を作成する
async function createTestShipper(suffix: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("shippers")
    .insert({
      code: `${TEST_PREFIX}${suffix}`,
      name: `テスト荷主 ${suffix}`,
      lot_managed: false,
      expiry_managed: false,
      serial_managed: false,
      inspection_method: "全数",
      picking_rule: "FIFO",
      storage_billing_method: "個建て",
      storage_billing_cycle: "3期制",
      storage_basis: "期末",
      closing_day: 99,
      expiry_acceptance_ratio: 0,
      inventory_mixing: "allowed",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`shipper 作成失敗: ${error?.message}`);
  }
  createdShipperIds.push(data.id);
  return data.id;
}

// roles テーブルから admin ロール ID を取得する
async function getAdminRoleId(): Promise<string> {
  const { data, error } = await serviceClient
    .from("roles")
    .select("id")
    .eq("code", "admin")
    .single();
  if (error || !data) {
    throw new Error(`admin ロール取得失敗: ${error?.message}`);
  }
  return data.id;
}

describe("認証 E2E テスト（JWT 認証フロー + RLS アクセス制御）", () => {
  beforeAll(async () => {
    if (!apiUrl || !anonKey || !serviceRoleKey) {
      throw new Error(
        "SUPABASE_API_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY が未取得です。" +
          "`supabase start` でローカルスタックを起動してから実行してください。",
      );
    }
    serviceClient = createClient(apiUrl, serviceRoleKey);

    // 荷主スコープ RLS テスト用の永続荷主（テストスイート全体で共有）
    shipperAId = await createTestShipper("A");
    shipperBId = await createTestShipper("B");
  });

  afterEach(async () => {
    // users テーブル行を削除
    for (const id of createdUserRowIds) {
      await serviceClient.from("users").delete().eq("id", id);
    }
    createdUserRowIds.length = 0;

    // Auth ユーザーを削除
    for (const id of createdAuthUserIds) {
      await serviceClient.auth.admin.deleteUser(id);
    }
    createdAuthUserIds.length = 0;
  });

  afterAll(async () => {
    // 荷主スコープテスト用の永続データを後始末
    for (const id of createdShipperIds) {
      await serviceClient.from("shippers").delete().eq("id", id);
    }
    createdShipperIds.length = 0;

    // プレフィックス付きテストデータの残骸がゼロであることを確認
    const { data: remainingShippers } = await serviceClient
      .from("shippers")
      .select("id")
      .like("code", `${TEST_PREFIX}%`);
    expect(
      remainingShippers ?? [],
      "後始末後にテスト用荷主が残っています",
    ).toHaveLength(0);
  });

  // ============================================================
  // テストケース 1: 未認証アクセス制御（RLS）
  // ============================================================

  describe("1. 未認証アクセス制御（anon クライアント）", () => {
    it("anon クライアントで shippers を SELECT すると 0 件または permission denied になる", async () => {
      const anonClient = createClient(apiUrl!, anonKey!);
      const { data, error } = await anonClient.from("shippers").select("id");

      // RLS で anon 全許可ポリシーが撤去されているため、
      // エラーになるか、または空配列（行なし）が返る
      if (error) {
        // permission denied 系のエラーが返った場合はテスト通過
        expect(error.code).toBeTruthy();
      } else {
        // エラーなしの場合は 0 件（anon が見える行はない）
        expect(data ?? []).toHaveLength(0);
      }
    });
  });

  // ============================================================
  // テストケース 2: 認証ユーザーのデータアクセス
  // ============================================================

  describe("2. 認証ユーザーのデータアクセス", () => {
    it("signInWithPassword 後は shippers を SELECT できる（RLS 通過）", async () => {
      const email = `${TEST_PREFIX}auth-user@example.com`;
      const password = "TestPass1234!";

      // Auth ユーザー作成
      const authUserId = await createAuthUser(email, password);

      // users テーブルに紐付け（shipper_id = shipperAId で荷主スコープ）
      const roleId = await getAdminRoleId();
      await insertUserRow({
        email,
        name: "テスト認証ユーザー",
        roleId,
        shipperId: shipperAId,
        authUserId,
      });

      // 認証クライアントで signInWithPassword
      const authClient = createClient(apiUrl!, anonKey!);
      const { data: signInData, error: signInError } =
        await authClient.auth.signInWithPassword({ email, password });
      expect(signInError, `ログイン失敗: ${signInError?.message}`).toBeNull();
      expect(signInData.session).not.toBeNull();

      // 認証後に shippers を SELECT → 自社データが見える
      const { data: shippers, error: selectError } = await authClient
        .from("shippers")
        .select("id")
        .eq("id", shipperAId);
      expect(selectError, `SELECT 失敗: ${selectError?.message}`).toBeNull();
      expect(shippers).not.toBeNull();
      expect(shippers!.length).toBeGreaterThanOrEqual(1);

      // サインアウト後は anon に戻る
      const { error: signOutError } = await authClient.auth.signOut();
      expect(signOutError).toBeNull();

      // サインアウト後は再び 0 件または permission denied
      const { data: afterSignOut, error: afterError } = await authClient
        .from("shippers")
        .select("id")
        .eq("id", shipperAId);
      if (afterError) {
        expect(afterError.code).toBeTruthy();
      } else {
        expect(afterSignOut ?? []).toHaveLength(0);
      }
    });
  });

  // ============================================================
  // テストケース 3: 荷主スコープ RLS（shipper_user）
  // ============================================================

  describe("3. 荷主スコープ RLS（shipper_user）", () => {
    it("荷主 A ユーザーは荷主 A のデータのみ参照でき、荷主 B のデータは見えない", async () => {
      const emailA = `${TEST_PREFIX}shipper-a-user@example.com`;
      const password = "TestPass1234!";

      const roleId = await getAdminRoleId();

      // 荷主 A の Auth ユーザーを作成し users テーブルに紐付け
      const authUserAId = await createAuthUser(emailA, password);
      await insertUserRow({
        email: emailA,
        name: "荷主Aユーザー",
        roleId,
        shipperId: shipperAId,
        authUserId: authUserAId,
      });

      // 荷主 A ユーザーでログイン
      const clientA = createClient(apiUrl!, anonKey!);
      const { data: signInDataA, error: signInErrorA } =
        await clientA.auth.signInWithPassword({ email: emailA, password });
      expect(signInErrorA, `荷主A ログイン失敗: ${signInErrorA?.message}`).toBeNull();
      expect(signInDataA.session).not.toBeNull();

      // 荷主 A のデータは見える
      const { data: seenA, error: errA } = await clientA
        .from("shippers")
        .select("id")
        .eq("id", shipperAId);
      expect(errA, `荷主A SELECT 失敗: ${errA?.message}`).toBeNull();
      expect(seenA).not.toBeNull();
      expect(seenA!).toHaveLength(1);
      expect(seenA![0].id).toBe(shipperAId);

      // 荷主 B のデータは見えない（0 件）
      const { data: seenB, error: errB } = await clientA
        .from("shippers")
        .select("id")
        .eq("id", shipperBId);
      expect(errB, `荷主B SELECT でエラー: ${errB?.message}`).toBeNull();
      expect(seenB ?? []).toHaveLength(0);

      await clientA.auth.signOut();
    });

    it("荷主 B ユーザーは荷主 B のデータのみ参照でき、荷主 A のデータは見えない", async () => {
      const emailB = `${TEST_PREFIX}shipper-b-user@example.com`;
      const password = "TestPass1234!";

      const roleId = await getAdminRoleId();

      // 荷主 B の Auth ユーザーを作成し users テーブルに紐付け
      const authUserBId = await createAuthUser(emailB, password);
      await insertUserRow({
        email: emailB,
        name: "荷主Bユーザー",
        roleId,
        shipperId: shipperBId,
        authUserId: authUserBId,
      });

      // 荷主 B ユーザーでログイン
      const clientB = createClient(apiUrl!, anonKey!);
      const { data: signInDataB, error: signInErrorB } =
        await clientB.auth.signInWithPassword({ email: emailB, password });
      expect(signInErrorB, `荷主B ログイン失敗: ${signInErrorB?.message}`).toBeNull();
      expect(signInDataB.session).not.toBeNull();

      // 荷主 B のデータは見える
      const { data: seenB, error: errB } = await clientB
        .from("shippers")
        .select("id")
        .eq("id", shipperBId);
      expect(errB, `荷主B SELECT 失敗: ${errB?.message}`).toBeNull();
      expect(seenB).not.toBeNull();
      expect(seenB!).toHaveLength(1);
      expect(seenB![0].id).toBe(shipperBId);

      // 荷主 A のデータは見えない（0 件）
      const { data: seenA, error: errA } = await clientB
        .from("shippers")
        .select("id")
        .eq("id", shipperAId);
      expect(errA, `荷主A SELECT でエラー: ${errA?.message}`).toBeNull();
      expect(seenA ?? []).toHaveLength(0);

      await clientB.auth.signOut();
    });
  });

  // ============================================================
  // テストケース 4: admin ユーザー（shipper_id IS NULL）
  // ============================================================

  describe("4. admin ユーザー（shipper_id IS NULL で全荷主データ参照可）", () => {
    it("users.shipper_id IS NULL の admin ユーザーは全荷主データを SELECT できる", async () => {
      const emailAdmin = `${TEST_PREFIX}admin-user@example.com`;
      const password = "TestPass1234!";

      const roleId = await getAdminRoleId();

      // shipper_id = null（admin）の Auth ユーザーを作成
      const authAdminId = await createAuthUser(emailAdmin, password);
      await insertUserRow({
        email: emailAdmin,
        name: "管理者ユーザー",
        roleId,
        shipperId: null, // admin: 全荷主参照可
        authUserId: authAdminId,
      });

      // admin ユーザーでログイン
      const adminClient = createClient(apiUrl!, anonKey!);
      const { data: signInData, error: signInError } =
        await adminClient.auth.signInWithPassword({
          email: emailAdmin,
          password,
        });
      expect(signInError, `admin ログイン失敗: ${signInError?.message}`).toBeNull();
      expect(signInData.session).not.toBeNull();

      // 荷主 A・荷主 B 両方が見える
      const { data: shippers, error: selectError } = await adminClient
        .from("shippers")
        .select("id")
        .in("id", [shipperAId, shipperBId]);
      expect(selectError, `admin SELECT 失敗: ${selectError?.message}`).toBeNull();
      expect(shippers).not.toBeNull();
      // 両荷主が見えること
      const ids = shippers!.map((s: { id: string }) => s.id);
      expect(ids).toContain(shipperAId);
      expect(ids).toContain(shipperBId);

      await adminClient.auth.signOut();
    });
  });
});
