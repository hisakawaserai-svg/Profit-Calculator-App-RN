// トースト下端の残り時間バー（デザイン確定仕様版・3a/3b/3c）。100%→0% を visibilityTime と
// 同じ長さで走らせるだけの飾り。react-native-toast-message は自動クローズの残り時間を
// カスタム描画側に渡してくれない（ToastConfigParams に無い）ので、こちら側で別途アニメーションする
// ── 実際の自動クローズはライブラリ本体の visibilityTime が担い、このバーは見た目を合わせるだけ。
//
// **isVisible を受け取って、それをきっかけに毎回アニメーションし直す。** マウント時の
// useEffect だけに頼ると、react-native-toast-message がトーストの表示・非表示のたびに
// この描画コンポーネントを作り直すとは限らず（実測: 保存確認→実績トーストと連続で出したとき、
// 2 個目でバーが動かない不具合が出た）、2 回目以降のトーストで初期化されない。
// isVisible は Toast.show() のたびに false→true と変わるので、これを合図にする方が確実。
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

export function ToastProgressBar({
  durationMs,
  trackColor,
  fillColor,
  isVisible,
}: {
  durationMs: number;
  trackColor: string;
  fillColor: string;
  isVisible: boolean;
}) {
  // useRef(...).current は React Compiler の react-hooks/refs に引っかかる
  // （レンダー中の ref 読み出しを禁じるルールで、Animated.Value も例外にならない）。
  // useState の遅延初期化なら ref を経由せず、同じ「マウント時に 1 回だけ作る」を満たせる
  const [progress] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!isVisible) return;

    progress.setValue(1);
    Animated.timing(progress, {
      toValue: 0,
      duration: durationMs,
      useNativeDriver: false, // width は native driver 非対応
    }).start();
  }, [isVisible, durationMs, progress]);

  return (
    <View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: fillColor, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 2 },
  fill: { height: 2 },
});
