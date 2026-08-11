// 固定の合計行（UI-SPEC §1.2-3 / §1.5-3。SPEC-V4 §4.1 で 2 段構成に作り替えた）。
//
//   1 段目 = 集計 2〜3 値
//   2 段目 = セグメント（横幅いっぱい）＋ 右端に「絞り込み N」チップ
//
// **集計を上、操作を下**にするのは決定 §9-1 ── 集計は常に見えているべきで、
// セグメントは操作。操作を値の上に置くと、目が最初に当たるのが数字ではなくボタンになる。
//
// `trailing` にチップを並べる旧来の形は廃止した（SPEC-V4 §4.1）。状態は 2 段目のセグメントへ、
// 種別は絞り込みシートの中へ移り、右端に残るのはチップ 1 つだけになったため。
//
// 値は「丸め済みの表示文字列」を受け取る。金額かどうか（¥ を付けるか、N 点か）は
// 呼び出し側の集計の意味で決まるため、この部品は書式に関与しない。
import { StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '@/components/FilterChip';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useThemeColors } from '@/theme';

export type SummaryItem = {
  /** 見出し（例:「この月の収支」「出品価格の合計」） */
  label: string;
  /** 表示済みの値（例:「¥1,405」「3 点」） */
  value: string;
  /** 値の文字色 */
  color: string;
};

/** 2 段目のセグメント（記録タブの「売れた記録 / 出品中」。§4.1） */
export type SummarySegment = {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
};

/** 2 段目の右端のチップ（「絞り込み N」。§4.1） */
export type SummaryChip = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

type Props = {
  items: SummaryItem[];
  /** 省略するとチップだけが 2 段目に載る（データタブ。§6 で同じ形に揃える） */
  segment?: SummarySegment;
  chip?: SummaryChip;
};

export function SummaryBar({ items, segment, chip }: Props) {
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

      {(segment != null || chip != null) && (
        <View style={styles.controls}>
          {/* セグメントは横幅いっぱい（決定 §9-1）。押した先が見えることが状態チップとの差 */}
          {segment != null && (
            <View style={styles.segment}>
              <SegmentedControl
                options={segment.options}
                selectedIndex={segment.selectedIndex}
                onChange={segment.onChange}
              />
            </View>
          )}
          {chip != null && (
            <FilterChip
              label={chip.label}
              onPress={chip.onPress}
              accessibilityLabel={chip.accessibilityLabel}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  values: {
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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  segment: {
    flex: 1,
  },
});
