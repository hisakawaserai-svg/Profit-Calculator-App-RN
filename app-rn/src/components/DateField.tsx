// SwiftUI の DatePicker(displayedComponents: .date) 相当。
// RecordFormView の「出品日」「販売日」（SPEC §3.2）で使う。
//
// @expo/ui の DatePicker は SwiftUI 専用で Android に載らないため、
// MonthPickerSheet / SegmentedControl と同じ方針（将来の Android 対応・SPEC §7-14）で
// RN プリミティブのホイール（WheelColumn）で組む。
//
// 日付だけを選び、時刻は元の値のまま引き継ぐ（Swift 版 .date と同じく時刻は編集しない）。
// 月次グループ化のキーは年月なので（SPEC §6.1）、時刻の扱いは表示にも集計にも影響しない。
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { WheelColumn, rangeOfNumbers } from '@/components/WheelColumn';
import { formatRecordDate } from '@/logic/format';
import { useThemeColors } from '@/theme';

/** 選択できる年の範囲。年月ピッカーと揃えて現在年の前後 5 年（決定 §7-12） */
const YEAR_RANGE = 5;

const MONTHS = rangeOfNumbers(1, 12);

type Props = {
  label: string;
  value: Date;
  onChangeValue: (value: Date) => void;
};

export function DateField({ label, value, onChangeValue }: Props) {
  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.label }]}>{label}</Text>
      <Pressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [
          styles.valueButton,
          { backgroundColor: colors.disabledBackground, opacity: pressed ? 0.5 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatRecordDate(value)}`}>
        <Text style={[styles.value, { color: colors.label }]}>{formatRecordDate(value)}</Text>
      </Pressable>

      {/* 開いている間だけマウントして、ホイール位置を現在の値で初期化する */}
      {showPicker && (
        <DatePickerSheet
          title={label}
          value={value}
          onChangeValue={onChangeValue}
          onClose={() => setShowPicker(false)}
        />
      )}
    </View>
  );
}

function DatePickerSheet({
  title,
  value,
  onChangeValue,
  onClose,
}: {
  title: string;
  value: Date;
  onChangeValue: (value: Date) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();

  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();

  // 前後 5 年に収まらない古い記録を編集するときも、その年を選べるように範囲へ含める
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return rangeOfNumbers(
      Math.min(currentYear - YEAR_RANGE, year),
      Math.max(currentYear + YEAR_RANGE, year),
    );
  }, [year]);

  const days = useMemo(() => rangeOfNumbers(1, daysInMonth(year, month)), [year, month]);

  /** 時刻は元の値から引き継ぐ。月末を超える日（1/31 → 2 月など）はその月の末日に丸める */
  const select = (nextYear: number, nextMonth: number, nextDay: number) => {
    const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth));
    onChangeValue(
      new Date(
        nextYear,
        nextMonth - 1,
        clampedDay,
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.sheetTitle, { color: colors.label }]}>{title}</Text>

        <View style={styles.columns}>
          <WheelColumn
            values={years}
            selectedValue={year}
            format={(n) => `${n}年`}
            onSelect={(nextYear) => select(nextYear, month, day)}
            accessibilityLabel="年"
          />
          <WheelColumn
            values={MONTHS}
            selectedValue={month}
            format={(n) => `${n}月`}
            onSelect={(nextMonth) => select(year, nextMonth, day)}
            accessibilityLabel="月"
          />
          <WheelColumn
            values={days}
            selectedValue={day}
            format={(n) => `${n}日`}
            onSelect={(nextDay) => select(year, month, nextDay)}
            accessibilityLabel="日"
          />
        </View>

        <Pressable
          style={[styles.doneButton, { backgroundColor: colors.blue }]}
          onPress={onClose}
          accessibilityRole="button">
          <Text style={styles.doneLabel}>決定</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** その年月の日数（翌月 0 日 = 当月の末日） */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  valueButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  value: {
    fontSize: 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    height: '55%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  doneButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  doneLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
