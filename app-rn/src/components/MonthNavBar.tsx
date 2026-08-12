// 月バー `◀　2026年8月 ▾　▶`（UI-SPEC §1.2）。記録タブ・データタブで共用する。
//
// **期間は 3 値**（全期間 / 年 / 月。logic/period.ts）。年を選んでいる間は `◀　2025年 ▾　▶` と出て、
// **◀▶ は前年・翌年へ動く** ── 矢印の意味は期間の種類で変わるが、
// 「表示されているものを 1 つ前後に動かす」と読めば一貫している（UI-SPEC §1.2 / SPEC-V3 §5.5 の改訂）。
//
// 無効化の規則（§5-14）も同じ読みで揃う:
//   - ▶ は今月／今年で無効（未来は選べない）
//   - ◀ はデータのある最古の月／最古の年で無効（それより前は必ず 0 件なので）
//   - 全期間を選んでいる間は両方とも無効（動かす基準がないため）
// 判定そのものは canShiftPeriod（純粋関数）が持ち、ここでは期間の種類で分岐しない。
// 中央タップで期間シート（全期間 / 年 / 各月）を開く（§5-5）。
//
// **右端に絞り込みの入口（▽）を持つ**（案 34a-A / 34a-B）。旧「絞り込み N」チップを廃して
// ここへ移したので、上部の固定段が 1 段減る。数（N）は出さない ── 効いている条件は
// 集計段の青い行（案 34a-C）に文で並ぶので、数える必要がない。
//
// **`▶` と ▽ は縦のヘアライン ＋ 12pt で分ける。** 隣接させると押し間違えるが、
// どちらも取り消しの要る操作（月が飛ぶ / 別の面が開く）なので、間隔ではなく区切りまで置く。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nextPeriodLabel, periodTitle, previousPeriodLabel } from '@/logic/labels';
import { canShiftPeriod, shiftPeriod, type Period } from '@/logic/period';
import { useThemeColors } from '@/theme';

type Props = {
  /** 表示中の期間（全期間 / "YYYY" / "YYYY-MM"） */
  period: Period;
  /** データのある最古の月キー。null = 0 件 */
  earliestMonthKey: string | null;
  /** 今月の月キー。「今日」を画面から渡して、日付をまたいでも表示が固まらないようにする */
  currentMonthKey: string;
  /** ◀ ▶ で動かした先の期間。**期間の種類は変わらない**（月なら月・年なら年） */
  onChangePeriod: (period: string) => void;
  /** 中央タップ（期間シートを開く） */
  onPressTitle: () => void;
  /**
   * 右端の ▽（絞り込みの入口）。**省略するとバーごと出ない** ──
   * データタブは絞り込みを持たないので、そこでは月バーだけになる（§6）。
   */
  filter?: {
    /** 1 つでも効いているか（hasActiveFilter）。true で青ベタになる */
    active: boolean;
    onPress: () => void;
    accessibilityLabel: string;
  };
};

export function MonthNavBar({
  period,
  earliestMonthKey,
  currentMonthKey,
  onChangePeriod,
  onPressTitle,
  filter,
}: Props) {
  const colors = useThemeColors();

  const bounds = { earliestMonthKey, currentMonthKey };
  const canGoBack = canShiftPeriod(period, -1, bounds);
  const canGoForward = canShiftPeriod(period, 1, bounds);
  /** 1 つ前後に動かす。全期間では矢印そのものが無効なので、shiftPeriod の null は届かない */
  const shift = (delta: number) => {
    const next = shiftPeriod(period, delta);
    if (next != null) onChangePeriod(next);
  };

  const title = periodTitle(period);
  // 読み上げの語も期間の種類に合わせる（「前の月」/「前の年」）。表示語は画面で組み立てない
  const backLabel = previousPeriodLabel(period);
  const forwardLabel = nextPeriodLabel(period);

  return (
    <View style={styles.bar}>
      {/* 月の 3 つ組を画面の中央から動かさないため、▽ と同じ幅の空きを左にも取る */}
      {filter != null && <View style={styles.side} />}

      <View style={styles.months}>
        <ArrowButton
          name="chevron-back"
          enabled={canGoBack}
          onPress={() => shift(-1)}
          accessibilityLabel={backLabel}
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
          onPress={() => shift(1)}
          accessibilityLabel={forwardLabel}
        />
      </View>

      {filter != null && (
        <View style={styles.side}>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <Pressable
            onPress={filter.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ selected: filter.active }}
            accessibilityLabel={filter.accessibilityLabel}
            style={({ pressed }) => [
              styles.filterButton,
              {
                // 効いている間は青ベタ。**色は常時・文は詳細**の役割分担（案 34a-C）で、
                // ここは「効いているかどうか」だけを、条件が何であれ同じ形で言う
                backgroundColor: filter.active ? colors.blue : 'transparent',
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <Ionicons
              name={filter.active ? 'funnel' : 'funnel-outline'}
              size={18}
              color={filter.active ? FILTER_ACTIVE_FOREGROUND : colors.blue}
            />
          </Pressable>
        </View>
      )}
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
      <Ionicons name={name} size={20} color={enabled ? colors.blue : colors.disabledContent} />
    </Pressable>
  );
}

/** 青ベタの上のアイコン。地が常に blue なので、明暗どちらでも白で読める */
const FILTER_ACTIVE_FOREGROUND = '#FFFFFF';

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  months: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  // 左右で同じ幅。中身が入るのは右だけで、左は月の 3 つ組を中央に保つための空き
  side: {
    width: 57,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // `▶` と ▽ の間の区切り。12pt の余白を左右に持たせて当たり判定を離す
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginRight: 12,
  },
  filterButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
