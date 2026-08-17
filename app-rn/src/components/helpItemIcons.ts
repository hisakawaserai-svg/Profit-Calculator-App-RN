// 使いかたの項目（`logic/helpContent.ts` の `HelpItem`）ごとのアイコン。
//
// **本文と分けて UI 層に置く。** helpContent.ts は文言と並びだけを持つ純粋なデータで、
// アイコンは Ionicons という**描き手側の都合**（名前が変わることもある）。
// achievements.ts と AchievementsSection.tsx の分け方に合わせている。
//
// ## 選び方
//
// - **項目の中身がそのまま思い浮かぶ絵**にする。電卓の話なら電卓、写真ならカメラ、
//   絞り込みならじょうご ── 見出しを読む前に、どの話かの当たりが付くのが目的
// - **同じページの中では重ねない**（helpItemIcons.test.ts で守る）。畳んだ見出しが
//   20 本並ぶページでは、同じ絵が 2 つあると目印として働かない。
//   ページをまたぐ重なりは許す ── `flag`（目標）のように、別のページで同じ話が続くときは
//   同じ絵のほうが繋がりが読める
// - **outline で揃える**。実績バッジ（塗り）と違って、ここでは見出しの文字が主で、
//   アイコンは頭に添える印。塗りだと 1 段ごとに黒い塊が立って、目次として読みにくい
import type { Ionicons } from '@expo/vector-icons';

export type HelpIconName = keyof typeof Ionicons.glyphMap;

/**
 * 項目 id → アイコン名。**id は helpContent.ts の `HelpItem.id`**（全ページを通して一意）。
 *
 * 並びは helpContent.ts のページ・群の順そのまま。項目を足したらここにも足す
 * （テストが未登録を落とす）。
 */
export const HELP_ITEM_ICONS: Record<string, HelpIconName> = {
  // ── 計算 ──────────────────────────────────────────────
  // 金額を出す
  'calc-net': 'wallet-outline', // 手元に残るお金
  'calc-target': 'swap-horizontal-outline', // 同じ帯を逆から見る（逆算）
  'calc-fee': 'remove-circle-outline', // 率を「−」「＋」で動かす欄
  'calc-breakdown': 'pie-chart-outline', // 何にいくらかかるかの内訳
  // 入力を楽にする
  'calc-calculator': 'calculator-outline', // 欄の右の電卓ボタンそのもの
  'calc-preset': 'pricetag-outline', // 欄の横の「タグの印」そのもの
  'calc-shipping-material': 'cube-outline', // 宅配便の箱＝専用資材
  // 終わったら
  'calc-clear': 'backspace-outline', // 入れた数字を消す
  'calc-to-record': 'create-outline', // そのまま記録の画面へ

  // ── 記録 ──────────────────────────────────────────────
  // 作る
  'record-new': 'add-circle-outline', // 「＋ 記録」
  'record-duplicate': 'duplicate-outline', // 過去の記録から複製（record-copy の写しとは別物）
  'record-kind': 'bag-handle-outline', // 仕入品＝売るために買ってきたもの
  'record-status': 'storefront-outline', // 出品中＝まだ店に並んでいる
  'record-saledate': 'calendar-outline', // 出品日と販売日の前後
  'record-photo': 'camera-outline',
  'record-tag': 'pricetags-outline', // 「洋服」「食器」と分ける
  'record-memo': 'document-text-outline',
  'record-target': 'flag-outline', // この 1 件の目標（sell-target と同じ絵で繋げる）
  'record-target-zero': 'alert-circle-outline', // 0 と「決めていません」の紛らわしさ
  // 見る
  'record-bar': 'stats-chart-outline', // 詳細の先頭に出る色分けの帯
  'record-copy': 'copy-outline', // 長押しでコピー
  // 探す
  'record-find-period': 'calendar-number-outline', // 月を送る
  'record-find-status': 'swap-horizontal-outline', // 売れた記録 ↔ 出品中
  'record-find-filter': 'funnel-outline', // 絞り込み
  'record-tag-or': 'git-merge-outline', // どちらかが付いていれば出る
  'record-find-search': 'search-outline',
  // 直す
  'record-edit': 'pencil-outline',
  'record-tag-delete': 'trash-outline',
  // 登録しておく
  'record-preset': 'bookmarks-outline', // よく使う値を登録しておく
  'record-preset-material': 'layers-outline', // 電卓の中で 1 行ずつ積まれる
  'record-preset-edit': 'lock-closed-outline', // 直しても保存済みの記録は動かない
  'record-preset-pack': 'cube-outline', // まとめ買いした梱包材
  'record-badge': 'text-outline', // バッジの中の文字
  'record-color': 'color-palette-outline',
  'record-color-custom': 'brush-outline', // 自由色（自分で作る）
  'record-default-kind': 'settings-outline', // 設定タブの既定値

  // ── 売る ──────────────────────────────────────────────
  // 出品したあとに考える
  'sell-open': 'open-outline', // 「いくらで売る？」を開く
  'sell-price-line': 'git-commit-outline', // 横 1 本の線に印が付く図そのもの
  'sell-simulator': 'options-outline', // つまみを動かす
  'sell-room': 'trending-down-outline', // あといくら下げられるか
  'sell-target': 'flag-outline', // 目標を決める（record-target と同じ話）
  // 売れたあと
  'sell-sold': 'checkmark-done-outline', // 売れて、終わったあと

  // ── データ ────────────────────────────────────────────
  // 3 つの見かた
  'data-modes': 'apps-outline', // 収支・タグ・実績の切り替え
  'data-tag': 'pricetags-outline', // タグごとの成績
  'data-achievements': 'trophy-outline',
  'data-achievement-kinds': 'ribbon-outline', // 段位（ブロンズ〜レジェンド）
  'data-achievement-period': 'infinite-outline', // 全期間で数える（月も絞り込みも効かない）
  // 収支のグラフ
  'data-chart': 'bar-chart-outline', // 棒と線
  'data-compare': 'git-compare-outline', // 1 つ前の期間と比べる
  // 期間と絞り込み
  'data-period': 'calendar-outline',
  'data-filter': 'funnel-outline', // 記録タブと同じ絞り込み

  // ── 残す ──────────────────────────────────────────────
  // この端末の中のこと
  'backup-where': 'phone-portrait-outline', // この端末の中だけにある
  'backup-photos': 'images-outline',
  'backup-delete': 'warning-outline', // 消すと戻らない
  // バックアップと復元
  'backup-create': 'save-outline',
  'backup-restore': 'arrow-undo-outline', // ファイルから戻す
  'backup-preview': 'reader-outline', // 「読み込む中身」の表
  'backup-migrate': 'swap-horizontal-outline', // 古い端末から新しい端末へ
  // 書き出し（CSV）
  'export-kinds': 'documents-outline', // 2 種類のファイル
  'export-period': 'calendar-outline',
  'export-preview': 'eye-outline', // 何が入るか先に見る
  'export-grouping': 'layers-outline', // 同じ日を 1 行にまとめる
  'export-share': 'share-outline', // 共有の画面から受け取る
  'export-tax': 'receipt-outline', // 確定申告
  'export-rounding': 'calculator-outline', // 足し方の違いで 1 円ずれる

  // ── ことば ────────────────────────────────────────────
  'terms-kind': 'git-compare-outline', // 不用品と仕入品の違い
  'terms-words': 'book-outline', // ことばの使い分け
  'terms-site': 'globe-outline', // 販売サイトの表示額
  'terms-expenses': 'list-outline', // 経費の 5 つ
  'terms-tax': 'receipt-outline', // 消費税（export-tax と同じ絵。税の話が続いていることを絵で繋ぐ）
};

/**
 * 項目 id → アイコン。
 *
 * 未登録の id では丸に「i」を返す ── テストが未登録を落とすので通常は起こらないが、
 * 落とすより**行の形（アイコン＋見出し）を保つ**ほうが、1 段だけ字下げがずれるより良い。
 */
export function helpItemIcon(id: string): HelpIconName {
  return HELP_ITEM_ICONS[id] ?? 'information-circle-outline';
}
