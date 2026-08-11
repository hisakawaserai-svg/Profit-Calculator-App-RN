// SwiftUI の Menu { Button... } 相当。RN にメニュー相当のプリミティブがないため、
// 下から出るシートで選択肢を並べる。並び替えシート・期間シート（UI-SPEC §1.2）で使う。
//
// SPEC-V2 §7-10 で同居させていた種別フィルタは、合計行のチップへ移したのでこのシートから外した
// （UI-SPEC §3.2）。シートが持つのは「1 つの選択値 ＋ 先頭の任意アクション」だけになる。
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useThemeColors } from '@/theme';

export type SheetOption<T extends string> = { label: string; value: T };

/** 選択肢より前に置く 1 行のアクション（UI-SPEC §1.2「並び替えシートの先頭に絞り込みをすべて解除」） */
export type SheetAction = { label: string; onPress: () => void };

type Props<T extends string> = {
  visible: boolean;
  title: string;
  /** 先頭のアクション行。押すと実行してシートを閉じる */
  action?: SheetAction;
  /** 選択肢の見出し。省略すると出ない */
  heading?: string;
  /** Swift 版 Menu の Divider に対応させるため、グループ単位で受け取り間に区切り線を入れる */
  groups: SheetOption<T>[][];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

export function OptionSheet<T extends string>({
  visible,
  title,
  action,
  heading,
  groups,
  selectedValue,
  onSelect,
  onClose,
}: Props<T>) {
  const colors = useThemeColors();

  return (
    // 幕はシートと一緒に上がってこない（不透明度だけで出る。SheetModal 参照）。
    // 選んだ時点で閉じる行も close を通し、下がり切ってから onClose が呼ばれるようにする
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
          <ScrollView bounces={false}>
            {action != null && (
              <Pressable
                style={[
                  styles.group,
                  styles.option,
                  { backgroundColor: colors.secondaryBackground },
                ]}
                onPress={() => {
                  action.onPress();
                  close();
                }}
                accessibilityRole="button">
                <Text style={[styles.optionLabel, { color: colors.blue }]}>{action.label}</Text>
              </Pressable>
            )}
            {heading != null && <SectionHeading text={heading} spaced={action != null} />}
            {groups.map((group, groupIndex) => (
              <OptionGroup
                key={group.map((option) => option.value).join(',')}
                options={group}
                spaced={groupIndex > 0}
                selectedValue={selectedValue}
                onSelect={(value) => {
                  onSelect(value);
                  close();
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </SheetModal>
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
