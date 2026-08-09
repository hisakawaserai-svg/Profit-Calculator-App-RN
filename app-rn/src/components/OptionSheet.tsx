// SwiftUI の Menu { Button... } 相当。RN にメニュー相当のプリミティブがないため、
// 下から出るシートで選択肢を並べる。ソートメニュー（SPEC §3.2 のツールバー）で使う。
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type SheetOption<T extends string> = { label: string; value: T };

type Props<T extends string> = {
  visible: boolean;
  title: string;
  /** Swift 版 Menu の Divider に対応させるため、グループ単位で受け取り間に区切り線を入れる */
  groups: SheetOption<T>[][];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

export function OptionSheet<T extends string>({
  visible,
  title,
  groups,
  selectedValue,
  onSelect,
  onClose,
}: Props<T>) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
        <ScrollView bounces={false}>
          {groups.map((group, groupIndex) => (
            <View
              key={group.map((option) => option.value).join(',')}
              style={[
                styles.group,
                { backgroundColor: colors.secondaryBackground },
                groupIndex > 0 && styles.groupSpacing,
              ]}>
              {group.map((option, index) => (
                <View key={option.value}>
                  {index > 0 && (
                    <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                  )}
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onSelect(option.value);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: option.value === selectedValue }}>
                    <Text style={[styles.optionLabel, { color: colors.label }]}>
                      {option.label}
                    </Text>
                    {option.value === selectedValue && (
                      <Text style={[styles.check, { color: colors.blue }]}>✓</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  sheet: {
    maxHeight: '60%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  group: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  groupSpacing: {
    marginTop: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionLabel: {
    fontSize: 16,
  },
  check: {
    fontSize: 16,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
