// CSV プレビューの表の部品（SPEC-V3 §5.9・採用案 `40a` ＋ `40c`）。
//
// **シートの中の 3 行（`ExportSheet`）と全画面（`ExportPreviewScreen`）で共用する。**
// どちらも「同じ幅の列が縦に揃った表」で、違うのは行数と器だけなので、
// セルの幅・高さ・書体をここ 1 か所に持つ ── 別々に持つと、片方だけ直したときに
// 「シートで見た表と全画面の表の列幅が違う」が起きる。
//
// **値は CSV に書かれるのと同じ文字列をそのまま出す**（`logic/csv.ts` の `buildCsvTable`）。
// 画面用に整形し直さない（`2026-08-10` を `8/10` に、`5000` を `¥5,000` にしない）── この表の用は
// 「押す前に中身が合っているか確かめる」ことなので、**ファイルに入るのと違う見た目にすると用が消える**。
// 設計案 `40a` の絵は整形した値で描かれていたが、その 1 点だけ採らなかった。
//
// 列の幅は**中身の型で決める**（日付・金額は狭く、商品名・メモ・記録IDは広く）。
// 端末幅（402pt）には 3〜4 列しか入らないので、残りは横スクロールで見る。
import { StyleSheet, Text, View } from 'react-native';

import {
  ITEM_NAME_LABEL,
  LISTED_DATE_FIELD_LABEL,
  MEMO_LABEL,
  RECORD_ID_COLUMN,
  presetTypeLabel,
  SOLD_DATE_FIELD_LABEL,
  TAG_LABEL,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

/** 1 行の高さ。**固定にする**（FlatList の getItemLayout が要るため。§5.9） */
export const CSV_TABLE_ROW_HEIGHT = 38;

/** ヘッダ行の高さ。行より少し低くして、見出しであることを高さでも示す */
export const CSV_TABLE_HEADER_HEIGHT = 34;

/** 既定の列幅（日付・金額・種別・状態はこれで足りる） */
const DEFAULT_COLUMN_WIDTH = 96;

/**
 * 幅を広く取る列。**列名で引く**（`labels.ts` の語がそのままヘッダになっている。§5.3）。
 * ここに無い列は既定幅。列を足しても表は壊れない（既定に落ちるだけ）。
 */
const WIDE_COLUMN_WIDTHS: Record<string, number> = {
  // 日付は `2026-08-09` の 10 文字が**必ず 1 行に収まる**幅にする ── 日付が
  // 「2026-08-…」と切れると、この表で確かめたい「どの日の行か」がまさに読めなくなる
  [SOLD_DATE_FIELD_LABEL]: 112,
  [LISTED_DATE_FIELD_LABEL]: 112,
  [ITEM_NAME_LABEL]: 150,
  [presetTypeLabel('site')]: 120,
  [TAG_LABEL]: 130,
  [MEMO_LABEL]: 170,
  [RECORD_ID_COLUMN]: 250,
};

export function csvColumnWidth(columnName: string): number {
  return WIDE_COLUMN_WIDTHS[columnName] ?? DEFAULT_COLUMN_WIDTH;
}

/** 表の全幅。横スクロールの中身の幅になる（列ごとの幅の和） */
export function csvTableWidth(header: readonly string[]): number {
  return header.reduce((total, name) => total + csvColumnWidth(name), 0);
}

/**
 * ヘッダ行。全画面では**縦スクロールに追随して固定**する（§5.9）。
 *
 * 地の色に `background`（不透明）を使う。`disabledBackground` のような半透明の色は、
 * 固定したときに**下を流れる行が透けて数字が重なる**（実機で見つけた）。
 * カードの地（`secondaryBackground`）とは違う色なので、不透明にしても見出しとして区別が付く。
 */
export function CsvHeaderRow({ header }: { header: readonly string[] }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.row,
        styles.headerRow,
        { backgroundColor: colors.background, borderBottomColor: colors.separator },
      ]}>
      {header.map((name) => (
        <Text
          key={name}
          style={[styles.cell, styles.headerCell, { width: csvColumnWidth(name), color: colors.secondaryLabel }]}
          numberOfLines={1}>
          {name}
        </Text>
      ))}
    </View>
  );
}

/**
 * データ行 1 本。**空の値は空のまま**（「—」などを置かない）── CSV の空文字が空文字として
 * 見えることが、この表で確かめたい事実そのもの（§5.4「空値は空文字」）。
 */
export function CsvDataRow({
  header,
  cells,
  showSeparator,
}: {
  header: readonly string[];
  cells: readonly string[];
  showSeparator: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.row,
        showSeparator && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
      ]}>
      {header.map((name, index) => (
        <Text
          key={name}
          style={[styles.cell, { width: csvColumnWidth(name), color: colors.label }]}
          numberOfLines={1}>
          {cells[index] ?? ''}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: CSV_TABLE_ROW_HEIGHT,
    alignItems: 'center',
  },
  headerRow: {
    height: CSV_TABLE_HEADER_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    paddingHorizontal: 10,
    fontSize: 13,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '600',
  },
});
