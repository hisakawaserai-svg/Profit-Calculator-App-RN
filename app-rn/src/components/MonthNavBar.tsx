// 月バー `◀　2026年8月 ▾　▶`（UI-SPEC §1.2）。記録タブ・データタブで共用する。
//
// 無効化の規則（§5-14）:
//   - ▶ は今月で無効（未来の月は選べない）
//   - ◀ はデータのある最古の月で無効（それより前は必ず 0 件なので）
//   - 全期間を選んでいる間は両方とも無効（動かす基準の月がないため）
// 中央タップで期間シート（全期間 / 各月）を開く。選べるのは全期間か 1 か月のいずれかだけ（§5-5）。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shiftMonthKey, monthKeyToDate } from '@/db/dates';
import { formatMonthTitle } from '@/logic/format';
import { ALL_PERIOD_LABEL } from '@/logic/labels';
import { useThemeColors } from '@/theme';

/** 無効な矢印の色（UI-SPEC §1.2） */
const DISABLED_ARROW_COLOR = 'rgba(60, 60, 67, 0.25)';

type Props = {
  /** 表示中の月キー "YYYY-MM"。null = 全期間 */
  monthKey: string | null;
  /** データのある最古の月キー。null = 0 件 */
  earliestMonthKey: string | null;
  /** 今月の月キー。「今日」を画面から渡して、日付をまたいでも表示が固まらないようにする */
  currentMonthKey: string;
  onChangeMonth: (monthKey: string) => void;
  /** 中央タップ（期間シートを開く） */
  onPressTitle: () => void;
};

export function MonthNavBar({
  monthKey,
  earliestMonthKey,
  currentMonthKey,
  onChangeMonth,
  onPressTitle,
}: Props) {
  const colors = useThemeColors();

  // 月キーは固定長なので、大小比較はそのまま文字列比較でよい
  const canGoBack =
    monthKey != null && earliestMonthKey != null && monthKey > earliestMonthKey;
  const canGoForward = monthKey != null && monthKey < currentMonthKey;

  const title =
    monthKey == null ? ALL_PERIOD_LABEL : formatMonthTitle(monthKeyToDate(monthKey));

  return (
    <View style={styles.bar}>
      <ArrowButton
        name="chevron-back"
        enabled={canGoBack}
        onPress={() => monthKey != null && onChangeMonth(shiftMonthKey(monthKey, -1))}
        accessibilityLabel="前の月"
      />

      <Pressable
        style={styles.title}
        onPress={onPressTitle}
        accessibilityRole="button"
        accessibilityLabel={`表示する期間: ${title}`}>
        <Text style={[styles.titleLabel, { color: colors.label }]}>{title}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.secondaryLabel} />
      </Pressable>

      <ArrowButton
        name="chevron-forward"
        enabled={canGoForward}
        onPress={() => monthKey != null && onChangeMonth(shiftMonthKey(monthKey, 1))}
        accessibilityLabel="次の月"
      />
    </View>
  );
}

function ArrowButton({
  name,
  enabled,
  onPress,
  accessibilityLabel,
}: {
  name: 'chevron-back' | 'chevron-forward';
  enabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={12}
      style={styles.arrow}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name={name} size={20} color={enabled ? colors.blue : DISABLED_ARROW_COLOR} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  arrow: {
    padding: 4,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  titleLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
