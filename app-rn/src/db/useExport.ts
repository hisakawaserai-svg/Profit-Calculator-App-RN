// 書き出しシート（SPEC-V3 §5.6 / §5.7）のデータ取得。
//
// **記録本体（repository）とタグ（tagRepository）の 2 本を束ねる場所**が要るのでここに置く。
// csv.ts は純粋関数のまま（引数は記録とタグ名の 2 つ。SPEC-V4 §5.4）で、DB を引くのはこちら。
//
// 画面が読むのは:
//   - `useExportPreview` … 下端の予告（件数・行数・0 件のときの出品中の数）
//   - `loadExportCsv`    … 「書き出す」を押した瞬間に本文を組み立てる（フックではない）
//
// **本文は押すまで作らない。** 予告に要るのは数だけで、条件を触るたびに数千件ぶんの
// 文字列を組み立てる理由がない（件数のクエリは同期で数千件規模でも問題にならない。SPEC-V2 §8-6）。

import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import {
  buildCsv,
  buildCsvTable,
  csvRowCount,
  type CsvExportKind,
  type CsvGrouping,
  type CsvTable,
} from '@/logic/csv';

import { repository, tagRepository } from './client';
import type { ExportFilter } from './repository';

/** シートの中に出す行数（§5.9・案 `40a`）。3 行なら 1 行の並びが読めて、シートの高さも抑えられる */
export const CSV_PREVIEW_ROW_LIMIT = 3;

export type ExportPreview = {
  /** 対象の記録の件数（§5.7 の下端。0 なら「書き出す」を非活性にする） */
  recordCount: number;
  /** 書き出される行数（ヘッダを除く）。日ごとにまとめると件数より少なくなる */
  rowCount: number;
  /**
   * 同じ期間の**出品中の記録**の件数（§5.7 の 0 件の 1 行）。
   * 「売れた記録のみ」で 0 件になったとき、切り替えれば書き出せることを示すために使う。
   */
  listingCount: number;
  /**
   * シートの中に出す表（ヘッダ ＋ **先頭 3 行**。§5.9）。
   * **書き出しと同じ `buildCsvTable` から取る**ので、ここに見えている文字列がそのままファイルに入る。
   * 0 件のときは `rows` が空（表そのものを出さない）。
   */
  table: CsvTable;
};

/** タグを引くのはデータ保存用のときだけ（確定申告用にタグの列が無い。SPEC-V4 §5.3） */
function tagsFor(kind: CsvExportKind, recordIds: string[]) {
  return kind === 'backup' ? tagRepository.tagNamesByRecord(recordIds) : undefined;
}

/** refreshToken を引数に取る理由は useRecords.ts の query() のコメントを参照 */
function queryPreview(
  filter: ExportFilter,
  kind: CsvExportKind,
  grouping: CsvGrouping,
  refreshToken: object,
): ExportPreview {
  void refreshToken;
  // 行数は「日ごとにまとめると何行になるか」なので、数えるには記録そのものが要る。
  // 件数だけの countForExport では足りないため、ここは一覧を引く
  const records = repository.listForExport(filter);
  /**
   * 表に渡す記録。**日ごとにまとめるときだけ全件が要る** ── 同じ日の記録が何件あるかを
   * 知らないと合算できないので、先頭 3 件で切ると 1 行目の金額が本物と食い違う。
   * 1 件ずつのときは行と記録が 1 対 1 なので、先頭 3 件で先頭 3 行が作れる。
   * どちらでも `limit` が最後に 3 行へ落とす（打ち切りの規則を 1 か所に置く）。
   */
  const grouped = kind === 'tax' && grouping === 'day';
  const source = grouped ? records : records.slice(0, CSV_PREVIEW_ROW_LIMIT);
  return {
    recordCount: records.length,
    rowCount: csvRowCount(records, kind, grouping),
    table: buildCsvTable({
      kind,
      grouping,
      records: source,
      // タグの列があるのはデータ保存用（= 常に 1 件ずつ）だけなので、source は高々 3 件
      tagsByRecord: tagsFor(kind, source.map((record) => record.id)),
      limit: CSV_PREVIEW_ROW_LIMIT,
    }),
    // 出品中の数は「対象を切り替えたら何件増えるか」なので、同じ期間で全件を数えて差を取る。
    // 対象の条件だけを差し替えて repository の 1 本を使い回す（数え方を 2 か所に書かない）
    listingCount:
      repository.countForExport({ ...filter, includeListing: true }) -
      repository.countForExport({ ...filter, includeListing: false }),
  };
}

/**
 * 下端の予告（§5.7）。**種類・期間・まとめ方・対象を触るたびにその場で引き直す。**
 * 設定タブは記録を書き換えないので、拾うのは画面復帰（useFocusEffect）だけでよい。
 */
export function useExportPreview(
  filter: ExportFilter,
  kind: CsvExportKind,
  grouping: CsvGrouping,
): ExportPreview {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(
    () => queryPreview(filter, kind, grouping, refreshToken),
    [filter, kind, grouping, refreshToken],
  );
}

/**
 * CSV の本文を組み立てる（「書き出す」を押した瞬間に 1 回だけ）。BOM は付かない ──
 * ファイルへ書くときに `toCsvFileContent` を通すのは呼び出し側（ExportSheet）の責務。
 *
 * タグを引くのは `backup` のときだけ（`tax` にタグの列が無い。§5.3.1）。
 * 引くときも**記録ごとではなく 1 本のクエリ**でまとめて引く（SPEC-V4 §5.4 の N+1 回避）。
 */
export function loadExportCsv(
  filter: ExportFilter,
  kind: CsvExportKind,
  grouping: CsvGrouping,
): string {
  return buildCsv(exportBuildParams(filter, kind, grouping));
}

/** 書き出し 1 回ぶんの材料。全画面プレビューと書き出しが**同じ引数**で組み立てる（§5.9） */
function exportBuildParams(filter: ExportFilter, kind: CsvExportKind, grouping: CsvGrouping) {
  const records = repository.listForExport(filter);
  return {
    kind,
    grouping,
    records,
    tagsByRecord: tagsFor(kind, records.map((record) => record.id)),
  };
}

/** refreshToken を引数に取る理由は useRecords.ts の query() のコメントを参照 */
function queryTable(
  filter: ExportFilter,
  kind: CsvExportKind,
  grouping: CsvGrouping,
  refreshToken: object,
): CsvTable {
  void refreshToken;
  return buildCsvTable(exportBuildParams(filter, kind, grouping));
}

/**
 * 全画面プレビュー（§5.9・案 `40c`）の表。**全行を返す。**
 *
 * 先頭 N 行で打ち切らないのは、打ち切ると「見えていない行に何が入っているか」という
 * 元の不安がそのまま残るため。件数が増えても重くならないのは画面側の仮想化（FlatList）の役目で、
 * ここは行の配列を作るだけ ── 数千件（SPEC-V2 §8-6）× 19 列の文字列は同期で組めば一瞬。
 */
export function useExportTable(
  filter: ExportFilter,
  kind: CsvExportKind,
  grouping: CsvGrouping,
): CsvTable {
  const [refreshToken, setRefreshToken] = useState<object>(() => ({}));
  const refresh = useCallback(() => setRefreshToken({}), []);

  useFocusEffect(refresh);

  return useMemo(
    () => queryTable(filter, kind, grouping, refreshToken),
    [filter, kind, grouping, refreshToken],
  );
}
