// 画面の下端に浮かせる丸い操作ボタン（UI-SPEC §1.2-7）。**下端の操作はすべてこの形。**
//
// 全幅の帯（高さ 54pt のボタンを地色の帯に敷く形）は計算タブと記録詳細にあったが、
// 画面ごとに帯の高さも押す場所も違っていた。押す口が浮いた 1 つの形に揃っていれば、
// どの画面でも親指の下の同じ場所を探せばよい。
//
// **置き場所は使う側が決める**（`position: 'absolute'` は持つが `bottom` も左右も持たない）──
// 下端からの距離は「その画面で広告枠の上端がどこか」で決まり、左右は同じ画面に
// いくつ並ぶかで決まる。距離の意味は使う側のコメントに書く。
//
// 記録を作る入口は AddRecordFab（この部品の薄い包み）を使うこと ── 計算タブと
// 記録一覧で語以外がずれないようにするため。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

/** 記号の大きさ。語（15pt）より少し小さくして、記号が主張しすぎないようにする */
const ICON_SIZE = 18;

/**
 * FAB の高さ（上下の余白 12pt ずつ ＋ 15pt の字）。
 * 実測 42.7pt。**上に何かを重ねる画面が距離を計算するために使う**（UndoBar など）。
 */
export const FAB_HEIGHT = 43;

type Props = {
  /** 語の左に置く記号 */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** ボタンに出す語。記号は部品側が描くので、ここには入れない */
  label: string;
  onPress: () => void;
  /** 読み上げの語。見た目の語が短いときは、こちらを動作が分かる形にする */
  accessibilityLabel?: string;
  /** 地の色 */
  backgroundColor: string;
  /** 記号と語の色。省略時は白（塗りつぶしの FAB） */
  foregroundColor?: string;
  /** 置き場所（bottom・left / right）。使う側が渡す（上のコメント参照） */
  style?: StyleProp<ViewStyle>;
};

export function Fab({
  icon,
  label,
  onPress,
  accessibilityLabel,
  backgroundColor,
  foregroundColor = '#FFFFFF',
  style,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}>
      <Ionicons name={icon} size={ICON_SIZE} color={foregroundColor} />
      <Text style={[styles.label, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
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
    fontSize: 15,
    fontWeight: '600',
  },
});
