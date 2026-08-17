// 画面の下端に固定する 1 つの口（設計案 53a / 53f / 53h / 53k）。
//
// **バックアップの 4 つの画面がすべてこの形を共有する。** 押せるものは常に
// 「大きなボタン 1 つ ＋ その下の小さな 2 つ目」で、位置が変わらない ──
// 作る・置き換える・別のファイルを選ぶ・記録を見る、と行き先は違っても、
// **次の一手はいつも親指の下の同じ場所にある**。
//
// 中身（スクロールする部分）とは別の層に置く。長い画面でも押す口を探して
// 上下に動かさずに済ませるため（KeyboardSaveBar と同じ考え方。あちらは
// 鍵盤に追従する必要があるので Reanimated を使うが、この画面には入力欄が無い）。
//
// **進捗のときはボタンそのものが帯に変わる**（案 53a 右）。別の場所に印を出すと、
// 押した指の先から反応が消えて「効いたのか」が読めない。
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

/** 実行中の表示。`ratio` は 0〜1（写真の枚数で数える） */
export type BottomBarProgress = {
  ratio: number;
  /**
   * 帯の中の語（「作っています...」）。**押す前の語とは別に受け取る** ──
   * ボタンの名前のまま進捗にすると、押したのに何も変わっていないように見える。
   */
  label: string;
  /** 帯の下に出す 1 行（「写真 34枚目 / 53枚　このままお待ちください」） */
  note: string;
};

type Props = {
  label: string;
  onPress: () => void;
  /** `destructive` は赤（押すと今のデータが消える。案 53f） */
  tone?: 'primary' | 'destructive';
  disabled?: boolean;
  /** これがあるとボタンは進捗の帯になり、押せなくなる */
  progress?: BottomBarProgress | null;
  /** ボタンの**上**の赤い 1 文（案 53f の「元には戻せません」） */
  warning?: string;
  /** ボタンの**下**の 2 つ目の口（「別のファイルを選ぶ」） */
  secondary?: { label: string; onPress: () => void };
  /** 下端の注記（「前回作ったのは 2026年7月2日」） */
  note?: string;
  /**
   * `plain` は地色と上の境界線を持たない（案 53e のシートの中）。
   *
   * 画面の下端に貼るときは、下を流れていく内容が透けないように地色が要るが、
   * シートの中では**紙が 2 枚あるように見える**だけで意味が無い。
   */
  variant?: 'bar' | 'plain';
};

export function BottomActionBar({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  progress = null,
  warning,
  secondary,
  note,
  variant = 'bar',
}: Props) {
  const colors = useThemeColors();
  const running = progress != null;
  const off = disabled || running;

  const background = off
    ? colors.disabledBackground
    : tone === 'destructive'
      ? colors.red
      : colors.blue;

  return (
    <View
      style={[
        styles.bar,
        variant === 'bar' && {
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      {warning != null && (
        <Text style={[styles.warning, { color: colors.red }]}>{warning}</Text>
      )}

      {running ? (
        // 帯そのものが進捗。器（薄い青）の上を、青の塗りが左から伸びる
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.ratio * 100) }}
          style={[styles.button, styles.progressTrack, { backgroundColor: colors.highlightBackground }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.blue,
                width: `${Math.min(100, Math.max(0, progress.ratio * 100))}%`,
              },
            ]}
          />
          <Text style={[styles.label, { color: colors.blue }]}>{progress.label}</Text>
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          disabled={off}
          accessibilityRole="button"
          accessibilityState={{ disabled: off }}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: background, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.label, { color: off ? colors.disabledContent : '#FFFFFF' }]}>
            {label}
          </Text>
        </Pressable>
      )}

      {secondary != null && !running && (
        <Pressable
          onPress={secondary.onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}>
          <Text
            style={[
              styles.secondaryLabel,
              { color: disabled ? colors.disabledContent : colors.blue },
            ]}>
            {secondary.label}
          </Text>
        </Pressable>
      )}

      {(running ? progress.note : note) != null && (
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>
          {running ? progress.note : note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 地色と境界線は variant === 'bar' のときだけ付く（下を流れていく内容が
  // 透けると、ボタンの文字が読めなくなる）
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  warning: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 塗りがはみ出さないように角丸で切る
  progressTrack: {
    overflow: 'hidden',
  },
  // 帯の中の塗り。**右端は開けておく**（幅で伸ばすので right は指定しない ──
  // absoluteFill を使うと left/right が両方 0 に固定されて幅が効かない）
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.25,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
  secondary: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    textAlign: 'center',
  },
});
