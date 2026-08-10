// 固定の合計行（UI-SPEC §1.2-3 / §1.5-3）。左に集計値を 2〜3 個、右端にチップを並べる。
//
// 記録タブは 2 値（収支・経費 / 出品中 N 点・出品価格の合計）＋チップ 2 つ、
// データタブは 3 値（売上・収支・経費）＋チップ 1 つ。どちらも同じ 1 段に収める部品。
//
// 値は「丸め済みの表示文字列」を受け取る。金額かどうか（¥ を付けるか、N 点か）は
// 呼び出し側の集計の意味で決まるため、この部品は書式に関与しない。
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type SummaryItem = {
  /** 見出し（例:「この月の収支」「出品価格の合計」） */
  label: string;
  /** 表示済みの値（例:「¥1,405」「3 点」） */
  value: string;
  /** 値の文字色 */
  color: string;
};

type Props = {
  items: SummaryItem[];
  /** 右端に置くチップなど */
  trailing?: ReactNode;
};

export function SummaryBar({ items, trailing }: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.secondaryBackground, borderBottomColor: colors.separator },
      ]}>
      <View style={styles.values}>
        {items.map((item) => (
          <View key={item.label} style={styles.item}>
            <Text style={[styles.label, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.value, { color: item.color }]} numberOfLines={1}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      {trailing != null && <View style={styles.trailing}>{trailing}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  values: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
  },
  item: {
    flexShrink: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
  },
  value: {
    fontSize: 17,
    fontWeight: '700',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
