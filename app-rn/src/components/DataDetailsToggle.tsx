// データタブの集計段（DataSummaryBar）の直下に足す開閉行（採用案 1c）。
//
//   [ この月の収支 ...                              売上 / 経費 ]  ← DataSummaryBar（変更なし）
//   詳細を見る ⌄                                                  ← この部品（畳んだ状態）
//
//   詳細を見る ⌄ → タップ →
//
//   閉じる ⌃
//   利益率        販売件数
//   1件あたり     平均販売日数
//
// **ヘッダーの見た目には一切手を入れず**、その直下に独立した行を足す形（案 1c）。
// 展開する 4 値は「選んだ期間全体」の合計で、グラフの棒タップでは変わらない ──
// summary は月バー直下の DataSummaryBar と同じ、絞り込み後の期間合計そのもの。
//
// **2 行 × 2 列で折り返す**（4 項目を 1 行に並べると、符号つきの金額（例:「-¥12,345」）が
// numberOfLines={1} で切れる幅しか残らない。折り返せば各列の幅を確保できる）。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type DataDetailItem = {
  label: string;
  value: string;
  color: string;
};

type Props = {
  expanded: boolean;
  onToggle: () => void;
  toggleLabel: string;
  /** 利益率・販売件数・1件あたり・平均販売日数の順で 4 項目 */
  items: [DataDetailItem, DataDetailItem, DataDetailItem, DataDetailItem];
};

export function DataDetailsToggle({ expanded, onToggle, toggleLabel, items }: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.secondaryBackground, borderBottomColor: colors.separator },
      ]}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={({ pressed }) => [styles.toggleRow, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded }}>
        <Text style={[styles.toggleLabel, { color: colors.blue }]}>{toggleLabel}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.blue} />
      </Pressable>

      {expanded && (
        <View style={styles.items}>
          {items.map((item) => (
            <View key={item.label} style={styles.item}>
              <Text style={[styles.itemLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.itemValue, { color: item.color }]} numberOfLines={1}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 13,
  },
  items: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: 12,
    paddingBottom: 4,
  },
  item: {
    width: '47%',
    gap: 2,
    paddingBottom: 12,
  },
  itemLabel: {
    fontSize: 12,
  },
  itemValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
