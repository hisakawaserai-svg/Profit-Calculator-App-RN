// 鍵盤が出ているかどうかだけを返すフック。
//
// 使いどころは**広告を畳むため**（計算タブ）。iOS ではウィンドウが縮まないので、鍵盤が
// 出ると広告はその裏に隠れる ── 見えていないのにインプレッションだけが数えられる状態は
// 避けたいので、鍵盤が出ている間は枠ごと畳む。
//
// KeyboardSaveBar のように**追従**したいなら Reanimated の useAnimatedKeyboard を使うこと。
// こちらは「出ているか」の 2 値しか要らないので、RN 標準のイベントで足りる。
//
// iOS は will（動き始め）、Android は did（動き終わり）を聴く ── iOS で did を聴くと
// 鍵盤の動きが終わってから畳むことになり、一拍遅れて広告が消える。Android に will は無い。
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
