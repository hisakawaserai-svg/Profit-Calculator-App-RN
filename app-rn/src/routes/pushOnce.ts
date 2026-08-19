// 「押しても開いたと分からない」画面への push を 1 回に閉じるためのフック。
//
// **`router.push` は同じ経路でも毎回積む。** 押した先が押す前とよく似た画面だと、
// 利用者は開いたことに気付かず押し直し、押した回数だけ同じ画面が重なる ──
// 戻るを何度も押す羽目になる（実際の利用者から報告された。書き出しシートの
// プレビューで起きた。SPEC-V3 §5.9）。
//
// **Android ではこれが特に起きやすい。** react-native-screens は
// `presentation: 'modal'` も `'card'` も同じ全画面フラグメントとして出すので
// （`ScreenViewManager.setStackPresentation`）、iOS の「下から迫り上がる／右から滑り込む」
// のような**動きの違いが無い**。そのうえ遷移の既定は 10% ぶんの横滑り ＋ 83ms の
// フェード（`rns_default_enter_in`）で、ページが入れ替わったとは読めない強さしかない。
//
// ---
//
// **自分が前面かどうかを、押した瞬間に見る。**
//
// `navigation.isFocused()` は呼んだその場のナビゲーション状態を読む
// （`useNavigationCache` の実装）。1 回目の push が反映された時点で
// この画面は前面ではなくなるので、2 回目以降は何もしない。
//
// **`useIsFocused()`（値を購読するほう）は使わない。** 描画のたびの値を握ると、
// React Compiler が絡む形（src/i18n/index.ts の冒頭）を増やすことになる。
// こちらは押したときに 1 回呼ぶだけなので、描画に依存しない。
//
// **自前の「送信中」フラグも持たない。** フラグは戻ってきたときに誰かが
// 倒し直さないと二度と押せない画面になるが、前面かどうかは
// ナビゲーション自身が持っている ── 戻れば勝手に真に戻る。
import { useNavigation, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * 前面にいるときだけ push する関数を返す。`router.push` と同じ引数を取る。
 *
 * 行き先が元の画面とはっきり違って見えるところでは要らない（押し直しが起きない）。
 * 入れてあるのは、表 → 表・一覧 → 一覧のように**同じ見た目へ進む**ところ。
 */
export function usePushOnce(): (href: Href) => void {
  const router = useRouter();
  const navigation = useNavigation();

  return useCallback(
    (href: Href) => {
      if (!navigation.isFocused()) return;
      router.push(href);
    },
    [navigation, router],
  );
}
