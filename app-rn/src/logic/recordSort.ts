// 並び替えシートが並べる「項目 × 方向」（採用案 22b）。純粋関数だけを置く。
//
// 8 択の縦並び（旧 SORT_OPTIONS）をやめ、**項目の行 ＋ 方向の 2 択**にする。
// 8 通りが開いた時点ですべて見えるので、シートに注記は置かない。
//
// **ソートキー（RecordSortType の 8 値）も並べ替えの結果も変えていない。**
// ここが持つのは「どの行に、どの 2 値を、どの語で並べるか」だけ。
// 表示語は labels.ts 経由（SPEC-V2 §5.3）── ここでは語を持たず、並べ方だけを持つ。
//
// 出品中（isSoldMode = false）では**販売日の行を消す**。出品中の記録に販売日は無く、
// 無効表示で残すと「押せない行」を毎回読ませることになる（絞り込みの販売サイトの節と同じ扱い。
// SPEC-V4 §4.2）。消えた行を選んでいた場合の行き先は fallbackSortType が決める。

import type { Locale } from '@/settings/language';

import type { RecordSortType } from '@/db/repository';

import {
  expectedTotalProfitLabel,
  expensesLabel,
  listedDateFieldLabel,
  soldDateFieldLabel,
  sortLargestLabel,
  sortNewestLabel,
  sortOldestLabel,
  sortSmallestLabel,
  totalProfitLabel,
} from './labels';

/** 行の右に出す方向の 1 つ。`value` がそのままソートキーになる */
export type SortSegment = { label: string; value: RecordSortType };

/**
 * シートの 1 行（項目名 ＋ 方向の 2 択）。
 * **2 つちょうど**に固定する ── 行の高さと幅を項目ごとに変えないため。
 * 並びは常に「降順（新しい / 多い）→ 昇順（古い / 少ない）」。
 */
export type SortRow = {
  /** 行の左に出す項目名 */
  label: string;
  segments: readonly [SortSegment, SortSegment];
};

// **モジュールスコープの定数にしない。** 表示語は locale で決まるので、import 時に畳むと
// 言語を切り替えても並び替えシートの行だけ前の言語のまま残る（src/i18n/index.ts の冒頭）。
function saleDateRow(locale: Locale): SortRow {
  return {
    label: soldDateFieldLabel(locale),
    segments: [
      { label: sortNewestLabel(locale), value: 'saleDateDesc' },
      { label: sortOldestLabel(locale), value: 'saleDateAsc' },
    ],
  };
}

function saleStartDateRow(locale: Locale): SortRow {
  return {
    label: listedDateFieldLabel(locale),
    segments: [
      { label: sortNewestLabel(locale), value: 'saleStartDateDesc' },
      { label: sortOldestLabel(locale), value: 'saleStartDateAsc' },
    ],
  };
}

function expensesRow(locale: Locale): SortRow {
  return {
    label: expensesLabel(locale),
    segments: [
      { label: sortLargestLabel(locale), value: 'expensesDesc' },
      { label: sortSmallestLabel(locale), value: 'expensesAsc' },
    ],
  };
}

/** 収支の行だけ、出品中で語が変わる（見込みの値になるため）。値は同じ 2 つ */
function profitRow(locale: Locale, isSoldMode: boolean): SortRow {
  return {
    label: isSoldMode ? totalProfitLabel(locale) : expectedTotalProfitLabel(locale),
    segments: [
      { label: sortLargestLabel(locale), value: 'profitDesc' },
      { label: sortSmallestLabel(locale), value: 'profitAsc' },
    ],
  };
}

/**
 * シートに出す行（採用案 22b）。売れた記録は 4 行、出品中は販売日を落として 3 行。
 * 行の順は「日付 → 金額」で固定し、出品中でも残る行の並びは動かさない
 * （先頭が販売日から出品日に繰り上がるだけ）。
 */
export function sortRows(locale: Locale, isSoldMode: boolean): SortRow[] {
  const rows = isSoldMode
    ? [saleDateRow(locale), saleStartDateRow(locale)]
    : [saleStartDateRow(locale)];
  return [...rows, profitRow(locale, isSoldMode), expensesRow(locale)];
}

/**
 * 出品中に切り替えたときの行き先（採用案 22b）。
 *
 * 販売日で並べたまま出品中に入ると、選択中の行がシートから消えて
 * 「どれも青くないシート」になる。**方向は保ったまま出品日へ**移す ──
 * 出品中の記録が並ぶ基準の日付は出品日で、利用者が指定した「新しい順 / 古い順」は
 * そのまま意味を持つため。
 *
 * 売れた記録へ戻すときに販売日へ戻すことはしない（この関数が isSoldMode = true で
 * 何もしないのがその実装）── 戻した瞬間に並びが勝手に変わる方が読めない。
 * ソートは画面ローカルの state で永続化しないので（決定 §9-9）、
 * この結果がどこかに保存されて残ることもない。
 */
export function fallbackSortType(
  sortType: RecordSortType,
  isSoldMode: boolean,
): RecordSortType {
  if (isSoldMode) return sortType;
  if (sortType === 'saleDateDesc') return 'saleStartDateDesc';
  if (sortType === 'saleDateAsc') return 'saleStartDateAsc';
  return sortType;
}
