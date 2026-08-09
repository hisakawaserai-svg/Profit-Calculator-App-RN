// MonthlyRecordList.swift の monthYearPickerView（年月ホイールのハーフモーダル）の移植。
//
// - 年の範囲は SPEC 決定 §7-12「現在年の前後 5 年（計 11 年）」。Swift 版の 2000〜2100 から縮小。
// - 月フィルタは年月の完全一致（SPEC §6.1）。期間指定ではない。
// - Swift 版と同じく、ホイールを動かした時点で即フィルタが変わる。
//   「決定」は閉じるだけ、「リセット」は全期間に戻して選択位置を今月へ戻す。
// - @expo/ui の wheel Picker は SwiftUI 専用で Android に載らないため、
//   SegmentedControl と同じ方針（SPEC §7-14 の将来の Android 対応）で RN プリミティブで組む。
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toMonthKey } from '@/db/dates';
import { useThemeColors } from '@/theme';

/** 現在年の前後 5 年（決定 §7-12） */
const YEAR_RANGE = 5;

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

type Props = {
  visible: boolean;
  /** 選択中の月キー "YYYY-MM"。null = 全期間 */
  monthKey: string | null;
  onChangeMonth: (monthKey: string) => void;
  onReset: () => void;
  onClose: () => void;
};

export function MonthPickerSheet({
  visible,
  monthKey,
  onChangeMonth,
  onReset,
  onClose,
}: Props) {
  const colors = useThemeColors();

  // 未選択（全期間）のときは今日の年月をホイール位置にする（Swift 版 @State の初期値と同じ）
  const today = useMemo(() => new Date(), []);
  const [selectedYear, selectedMonth] = useMemo(() => {
    const [year, month] = (monthKey ?? toMonthKey(today)).split('-').map(Number);
    return [year, month] as const;
  }, [monthKey, today]);

  const years = useMemo(() => {
    const currentYear = today.getFullYear();
    return Array.from(
      { length: YEAR_RANGE * 2 + 1 },
      (_, index) => currentYear - YEAR_RANGE + index,
    );
  }, [today]);

  const select = (year: number, month: number) => {
    onChangeMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.label }]}>表示月を選択</Text>

        <View style={styles.columns}>
          <WheelColumn
            values={years}
            selectedValue={selectedYear}
            format={(year) => `${year}年`}
            onSelect={(year) => select(year, selectedMonth)}
          />
          <WheelColumn
            values={MONTHS}
            selectedValue={selectedMonth}
            format={(month) => `${month}月`}
            onSelect={(month) => select(selectedYear, month)}
          />
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, { backgroundColor: colors.blue }]}
            onPress={onClose}
            accessibilityRole="button">
            <Text style={styles.buttonLabel}>決定</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: colors.blue }]}
            onPress={onReset}
            accessibilityRole="button">
            <Text style={styles.buttonLabel}>リセット</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function WheelColumn({
  values,
  selectedValue,
  format,
  onSelect,
}: {
  values: number[];
  selectedValue: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  const colors = useThemeColors();

  return (
    <ScrollView
      style={[styles.column, { backgroundColor: colors.secondaryBackground }]}
      contentContainerStyle={styles.columnContent}>
      {values.map((value) => {
        const selected = value === selectedValue;
        return (
          <Pressable
            key={value}
            style={[styles.item, selected && { backgroundColor: colors.disabledBackground }]}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <Text
              style={[
                styles.itemLabel,
                { color: selected ? colors.blue : colors.label },
                selected && styles.itemLabelSelected,
              ]}>
              {format(value)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
    borderRadius: 10,
  },
  columnContent: {
    paddingVertical: 4,
  },
  item: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 17,
  },
  itemLabelSelected: {
    fontWeight: '700',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
