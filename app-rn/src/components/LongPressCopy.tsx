import { type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';

// 長押しでコピーする Pressable。コピー成功時に haptic とトーストを出す。
// style は行の中に置くとき用（Pressable が中身の Text の代わりに flex の子になるので、
// flexShrink などは包んだ側に渡さないと効かない）。
export function LongPressCopy({ label, text, style, children }: {label: string, text: string, style?: StyleProp<ViewStyle>, children: ReactNode}) {
  // コピーするものが無いときは押せなくするだけで、中身はそのまま出す ──
  // 空の商品名（「無題」）・空のメモ（「未入力」）は**表示としては意味を持つ**ので、
  // ここで返さないと画面からその語ごと消える
  if (!text) {
    return <View style={style}>{children}</View>;
  }

  return(
    <Pressable style={style} onLongPress={async() => {
      try {
        await Clipboard.setStringAsync(text);

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );

        Toast.show({
          type: 'success',
          text1: `${label}をコピーしました`,
          text2: `コピー内容：${text}`,
        })
      } catch(error) {
        console.error('Failed to copy sales price to clipboard:', error);

        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );

        Toast.show({
          type: "error",
          text1: `${label}のコピーに失敗しました`,
        })
      }
    }}>
      {children}
    </Pressable>
  )
}