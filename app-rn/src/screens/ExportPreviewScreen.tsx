// 全画面プレビュー（SPEC-V3 §5.9・採用案 `40c`）。書き出しシートの表を押すと開く。
//
// 構成（上から）: 見出しの行（左「2026年8月・売れた記録」／右「全11列・8件（4行）」）→
// 表（ヘッダ固定 ＋ 縦横スクロール）→ 下端「シートに戻る」。
//
// この画面が持つ判断:
//
// - **全行を出す。先頭 N 行で打ち切らない。** 打ち切ると「見えていない行に何が入っているか」という
//   元の不安がそのまま残る。件数が増えても重くならないのは `FlatList` の仮想化の役目で、
//   画面に見えている行しか描かれない（行の高さが固定なので `getItemLayout` も渡せる）。
// - **条件はルートの引数から受け取り、DB は自分で引き直す**（`logic/exportPeriod.ts`）。
//   シートから props で渡す形にすると、リロードやディープリンクで空の表になる。
// - **ヘッダ行は縦スクロールに追随して固定する**（`stickyHeaderIndices`）。
//   縦に流れても列名が読めないと、右へ動かした後にどの列を見ているのか分からなくなる。
// - **1 列目（販売日）は固定しない。** 固定するには「左の 1 列」と「残りの列」を別々の
//   仮想化リストにして縦スクロールを同期させることになり、リストが 2 本になる
//   （行の高さの計算も 2 通りになり、速い指の動きで縦位置がずれる）。ヘッダが固定されていれば
//   「いま何の列か」は読めるので、そこまでの作りは持たない。
// - **横向きには対応しない**（アプリ全体が縦固定）。列が多いときの逃げ道はこの画面そのもの。
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CsvDataRow,
  CsvHeaderRow,
  csvTableWidth,
  CSV_TABLE_ROW_HEIGHT,
} from '@/components/CsvTable';
import { useExportPreview, useExportTable } from '@/db/useExport';
import { fromExportParams, type ExportRouteParams } from '@/logic/exportPeriod';
import {
  EXPORT_PREVIEW_BACK_LABEL,
  EXPORT_PREVIEW_SCROLL_HINT,
  exportPreviewScreenMetaLabel,
  exportSummaryLabel,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

export function ExportPreviewScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<Partial<ExportRouteParams>>();

  const { kind, grouping, period, includeListing } = useMemo(
    () => fromExportParams(params),
    [params],
  );
  const filter = useMemo(() => ({ period, includeListing }), [period, includeListing]);

  const table = useExportTable(filter, kind, grouping);
  // 見出しに出す件数は**シートの下端と同じ 1 本**から取る（同じ書き出しなので数が割れない）
  const preview = useExportPreview(filter, kind, grouping);

  const width = useMemo(() => csvTableWidth(table.header), [table.header]);

  // 見出し（「プレビュー」）と push の指定は設定タブの _layout.tsx が持つ ──
  // レイアウト側で screen を宣言すると、そちらが先に効くため
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.head}>
        <Text style={[styles.headLabel, { color: colors.label }]} numberOfLines={1}>
          {exportSummaryLabel(period, includeListing)}
        </Text>
        <Text style={[styles.headMeta, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {exportPreviewScreenMetaLabel(
            table.header.length,
            preview.recordCount,
            preview.rowCount,
          )}
        </Text>
      </View>

      {/* 横スクロールが外・縦（仮想化）が内。**同じ向きの入れ子ではない**ので
          VirtualizedList の警告も出ない。中身の幅は列幅の和で固定する */}
      <ScrollView
        horizontal
        style={[styles.table, { backgroundColor: colors.secondaryBackground }]}
        contentContainerStyle={{ width }}>
        <FlatList
          style={styles.list}
          data={table.rows}
          keyExtractor={(_, index) => String(index)}
          // ヘッダを 0 番目の要素として貼り付ける（縦に流れても列名が読める）
          ListHeaderComponent={<CsvHeaderRow header={table.header} />}
          stickyHeaderIndices={[0]}
          renderItem={({ item, index }) => (
            <CsvDataRow header={table.header} cells={item} showSeparator={index > 0} />
          )}
          // 行の高さが固定なので、スクロール位置の計算に実測を待たせない（数千行でも一定）
          getItemLayout={(_, index) => ({
            length: CSV_TABLE_ROW_HEIGHT,
            offset: CSV_TABLE_ROW_HEIGHT * index,
            index,
          })}
          showsVerticalScrollIndicator={false}
        />
      </ScrollView>

      <Text style={[styles.hint, { color: colors.secondaryLabel }]}>
        {EXPORT_PREVIEW_SCROLL_HINT}
      </Text>

      {/* 案 40c: 下端は行き先を名指しする。ヘッダの「‹ 戻る」と同じことをするが、
          表を最後まで見た指がそのまま届く場所に置く */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: colors.highlightBackground, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Text style={[styles.backLabel, { color: colors.blue }]}>
          {EXPORT_PREVIEW_BACK_LABEL}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
  },
  headLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  headMeta: {
    fontSize: 13,
  },
  // 表は残りの高さをすべて使う（下端のボタンと注記のぶんだけを残す）
  table: {
    flex: 1,
    borderRadius: 12,
  },
  list: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    marginLeft: 4,
  },
  back: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
