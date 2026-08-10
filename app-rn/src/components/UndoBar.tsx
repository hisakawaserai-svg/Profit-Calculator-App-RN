// 画面下部に数秒だけ出るバー（UI-SPEC §8.3）。
//
// 「何をしたか」の本文と、取り消しの口を 1 つだけ持つ汎用の部品。何を取り消すかは知らず、
// 押されたことを呼び出し側へ伝えるだけにしてある。最初の使い手はレコード詳細の
// 「売れた記録にしました ／ 元に戻す」だが、計算タブの「クリア」の取り消し（§5-8。
// 今回は未実装で IMPROVEMENTS.md 送り）でもそのまま使い回せるようにするため。
//
// 出ている間だけマウントする（visible の props は取らない）。タイマーはマウントで始まり、
// 時間切れで onHide を呼ぶので、呼び出し側は「出す」条件だけを持てばよい。
//
// **バーは取り消しの猶予、恒久的な訂正口は別（§8.3）。** 売れた日の行のように
// 消えずに残るものと役割を混同しないこと。バーだけに情報を載せてもいけない
// （数秒で消えるので、読み上げは呼び出し側が押下時にアナウンスする）。
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

/**
 * 押した直後の合図を出しておく時間（UI-SPEC §8.3）。
 * ハイライト（薄い青の下地）とこのバーは**同じ 1 つの定数**を使う。暫定 4 秒。
 */
export const TRANSIENT_FEEDBACK_MS = 4000;

const FADE_IN_MS = 180;
const FADE_OUT_MS = 220;

type Props = {
  /** 何が起きたか（例:「売れた記録にしました」） */
  message: string;
  /** 操作の名前（例:「元に戻す」） */
  actionLabel: string;
  onAction: () => void;
  /** 表示時間が過ぎたとき。呼び出し側はこれを受けてバーを畳む */
  onHide: () => void;
  /** 下端からの距離。下端に固定の操作列がある画面はそのぶん持ち上げる */
  bottomOffset?: number;
  durationMs?: number;
};

export function UndoBar({
  message,
  actionLabel,
  onAction,
  onHide,
  bottomOffset = 24,
  durationMs = TRANSIENT_FEEDBACK_MS,
}: Props) {
  const colors = useThemeColors();
  // Animated.Value はマウント中ずっと同じインスタンスを使う（計算タブの固定バーと同じ書き方。
  // ref にすると描画中の参照になり react-hooks/refs に触れる）
  const [opacity] = useState(() => new Animated.Value(0));

  // タイマーは「出ている時間」だけで決まる。onHide が毎回新しい関数でも張り直さないよう、
  // 呼び出しは ref 越しにする（張り直すと表示時間が伸び続ける）
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  });

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      // 消えるところまで見せてから畳む。ハイライトも onHide で同時に解除されるので、
      // 2 つの合図（§8.3）は最後まで足並みがそろう
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => onHideRef.current());
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, opacity]);

  return (
    <Animated.View style={[styles.container, { bottom: bottomOffset, opacity }]}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.secondaryBackground, borderColor: colors.separator },
        ]}>
        <Text style={[styles.message, { color: colors.label }]} numberOfLines={2}>
          {message}
        </Text>
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={[styles.action, { color: colors.blue }]}>{actionLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    // 内容の上に浮いていることを影で示す（地色はカードと同じなので、影がないと沈んで見える）
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  message: {
    flexShrink: 1,
    fontSize: 15,
  },
  action: {
    fontSize: 15,
    fontWeight: '600',
  },
});
