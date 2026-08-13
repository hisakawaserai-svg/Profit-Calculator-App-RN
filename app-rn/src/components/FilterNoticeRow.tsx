// 絞り込み中だけ出る青い行（SPEC-V4 §4.3 / 案 21d → 34a-C）。**記録タブとデータタブで共用する。**
//
//   ▽ 仕入品・タグ「洋服」の14件だけ                          | 解除
//
// **押せる場所が 1 行に 2 つある。** 左（▽ ＋ 条件文）で絞り込みの面を開き、右端の「解除」で外す。
// 当たり判定は右端に余白を取って明確に分け、読み上げでも 2 つのボタンとして扱う。
// 左を押して面へ行けるのは、**絞り込み中はこの行が最も目に入る**から ── そこから直せると往復が減る。
//
// **置く場所はタブで違う**（見た目と中身は同じ）:
//   - 記録タブ … 集計段（SummaryBar）の中に生える。固定段の中なので段数は増えない（案 34a-C）
//   - データタブ … **月バーの直下**（UI-SPEC §1.5 / 案 36b）。集計段とグラフカードの間に挟むと
//     絞り込みの有無で両者の距離が変わるが、月バーの下なら
//     「期間 → 絞り込み → その結果」の順に読め、集計とグラフは常に隣り合ったままになる
//
// 文言は純粋関数（logic/recordFilter の filterSummaryText）が組む。ここは並べるだけ。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FILTER_CLEAR_ACTION_LABEL,
  FILTER_CLEAR_LABEL,
  FILTER_NOTICE_HINT,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

export type FilterNotice = {
  /** filterSummaryText の返り値（「仕入品・タグ「洋服」の14件だけ」）。null なら行ごと出ない */
  text: string | null;
  onPressFilter: () => void;
  onClear: () => void;
};

export function FilterNoticeRow({
  text,
  onPressFilter,
  onClear,
}: { text: string } & Omit<FilterNotice, 'text'>) {
  const colors = useThemeColors();

  return (
    // 左右の余白を持たずに端まで届かせる。青い地が「生えた」ように見えるため
    <View style={[styles.row, { backgroundColor: FILTER_ROW_BACKGROUND }]}>
      <Pressable
        onPress={onPressFilter}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={FILTER_NOTICE_HINT}
        style={({ pressed }) => [styles.main, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="funnel" size={13} color={colors.blue} />
        <Text style={[styles.text, { color: colors.label }]} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      {/* 「解除」は左の当たり判定と重ならないよう、余白ごと自分の側に持つ */}
      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={FILTER_CLEAR_ACTION_LABEL}
        style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.5 : 1 }]}>
        <Text style={[styles.clearLabel, { color: colors.blue }]}>{FILTER_CLEAR_LABEL}</Text>
      </Pressable>
    </View>
  );
}

/** 青い行の地。明暗どちらでも「青みの薄い地」に見える透過（解除バーから引き継ぎ） */
const FILTER_ROW_BACKGROUND = 'rgba(0, 122, 255, 0.10)';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 9,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
  },
  clear: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 9,
  },
  clearLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
