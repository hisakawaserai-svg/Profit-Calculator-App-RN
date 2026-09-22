# 通知機能の検証方法（時間依存・到達日ロジック）

## 概要

出品滞留アラート、月次振り返りなど、日数・月経過が必要な通知を実装上で速く検証する方法をまとめたもの。実装はしないこと。

---

## 1. 即座に確認できる方法（8秒テスト通知）

### __DEV__ テストボタンの存在確認

**ボタンの場所**: `app/(tabs)/settings/index.tsx` の `__DEV__ && (...)` セクション（408行～）

**実装状況**:
- ✓ `sendTestNotification()` — 出品滞留アラートのテスト通知
- ✓ `sendTestMonthlyReviewNotification()` — 月次振り返りのテスト通知  
- ✓ `insertNotificationHistorySeed()` — ダミー履歴データ投入
- ✓ `notificationTestCasesSeed?.insertNotificationTestCases()` — 境界値テスト記録投入

### 使い方

1. `npx expo run:ios` または `npx expo run:android` で開発ビルド実行（__DEV__ = true）
2. 設定タブへ移動 → `__DEV__ && (...)` セクションにテストボタンが 4 行ぶん表示される
3. **「通知をテストする」ボタンを押す** → **8秒後に OS 通知が発火**

### 特徴

- **即座**: ボタン押下から 8秒で OS 通知到達（`TEST_NOTIFICATION_DELAY_SECONDS = 8`）
- **本番予約に影響なし**: 開発テスト通知は `pending` に載らず、本番の `rescheduleNotification()` で上書きされない
- **履歴に記録**: 「すべて」タブに即座に表示される
- **リリースビルドでは使えない**: Metro の constantFoldingPlugin で削除される（--dev オプション使用時のみ使用可）

**検証内容**:
- ✓ 通知の許可・トースト・お知らせ画面の動作（既に確認済み）
- ✓ **テスト通知が届くか → 発火ロジック自体の確認**

---

## 2. 実際の到達日を越えて検証する方法（エミュレータ時刻操作）

### 通知の日時計算

出品滞留アラート到達日の計算ロジック（`src/logic/notifications.ts`）:

```typescript
// 出品日（または値下げ日）から N 日後の 9:00
export function listingAlertFireAt(basisDate: Date, thresholdDays: number): Date {
  return new Date(
    basisDate.getFullYear(),
    basisDate.getMonth(),
    basisDate.getDate() + thresholdDays,  // ← 起点 + しきい値日数
    9,  // NOTIFICATION_HOUR
    0, 0, 0
  );
}
```

月次振り返りの計算ロジック:

```typescript
// 現在が月初 9:00 前なら今月、過ぎていれば翌月の 1 日 9:00
export function nextMonthlyReviewFireAt(now: Date): Date {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0, 0);
  if (thisMonth.getTime() > now.getTime()) return thisMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0);
}
```

**フィルタ条件**:

```typescript
// scheduler.ts の upcomingSchedules()
const fireAt = listingAlertFireAt(basisDate, thresholdDays);
if (fireAt.getTime() <= now.getTime()) continue;  // ← 既に過ぎた日時は対象外
```

### 検証フロー

#### Step 1: 開発用テストデータを投入

1. 設定タブの **「境界値テスト記録を投入する」** ボタンを押す
   - `notificationTestCasesSeed.insertNotificationTestCases()` が実行
   - 以下の相対日付でレコード投入（`id = "notiftest-*"`）:
     - 明日（-1日）
     - 今日（0日）
     - 昨日（1日前）
     - しきい値の 1 日前
     - **しきい値ちょうど** ← 到達日は **今朝 9:00**（プレビュー用）
     - しきい値の 1 日後
     - 300 日前（大幅超過、お知らせ「滞留中」用）

2. トースト「境界値テスト記録を XX 件投入しました」で確認

#### Step 2: エミュレータ時刻をしきい値到達日の 9:00 を過ぎた時刻に変更

**iOS Simulator の場合**:
- Simulator menu → Clock に入り、カスタム時刻を設定
- または `xcrun simctl status_bar iPhone14Pro override --time "2026-09-23 09:05:00"`

**Android Emulator の場合**:
- Emulator Control → Extended Controls → Other sensors → Time を変更
- または `adb shell date YYYYMMDD.HHMMSS`

#### Step 3: アプリをバックグラウンドに→フォアグラウンド（AppState 遷移）

予約が再計算・更新されます:

```typescript
// app/_layout.tsx（実装）
const subscription = AppState.addEventListener('change', (nextState) => {
  if (nextState === 'background') {
    rescheduleNotification();  // ← ここで予約を再計算・OS に登録
  }
  if (nextState === 'active') {
    promotePendingNotificationIfDue();  // ← pending を履歴へ昇格
  }
});
```

つまり:
- **バックグラウンド遷移時**: エミュレータ時刻が進んだ状態で、新しい到達日が計算される
- **フォアグラウンド遷移時**: pending のうち発火予定時刻を過ぎたものが履歴に記録される

#### Step 4: 本番 OS 通知を確認

1. **到達日到来**: アプリを戻す際に OS 通知がロック画面に表示
2. **「すべて」タブで履歴確認**:
   - 通知 > 「すべて」タブ → "notiftest-" 接頭辞のレコードが履歴に記録
   - タップすると損益分岐点画面へ遷移

### 月次振り返りの検証

1. エミュレータ時刻を **来月 1 日 9:00 を過ぎた時刻** に設定
   - 例: 現在が 9 月 → 10 月 1 日 09:05 へ
2. アプリをバックグラウンド→フォアグラウンド
3. **「月次振り返り」通知が発火**（タイトル: "9月の振り返り" など）
4. 「すべて」タブで履歴確認 → "monthlyReview" として記録

---

## 3. 開発用ツール：境界値テストデータ

### 自動生成される記録

`src/dev/notificationTestCasesSeed.ts` より：

| レコード | 相対日付 | 説明 |
|---------|--------|------|
| notiftest-tomorrow | -1 日 | 到達日が明日 9:00 |
| notiftest-today | 0 日 | 到達日が今朝 9:00（既に過ぎていれば本番 OS には出ない） |
| notiftest-yesterday | 1 日 | 到達日が昨朝 9:00（過ぎている） |
| notiftest-daybefore | 2 日 | ... |
| notiftest-before-threshold | threshold - 1 日 | まだしきい値に到達していない |
| **notiftest-threshold** | **threshold 日** | **ちょうどしきい値**（到達日 = 今朝 9:00） |
| notiftest-after-threshold | threshold + 1 日 | 既にしきい値を超えている |
| notiftest-300days | 300 日 | 大幅超過（お知らせ「滞留中」用） |

### テストデータの削除

通知テスト後は、同じボタンを再度押すか以下で削除:

```typescript
// dev/seedKit.ts から
removeSeedRows('notiftest-')  // id 接頭辞で一括削除
```

---

## 4. 実装確認ポイント

### a. 端末時刻参照

✓ **最確**: 全ロジック（`listingAlertFireAt()`, `nextMonthlyReviewFireAt()` など）が `Date` を使用
  - エミュレータの時刻変更がそのまま反映される
  - OS ネイティブ通知の予約（`Notifications.scheduleNotificationAsync({ trigger: { type: DATE, date: ... } })`）も同じ

### b. 予約更新タイミング

✓ **検証可能**: `rescheduleNotification()` は以下で呼ばれる:
- AppState background → active 遷移
- 通知許可オン/オフ
- しきい値変更（settings で実装）

### c. 重複通知の回避

✓ **確認方法**: 同じ到達日に複数レコード → 1 通の OS 通知にまとめる
  - テストデータで複数件投入 → OS 上は 1 通、「すべて」タブでは複数行

### d. 月次振り返りとの統合

✓ **確認方法**: 出品滞留アラートの到達日と月初が同じ朝
  - テストレコード + エミュレータ時刻調整 → `kind: 'combined'` 通知が 1 通で届く

---

## 5. リリースビルドでの考慮

### __DEV__ テストボタンの扱い

**ビルド時に削除される**:

```typescript
const sendTestNotification: (() => void) | null = __DEV__
  ? require('@/notifications/scheduler').sendTestNotification
  : null;
```

Metro bundler の処理順:
1. `__DEV__` を false に畳む（inlinePlugin）
2. 定数畳み込み（constantFoldingPlugin） → `null` に確定
3. 依存関係収集 → 不要なモジュール削除

**結果**: リリースビルド（production）には 0 バイト追加、テストボタンは表示されない

### Play Console 公式テスト

本番 OS 通知の到達を確認するには通常の Internal Testing 版（リリースビルド）を使用し、
デバイスの時刻設定（自動）で自然な日数経過を待つしかない。

開発時のみ、__DEV__ ビルド + エミュレータ時刻操作で短時間検証。

---

## 6. まとめ：検証フロー案

### 最小手順（5 分）

1. `npx expo run:ios` で開発ビルド
2. 設定タブ → 「通知をテストする」ボタン
3. 8 秒待機 → OS 通知確認 → 「すべて」タブで履歴確認

**検証内容**: 出品滞留アラート、月次振り返りの基本的な発火ロジック

### 詳細手順（15～20 分、エミュレータ時刻操作含む）

1. 開発ビルド起動
2. 設定タブ → 「境界値テスト記録を投入する」
3. エミュレータ時刻を「しきい値到達日の 9:00 超過」に変更
4. アプリをバックグラウンド→フォアグラウンド
5. ロック画面で OS 通知確認
6. 「すべて」タブで履歴詳細確認
7. 月初に同じ手順 → 月次振り返り + 出品滞留の統合通知確認

**検証内容**: 実際の日付計算、OS 予約、統合通知、履歴記録まで一貫性確認

---

## 参考：コードの場所

| 機能 | ファイル | 行 |
|------|---------|-----|
| テストボタン | `app/(tabs)/settings/index.tsx` | 408~ |
| テスト通知実装 | `src/notifications/scheduler.ts` | 405~440 |
| 日付計算（到達日） | `src/logic/notifications.ts` | 94~104 |
| 日付計算（月初） | `src/logic/notifications.ts` | 225~229 |
| テストデータ生成 | `src/dev/notificationTestCasesSeed.ts` | 68~85 |
| 予約実行 | `src/notifications/scheduler.ts` | 331~341 |
| AppState 監視 | `app/_layout.tsx` | (rescheduleNotification 呼び出し) |
