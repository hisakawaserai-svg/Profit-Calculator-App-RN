// 画面下端の保存ボタン（設計案 49c）。**キーボードが出ている間はその上に貼り付く。**
//
// ヘッダ右上の小さな「保存」から下端の大きなボタンに移したので、鍵盤に隠れると
// 保存の口そのものが消える。押せる場所を探して画面を閉じ直すことになるため、追従が要る。
//
// **実装は react-native-keyboard-controller の useReanimatedKeyboardAnimation。**
// - 高さの変化が UI スレッドで反映されるので、iOS のキーボードのアニメーションカーブと
//   ズレずに動く。keyboardWillShow を JS で受ける方式では duration と easing を手で
//   合わせる必要があり、合わせても 1 フレーム遅れる（しかも表示のたびに再描画が走る）
// - **Reanimated の `useAnimatedKeyboard` から移した。** 返す形（height の SharedValue）は
//   同じだが**符号が逆**（下の useAnimatedStyle 参照）。移した理由は、Android で鍵盤の高さを
//   WindowInsets から取る仕組みを 2 つ動かさないため ── edgeToEdge が有効なこのアプリでは
//   ウィンドウが縮まず、逃がしは全部このライブラリが受け持つ。同じ inset に 2 つの
//   listener を挿すと、どちらが先に動いたかで帯の位置が変わる余地が残る
//
// **画面の下端 ＝ ウィンドウの下端ではない。** この画面はタブの中に push されるので、
// 下にタブバーぶんの隙間がある。フックが返す高さはウィンドウ下端からの
// 値なので、そのぶんを引かないと鍵盤の上に浮きすぎる。隙間は実測する ──
// タブバーの高さを定数で持つと、端末と OS の版で必ずずれる。
import { useCallback, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

/** 帯の高さ（pt）= 上下の余白 12 + 12 とボタンの高さ 50。下の styles と揃える */
export const KEYBOARD_SAVE_BAR_HEIGHT = 74;

type Props = {
  label: string;
  onPress: () => void;
  /** false のあいだは押せない（検証が通っていない）。色も落とす */
  enabled: boolean;
};

export function KeyboardSaveBar({ label, onPress, enabled }: Props) {
  const colors = useThemeColors();
  const keyboard = useReanimatedKeyboardAnimation();
  /** この帯の下端からウィンドウ下端までの距離（＝タブバー ＋ 下の安全域） */
  const bottomGap = useSharedValue(0);
  const barRef = useRef<View>(null);

  /**
   * 隙間の実測。**測るのは動かない外側の器**（中身は translateY で動くので、
   * 動いた後の位置を測ると次の計算が狂う）。measureInWindow はレイアウト確定後に
   * 呼ぶ必要があるので onLayout に載せる ── 回転やタブバーの高さの違いにこれで追随する。
   */
  const measure = useCallback(() => {
    barRef.current?.measureInWindow((_x, y, _width, height) => {
      bottomGap.value = Math.max(0, Dimensions.get('window').height - (y + height));
    });
  }, [bottomGap]);

  const followKeyboard = useAnimatedStyle(() => {
    /**
     * **このライブラリの height は負の値**（鍵盤が出ているとき −346 のように返る）。
     * そのまま `translateY` に入れれば上へ動く向きに合わせてある値なので、
     * 「高さ」として読むにはここで符号を戻す。
     *
     * Reanimated の `useAnimatedKeyboard` は正の値を返していたので、移したときに
     * 符号を戻し忘れると `Math.max(0, 負 − 隙間)` が常に 0 になり、**帯が動かない**
     * （実機で確認。保存ボタンが鍵盤の裏に残ったままだった）。
     */
    const keyboardHeight = -keyboard.height.value;
    // 鍵盤がタブバーより低いことはないが、負に振れると帯が下へ潜るので 0 で止める
    return { transform: [{ translateY: -Math.max(0, keyboardHeight - bottomGap.value) }] };
  });

  return (
    <View ref={barRef} onLayout={measure} collapsable={false}>
      <Animated.View
        style={[
          styles.bar,
          followKeyboard,
          { backgroundColor: colors.background, borderTopColor: colors.separator },
        ]}>
        <Pressable
          onPress={onPress}
          disabled={!enabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !enabled }}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: enabled ? colors.blue : colors.disabledBackground,
              opacity: pressed && enabled ? 0.7 : 1,
            },
          ]}>
          <Text style={[styles.label, { color: enabled ? '#FFFFFF' : colors.disabledContent }]}>
            {label}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 帯そのものが地色を持つ（下を流れていく内容が透けると、ボタンの文字が読めなくなる）
  // 高さを変えたら KEYBOARD_SAVE_BAR_HEIGHT も直すこと
  //（この帯は鍵盤の上に浮くので、下のスクロールが空けておく余白の元になる）
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
});
