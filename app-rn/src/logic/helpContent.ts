// 使いかたの本文（UI-SPEC §3.2 / 採用案 `19c` `20b` `20c`）。**文言と並びだけを持つ純粋なデータ。**
//
// `labels.ts` と分けたのは長さのため ── こちらは 1 項目が数行の地の文で、
// 画面の表示語（ボタン名・列名）を引く場所と混ぜると `labels.ts` が読めなくなる。
// 分けても原則は同じで、**画面側で文字列を組み立てない**（SPEC-V2 §5.3）。
// 図の中の語と数字だけは `HelpDiagram.tsx` が持つ（理由は同ファイルの冒頭）。
//
// ## ページは 5 枚 ＋ ことば（案 `20b` の改訂）
//
// 上部のチップで**計算 / 記録 / 売る / データ / 残す**を切り替える。
//
// 当初は 4 枚（計算 / 記録 / データ / ことば）だったが、そのあとに入った機能が
// **すべて「データ」に流れ込む**形になっていたので割り直した:
//
// | 変えたこと | 理由 |
// |---|---|
// | 「データ」から**書き出しとバックアップを「残す」へ**出した | 1 枚が「見る」と「残す」の 2 つの話を抱えていた。実績・タグ別分析を足すと 25 項目を超え、畳んだ見出しの列が目次として読めなくなる |
// | **「売る」を新設**した | 目標利益（SPEC-V9）と分析画面は、記録を作る話でも見る話でもない ──「出品したあとに何度でも戻ってくる判断」で、どの既存ページにも属せなかった |
// | **「ことば」をチップから外した** | 純利益・利益・収支の使い分けはどの画面にも属さない、という当初の判断はそのまま。ただしチップ 1 枠を常時使うほどは開かれない。各項目の `link` と、画面先頭の 1 行（`HELP_TERMS_ENTRY_LABEL`）から入る |
//
// **「ことば」がどのページにも属さないのは変えていない。** 画面ごとの節に押し込むと、
// 計算にも記録にもデータにも同じ説明を書くことになり、直すときに 3 か所が食い違う。
//
// ## 群（`HelpGroup`）を足した
//
// 記録ページが 27 項目あるので、**畳んだ見出しの列に小見出しを挟む**。
// 「作る / 見る / 探す / 直す / 設定タブで登録しておく」のように、**先に群を読んで、その中から探す**形。
// 群が 1 つだけのページ（ことば）では見出しを持たせない ── 小見出しが 1 本だけ立つと、
// それが何かの区切りに見えて、無い後半を探させる。
//
// ## どの話をどのページに入れたか
//
// | 内容 | ページ | 理由 |
// |---|---|---|
// | 写真（付ける・外す） | 記録 | 付ける・外すのは記録の画面だけ。見るのは一覧と詳細で、記録の一生の中で閉じる |
// | 写真（どこに保存されるか） | 残す | 「自分のデータがどこにあるか」の話なので、バックアップと同じ面に置く。記録側からは `link` で送る |
// | タグ | 記録（絞り込みも含めて全部） | 「付ける」と「絞る」を別ページにすると往復させる。データ側には「同じ絞り込みがここでも効く」の 1 項目だけ置く |
// | タグ**別の成績** | データ | あちらは付ける話、こちらは読む話。母集団も期間で変わる |
// | 目標利益（欄と、0 と未設定の違い） | 記録 | **欄がある場所に置く。** 値の意味は入れる場所で 1 回だけ言う |
// | 目標利益（決めたあと何が変わるか） | 売る | 目標を読むのは分析画面だけなので、使い道はそちらに続ける |
// | 書き出し（CSV）・バックアップ | 残す | 話は「自分のデータをまとめて取り出す・残す」こと。入口が設定タブなのは同じだが、チップは画面名ではなく話の単位 |
// | よく使う値・タグの色・既定の種別 | 記録 | 目的が「記録を作るときの入力を減らす」ことなので。計算タブからも同じ印で選べることは計算ページ側から参照する |
//
// 設定タブのチップを立てないのは、設定は**入口であって話題ではない**ため。
// 「設定」を探しに来る人は既に設定タブを開いている。

import { t } from '@/i18n';
import type { Locale } from '@/settings/language';

/** ページ（チップ）の id。`terms` だけはチップに出さない（画面先頭の 1 行と `link` から入る） */
export type HelpPageId = 'calc' | 'record' | 'sell' | 'data' | 'keep' | 'terms';

/**
 * 図の id。実体は `HelpDiagram.tsx`（概念）と `HelpPartFigure.tsx`（実物の部品）。
 *
 * **型ではなく配列で持つ**のは、テストが「作ったのに誰も使っていない図」を数えられるようにするため
 * ── 図を足して項目に付け忘れても型は通る（`FIGURES` の Record が埋まっていれば通る）ので、
 * 出ないまま残った図に気付けない。
 */
export const HELP_FIGURE_IDS = [
  // 概念の図（HelpDiagram.tsx）。部品を描いても伝わらないので抽象的に描く
  'kind',
  'terms',
  'siteAmount',
  'saleDate',
  'reversePrice',
  'tagOr',
  'chart',
  'csvKinds',
  'expenseItems',
  'packBuy',
  'grouping',
  'rounding',
  'backupPreview',
  'targetRoom',
  'achievementKinds',
  'duplicateFields',
  'backupMigrate',
  // 実物の部品を使う図（HelpPartFigure.tsx）。UI を直すと図も一緒に変わる
  'modeProfit',
  'calculatorButton',
  'commissionField',
  'breakdown',
  'presetTag',
  'shippingMaterial',
  'addRecord',
  'kindSelector',
  'statusToggle',
  'photoField',
  'tagRow',
  'targetField',
  'recordBar',
  'priceLine',
  'simulator',
  'monthBar',
  'soldListing',
  'filterEntry',
  'searchSort',
  'dataModes',
  'tagViewMode',
  'presetList',
  'presetBadge',
  'colorGroups',
  'photoInclude',
  'exportTarget',
  'exportPreview',
] as const;

export type HelpFigureId = (typeof HELP_FIGURE_IDS)[number];

/**
 * 1 項目。**アコーディオンの 1 段**にあたる。
 *
 * 見出しが畳んだときの行、`body` と `figure` が開いたときの中身。
 * 図が題や説明を持たないのはこのため（同じ語が 2 回出る）。
 */
export type HelpItem = {
  /** **全ページを通して一意**（各画面の「？」が id だけで項目を指すため。案 `20c`） */
  id: string;
  title: string;
  body: string;
  /** 図。省略した項目は文だけになる */
  figure?: HelpFigureId;
  /**
   * 他のページへ飛ばすリンク（案 `20c`）。例:「違いを見る ›」
   *
   * `itemId` を添えると、飛んだ先で**その段を開いた状態**にする（HelpScreen の openPage）。
   * ページだけを指すと、27 項目ある記録ページでは着地点から目当てまで自力で探させることになる ──
   * ラベルで「これが読める」と期待を作っておいて先頭に落とすくらいなら、指し先まで書く。
   * 指した項目が消えたときは helpContent.test.ts が落とす。
   */
  link?: { label: string; to: HelpPageId; itemId?: string };
};

/**
 * ページの中の 1 群。**畳んだ見出しの列に挟む小見出し**（項目が増えたページ用）。
 *
 * `title` を省くと見出しの行を出さない ── 群が 1 つだけのページで小見出しを立てると、
 * 区切りに見えて「他の群はどこか」を探させる。
 */
export type HelpGroup = {
  title?: string;
  items: HelpItem[];
};

export type HelpPage = {
  id: HelpPageId;
  /** 上部のチップに出す語（短く）。`terms` では使わない */
  chip: string;
  /** ページ先頭の見出し */
  title: string;
  groups: HelpGroup[];
};

/** チップに出る 5 枚。並びがそのままチップの並び */
export function helpPages(locale: Locale): HelpPage[] {
  return [
  {
    id: 'calc',
    chip: t('help.pages.calc.chip', locale),
    title: t('help.pages.calc.title', locale),
    groups: [
      {
        title: t('help.groups.calc1', locale),
        items: [
          {
            id: 'calc-net',
            title: t('help.items.calc-net.title', locale),
            body: t('help.items.calc-net.body', locale),
            figure: 'modeProfit',
          },
          {
            id: 'calc-target',
            title: t('help.items.calc-target.title', locale),
            body: t('help.items.calc-target.body', locale),
            figure: 'reversePrice',
          },
          {
            id: 'calc-fee',
            title: t('help.items.calc-fee.title', locale),
            body: t('help.items.calc-fee.body', locale),
            figure: 'commissionField',
          },
          {
            id: 'calc-breakdown',
            title: t('help.items.calc-breakdown.title', locale),
            body: t('help.items.calc-breakdown.body', locale),
            figure: 'breakdown',
            link: { label: t('help.items.calc-breakdown.linkLabel', locale), to: 'terms', itemId: 'terms-site' },
          },
        ],
      },
      {
        title: t('help.groups.calc2', locale),
        items: [
          {
            id: 'calc-calculator',
            title: t('help.items.calc-calculator.title', locale),
            body: t('help.items.calc-calculator.body', locale),
            figure: 'calculatorButton',
          },
          {
            id: 'calc-preset',
            title: t('help.items.calc-preset.title', locale),
            body: t('help.items.calc-preset.body', locale),
            figure: 'presetTag',
            link: { label: t('help.items.calc-preset.linkLabel', locale), to: 'record', itemId: 'record-preset' },
          },
          {
            id: 'calc-shipping-material',
            title: t('help.items.calc-shipping-material.title', locale),
            body: t('help.items.calc-shipping-material.body', locale),
            figure: 'shippingMaterial',
            link: { label: t('help.items.calc-shipping-material.linkLabel', locale), to: 'record', itemId: 'record-preset' },
          },
        ],
      },
      {
        title: t('help.groups.calc3', locale),
        items: [
          {
            id: 'calc-clear',
            title: t('help.items.calc-clear.title', locale),
            body: t('help.items.calc-clear.body', locale),
          },
          {
            id: 'calc-to-record',
            title: t('help.items.calc-to-record.title', locale),
            body: t('help.items.calc-to-record.body', locale),
            link: { label: t('help.items.calc-to-record.linkLabel', locale), to: 'record', itemId: 'record-target' },
          },
        ],
      },
    ],
  },
  {
    id: 'record',
    chip: t('help.pages.record.chip', locale),
    title: t('help.pages.record.title', locale),
    groups: [
      {
        title: t('help.groups.record1', locale),
        items: [
          {
            id: 'record-new',
            title: t('help.items.record-new.title', locale),
            body: t('help.items.record-new.body', locale),
            figure: 'addRecord',
          },
          {
            id: 'record-duplicate',
            title: t('help.items.record-duplicate.title', locale),
            body: t('help.items.record-duplicate.body', locale),
            figure: 'duplicateFields',
          },
          {
            id: 'record-kind',
            title: t('help.items.record-kind.title', locale),
            body: t('help.items.record-kind.body', locale),
            figure: 'kindSelector',
            link: { label: t('help.items.record-kind.linkLabel', locale), to: 'terms', itemId: 'terms-kind' },
          },
          {
            id: 'record-status',
            title: t('help.items.record-status.title', locale),
            body: t('help.items.record-status.body', locale),
            figure: 'statusToggle',
          },
          {
            id: 'record-saledate',
            title: t('help.items.record-saledate.title', locale),
            body: t('help.items.record-saledate.body', locale),
            figure: 'saleDate',
          },
          {
            id: 'record-photo',
            title: t('help.items.record-photo.title', locale),
            body: t('help.items.record-photo.body', locale),
            figure: 'photoField',
            link: { label: t('help.items.record-photo.linkLabel', locale), to: 'keep', itemId: 'backup-photos' },
          },
          {
            id: 'record-tag',
            title: t('help.items.record-tag.title', locale),
            body: t('help.items.record-tag.body', locale),
            figure: 'tagRow',
          },
          {
            id: 'record-memo',
            title: t('help.items.record-memo.title', locale),
            body: t('help.items.record-memo.body', locale),
            link: { label: t('help.items.record-memo.linkLabel', locale), to: 'keep', itemId: 'export-kinds' },
          },
          {
            id: 'record-target',
            title: t('help.items.record-target.title', locale),
            body: t('help.items.record-target.body', locale),
            figure: 'targetField',
            link: { label: t('help.items.record-target.linkLabel', locale), to: 'sell', itemId: 'sell-room' },
          },
          {
            id: 'record-target-zero',
            title: t('help.items.record-target-zero.title', locale),
            body: t('help.items.record-target-zero.body', locale),
            figure: 'targetRoom',
          },
        ],
      },
      {
        title: t('help.groups.record2', locale),
        items: [
          {
            id: 'record-bar',
            title: t('help.items.record-bar.title', locale),
            body: t('help.items.record-bar.body', locale),
            figure: 'recordBar',
            link: { label: t('help.items.record-bar.linkLabel', locale), to: 'sell', itemId: 'sell-open' },
          },
          {
            id: 'record-copy',
            title: t('help.items.record-copy.title', locale),
            body: t('help.items.record-copy.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.record3', locale),
        items: [
          {
            id: 'record-find-period',
            title: t('help.items.record-find-period.title', locale),
            body: t('help.items.record-find-period.body', locale),
            figure: 'monthBar',
          },
          {
            id: 'record-find-status',
            title: t('help.items.record-find-status.title', locale),
            body: t('help.items.record-find-status.body', locale),
            figure: 'soldListing',
          },
          {
            id: 'record-find-filter',
            title: t('help.items.record-find-filter.title', locale),
            body: t('help.items.record-find-filter.body', locale),
            figure: 'filterEntry',
          },
          {
            id: 'record-tag-or',
            title: t('help.items.record-tag-or.title', locale),
            body: t('help.items.record-tag-or.body', locale),
            figure: 'tagOr',
          },
          {
            id: 'record-find-search',
            title: t('help.items.record-find-search.title', locale),
            body: t('help.items.record-find-search.body', locale),
            figure: 'searchSort',
          },
        ],
      },
      {
        title: t('help.groups.record4', locale),
        items: [
          {
            id: 'record-edit',
            title: t('help.items.record-edit.title', locale),
            body: t('help.items.record-edit.body', locale),
          },
          {
            id: 'record-tag-delete',
            title: t('help.items.record-tag-delete.title', locale),
            body: t('help.items.record-tag-delete.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.record5', locale),
        items: [
          {
            id: 'record-preset',
            title: t('help.items.record-preset.title', locale),
            body: t('help.items.record-preset.body', locale),
            figure: 'presetList',
          },
          {
            id: 'record-preset-material',
            title: t('help.items.record-preset-material.title', locale),
            body: t('help.items.record-preset-material.body', locale),
          },
          {
            id: 'record-preset-pack',
            title: t('help.items.record-preset-pack.title', locale),
            body: t('help.items.record-preset-pack.body', locale),
            figure: 'packBuy',
          },
          {
            id: 'record-preset-edit',
            title: t('help.items.record-preset-edit.title', locale),
            body: t('help.items.record-preset-edit.body', locale),
          },
          {
            id: 'record-badge',
            title: t('help.items.record-badge.title', locale),
            body: t('help.items.record-badge.body', locale),
            figure: 'presetBadge',
          },
          {
            id: 'record-color',
            title: t('help.items.record-color.title', locale),
            body: t('help.items.record-color.body', locale),
            figure: 'colorGroups',
          },
          {
            id: 'record-color-custom',
            title: t('help.items.record-color-custom.title', locale),
            body: t('help.items.record-color-custom.body', locale),
          },
          {
            id: 'record-default-kind',
            title: t('help.items.record-default-kind.title', locale),
            body: t('help.items.record-default-kind.body', locale),
          },
        ],
      },
    ],
  },
  {
    id: 'sell',
    chip: t('help.pages.sell.chip', locale),
    title: t('help.pages.sell.title', locale),
    groups: [
      {
        title: t('help.groups.sell1', locale),
        items: [
          {
            id: 'sell-open',
            title: t('help.items.sell-open.title', locale),
            body: t('help.items.sell-open.body', locale),
          },
          {
            id: 'sell-price-line',
            title: t('help.items.sell-price-line.title', locale),
            body: t('help.items.sell-price-line.body', locale),
            figure: 'priceLine',
          },
          {
            id: 'sell-simulator',
            title: t('help.items.sell-simulator.title', locale),
            body: t('help.items.sell-simulator.body', locale),
            figure: 'simulator',
          },
          {
            id: 'sell-room',
            title: t('help.items.sell-room.title', locale),
            body: t('help.items.sell-room.body', locale),
            figure: 'targetRoom',
            link: { label: t('help.items.sell-room.linkLabel', locale), to: 'record', itemId: 'record-target-zero' },
          },
          {
            id: 'sell-target',
            title: t('help.items.sell-target.title', locale),
            body: t('help.items.sell-target.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.sell2', locale),
        items: [
          {
            id: 'sell-sold',
            title: t('help.items.sell-sold.title', locale),
            body: t('help.items.sell-sold.body', locale),
          },
        ],
      },
    ],
  },
  {
    id: 'data',
    chip: t('help.pages.data.chip', locale),
    title: t('help.pages.data.title', locale),
    groups: [
      {
        title: t('help.groups.data1', locale),
        items: [
          {
            id: 'data-modes',
            title: t('help.items.data-modes.title', locale),
            body: t('help.items.data-modes.body', locale),
            figure: 'dataModes',
          },
          {
            id: 'data-tag',
            title: t('help.items.data-tag.title', locale),
            body: t('help.items.data-tag.body', locale),
            figure: 'tagViewMode',
          },
          {
            id: 'data-achievements',
            title: t('help.items.data-achievements.title', locale),
            body: t('help.items.data-achievements.body', locale),
          },
          {
            id: 'data-achievement-kinds',
            title: t('help.items.data-achievement-kinds.title', locale),
            body: t('help.items.data-achievement-kinds.body', locale),
            figure: 'achievementKinds',
          },
          {
            id: 'data-achievement-period',
            title: t('help.items.data-achievement-period.title', locale),
            body: t('help.items.data-achievement-period.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.data2', locale),
        items: [
          {
            id: 'data-chart',
            title: t('help.items.data-chart.title', locale),
            body: t('help.items.data-chart.body', locale),
            figure: 'chart',
            link: { label: t('help.items.data-chart.linkLabel', locale), to: 'terms', itemId: 'terms-words' },
          },
          {
            id: 'data-compare',
            title: t('help.items.data-compare.title', locale),
            body: t('help.items.data-compare.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.data3', locale),
        items: [
          {
            id: 'data-period',
            title: t('help.items.data-period.title', locale),
            body: t('help.items.data-period.body', locale),
            figure: 'monthBar',
          },
          {
            id: 'data-filter',
            title: t('help.items.data-filter.title', locale),
            body: t('help.items.data-filter.body', locale),
            figure: 'filterEntry',
          },
        ],
      },
    ],
  },
  {
    id: 'keep',
    chip: t('help.pages.keep.chip', locale),
    title: t('help.pages.keep.title', locale),
    groups: [
      {
        title: t('help.groups.keep1', locale),
        items: [
          {
            id: 'backup-where',
            title: t('help.items.backup-where.title', locale),
            body: t('help.items.backup-where.body', locale),
          },
          {
            id: 'backup-photos',
            title: t('help.items.backup-photos.title', locale),
            body: t('help.items.backup-photos.body', locale),
          },
          {
            id: 'backup-delete',
            title: t('help.items.backup-delete.title', locale),
            body: t('help.items.backup-delete.body', locale),
          },
        ],
      },
      {
        title: t('help.groups.keep2', locale),
        items: [
          {
            id: 'backup-create',
            title: t('help.items.backup-create.title', locale),
            body: t('help.items.backup-create.body', locale),
            figure: 'photoInclude',
          },
          {
            id: 'backup-restore',
            title: t('help.items.backup-restore.title', locale),
            body: t('help.items.backup-restore.body', locale),
          },
          {
            id: 'backup-preview',
            title: t('help.items.backup-preview.title', locale),
            body: t('help.items.backup-preview.body', locale),
            figure: 'backupPreview',
          },
          {
            id: 'backup-migrate',
            title: t('help.items.backup-migrate.title', locale),
            body: t('help.items.backup-migrate.body', locale),
            figure: 'backupMigrate',
          },
        ],
      },
      {
        title: t('help.groups.keep3', locale),
        items: [
          {
            id: 'export-kinds',
            title: t('help.items.export-kinds.title', locale),
            body: t('help.items.export-kinds.body', locale),
            figure: 'csvKinds',
          },
          {
            id: 'export-period',
            title: t('help.items.export-period.title', locale),
            body: t('help.items.export-period.body', locale),
            figure: 'exportTarget',
          },
          {
            id: 'export-preview',
            title: t('help.items.export-preview.title', locale),
            body: t('help.items.export-preview.body', locale),
            figure: 'exportPreview',
          },
          {
            id: 'export-grouping',
            title: t('help.items.export-grouping.title', locale),
            body: t('help.items.export-grouping.body', locale),
            figure: 'grouping',
          },
          {
            id: 'export-share',
            title: t('help.items.export-share.title', locale),
            body: t('help.items.export-share.body', locale),
          },
          {
            id: 'export-tax',
            title: t('help.items.export-tax.title', locale),
            body: t('help.items.export-tax.body', locale),
            link: { label: t('help.items.export-tax.linkLabel', locale), to: 'terms', itemId: 'terms-tax' },
          },
          {
            id: 'export-rounding',
            title: t('help.items.export-rounding.title', locale),
            body: t('help.items.export-rounding.body', locale),
            figure: 'rounding',
          },
        ],
      },
    ],
  },
  ];
}

/**
 * ことば（チップには出さない）。
 *
 * **どの画面にも属さない**のは当初のまま ── 純利益・利益・収支の使い分けや、
 * 不用品と仕入品のちがいを画面ごとの節に置くと、同じ説明が 3 か所に増える。
 * 入口は各項目の `link` と、画面先頭の 1 行（`HELP_TERMS_ENTRY_LABEL`）の 2 つ。
 */
export function helpTermsPage(locale: Locale): HelpPage {
  return {
  id: 'terms',
  chip: t('help.pages.terms.chip', locale),
  title: t('help.pages.terms.title', locale),
  groups: [
    {
      items: [
        {
          id: 'terms-kind',
          title: t('help.items.terms-kind.title', locale),
          body: t('help.items.terms-kind.body', locale),
          figure: 'kind',
        },
        {
          id: 'terms-words',
          title: t('help.items.terms-words.title', locale),
          body: t('help.items.terms-words.body', locale),
          figure: 'terms',
        },
        {
          id: 'terms-site',
          title: t('help.items.terms-site.title', locale),
          body: t('help.items.terms-site.body', locale),
          figure: 'siteAmount',
        },
        {
          id: 'terms-expenses',
          title: t('help.items.terms-expenses.title', locale),
          body: t('help.items.terms-expenses.body', locale),
          figure: 'expenseItems',
        },
        {
          id: 'terms-tax',
          title: t('help.items.terms-tax.title', locale),
          body: t('help.items.terms-tax.body', locale),
        },
      ],
    },
  ],
  };
}

/** チップの 5 枚 ＋ ことば。id からページを引くときに使う */
export function helpAllPages(locale: Locale): readonly HelpPage[] {
  return [...helpPages(locale), helpTermsPage(locale)];
}

/** id からページを引く。知らない id では先頭（計算）に落とす */
export function helpPageOf(locale: Locale, id: HelpPageId): HelpPage {
  const pages = helpPages(locale);
  return helpAllPages(locale).find((page) => page.id === id) ?? pages[0];
}

/** ページの中の項目を順に返す（群をまたいで平らにする） */
export function helpItemsOf(page: HelpPage): HelpItem[] {
  return page.groups.flatMap((group) => group.items);
}

/** 各画面の「？」の設定（案 `20c`）。困りそうなことを先頭に持ち上げ、見出しをその場の語にする */
export type HelpEntryId =
  | 'calc'
  | 'recordList'
  | 'recordDetail'
  | 'recordForm'
  | 'pricing'
  | 'data'
  | 'dataTag'
  | 'dataAchievements'
  | 'export'
  | 'backup'
  | 'tagForm'
  | 'presetForm';

export type HelpEntry = {
  page: HelpPageId;
  /** この項目を開いた状態で出す（案 `20c`）。省略時は全部畳んだまま */
  leadItemId?: string;
  /** シートの見出し。その場に合った語にする（記録フォームなら「記録の書きかた」） */
  sheetTitle: string;
};

export function helpEntries(locale: Locale): Record<HelpEntryId, HelpEntry> {
  const title = (id: HelpEntryId) => t(`help.entries.${id}`, locale);
  return {
  calc: { page: 'calc', sheetTitle: title('calc') },
  // 一覧で詰まるのは「目当ての記録が出てこない」とき
  recordList: { page: 'record', leadItemId: 'record-find-filter', sheetTitle: title('recordList') },
  recordDetail: { page: 'record', leadItemId: 'record-bar', sheetTitle: title('recordDetail') },
  // 販売日を選べなかった直後に開くのがいちばん役に立つ（案 `20c`）
  recordForm: { page: 'record', leadItemId: 'record-saledate', sheetTitle: title('recordForm') },
  // 分析画面（SPEC-V9 §9）。まず「ここが何の画面か」を先頭に出す
  pricing: { page: 'sell', leadItemId: 'sell-open', sheetTitle: title('pricing') },
  data: { page: 'data', leadItemId: 'data-chart', sheetTitle: title('data') },
  // データタブは見ているモードで詰まる場所が違うので、モードごとに別の項目を開く
  dataTag: { page: 'data', leadItemId: 'data-tag', sheetTitle: title('dataTag') },
  dataAchievements: {
    page: 'data',
    leadItemId: 'data-achievements',
    sheetTitle: title('dataAchievements'),
  },
  // §5.8 のバナーの飛び先。注意書きそのものを先頭に出す
  export: { page: 'keep', leadItemId: 'export-tax', sheetTitle: title('export') },
  backup: { page: 'keep', leadItemId: 'backup-create', sheetTitle: title('backup') },
  // 色は 2 つの編集画面が同じものを使う（SPEC-V7 §3）ので、開く項目も同じ
  tagForm: { page: 'record', leadItemId: 'record-color', sheetTitle: title('tagForm') },
  presetForm: { page: 'record', leadItemId: 'record-badge', sheetTitle: title('presetForm') },
  };
}

/** シート下端のリンク（案 `20c`）。全体（設定タブから開くのと同じもの）へ */
export function helpReadAllLabel(locale: Locale): string {
  return t('help.readAllLabel', locale);
}

/** 画面先頭の 1 行。チップから外した「ことば」への入口 */
export function helpTermsEntryLabel(locale: Locale): string {
  return t('help.termsEntryLabel', locale);
}

/** 設定タブから push で開くときの見出し（UI-SPEC §1.6-1） */
export function helpScreenTitle(locale: Locale): string {
  return t('help.screenTitle', locale);
}

/** 各画面の「？」の読み上げ語 */
export function helpButtonLabel(locale: Locale): string {
  return t('help.buttonLabel', locale);
}
