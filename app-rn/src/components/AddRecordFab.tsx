// 記録を作る入口の FAB（UI-SPEC §1.2-7）。記録タブと計算タブが**同じ 1 つを使う**。
//
// Fab の薄い包みでしかないが、名前を付けて挟んである ── 記号（＋）と色（青）は
// 「記録を作る」という意味に結び付いていて、2 つの画面でずれてはいけないため。
// 使う側が選べるのは語と置き場所だけにしてある。
import { StyleProp, ViewStyle } from 'react-native';

import { useThemeColors } from '@/theme';

import { Fab } from './Fab';

type Props = {
  /** ボタンに出す語。＋は部品側が描くので、ここには入れない（「記録」「記録する」） */
  label: string;
  onPress: () => void;
  /** 読み上げの語。見た目の語が短いので、こちらは動作が分かる形にする */
  accessibilityLabel: string;
  /** 下端からの距離。使う側が渡す（Fab の冒頭コメント参照） */
  style?: StyleProp<ViewStyle>;
};

export function AddRecordFab({ label, onPress, accessibilityLabel, style }: Props) {
  const colors = useThemeColors();

  return (
    <Fab
      icon="add"
      label={label}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      backgroundColor={colors.blue}
      style={style}
    />
  );
}
