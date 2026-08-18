// 日付の入力行（UI-SPEC §8.10.1）。RecordFormView の「出品日」「販売日」（SPEC §3.2）で使う。
//
// **行の中で 1 タップ、それ以外だけシート。** 多数派の日付（今日・昨日）は行に常設した
// チップで決め、それ以外を選ぶときだけ値のボタンからカレンダーを開く。
// ホイール（旧 DatePickerSheet）は使わない ── 「通り過ぎるので使いたくない」という
// 実利用者の指摘と、範囲外を選択肢ごと消したせいで「過去に入力した内容しか出てこない」と
// 誤解された件（§8.10）への対応。
//
// 行の見た目（ラベル＋値）は旧実装のまま残し、チップを 1 段足しただけにしてある（§8.10.5）。
// 値の表示を残すのは、チップにない日付を選んだときにそれが読める場所が他にないため。
//
// 日付だけを選び、時刻は元の値のまま引き継ぐ（Swift 版 .date と同じく時刻は編集しない）。
// 月次グループ化のキーは年月なので（SPEC §6.1）、時刻の扱いは表示にも集計にも影響しない。
//
// minDate / maxDate は欄ごとの選べる範囲（§8.10.4）。チップの淡色とカレンダーの盤面が
// **同じ範囲**を見るので、行で押せないチップがシートでは押せる、という食い違いは起きない。
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { DateChips } from '@/components/DateChips';
import { dayChips } from '@/logic/calendar';
import { formatRecordDate } from '@/logic/format';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** 選べる範囲（両端を含む）。省略した側は制限なし */
type RangeProps = {
  minDate?: Date;
  maxDate?: Date;
};

type Props = RangeProps & {
  label: string;
  value: Date;
  onChangeValue: (value: Date) => void;
  /** 「今日」の基準。チップの起点であり、カレンダーで印を出す日 */
  today: Date;
  /**
   * ボタンに出す文字の上書き（記録フォームの「今日（2026/08/09）」。UI-SPEC §1.3-12）。
   * 省略すると日付そのもの。ピッカーが選ぶ値は変わらず、表示だけが差し替わる。
   */
  valueText?: string;
  /** 当日であることを青で示す（UI-SPEC §1.3-12） */
  accent?: boolean;
  /**
   * 行に薄い青の下地を敷く（UI-SPEC §8.3）。状態を切り替えた直後だけ立て、
   * 「ここを直せばいい」と指すために使う。地色以外は変わらないので行の高さは動かない。
   */
  highlighted?: boolean;
  /** カレンダーで小さな旗を出す日（売れた日の欄では出品日。§8.10.2） */
  flagDate?: Date | null;
  /** カレンダーに出す「選べない理由」の一行（§8.10.2） */
  note?: string;
  /**
   * **行のチップ**が淡色のときにその理由を出す一行（§8.10.1 / §8.10.5）。
   *
   * 淡色にするところまでで止めると「押せないのは不具合では」と読まれる ── 淡色と理由の一行は
   * 1 組（§8.10.5）。カレンダーの `note` と語が違うのは、行とシートで淡くなっているものが
   * 違うため（labels.soldDateChipsNote 参照）。
   *
   * 出るのは**実際にどれかのチップが落ちているときだけ**。全部押せる行に
   * 「〜は選べません」と書くと、無い制約を探させることになる。
   */
  chipsNote?: string;
};

export function DateField({
  label,
  value,
  onChangeValue,
  today,
  valueText,
  accent = false,
  highlighted = false,
  minDate,
  maxDate,
  flagDate,
  note,
  chipsNote,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);
  const text = valueText ?? formatRecordDate(locale, value);

  const chips = useMemo(
    () => dayChips(locale, { today, range: { min: minDate, max: maxDate }, selected: value }),
    [today, minDate, maxDate, value, locale],
  );

  return (
    <View
      style={[
        styles.row,
        highlighted && { backgroundColor: colors.highlightBackground },
      ]}>
      <View style={styles.valueRow}>
        <Text style={[styles.label, { color: colors.label }]}>{label}</Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={({ pressed }) => [
            styles.valueButton,
            { backgroundColor: colors.disabledBackground, opacity: pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${text}`}>
          <Text style={[styles.value, { color: accent ? colors.blue : colors.label }]}>{text}</Text>
          <Text style={[styles.chevron, { color: colors.mutedLabel }]}>▸</Text>
        </Pressable>
      </View>

      {/* 押した時点で値が決まる（確定操作は挟まない。§8.10.1）。範囲外は淡色で押せない */}
      <DateChips chips={chips} onSelect={onChangeValue} note={chipsNote} />

      {/* 開いている間だけマウントして、盤面の位置を現在の値で初期化する */}
      {showPicker && (
        <CalendarPicker
          title={label}
          value={value}
          onChangeValue={onChangeValue}
          onClose={() => setShowPicker(false)}
          minDate={minDate}
          maxDate={maxDate}
          today={today}
          flagDate={flagDate}
          note={note}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // ハイライトの下地がラベル・値の外側まで届くよう、常に同じぶんだけ内外の余白を持つ。
    // 地色が付くのは highlighted のときだけで、行の位置は変わらない
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 8,
  },
  valueRow: {
    // ラベルと値は旧実装と同じ 1 行（§8.10.5）。チップはその下に段を足す ──
    // 「出品日 [今日][昨日][一昨日] 2026/08/10 ▸」を 1 行に詰めると端末幅に収まらない
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  valueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  value: {
    fontSize: 16,
  },
  chevron: {
    fontSize: 14,
  },
});
