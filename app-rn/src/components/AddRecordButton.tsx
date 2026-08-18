// AddRecordButton.swift の移植。新規レコード作成フォームを開く共通の＋ボタン。
//
// Swift 版は editingRecord = nil / showingForm = true を立てて RecordFormView をシート表示していた。
// SPEC 決定 §7-7 により RN 版は「＋の時点では insert せず、保存時にだけレコードを作る」ため、
// 押下時にやることは「新規モードで RecordFormSheet を開く」だけになる。
// シートの表示状態は画面ごとに持つため、onPress は呼び出し側から受け取る。
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { addRecordActionLabel } from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  onPress: () => void;
};

export function AddRecordButton({ onPress }: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={addRecordActionLabel(locale)}>
      <Ionicons name="add" size={26} color={colors.blue} />
    </Pressable>
  );
}
