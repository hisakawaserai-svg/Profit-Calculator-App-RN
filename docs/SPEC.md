# 利益計算アプリ 仕様書（React Native 移植用）

SwiftUI + CoreData 版（本リポジトリ）の全 `.swift` ファイルおよび `MyAppDataModel.xcdatamodeld` から読み取った仕様。
物販（メルカリ等のフリマ販売）の利益計算・出品/売却記録・月次集計・分析グラフを提供する iOS / macOS (Catalyst) アプリ。

- 通貨は日本円。表示は整数円（表示時のみ丸め、保存値は Double のまま）。
- 対象ソース: 全 17 の Swift ファイル + CoreData モデル定義。
- **レコード種別（不用品 / 仕入品）は Swift 版にない RN 版の追加仕様で、決定の経緯と詳細は `docs/SPEC-V2.md` にある。**
  本書には確定した差分だけを反映してあり、`SPEC-V2 §x.y` はその出典を指す。計算式（§2）は種別によって変わらない。
- **UI は 2026-08-10 に全面改訂した（`docs/UI-SPEC.md`）。** 画面構成・タブ構成・遷移・データタブの集計は
  Swift 版から大きく変わっており、本書の §3 と §6 には改訂を反映済み。
  UI の記述が UI-SPEC.md と食い違う場合は **UI-SPEC.md が優先する**。
  §1（データモデル）・§2（計算ロジック）・§5（バリデーション）は改訂の影響を受けていない。

---

## 1. データモデル

CoreData モデル名: `MyAppDataModel`。エンティティは 1 つのみで、リレーションは存在しない。

### エンティティ: `SaleRecordEntities`

| 属性 | 型 | オプショナル | デフォルト値 | 説明 |
|---|---|---|---|---|
| `id` | UUID | ○ | なし | レコード ID。保存時に未設定なら `UUID()` を採番 |
| `itemName` | String | ○ | なし | 商品名 |
| `salesPrice` | Double | ○（scalar） | 0.0 | 販売価格（円） |
| `purchasePrice` | Double | ○（scalar） | 0.0 | 仕入価格（円） |
| `postage` | Double | ○（scalar） | 0.0 | 送料（円） |
| `envelopeCost` | Double | ○（scalar） | 0.0 | 梱包材費（円） |
| `othersCost` | Double | ○（scalar） | 0.0 | その他経費（円） |
| `commission` | Double | ○（scalar） | 0.0 | 手数料**率**（%）。`10.0` = 10%。金額ではない |
| `isSold` | Boolean | ○（scalar） | なし（実質 false） | true = 売却済み / false = 出品中 |
| `saleStartDate` | Date | ○ → **RN 版では必須（NOT NULL）** | なし | 出品日。**決定 §7-11**: RN 版では必須項目とし、新規作成時のフォーム初期値は当日 |
| `saleDate` | Date | ○ | なし | 販売日。**出品中のときは nil**（保存時に強制的に nil 化） |
| `memo` | String | ○ | なし | メモ |
| `kind` | — | — | `'used'` | **RN 版で追加（SPEC-V2 §1.1 / §2.1）**。レコード種別。`'used'` = 不用品 / `'sourced'` = 仕入品の文字列 enum で **NOT NULL**。Swift 版には存在しない列 |

- リレーション: なし。
- **`kind` について（SPEC-V2）**: 種別はレコードの属性であり、アプリ全体のモードではない。同一リスト内に両種別が混在する。既存行への追加は `drizzle/0001_curvy_christian_walker.sql` で `ALTER TABLE ... ADD COLUMN` ＋ バックフィル（`purchase_price > 0` → `'sourced'`、それ以外 → `'used'`）を行う（SPEC-V2 §2.2）。種別フィルタ用のインデックスは追加しない（SPEC-V2 §2.3）。
- `usesScalarValueType="YES"` の数値属性は Swift 上では非オプショナルの `Double`/`Bool` として扱われる（nil にならず 0 / false）。
- 計算プロパティ（extension、DB には保存されない）: `netProfit`、`totalExpenses`（§2 参照）。

### 永続化の設定（PersistenceController）

- `NSPersistentContainer(name: "MyAppDataModel")`、単一ストア。
- `viewContext.automaticallyMergesChangesFromParent = true`
- `mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy`（競合時は新しい入力を優先して上書き）。
- iCloud 同期なし（`NSPersistentCloudKitContainer` 不使用）。

---

## 2. 計算ロジック

### 2.1 変数定義

| 変数 | 意味 |
|---|---|
| `salesPrice` | 販売価格 |
| `purchasePrice` | 仕入価格 |
| `postage` | 送料 |
| `envelopeCost` | 梱包材費 |
| `othersCost` | その他経費 |
| `commission` | 手数料率（% 単位の実数。10 = 10%） |
| `targetProfit` | 目標利益（逆算タブの入力値） |

**レコード種別（`kind`）は計算式に一切入らない（SPEC-V2 §1.2）。** 不用品は `purchasePrice = 0` になるだけで、
`netProfit` / `totalExpenses` / `requiredSalesPrice` の式は種別によらず同一。種別で変わるのは表示ラベルと入力欄の出し分けのみ。

### 2.2 手数料額

```
commissionCost = salesPrice × (commission / 100)
```

- **丸めなし**。Double のまま保持（例: salesPrice=999, commission=10 → 99.9）。
- 実サービス（メルカリ等）のような「手数料は1円未満切り捨て」等の処理は**存在しない**。
- **TODO（§7-4 で保留）**: 実サービスの手数料端数処理（1 円未満切り捨て等）に合わせるかは未決定。RN 版でも当面は丸めなしのまま移植する。

### 2.3 純利益（netProfit）

```
netProfit = salesPrice − (purchasePrice + postage + envelopeCost + othersCost + commissionCost)
```

### 2.4 経費合計（totalExpenses）

```
totalExpenses = purchasePrice + postage + envelopeCost + othersCost + commissionCost
```

（つまり `netProfit = salesPrice − totalExpenses`。手数料は経費に含まれる。）

この式は 2 箇所に重複実装されており、内容は同一:
- `SaleRecordEntities` の extension（保存済みレコード用）
- `MercariCalcData` 構造体（CalcView のシミュレーション用。プロパティ名は `NetProfit` と大文字始まり）

### 2.5 目標利益からの逆算（必要販売価格）

CalcView「目標利益逆算」タブ。`TargetProfitView.requiredSalesPrice`:

```
costs = purchasePrice + postage + envelopeCost + othersCost   // 手数料以外の経費
requiredSalesPrice = Math.ceil( (targetProfit + costs) / (1 − commission / 100) )
```

- 導出: `targetProfit = P − costs − P×(c/100)` を販売価格 `P` について解いたもの。
- **丸め（決定 §7-3）: RN 版では `Math.ceil`（切り上げ）に変更する。** Swift 版は `Int()` 切り捨てだったが、切り捨てだと表示された価格で売ったときの実利益が目標をわずかに下回り得る。切り上げにすることで「表示価格で売れば必ず目標利益以上になる」ことを保証する。
- この丸めは逆算結果のみの例外。それ以外の表示丸めは §2.6 の `Math.round` に従う。
- `commission` は CalcView では `Stepper` で 0〜50% (整数刻み) に制限されるため、分母 0（100%）は UI 上発生しない。
- `targetProfitInput` が数値に変換できない場合は 0 として扱う。負数チェックなし。

### 2.6 端数処理の全体方針（RN 版の確定仕様）

- **保存値・計算中間値はすべて Double（JS では number）のまま。丸めは「表示の瞬間」のみ。**（Swift 版と同じ）
- **表示時の丸め（決定 §7-5）: アプリ全体で `Math.round`（四捨五入）に統一する。負値も同様に `Math.round` を使う。**
  - Swift 版は `Int()` キャスト（0 方向切り捨て）だったが、RN 版では変更する。
  - 例: 99.9 → 100、99.4 → 99、−99.9 → −100
  - 注意: JS の `Math.round` は「.5 ちょうど」を常に +∞ 方向へ丸める（`Math.round(99.5) = 100`、`Math.round(-99.5) = -99`）。この挙動をそのまま仕様とする。
  - 唯一の例外は逆算結果 `requiredSalesPrice` の `Math.ceil`（§2.5）。
- **集計時の丸めタイミング（決定 §7-2）: 「Double で合算 → 表示時に丸め」`Math.round(Σ netProfit)` に全画面で統一する。**
  - Swift 版で唯一異なっていた `MonthlySummaryCard`（各レコードを切り捨ててから合算）も、RN 版ではこの方式に変更する。
  - これにより月カード・下部累計・DataView の表示額の不整合は解消される。
- **桁区切り**: 「¥」表記（`formatYenSymbol` / `formatSignedYenSymbol` / `formatApproxYenSymbol`）は
  **3 桁区切りを入れる**（`¥12,685`）。5 桁を超えると区切りなしでは桁が数えられないため。
  区切りを入れるのは**丸めたあとの表示文字列を組み立てる瞬間だけ**で、丸めの規則も集計値も変えない。
  「N 円」表記（`formatYen` / `formatYenTight`）と電卓（`formatCalcTotal` / `formatUnitYen`）は
  区切りなしのまま（Swift 版に合わせる）。
  - **CSV 書き出し（SPEC-V3 §5・未実装）には桁区切りを入れない。** `"12,685"` は表計算ソフトが
    数値として読めず、区切り文字とも衝突する。CSV は素の数値を書く。

---

## 3. 画面一覧と遷移

### 3.1 タブ構成（RN 版・4 タブ。UI-SPEC §6-8）

| # | タブ名 | 画面 | 役割 |
|---|---|---|---|
| 1 | 計算 | `app/(tabs)/index.tsx` | 出品前の利益シミュレーション・逆算 |
| 2 | 記録 | `app/(tabs)/records/index.tsx` → `RecordListScreen` | 出品中／売れた記録の一覧（状態はチップで切替） |
| 3 | データ | `app/(tabs)/data.tsx` → `DataScreen` | 売却済みデータのグラフ分析 |
| 4 | 設定 | `app/(tabs)/settings/index.tsx` | 既定値・使いかた・書き出し |

<details>
<summary>Swift 版のタブ構成（5 タブ・移植元）</summary>

| # | タブ名 | アイコン | View | 役割 |
|---|---|---|---|---|
| 1 | 計算 | function | `CalcView` | 出品前の利益シミュレーション・逆算 |
| 2 | 出品中 | shippingbox | `MonthlyRecordList(isSoldMode: false)` | 在庫（出品中）の月別一覧 |
| 3 | 実績 | yensign.circle | `MonthlyRecordList(isSoldMode: true)` | 売却済みの月別一覧 |
| 4 | データ | chart.bar | `DataView` | 売却済みデータのグラフ分析 |
| 5 | ヘルプ | questionmark.circle | `HelpView` | 静的な使い方ガイド |

`ContentView` はタブ間で共有する `@State editingRecord: SaleRecordEntities?` を保持し、`CalcView` に Binding で渡す。

</details>

**RN 版での変更点（UI-SPEC §6-8 / §6-9）**:
出品中タブと実績タブは「記録タブ」1 つに統合し、状態は合計行のチップで切り替える。
月別詳細画面（`SaleRecordView`）は廃止し、一覧から詳細へ 1 タップ。
ヘルプタブは設定タブ配下へ降ろし、空いた枠に設定タブを昇格させた。

### 3.2 各画面

#### CalcView（計算タブ）
- 入力: 販売価格 / 仕入れ価格 / 送料 / 梱包材 / その他（文字列入力、数字と `.` のみ許可）、手数料 Stepper（Int、0〜50、初期値 10）。
- サブタブ（SegmentedPicker）: 「純利益表示」(`ResultView` — 純利益の大表示＋収益内訳) / 「目標利益逆算」(`TargetProfitView`)。
- 逆算タブ選択中は販売価格入力欄が `disabled`。
- ツールバー: リセット（全入力クリア、手数料 10 に戻す）、＋ボタン（Swift 版は `prepareNewRecord` で新規 `SaleRecordEntities` をコンテキストに即 insert してから `RecordFormView` をシート表示。**決定 §7-7: RN 版では即 insert せず、現在の入力値をフォーム初期値としてメモリ上で渡し、保存時にのみレコードを作成する**）。
- 各数値欄の右に電卓ボタン → `MiniCalculatorView` を popover 表示。
- レイアウト: iPad/Mac（sizeClass regular か nil）は入力＋結果の 2 ペイン、iPhone は縦 1 カラム。
- **RN 版の追加（SPEC-V2 §1.3 / §1.4）**:
  - 種別セレクタ（不用品 / 仕入品）を**入力カードの直上**に置く。これは**画面ローカルの state**（レコードではない）で、初期値は設定の既定種別（UI-SPEC §5-1）。
  - 不用品のときは「仕入価格」入力欄と収益内訳の「仕入価格」行を**非表示**にし、値は 0 として計算する。
  - 結果側のセグメント名は種別で変わる:「純利益を出す」（不用品）/「利益を出す」（仕入品）。逆算側は「目標から逆算」で種別によらない。逆算入力行のラベルは「目標の純利益 / 目標利益」（SPEC-V2 §5.3 / UI-SPEC §6-4）。
  - クリアは金額をクリアしたうえで、**種別も設定の既定値に戻す**。入力が空のときは無効（UI-SPEC §5-8）。
  - 「この内容で記録する」は**画面で選択中の種別**をフォームの初期値として引き継ぐ（設定の既定種別ではない）。
- **UI 全面改訂での変更（UI-SPEC §1.1 / §6-7）**:
  - 結果を画面上部に大きく置き、スクロールすると上部の 1 行バーに縮小固定する。
  - 逆算は結果カード内の対等な 2 択に格上げ（サブタブではなくカード先頭のセグメント）。
  - 記録への導線は下端固定の大ボタン「この内容で記録する」。ヘッダの＋は廃止。
  - **歯車ボタンは置かない**（設定はタブへ昇格）。ヘッダは「？」のみ。
  - 梱包材・その他は折りたたみに入れる。

#### RecordListScreen（記録タブ。RN 版で統合。UI-SPEC §1.2 / §6-9）

Swift 版の `MonthlyRecordList`（出品中 / 実績の 2 タブ）と `SaleRecordView`（月別詳細）を **1 画面に統合**した。
月はセクションではなく**フィルタ**になり、一覧からレコード詳細まで 1 タップで到達する。

- 上部固定は 3 段: ヘッダ（記録 / ⌕ ⇅ ？）／月バー（`◀ YYYY年M月 ▾ ▶`）／合計行。
- 月バー中央タップで期間シート（全期間 / 各月）。初期表示は今月。今月では ▶、データのある最古の月では ◀、全期間中は両方を無効化（UI-SPEC §5-14）。年月ホイールは廃止（**決定 §7-12 の年範囲の縮小は期間シートの選択肢生成に読み替える**）。
- 合計行は状態で出し分ける: 売れた記録 =「この月の収支 / 全期間の収支」＋「経費」、出品中 =「出品中 N 点」＋「出品価格の合計」。右端に状態チップと種別チップ（SPEC-V2 §4.3 / §5.3）。
- 状態（売れた記録 ⇄ 出品中）は合計行の**状態チップ**で切り替える。タブでは分けない。
- リストはその期間のレコードをフラットに並べる。行タップ → レコード詳細へプッシュ遷移。
- ＋ボタンは画面左下に浮かせる（「＋ 記録」）。
- 検索は ⌕ タップでヘッダ行を検索フィールドに差し替える（常時表示の検索バーは置かない。UI-SPEC §5-10）。
- 並び替えシート（⇅）の先頭に「絞り込みをすべて解除」を置く。
- 0 件のときは空表示（絞り込み中は「条件に合う記録がありません」＋解除リンク）。
- **月次サマリーカード（`MonthlySummaryCard`）と画面下部の累計（`CareerSummarySection`）は廃止**し、上部の合計行 1 本に集約する。
- **行の表示（SPEC-V2 §1.3 / §5.3 / UI-SPEC §6-1 / §6-2）**: 金額ラベルは付けない（金額のみ・色で正負）。メタ行の左に「{種別}　M/D 販売」、右に「経費 ¥…」。出品中は主金額が**出品価格**、メタ行の右が「売れたら 約¥…・N 日経過」になる。見込み額には常に「約」を付ける（UI-SPEC §5-3）。経過日数は出品日起算・当日 0 日（UI-SPEC §5-2）。
- **種別フィルタ（SPEC-V2 §4.2）**: 合計行の右端のチップで「すべて → 不用品 → 仕入品」を巡回。リスト本体と合計行の両方に効く（検索は従来どおり合計に効かせない）。並び替えの「純利益 ↑↓」は「収支 ↑↓」に改称。

#### SaleRecordDetailView（レコード詳細）
- 表示: `SaleStatusToggleCard`（出品中⇔売却済みトグル。ONにすると `saleDate = 今日` で即保存、OFFで `saleDate = nil`）/ 商品情報カード / 費用内訳カード / メモカード。
- 削除は**確認アラート**「削除しますか？」（キャンセル / 削除）→ 削除して dismiss。
- **RN 版の追加（SPEC-V2 §1.3）**: 種別の変更 UI はここに置かず、編集フォーム経由のみとする（売却トグルのような 1 タップの誤操作を避けるため）。費用の「仕入価格」行は不用品では非表示。
- **UI 全面改訂での変更（UI-SPEC §1.4 / §5-12 / §5-13）**:
  - 商品情報カードと費用内訳カードを**1 枚のレシートカード**に統合する。上から 販売価格 → −仕入価格（仕入品のみ）→ −送料 → −販売手数料 → −梱包材・その他 → 太線 → 「純利益 / 利益」＋額。
  - 種別は独立した行ではなく、商品名の上のメタ行に出す:「{状態バッジ} {種別} ・ 8/2 出品 → 8/9 販売（7日）」。
  - **下部の 1 件サマリー（`CareerSummarySection`）は廃止**。レシートカードの結果行が同じ役割を果たす。
  - 編集・削除はツールバーではなく**下端の操作列**（「編集する」／「削除」）にまとめる。
  - 売却トグルはメタ行の状態バッジと併存させる（バッジ = 状態の表示、トグル = 状態を変える唯一の手段）。

#### RecordFormView（新規追加 / 編集フォーム。各画面からシート表示）
- 入力: 商品名 / 販売価格 / 仕入価格 / 送料 / 梱包材 / その他 / 手数料 Stepper（Double、0〜50、初期 10）/ 出品日 DatePicker / 販売済みトグル / （売却済み時のみ）販売日 DatePicker / メモ（複数行）。
- タイトル: `editingRecord` の itemName が空なら「新規追加」、それ以外は「編集」。
- 保存 / キャンセルの挙動は §5 参照。
- **RN 版の追加（SPEC-V2 §1.3 / §1.4 / §1.5）**: 不用品では「仕入価格」欄を非表示にする。新規作成時の初期種別は設定の既定値（計算タブから開いたときは計算タブで選択中の種別）、編集時はそのレコードの `kind`。**仕入品 → 不用品に切り替えたときは、欄が消える前に仕入価格をその場で 0 にクリアする**（確認ダイアログは出さない。値を保持したまま非表示にはしない）。不用品 → 仕入品では空欄の入力欄が現れ、他の値は変えない。必須項目は従来どおり商品名のみ。
- **UI 全面改訂での変更（UI-SPEC §1.3 / §5-11 / §6-6）**:
  - **伝票（レシート）型**にする。1 枚のカードに 商品名 → 種別セレクタ → 販売価格 → −仕入価格（仕入品のみ）→ −送料 → −手数料 → ＋梱包材・その他 → 太線 → 結果 の順で縦に積む。
  - **種別セレクタは伝票カード内・商品名の直下**に置く（仕入価格行と同じカード内にあるため、切替時に値が 0 になる変化がその場で見える。SPEC-V2 §1.5 の要件）。
  - 販売済みの切替は伝票カードの見出し行に置く（左に状態ドット＋状態名、右に切替リンク）。上端に 2 択ボタンは置かない。
  - 出品日・販売日は伝票カードの下の日付カードへ。メモは折りたたみ。

#### DataView（データタブ）
- §6 参照。

#### HelpScreen（使いかた。RN 版では設定タブ配下）
- 静的な DisclosureGroup 3 セクション（利益計算機について / 出品と売却のルール / 記録の整理と分析）。データ処理なし。
- **RN 版の追加（SPEC-V2 §1.3 / §6.1）**: 「記録の種別について」セクションを 2 番目に追加する。内容は ①不用品と仕入品のちがい ②「純利益 / 利益 / 収支」の使い分け ③経費の範囲の注記「本アプリの純利益は梱包材やその他の経費も差し引いた額のため、販売サイトに表示される金額より少なくなることがあります」 ④既定種別の設定場所（設定タブ →「記録の既定値」→「種別」）の 4 項目。いずれも静的文言のみ。
- **UI 全面改訂での変更（UI-SPEC §5-9 / §6-8）**: ヘルプタブは廃止し、`app/(tabs)/settings/help.tsx` へ移す。各画面の右上の「？」からは `HelpScreen` を**シート表示**し、開く節を props で渡してその節を開いた状態で描画する（タブをまたぐ push を避けるため）。設定タブの「使いかた」だけが push。

#### 設定タブ（RN 版で新規。SPEC-V2 §3.1 / §3.3、UI-SPEC §1.6）
- **タブとして独立する**（`app/(tabs)/settings/index.tsx`）。計算タブの歯車は廃止（UI-SPEC §6-7）。
- 項目は上から: 使いかた ▸ ／「記録の既定値」（種別・手数料）／「入力を減らす（今後）」（梱包材の登録・手数料のプリセット。いずれも準備中・非活性）／「データ」（書き出し CSV = 準備中・非活性、記録の件数）／バージョン表記。
- 設定値は `expo-sqlite/kv-store` に保存し（同期読み出し）、不正値・未設定は既定値にフォールバックする（種別は `'used'`）。
- 設定が決めるのは**これから作るレコードの初期値だけ**で、保存済みレコードの `kind` は書き換わらない（SPEC-V2 §3.4）。
- 設計案にあった「送料（前回の値を使う）」は挙動が未定義のため**今回は実装しない**（UI-SPEC §5-6。IMPROVEMENTS.md に記録）。

#### MiniCalculatorView（共通部品・popover）
- 四則演算の簡易電卓。Swift 版は `NSExpression` で式を評価。**決定 §7-13: RN 版は `expr-eval` 等の軽量ライブラリで評価する。**
- 結果が整数なら小数なし、小数が出たら小数第 1 位まで表示。「この数字を入力する」で親の入力欄 String に書き戻す。

### 3.3 遷移図

RN 版（4 タブ）。詳細と根拠は UI-SPEC §2。

```
TabView（4 タブ）
├─ 計算: app/(tabs)/index.tsx
│    ├─(この内容で記録する)──> [sheet] RecordFormSheet（種別を引き継ぐ）
│    └─(？)──> [sheet] HelpScreen（計算の節）
├─ 記録: app/(tabs)/records/index.tsx → RecordListScreen
│    ├─(行タップ)──> [push] records/[id].tsx → SaleRecordDetailScreen
│    │    ├─(編集する)──> [sheet] RecordFormSheet
│    │    ├─(削除)──────> [alert] 削除確認
│    │    └─(？)────────> [sheet] HelpScreen（記録の節）
│    ├─(＋ 記録)──> [sheet] RecordFormSheet
│    ├─(⌕)──────> ヘッダ行を検索フィールドに差し替え（画面内）
│    ├─(⇅)──────> [sheet] 並び替え（先頭に「絞り込みをすべて解除」）
│    └─(月バー中央)──> [sheet] 表示する期間（全期間 / 各月）
├─ データ: app/(tabs)/data.tsx → DataScreen
│    ├─(棒タップ)──> 当日の一覧（画面内）
│    ├─(行タップ)──> [push] レコード詳細（記録タブと同じ [id] ルート）
│    ├─(月バー中央)──> [sheet] 表示する期間
│    └─(？)──> [sheet] HelpScreen（データの節）
└─ 設定: app/(tabs)/settings/index.tsx
     └─(使いかた)──> [push] settings/help.tsx → HelpScreen
```

<details>
<summary>Swift 版の遷移図（移植元）</summary>

```
TabView
├─ 計算: CalcView ──(＋)──> [sheet] RecordFormView
├─ 出品中: MonthlyRecordList(isSold=false) ─┐
├─ 実績:   MonthlyRecordList(isSold=true) ──┤
│    ├─(＋)──> [sheet] RecordFormView       │
│    ├─(カレンダー)──> [sheet] 年月ピッカー   │
│    └─(月セクションタップ)──> [push] SaleRecordView
│         ├─(＋)──> [sheet] RecordFormView
│         └─(行タップ)──> [push] SaleRecordDetailView
│              ├─(ペン)──> [sheet] RecordFormView
│              └─(ゴミ箱)──> [alert] 削除確認
├─ データ: DataView（遷移なし）
└─ ヘルプ: HelpView（遷移なし）
```

</details>

### 3.4 表示用語（RN 版。SPEC-V2 §5.3 の確定ラベル表）

「1 件を指すときは種別語、2 件以上の合計は中立語」で使い分ける。表示語は `src/logic/labels.ts` に集約し、
画面ごとに文字列を持たない。**内部の識別子（`netProfit` / `totalNetProfit` / `SortTypeMonthly` の `profitDesc` 等）は改名しない。**

| 対象 | ラベル |
|---|---|
| 不用品レコード 1 件の `netProfit` | 純利益 |
| 仕入品レコード 1 件の `netProfit` | 利益 |
| 複数レコードの `Σ netProfit`（合計行 / グラフ / 並び替え名） | 収支 |
| `totalExpenses`（1 件・合計とも） | 経費 |
| `salesPrice` | 販売価格（データタブの集計は「売上」） |
| `commissionCost` | 販売手数料 |
| 計算タブの逆算入力 | 不用品「目標の純利益」/ 仕入品「目標利益」 |
| 計算タブの逆算結果 | 必要な販売価格 |
| 計算タブのセグメント（結果側） | 不用品「純利益を出す」/ 仕入品「利益を出す」 |
| 計算タブのセグメント（逆算側） | 目標から逆算（種別で変えない） |
| 出品中レコード 1 件の `salesPrice` | 出品価格 |
| 出品中の `Σ salesPrice`（合計行） | 出品価格の合計 |
| 出品中レコード 1 件の見込み `netProfit` | 売れたら 約¥…（常に「約」を付ける） |

- **「手取り」はアプリ内のどこでも使わない（SPEC-V2 §1.2 / §7-8）。** 販売サイトが表示する「手取り」は梱包材費やその他経費を含まず、
  本アプリの計算結果と食い違うため。この食い違いはヘルプの注記で明示する（§3.2 HelpScreen）。
- 月内が片方の種別だけのときに合計を種別語にする「動的ラベル」は採用しない（データが 1 件増えるだけでラベルが変わるため）。
- **一覧行（`RecordRow`）には金額ラベルを付けない**（金額のみ・色で正負。UI-SPEC §6-2）。
  代わりにメタ行へ種別名を出す（UI-SPEC §6-1）。上表の「純利益 / 利益」は記録フォーム・レコード詳細・計算タブの結果行で使う。
- 出品中の語（出品価格 / 出品価格の合計 / 売れたら）は 2026-08-10 の追加（SPEC-V2 §5.3 / UI-SPEC §6-3）。
- データタブの指標セグメント（`metricLabel`）は指標切替の廃止に伴い削除する（UI-SPEC §6-10）。

---

## 4. 状態管理

### 4.1 SaleRecordViewModel（ObservableObject）

| state | 型 | 初期値 | 役割 |
|---|---|---|---|
| `searchText` | `@Published String` | `""` | 商品名の部分一致検索（大文字小文字無視、localized） |
| `sortType` | `@Published SortTypeMonthly` | `.saleDateDesc` | **月グループ間**の並び順 |
| `selectedDate` | `@Published Date?` | `nil` | 月フィルタ。nil = 全期間。`setTargetMonth(_:)` でその月の 1 日 0:00 に正規化して格納 |

`SortTypeMonthly`（8 種、rawValue は日本語ラベル）: 販売日新/古、出品日新/古、利益高/低、経費高/低。

メソッド `filteredAndGrouped(from:isSoldMode:)` の処理順:
1. **フィルタ**: `isSold == isSoldMode` ∧ 月一致（`selectedDate` があれば基準日と年月比較） ∧ 商品名検索。基準日は sold なら `saleDate`、未売却なら `saleStartDate`（nil は `distantPast` 扱い）。
2. グループ内を基準日の降順でソート（sortType に関わらず固定）。
3. 基準日の年月（月初日）をキーに Dictionary でグループ化。
4. **月グループ同士**を `sortType` でソート（日付系はキー比較、利益/経費系は月内合計 `Σ netProfit` / `Σ totalExpenses` の比較）。

### 4.2 ViewModel インスタンスと利用箇所の対応

**重要: ViewModel は共有されていない。** 各利用箇所がそれぞれ独自インスタンスを生成する（SaleRecord.swift のコメントには「親と同じインスタンスを共有」とあるが、実装は `@StateObject private var viewModel = SaleRecordViewModel()` で毎回新規生成 → §7）。

| View | インスタンス | 使う state / メソッド |
|---|---|---|
| `MonthlyRecordList` | 自前の `@StateObject` | `searchText`（検索バー直結）/ `sortType`（ソートメニュー）/ `selectedDate`（年月ピッカー・リセット）/ `filteredAndGrouped` |
| `SaleRecordView` | 自前の `@StateObject` | `filteredAndGrouped`（グループ化のみ）/ `setTargetMonth`（onAppear で親から渡された月を設定）。検索・ソートは ViewModel を使わず **View ローカルの @State**（`searchText`, `sortType: SortType` 6 種）で別実装 |
| `CareerSummarySection`（targetMonth 指定時） | init 内で一時生成 | `setTargetMonth` + `filteredAndGrouped` で月絞り込みし合計を計算 |

### 4.3 主な View ローカル state（移植時に必要なもの）

- `ContentView`: `editingRecord`（CalcView と共有）。
- `CalcView`: 5 つの金額入力 String、`commissionValue: Int = 10`、`selectedTab`（0=純利益/1=逆算）、`targetProfitInput`、`showingForm`。
- `MonthlyRecordList`: `selectedYear`/`selectedMonth`（初期値=今日）、`showCalendar`、`showingForm`、`editingRecord`、`isResetting`。
- `SaleRecordView`: `sortType`（初期 `.saleDateDesc`）、`searchText`、`selectedDate`、`showCalendar`、`showingForm`、`refreshID`（フォーム閉時にリスト強制再描画）。
- `RecordFormView`: 全入力項目の一時 @State（onAppear で `editingRecord` から読み込み）、`isPushedSave`。
- `DataView`: `startDate`（初期=7日前）/`endDate`（初期=今）/`isAllPeriod`/`chartType`/`metricType`、チャート内 `selectedDate`。

上は Swift 版の内訳。**RN 版では画面構成が変わっている**（§3.1 / §3.2）ため、対応は次のとおり:

- `MonthlyRecordList` + `SaleRecordView` → `RecordListScreen` 1 つ。state は
  `periodKey`（選択中の年月 or 全期間、初期値 = 今月）、`isSoldMode`（状態チップ）、`kindFilter`、
  `sortType`、`searchText`、`isSearching`（⌕ でヘッダを検索フィールドに差し替え中か）、`showingForm`。
  `selectedYear`/`selectedMonth`/`showCalendar`/`isResetting` は期間シートに統合されて不要になる。
- `DataView` → `DataScreen`。`startDate`/`endDate`/`isAllPeriod`/`chartType`/`metricType` は廃止し、
  `periodKey`（記録タブと同じ型）とチャート内の `selectedKey` だけになる（§6.2 / UI-SPEC §6-10）。
- `CalcView` の `selectedTab` は結果カード内のセグメント（`calcMode: 'profit' | 'target'`）になる。
  スクロール固定バー用に `scrolled`、内訳の開閉（結果カード側と固定バー側で別）も持つ。

**RN 版で追加される state（SPEC-V2 §1.3 / §4.2）**: 計算タブの `kind`（初期値 = 設定の既定種別。クリアでもここへ戻る）、
記録フォームの `kind`、記録タブ・データタブの種別フィルタ（`'all' | 'used' | 'sourced'`、初期値 `'all'`）。
種別フィルタは画面ごとに独立で、画面間で共有しない（検索・ソートと同じ扱い。§7-1 の決定に揃える）。

---

## 5. バリデーションとエラー表示

### 5.1 数値入力のフィルタリング（CalcView / RecordFormView 共通）

- `onChange` で入力文字列から `0-9` と `.` **以外を即座に除去**（それ以外の文字は入力欄に残らない）。エラーメッセージは出ない。
- **決定 §7-9**: RN 版では加えて**小数点を 1 個までに制限**する。正規表現でフィルタし（許容形式: `/^\d*\.?\d*$/`）、2 個目以降の `.` は入力段階で除去する。これにより `1.2.3` のような不正形式は発生しない。
- 数値化は `Double(text) ?? 0` 相当（空文字・`.` のみは 0 扱い）。
- 上限・下限・桁数チェックなし。

### 5.2 RecordFormView の保存バリデーション

- 条件: **商品名（itemName）が空文字のとき保存不可**。`saveAndDismiss()` が早期 return し、シートは閉じない。DB 書き込みも行われない。
- 表示: 保存ボタン押下で `isPushedSave = true` になり、商品名欄に
  - 赤枠（`RoundedRectangle` の赤 stroke、線幅 1）
  - 欄の下に赤字キャプション **「⚠️ 商品名を入力してください」**
  が表示される。`isPushedSave` フラグを受け取るのは商品名欄のみで、他の欄には警告は出ない。
- 商品名以外に必須項目はない（金額 0・メモ空で保存可）。
- 保存時の正規化:
  - `id` 未設定なら `UUID()` を採番。
  - `isSold == false` なら `saleDate = nil` に強制。`isSold == true` で saleDate が nil なら `Date()`（現状のフローでは到達しない防御コード）。
  - **RN 版で追加（SPEC-V2 §2.4）: `kind == 'used'`（不用品）なら `purchasePrice = 0` に強制する。** フォーム側でも種別切替時にクリアするが（§3.2 RecordFormView）、DB に入る値の保証は repository（`toRow()`）の責務とする。`saleDate` の正規化と同じ方針で、UI は見た目、repository は不変条件を受け持つ。これにより「不用品なのに仕入価格が入っている行」はアプリ経由では作られない。
- CoreData の save 失敗時: `print` のみで **UI 上のエラー表示なし**、シートは開いたまま。

### 5.3 キャンセル時の挙動

- Swift 版: 新規作成中（`editingRecord.itemName` が空 = isNew）にキャンセルした場合、コンテキストに insert 済みの一時レコードを delete してから閉じる。
- **決定 §7-7**: RN 版では＋ボタンでの即 insert を廃止し「保存時にのみレコード作成」とするため、**キャンセル時の delete 処理は不要（廃止）**。キャンセルは単にフォームを閉じるだけでよい。
- 編集中のキャンセルは変更を書き込まず閉じるのみ（一時変数方式のため rollback 不要）。

### 5.4 削除の確認

- `SaleRecordDetailView`: アラート「削除しますか？」で確認後に削除。
- `SaleRecordView` のスワイプ削除: **確認なし**で即削除・save。失敗時は `print` のみ。

---

## 6. 月次集計・分析の仕様

### 6.1 記録タブの期間集計

**UI 全面改訂で月セクションは廃止**し、選択中の期間 1 本の合計を上部の固定行に出す（UI-SPEC §1.2 / §6-9）。
グループ化ではなく**フィルタ**になったため、Swift 版の月次グループ集計はこの節に置き換わる。

- **対象**: `isSold == isSoldMode`（状態チップの選択）のレコード。加えて検索文字列・選択期間・種別フィルタ（SPEC-V2 §4.2）適用後のもの。
- **期間キー**: 売れた記録 = `saleDate` の年月 / 出品中 = `saleStartDate` の年月。月は端末ローカルのタイムゾーン・暦で判定する（`substr(date, 1, 7)` の前提。§1）。**決定 §7-11 により `saleStartDate` は必須**なので、基準日 nil のレコードは発生しない。
- **合計行の集計値**（Swift 版の月カード・下部累計を統合したもの）:
  - `Math.round(Σ netProfit)` / `Math.round(Σ totalExpenses)`（Double で合算 → 表示時に四捨五入）。**決定 §7-2 / §7-5**（Swift 版は各レコードを切り捨ててから合算していた）。
  - 収支は正なら緑・負なら赤。経費は正なら赤。
  - **出品中のときは値が変わる**: 件数（N 点・オレンジ）と `Math.round(Σ salesPrice)`（出品価格の合計・青）。売れていないため収支・経費は出さない（IMPROVEMENTS.md「出品中の合計表示」）。
- **期間フィルタ**: 期間シートで選んだ「年月」との**完全一致**（年 AND 月）、または「全期間」。期間指定（範囲）はない。初期値は今月。
- **画面下部の累計（`CareerSummarySection`）は廃止**（合計行に一本化）。
- **種別フィルタ（RN 版で追加。SPEC-V2 §4.1 / §4.2 / §4.3）**: 「すべて / 不用品 / 仕入品」の 3 択で、リスト本体・月カード・下部累計のすべてに同じように効く（`buildWhere()` に `kind` 条件を 1 つ足すだけで、集計式は変えない）。
  - 集計値の表示語は中立語「収支 / 経費」。種別が混ざり得るため、月カードや累計に種別語（純利益 / 利益）は使わない（SPEC-V2 §5.3）。
  - **種別ごとの内訳を常時 2 系統で出すことはしない**（`GROUP BY kind` の集計関数も作らない）。片方が 0 のカードを量産して可読性が落ちるため、分離はこのフィルタで代替する。実際に使ってから内訳表示の要否を判断する（SPEC-V2 §4.1 / §7-5）。

### 6.2 DataView（分析グラフ）の集計

**UI 全面改訂で指標切替・表示単位切替・期間の自由指定を廃止した**（UI-SPEC §5-5 / §6-10）。
期間の選び方は記録タブと同じ月バー＋期間シートに統一する。

- **対象レコード**: `isSold == true` かつ `saleDate != nil` のみ（出品中は一切含まれない）。**RN 版ではさらに種別フィルタが掛かる**（SPEC-V2 §4.2。フィルタ UI は合計行の右端の種別チップ）。
- **期間**: 選択中の年月との**完全一致**、または「全期間」。記録タブと同じ期間シートで選ぶ（UI-SPEC §1.5）。
  - 初期値は今月。月バーの ◀▶ で 1 か月ずつ移動する（今月で ▶、最古の月で ◀、全期間中は両方を無効化）。
  - **廃止**: `startDate` / `endDate` の自由指定、表示単位ごとの期間リセット幅、単位ぶんの平行移動。
- **合計行（期間内合計）**: `totalSales = Σ salesPrice`（売上・青）/ `totalNetProfit`（収支・緑）/ `totalExpenses`（経費・赤）の 3 値を常時表示。表示時に `Math.round`（§2.6）。
- **刻み（旧・表示単位）**: 期間から自動で決まる。**月を選択 = 日ごと / 全期間 = 月ごと（対象の月数が 36 を超えたら年ごと）**の 3 分岐。
  いま何で刻んでいるかは凡例の語で示すだけで、切替 UI は置かない。
  設計案にあった「62 日以下 = 日ごと」の規則は、期間指定 UI がないため採らない（UI-SPEC §5-5）。
  - 月数は最も古い記録の月から今月まで（両端を含む）。36 か月ちょうどは月ごと、37 か月から年ごと。
    横スクロールをさせないまま棒の本数を抑えるため（UI-SPEC §5-5 の追補）。
  - **廃止**: 「明細」（1 件ずつの折れ線）と、切替としての「年別」。明細の役割は棒タップで下に出る一覧が果たす。
- **チャート集計（AggregatedPoint）**: レコードを刻みごとの日付キー（日ごと = `startOfDay` / 月ごと = 月初日 / 年ごと = 元日）に丸めて `profit`（Σ netProfit）を合算。棒グラフ。
- **指標**: **収支のみ**（切替を廃止）。売上の推移は見られなくなるが、合計行に売上額はあるので「今いくら」は分かる。
  必要になったら収支の棒の背後に薄い売上の棒を重ねる形（切替なし・1 グラフ）で戻せる（IMPROVEMENTS.md に記録）。
- 種別を絞っても集計・グラフの形は変わらず件数が減るだけで、チャート側の実装変更は不要。種別ごとに色を分けた積み上げグラフは行わない（SPEC-V2 §4.4）。
- **タップ**: 棒をタップするとその刻みが選択状態（濃色）になり、下に当日の記録一覧が並ぶ。「選択を解除」で戻す。
  行は記録タブと同じ `RecordRow` を共用する（UI-SPEC §6-11）。行タップでレコード詳細へ。
- Y 軸上限 = `max(1000, データ最大値) × 1.15`。

---

## 7. 要確認事項と決定（2026-08-09 確定）

各項目の課題と、RN 移植にあたっての決定事項。

1. **ViewModel 非共有**: `SaleRecordView` のコメントは「親と同じ ViewModel を共有」だが、実装は独自 `@StateObject` で、親リストの検索/ソート状態は月別詳細に引き継がれない。
   **決定: 現状の挙動を維持する。** RN 版でも一覧画面と月別詳細画面はそれぞれ独立した検索・ソート・フィルタ状態を持つ。
2. **丸めタイミングの不整合**: `MonthlySummaryCard` は「レコードごとに切り捨て → 合算」、他は「合算 → 表示時丸め」。
   **決定: 「Double で合算 → 表示時に丸め」に統一する。月カードもこの方式に変更する。**（§2.6 に反映済み）
3. **逆算結果の丸め**: `Int()` 切り捨てでは、表示された販売価格で売ると実利益が目標をわずかに下回り得る。
   **決定: `Math.ceil`（切り上げ）に変更する。** 理由: 逆算の目的は「この価格で売れば目標利益に届く」ことの提示であり、切り上げなら表示価格で売った場合に実利益 ≥ 目標利益が常に保証される（切り捨てだと保証されない）。（§2.5 に反映済み）
4. **手数料の端数**: 手数料額に丸め処理がなく、実サービス（1 円未満切り捨てが多い）と誤差が出得る。
   **決定: 保留。TODO として残す。** 当面は丸めなしのまま移植する。（§2.2 に TODO 記載）
5. **表示丸めの方式**: Swift 版は `Int()` キャスト（0 方向切り捨て、負値は floor と異なる）。
   **決定: アプリ全体を `Math.round`（四捨五入）に統一する。負値も同様に `Math.round` を適用する。**（§2.6 に反映済み）
6. **未使用/デッドコード**:
   **決定: 移植対象から除外する。** 除外一覧:
   | 場所 | 除外対象 |
   |---|---|
   | `ViewTitle.swift` | ファイル全体（`ViewTitle` 構造体、どこからも未参照） |
   | `SaleRecordDetailView.swift` | `careerProfit` / `careerExpenses`（計算のみで未使用）、`allRecords` の `@FetchRequest`（上記のみで使用） |
   | `SaleRecord.swift` | `groupedRecords` / `deleteRecords(at:in:)` / `totalNetProfit` / `totalExpenses` / `lastUpdate`（いずれも未使用） |
   | `RecordFormView.swift` | 保存処理内の `isSold == true && saleDate == nil` 分岐（現行フローで到達しない防御コード。※RN 版でも防御として残す場合は害なし） |
7. **CalcView ＋ボタンの即 insert**: フォームを開く前にレコードをストアへ insert し、キャンセル時に delete で掃除する設計。
   **決定: 即 insert をやめ、「保存ボタン押下時にのみレコードを作成する」方式に変更する。** CalcView の入力値はフォームの初期値としてメモリ上で渡すのみとし、キャンセル時の削除処理は不要になる。§5.3 のキャンセル時 delete 仕様は RN 版では廃止。
8. **新規レコードの `isSold`**:
   **決定: 新規レコードは `isSold = false`（出品中）で作成する。** これを明示仕様とする。
9. **数値入力の `.` 複数許容**: 現行フィルタは `1.2.3` を許し、パース失敗で黙って 0 になる。
   **決定: 小数点は 1 個までに制限する。** 正規表現でフィルタする（例: 入力を `/^\d*\.?\d*$/` に一致する形へ整形し、2 個目以降の `.` は入力段階で除去）。
10. **DataView の期間境界**: `endDate` が時刻込みのため「終了日その日」の販売が漏れ得る。
    **決定: `endDate` はその日の 23:59:59 に正規化する。** 集計条件は `startDate（その日の 00:00:00）〜 endDate（その日の 23:59:59.999）` の閉区間とする。（§6.2 に反映済み）
11. **基準日 nil レコードの扱い**（`saleStartDate` nil → `distantPast` グループ落ち）:
    **決定: RN 版では `saleStartDate` を NOT NULL の必須項目とする。** 新規作成時は必ず値を持つ（フォーム初期値 = 当日）。これにより出品中リストで `distantPast` グループは発生しない。`saleDate` は従来どおり「出品中 = null」を許容する。（§1 に反映済み）
12. **年月ピッカーの範囲**: 現行は 2000〜2100 年固定。
    **決定: 現在年の前後 5 年（現在年−5 〜 現在年+5 の 11 年間）に縮小する。**
13. **電卓の式評価**: `NSExpression` 依存で RN にはそのまま持ち込めない。
    **決定: `expr-eval` 等の軽量な式評価ライブラリを使用する。** NSExpression の挙動の厳密な再現は行わず、四則演算・演算子優先順位・小数の扱いはライブラリ標準に従う（末尾演算子ガードなど UI 側のガードは維持）。
14. **macOS/Catalyst 対応**:
    **決定: スコープ外とする。** RN 版は iOS（+ 将来的な Android）のみを対象とし、`#if os(macOS)` / Catalyst 分岐（レイアウト・ピッカースタイル・背景色）は移植しない。
15. **`MonthlySummaryCurd.swift` のファイル名タイポ**:
    **決定: 情報として受領のみ。** 対応不要（RN 版では自然に正しい命名を使う）。

---

## 付録: ファイル → 役割対応表

| ファイル | 内容 |
|---|---|
| `Profit Calculator App.swift` | `@main` エントリ。ContentView + CoreData コンテキスト注入 |
| `ContentView.swift` | TabView（5 タブ） |
| `PersistenceController.swift` | CoreData スタック |
| `SaleRecordEntities+Extensions.swift .swift`（※末尾に余分な ` .swift`） | `netProfit` / `totalExpenses` 計算プロパティ |
| `SaleRecordViewModel.swift` | フィルタ・グループ化・ソートロジック |
| `CalcView.swift` | 計算タブ（`MercariCalcData`、逆算、入力フォーム含む） |
| `MonthlyRecordList.swift` | 出品中/実績タブの月別一覧 |
| `SaleRecord.swift` | `SaleRecordView`（月別詳細リスト）+ `RecordRowView` |
| `SaleRecordDetailView.swift` | 詳細画面 + 商品情報/費用内訳/メモ/売却トグル部品 |
| `RecordFormView.swift` | 新規/編集フォーム + `LabeledField` |
| `MonthlySummaryCurd.swift` | 月ごとのサマリーカード |
| `SummaryViewComponents.swift` | `CareerSummarySection` / `SummaryMiniCard` |
| `DataView.swift` | 分析グラフ（Swift Charts） |
| `MiniCalc.swift` | 簡易電卓 popover |
| `AddRecordButton.swift` | 新規追加 ＋ ボタン共通部品 |
| `HelpView.swift` | 静的ヘルプ |
| `Color+Extensions.swift` | プラットフォーム別背景色 |
| `ViewTitle.swift` | タイトル判定構造体（未使用） |
