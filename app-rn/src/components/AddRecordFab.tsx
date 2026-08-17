// 記録を作る入口の FAB（UI-SPEC §1.1-7 / §1.2-7）。**計算タブと記録一覧が同じ 1 つを使う。**
//
// Fab の薄い包みでしかないが、名前を付けて挟んである ── 記号（＋）・色（青）・語は
// 「記録を作る」という意味に結び付いていて、2 つの画面でずれてはいけないため。
// **使う側が選べるのは置き場所だけ。** 語を props で渡せるようにすると、片方だけ
// 直したときにずれる（実際、記録タブは「記録」、計算タブは「この内容で記録する」だった）。
import { StyleProp, ViewStyle } from 'react-native';

import { addRecordActionLabel, addRecordFabLabel } from '@/logic/labels';
import { useThemeColors } from '@/theme';

import { Fab } from './Fab';
import { useLocale } from '@/settings';

type Props = {
  onPress: () => void;
  /** 下端からの距離。使う側が渡す（Fab の冒頭コメント参照） */
  style?: StyleProp<ViewStyle>;
};

export function AddRecordFab({ onPress, style }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <Fab
      icon="add"
      label={addRecordFabLabel(locale)}
      onPress={onPress}
      // 見た目の語が短いので、読み上げは動作が分かる形にする
      accessibilityLabel={addRecordActionLabel(locale)}
      backgroundColor={colors.blue}
      style={style}
    />
  );
}
