// 解除バー（SPEC-V4 §4.3 / 設計案 21d）。合計行の下に 1 段だけ出る。
//
//   仕入品・タグ「洋服」で絞り込み中                          | 解除
//
// **絞り込みが 0 件のときは行ごと出ない**ので、通常の上部の高さは 4 段で固定（§4.1）。
// 段が増えるぶんリストの見える件数は減るが、**絞り込みが効いている事実を隠すより
// 高さを使う方を採る**（案 21d の趣旨）。
//
// 文言は組み立てない ── 呼び出し側が logic/recordFilter.filterSummaryText で作った 1 本の文を渡す
// （画面で文字列を連結しない。SPEC-V2 §5.3）。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FILTER_CLEAR_LABEL } from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  /** filterSummaryText の返り値。null（＝ 0 件）のときは呼び出し側がこの部品ごと出さない */
  text: string;
  /** 「解除」。3 条件を初期値へ戻す（「すべて解除」と同じ。§4.3） */
  onClear: () => void;
};

export function FilterClearBar({ text, onClear }: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.bar,
        // 合計行と地続きに見えないよう、青みのある薄い地にする（効いている状態の印）
        { backgroundColor: 'rgba(0, 122, 255, 0.08)', borderBottomColor: colors.separator },
      ]}>
      <Text style={[styles.text, { color: colors.label }]} numberOfLines={1}>
        {text}
      </Text>
      <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.clear, { color: colors.blue }]}>{FILTER_CLEAR_LABEL}</Text>
      </Pressable>
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
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
  },
  clear: {
    fontSize: 13,
    fontWeight: '600',
  },
});
