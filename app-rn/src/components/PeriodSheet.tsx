// 期間シート（UI-SPEC §1.2「期間シート」・採用案 10c）。月バーの中央タップで開く。
// **記録タブとデータタブで同じ部品を共用する**（§1.2「MonthNavBar と対で共用する」）──
// 同じ「期間を選ぶ」操作を画面ごとに違う形で覚えさせないため、月バーと同じく 1 か所に置く。
//
// 構成（上から）
//   1. 見出し「表示する期間」
//   2. クイック選択「今月 / 先月 / 全期間」── **先頭に固定**。スクロールしても常に先頭に来る
//   3. 月グリッド ── 年ごとのブロック（年見出し ＋ 4 列 × 3 行）。年は降順。ここだけがスクロールする
//   4. 凡例「記録あり / 記録なし」── 下部に固定
//
// 選べるのは全期間か 1 か月のいずれかだけ。「期間を指定」は置かない（§5-5）。
// 選んだ時点で即座に反映してシートを閉じる。確定ボタンは持たない。
//
// 濃淡と押せるかどうかの規則（§1.2「月セルの出し分け」）:
//   | 月                        | 表示 | 押せるか |
//   | 記録のある月              | 通常 | ○ |
//   | 記録のない過去の月・今月  | 薄い | ○（一覧は空表示になる） |
//   | 未来の月                  | 薄い | × |
// **記録のない月と未来の月は見た目では区別しない。違いは押せるかどうかだけ。**
// 盤面の組み立て（年の範囲・各マスの状態）は logic/periodGrid.ts の純粋関数が決める。
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { monthKeyToDate, shiftMonthKey } from '@/db/dates';
import { formatMonthCell, formatMonthTitle, formatYearTitle } from '@/logic/format';
import {
  ALL_PERIOD_LABEL,
  HAS_RECORDS_LEGEND_LABEL,
  LAST_MONTH_LABEL,
  NO_RECORDS_LEGEND_LABEL,
  PERIOD_SHEET_TITLE,
  THIS_MONTH_LABEL,
} from '@/logic/labels';
import { periodGrid, type MonthCell } from '@/logic/periodGrid';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** 選択中の月キー "YYYY-MM"。null = 全期間 */
  monthKey: string | null;
  /**
   * 記録が 1 件以上ある月キー（順不同）。マスの濃淡だけに使う。
   * **種別・状態・検索を無視した全記録**で作った集合を渡すこと（§1.2 の派生決定）──
   * 絞り込みでグリッドの見た目が変わると、期間選びの手がかりとして不安定になるため。
   */
  monthsWithRecords: readonly string[];
  /** 今月の月キー。未来かどうかの境目と「今月」ボタンの行き先になる */
  currentMonthKey: string;
  /** 選んだ期間。null = 全期間 */
  onSelect: (monthKey: string | null) => void;
  onClose: () => void;
};

export function PeriodSheet({
  visible,
  monthKey,
  monthsWithRecords,
  currentMonthKey,
  onSelect,
  onClose,
}: Props) {
  const colors = useThemeColors();

  const lastMonthKey = useMemo(() => shiftMonthKey(currentMonthKey, -1), [currentMonthKey]);
  const blocks = useMemo(
    () => periodGrid({ currentMonthKey, monthsWithRecords }),
    [currentMonthKey, monthsWithRecords],
  );

  // 選んだ時点で反映してシートを閉じる（§1.2「挙動」）。確定ボタンは置かない
  const choose = (next: string | null) => {
    onSelect(next);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.label }]}>{PERIOD_SHEET_TITLE}</Text>

        {/* クイック選択は ScrollView の外に置いて先頭に固定する（§1.2-2）。
            「今月」を選んでいるときはこのボタンとグリッドの該当月の**両方**がハイライトされる。
            グリッドから直接その月を選んだ場合も同じ状態になる（経由で区別しない） */}
        <View style={styles.quickRow}>
          <QuickButton
            label={THIS_MONTH_LABEL}
            selected={monthKey === currentMonthKey}
            onPress={() => choose(currentMonthKey)}
          />
          <QuickButton
            label={LAST_MONTH_LABEL}
            selected={monthKey === lastMonthKey}
            onPress={() => choose(lastMonthKey)}
          />
          <QuickButton
            label={ALL_PERIOD_LABEL}
            // 全期間のときグリッドにハイライトは出ない（月を選んでいないため）
            selected={monthKey == null}
            onPress={() => choose(null)}
          />
        </View>

        <ScrollView contentContainerStyle={styles.gridContent}>
          {blocks.map((block) => (
            <View key={block.year} style={styles.yearBlock}>
              <Text style={[styles.yearTitle, { color: colors.secondaryLabel }]}>
                {formatYearTitle(block.year)}
              </Text>
              <View style={styles.monthGrid}>
                {block.months.map((cell) => (
                  <MonthButton
                    key={cell.monthKey}
                    cell={cell}
                    selected={monthKey === cell.monthKey}
                    onPress={() => choose(cell.monthKey)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <Legend />
      </View>
    </Modal>
  );
}

/** クイック選択の 1 ボタン（今月 / 先月 / 全期間）。選択中はチップと同じ薄い青地＋青文字 */
function QuickButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickButton,
        {
          backgroundColor: selected ? colors.highlightBackground : colors.secondaryBackground,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}>
      <Text
        style={[styles.quickLabel, { color: selected ? colors.blue : colors.label }]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 月グリッドの 1 マス。未来の月は押しても何も起きない（シートも閉じない。§1.2「挙動」） */
function MonthButton({
  cell,
  selected,
  onPress,
}: {
  cell: MonthCell;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  // 記録のない月と未来の月は同じ薄さ（§1.2）。違いは disabled かどうかだけ
  const textColor = selected
    ? colors.blue
    : cell.hasRecord
      ? colors.label
      : colors.disabledContent;

  return (
    <View style={styles.monthCell}>
      <Pressable
        style={({ pressed }) => [
          styles.monthButton,
          selected && { backgroundColor: colors.highlightBackground },
          { opacity: pressed && !cell.isFuture ? 0.6 : 1 },
        ]}
        onPress={onPress}
        disabled={cell.isFuture}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: cell.isFuture }}
        // 読み上げでは年も込みで言う（マスには月しか出ていないため）
        accessibilityLabel={`${formatMonthTitle(monthKeyToDate(cell.monthKey))}${
          cell.hasRecord ? `・${HAS_RECORDS_LEGEND_LABEL}` : `・${NO_RECORDS_LEGEND_LABEL}`
        }`}>
        <Text style={[styles.monthLabel, { color: textColor }]}>
          {formatMonthCell(cell.month)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * 凡例（§1.2-4）。濃淡が何を意味するかを名指しする。
 * 未来の月は「記録なし」と同じ薄さなので項目を足さない ── 押せないことは押せば分かる。
 */
function Legend() {
  const colors = useThemeColors();

  return (
    <View style={[styles.legend, { borderTopColor: colors.separator }]}>
      <LegendItem color={colors.label} label={HAS_RECORDS_LEGEND_LABEL} />
      <LegendItem color={colors.disabledContent} label={NO_RECORDS_LEGEND_LABEL} />
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colors = useThemeColors();

  return (
    <View style={styles.legendItem}>
      {/* 見本はグリッドの文字色そのもの。色見本と本体の濃さが違うと凡例にならない */}
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  gridContent: {
    paddingBottom: 8,
    gap: 16,
  },
  yearBlock: {
    gap: 6,
  },
  yearTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // 4 列（1〜12 月が 4 列 × 3 行）。幅を割合で持たせて端末幅に追従させる
  monthCell: {
    width: '25%',
    padding: 4,
  },
  monthButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 15,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
  },
});
