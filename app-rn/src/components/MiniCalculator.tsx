// MiniCalc.swift（MiniCalculatorView）の移植。
// SPEC §3.2「MiniCalculatorView（共通部品・popover）」。
// iPhone では SwiftUI の popover もシート表示になるため、RN では Modal で再現する。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { evaluateExpression, isCalculatorOperator } from '@/logic/calculator';
import { useThemeColors } from '@/theme';

const BUTTON_ROWS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', 'C', '=', '+'],
];

type Props = {
  /**
   * 親の入力欄の値。Swift 版の .onAppear 相当で、マウント時の初期表示にのみ使う
   * （開いている間の親側の変化は反映しない）。
   */
  targetText: string;
  /** 「この数字を入力する」で親の入力欄へ書き戻す */
  onSubmit: (value: string) => void;
  onClose: () => void;
};

/** 開いている間だけマウントする前提のコンポーネント（初期表示を state の初期値で決めるため）。 */
export function MiniCalculator({ targetText, onSubmit, onClose }: Props) {
  const colors = useThemeColors();
  // "0" のときだけ空から始める
  const [display, setDisplay] = useState(() => (targetText === '0' ? '' : targetText));

  const handleButton = (label: string) => {
    if (label === 'C') {
      setDisplay('');
    } else if (label === '=') {
      setDisplay((current) => evaluateExpression(current));
    } else {
      setDisplay((current) => current + label);
    }
  };

  const handleSubmit = () => {
    onSubmit(evaluateExpression(display));
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* カード自身を Pressable にして、背景のタップ判定を奪う（カード内タップでは閉じない） */}
        <Pressable style={[styles.card, { backgroundColor: colors.background }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.label }]}>電卓</Text>
            <Pressable onPress={onClose} accessibilityLabel="電卓を閉じる">
              <Ionicons name="close-circle" size={22} color={colors.gray} />
            </Pressable>
          </View>

          <Text style={[styles.display, { color: colors.label }]} numberOfLines={1}>
            {display.length === 0 ? '0' : display}
          </Text>

          {BUTTON_ROWS.map((row) => (
            <View key={row.join('')} style={styles.row}>
              {row.map((label) => {
                const operator = isCalculatorOperator(label);
                return (
                  <Pressable
                    key={label}
                    onPress={() => handleButton(label)}
                    style={({ pressed }) => [
                      styles.key,
                      {
                        backgroundColor: operator ? colors.orange : colors.secondaryBackground,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}>
                    <Text
                      style={[styles.keyLabel, { color: operator ? '#FFFFFF' : colors.label }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={styles.submitLabel}>この数字を入力する</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    width: 280,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  display: {
    textAlign: 'right',
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  key: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  submit: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
