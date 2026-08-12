// 書き出しファイルの名前（SPEC-V3 §5.4「ファイル名」の改訂）。純粋関数だけを置く。
//
// **名前は「種類 ＋ 期間」だけで決まる。** 対象（売れた記録のみ / 出品中も含める）と
// まとめ方は名前に入れない ── 4 要素を全部入れると
// `確定申告_2026-08_売れた記録_日ごと.csv` のように読めない長さになる。
// 後から見て要るのは「いつの・何の書き出しか」の 2 つ。
//
// **日本語の名前にする**（§5.4 の改訂。元は ASCII の `sale-records_2026-08.csv` だった）。
// 共有シートに出る名前がそのまま保存名になるので、ファイルアプリやメールの添付一覧で
// 何のファイルか読める形を採る。理由と、覆した元の決定は SPEC-V3 §5.4 に置く。
//
// 期間は 3 値（全期間 / 年 / 月。logic/period.ts）なので、名前も 3 通りになる:
//   売上記録_2026-08.csv / 売上記録_2025.csv / 売上記録_全期間.csv

import type { CsvExportKind, CsvGrouping } from './csv';
import { CSV_ALL_PERIOD_FILE_LABEL, CSV_FILE_BASE_NAMES } from './labels';
import { periodKind, type Period } from './period';

/** 拡張子。共有シートの受け手（メール・ファイル）はこれで種類を判断する */
const CSV_EXTENSION = '.csv';

/**
 * ファイル名の期間の部分。**期間キーをそのまま使う**（"2026-08" / "2025"）──
 * 「2026年8月」のように整形すると、名前で並べたときに月の順が崩れる（10 月が 1 月の隣に来る）。
 * 全期間だけはキーが無い（null）ので語を当てる。
 */
export function exportPeriodSlug(period: Period): string {
  return periodKind(period) === 'all' ? CSV_ALL_PERIOD_FILE_LABEL : (period as string);
}

/** 共有シートに出るファイル名（§5.4）。`確定申告_2026-08.csv` */
export function exportFileName(kind: CsvExportKind, period: Period): string {
  return `${CSV_FILE_BASE_NAMES[kind]}_${exportPeriodSlug(period)}${CSV_EXTENSION}`;
}

// ---- 全画面プレビューへ渡す条件（§5.9・案 `40c`） ----
//
// 全画面（`ExportPreviewScreen`）は**シートの state を受け取らず、ルートの引数から
// 自分で引き直す**。シートから props を渡す形にすると、戻る・リロード・ディープリンクで
// 引数が欠けたときに空の表が出る ── 引数が URL に載っていれば、その画面だけで再現できる。
// 期間は 3 値（全期間 = null）なので、全期間だけ**空文字**に倒す（クエリに null は載らない）。

/** ルートの引数の形。すべて文字列（expo-router のクエリはそのまま文字列で届く） */
export type ExportRouteParams = {
  kind: string;
  grouping: string;
  /** 期間キー。空文字 = 全期間 */
  period: string;
  /** '1' = 出品中も含める */
  includeListing: string;
};

export function toExportParams(
  kind: CsvExportKind,
  grouping: CsvGrouping,
  period: Period,
  includeListing: boolean,
): ExportRouteParams {
  return {
    kind,
    grouping,
    period: period ?? '',
    includeListing: includeListing ? '1' : '0',
  };
}

/**
 * 受け取り側。**知らない値は既定へ倒す**（外から壊れた引数で開かれても表が出る）──
 * 既定はシートの初期値と同じ「データ保存用・1件ずつ・全期間・売れた記録のみ」。
 */
export function fromExportParams(params: Partial<ExportRouteParams>): {
  kind: CsvExportKind;
  grouping: CsvGrouping;
  period: Period;
  includeListing: boolean;
} {
  return {
    kind: params.kind === 'tax' ? 'tax' : 'backup',
    grouping: params.grouping === 'day' ? 'day' : 'record',
    period: params.period == null || params.period === '' ? null : params.period,
    includeListing: params.includeListing === '1',
  };
}
