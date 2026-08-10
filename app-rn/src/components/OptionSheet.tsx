// SwiftUI の Menu { Button... } 相当。RN にメニュー相当のプリミティブがないため、
// 下から出るシートで選択肢を並べる。ソートメニュー（SPEC §3.2 のツールバー）で使う。
//
// SPEC-V2 §7-10 の決定により、種別フィルタもこのシートに同居させる。独立したセグメント
// コントロールをヘッダ下に置くと検索バーと合わせて縦幅を二重に食うため。
// 種別はソートとは別の state なので、`section` として選択値の型・onSelect ごと分けて受け取る。
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type SheetOption<T extends string> = { label: string; value: T };

/** ソート値とは別の選択値を同じシートに並べるための追加セクション（SPEC-V2 §4.2） */
export type SheetSection<K extends string> = {
  heading: string;
  options: SheetOption<K>[];
  selectedValue: K;
  onSelect: (value: K) => void;
};

type Props<T extends string, K extends string> = {
  visible: boolean;
  title: string;
  /** 主セクションの見出し。section を足して 2 種類の選択が並ぶときに付ける */
  heading?: string;
  /** Swift 版 Menu の Divider に対応させるため、グループ単位で受け取り間に区切り線を入れる */
  groups: SheetOption<T>[][];
  selectedValue: T;
  onSelect: (value: T) => void;
  section?: SheetSection<K>;
  onClose: () => void;
};

export function OptionSheet<T extends string, K extends string = never>({
  visible,
  title,
  heading,
  groups,
  selectedValue,
  onSelect,
  section,
  onClose,
}: Props<T, K>) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
        <ScrollView bounces={false}>
          {heading != null && <SectionHeading text={heading} />}
          {groups.map((group, groupIndex) => (
            <OptionGroup
              key={group.map((option) => option.value).join(',')}
              options={group}
              spaced={groupIndex > 0}
              selectedValue={selectedValue}
              onSelect={(value) => {
                onSelect(value);
                onClose();
              }}
            />
          ))}

          {section && (
            <>
              <SectionHeading text={section.heading} spaced />
              <OptionGroup
                options={section.options}
                selectedValue={section.selectedValue}
                onSelect={(value) => {
                  section.onSelect(value);
                  onClose();
                }}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SectionHeading({ text, spaced }: { text: string; spaced?: boolean }) {
  const colors = useThemeColors();

  return (
    <Text
      style={[
        styles.heading,
        { color: colors.secondaryLabel },
        spaced === true && styles.headingSpacing,
      ]}>
      {text}
    </Text>
  );
}

/** 区切り線で囲われた 1 グループ。同じ選択値を共有する選択肢の並び */
function OptionGroup<T extends string>({
  options,
  spaced,
  selectedValue,
  onSelect,
}: {
  options: SheetOption<T>[];
  spaced?: boolean;
  selectedValue: T;
  onSelect: (value: T) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.secondaryBackground },
        spaced === true && styles.groupSpacing,
      ]}>
      {options.map((option, index) => (
        <View key={option.value}>
          {index > 0 && (
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
          )}
          <Pressable
            style={styles.option}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === selectedValue }}>
            <Text style={[styles.optionLabel, { color: colors.label }]}>{option.label}</Text>
            {option.value === selectedValue && (
              <Text style={[styles.check, { color: colors.blue }]}>✓</Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
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
  heading: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 6,
  },
  headingSpacing: {
    marginTop: 20,
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
