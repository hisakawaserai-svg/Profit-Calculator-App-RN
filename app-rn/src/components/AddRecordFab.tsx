// 記録を作る入口の浮いたボタン（UI-SPEC §1.2-7）。記録タブと計算タブが**同じ 1 つを使う**。
//
// 元は記録一覧にだけあり、計算タブは下端の全幅の帯（高さ 54pt のボタン）だった。
// 同じ「記録を作る」なのに形が違うと、タブを移った先で押す場所を探し直すことになる。
// 見た目・大きさ・置き場所を 1 か所に持たせて、語だけを変える。
//
// **置き場所は使う側が決める**（`position: 'absolute'` は持つが `bottom` は持たない）──
// 下端からの距離は「その画面で広告枠の上端がどこか」で決まり、画面ごとに違うため。
// 距離の意味は使う側のコメントに書く（RecordListScreen / (calc)/index の addButton）。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '@/theme';

/** ＋の大きさ。語（15pt）より少し小さくして、記号が主張しすぎないようにする */
const PLUS_ICON_SIZE = 18;

type Props = {
  /** ボタンに出す語。＋は部品側が描くので、ここには入れない（「記録」「記録する」） */
  label: string;
  onPress: () => void;
  /** 読み上げの語。見た目の語が短いので、こちらは動作が分かる形にする */
  accessibilityLabel: string;
  /** 下端からの距離。使う側が渡す（上のコメント参照） */
  style?: StyleProp<ViewStyle>;
};

export function AddRecordFab({ label, onPress, accessibilityLabel, style }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      style={[styles.button, { backgroundColor: colors.blue }, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <Ionicons name="add" size={PLUS_ICON_SIZE} color="#FFFFFF" />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
