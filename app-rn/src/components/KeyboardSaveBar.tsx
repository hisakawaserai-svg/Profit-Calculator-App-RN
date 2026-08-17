// 画面下端の保存ボタン（設計案 49c）。**キーボードが出ている間はその上に貼り付く。**
//
// ヘッダ右上の小さな「保存」から下端の大きなボタンに移したので、鍵盤に隠れると
// 保存の口そのものが消える。押せる場所を探して画面を閉じ直すことになるため、追従が要る。
//
// **実装は Reanimated の useAnimatedKeyboard**（RN 標準の Keyboard イベントではない）。
// - 高さの変化が UI スレッドで反映されるので、iOS のキーボードのアニメーションカーブと
//   ズレずに動く。keyboardWillShow を JS で受ける方式では duration と easing を手で
//   合わせる必要があり、合わせても 1 フレーム遅れる（しかも表示のたびに再描画が走る）
// - react-native-reanimated は既に依存にあり、babel-preset-expo が
//   react-native-worklets/plugin を自動で足すので、追加のライブラリも設定も要らない
//
// **画面の下端 ＝ ウィンドウの下端ではない。** この画面はタブの中に push されるので、
// 下にタブバーぶんの隙間がある。useAnimatedKeyboard が返す高さはウィンドウ下端からの
// 値なので、そのぶんを引かないと鍵盤の上に浮きすぎる。隙間は実測する ──
// タブバーの高さを定数で持つと、端末と OS の版で必ずずれる。
import { useCallback, useRef } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useThemeColors } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /** false のあいだは押せない（検証が通っていない）。色も落とす */
  enabled: boolean;
};

export function KeyboardSaveBar({ label, onPress, enabled }: Props) {
  const colors = useThemeColors();
  const keyboard = useAnimatedKeyboard();
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

  const followKeyboard = useAnimatedStyle(() => ({
    // 鍵盤がタブバーより低いことはないが、負に振れると帯が下へ潜るので 0 で止める
    transform: [{ translateY: -Math.max(0, keyboard.height.value - bottomGap.value) }],
  }));

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
