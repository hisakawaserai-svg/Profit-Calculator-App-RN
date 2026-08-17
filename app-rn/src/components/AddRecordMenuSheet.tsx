// 記録タブの「＋ 記録」を押したときに出る 2 択（新しく作る / 過去の記録から複製）。
//
// **＋の行き先を 2 つにしたので、押した先をシートで分ける。** 長押しや隠しメニューにしなかったのは、
// 同じ物を何度も出す人にとって複製が本命になり得るから ── 見えない操作は使われないまま終わる。
//
// 形は並び替えシート（SortSheet）と同じ「見出し ＋ 1 枚のカードに行」。選んだ時点で閉じるので、
// 確定のボタンは置かない（PresetPickerSheet と同じ扱い）。
//
// **行は 2 つとも同じ重さで描く。** 片方を大きくしたり色を付けたりすると、
// もう片方が「上級者向け」に見える ── どちらも記録を 1 件作るだけの、対等な入口。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import {
  ADD_RECORD_MENU_TITLE,
  DUPLICATE_RECORD_ACTION_LABEL,
  DUPLICATE_RECORD_ACTION_NOTE,
  NEW_RECORD_ACTION_LABEL,
  NEW_RECORD_ACTION_NOTE,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** 空のフォームを開く（従来の＋と同じ） */
  onSelectNew: () => void;
  /** 複製元を選ぶ画面へ */
  onSelectDuplicate: () => void;
  /** 閉じ切ってから呼ばれる（幕のタップに共通） */
  onClose: () => void;
};

export function AddRecordMenuSheet({
  visible,
  onSelectNew,
  onSelectDuplicate,
  onClose,
}: Props) {
  const colors = useThemeColors();

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => {
        // 選んだ先を開くのは**シートが下がり切ってから**（SheetModal の close の作り）──
        // 先に開くと、下がっていくシートの上にフォームが重なって出る
        const select = (action: () => void) => {
          close();
          action();
        };

        return (
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.label }]}>{ADD_RECORD_MENU_TITLE}</Text>
            <View style={[styles.group, { backgroundColor: colors.secondaryBackground }]}>
              <MenuRow
                icon="add-circle-outline"
                label={NEW_RECORD_ACTION_LABEL}
                note={NEW_RECORD_ACTION_NOTE}
                onPress={() => select(onSelectNew)}
              />
              <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              <MenuRow
                icon="copy-outline"
                label={DUPLICATE_RECORD_ACTION_LABEL}
                note={DUPLICATE_RECORD_ACTION_NOTE}
                onPress={() => select(onSelectDuplicate)}
              />
            </View>
          </View>
        );
      }}
    </SheetModal>
  );
}

function MenuRow({
  icon,
  label,
  note,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 読み上げは 1 つの塊にする（行の中の 2 つの文を別々に読ませない）
      accessibilityLabel={`${label}。${note}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={24} color={colors.blue} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.label }]}>{label}</Text>
        <Text style={[styles.rowNote, { color: colors.secondaryLabel }]}>{note}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowNote: {
    fontSize: 13,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
});
