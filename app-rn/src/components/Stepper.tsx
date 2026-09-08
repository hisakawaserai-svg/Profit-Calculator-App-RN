// SwiftUI の Stepper 相当。CalcView の「手数料: N%」（SPEC §3.2、0〜50・初期値 10）で使う。
//
// 記録フォームの伝票カード（UI-SPEC §1.3-9）では行の形が違う
// （左が行名・右が手数料「額」で、− ＋ はその間に入る）ため、
// ボタンだけを StepperButtons として切り出して共用する。
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  decreaseAccessibilityLabel,
  increaseAccessibilityLabel,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** 押しっぱなしから連続変更が始まるまでの間（決定 §7-14）。誤って長押し扱いにならない、
 * かつ待たされて遅いとも感じない値 */
const STEPPER_HOLD_DELAY_MS = 350;
/** 連続変更 1 回ごとの間隔。0〜50 を最後まで送っても指を離したくなるほど待たない速さ */
const STEPPER_HOLD_INTERVAL_MS = 100;

type ButtonsProps = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onChangeValue: (value: number) => void;
  /** 「〜を増やす / 減らす」の主語。行名（「手数料 10%」）を渡す */
  accessibilityLabel: string;
  /**
   * − と ＋ の間に挟む表示用の値（例:「10%」。決定 §7-13）。
   *
   * 計算タブの手数料行はここに率を置く ── 桁数が変わる値をラベル（Text の flexShrink）
   * 側に置くと、3 桁（100%）になったときに折り返して 2 段になる不具合があった。
   * ボタンの並び（View）は折り返さないので、率をこちら側へ移せば桁数が増えても 1 段のまま収まる。
   *
   * 省略すると従来どおり区切り線 1 本だけの − ＋ の 2 連ボタンになる。記録フォームの伝票カード
   * （額を別の列に持つ 4 要素構成の行）はこの省略のまま ── 額をレシート側に持つ行の見た目・
   * 桁あふれの心配が無い行にまで手を入れる理由が無い。
   */
  centerLabel?: string;
};

type Props = Omit<ButtonsProps, 'accessibilityLabel'> & {
  label: string;
  /**
   * ラベルの直後に置くもの（SPEC-V3 §4.4 のタグボタン。設計案 29b）。
   * ± の右や外側ではないのは、行の右端が「率を 1 目盛り動かす」操作で閉じているため ──
   * 選ぶ操作を挟むと、± を続けて押すときに指の位置が毎回変わる。
   */
  accessory?: ReactNode;
  /**
   * ± の読み上げに使う語。省略時は `label` をそのまま使う。
   *
   * 計算タブの手数料行は見た目のラベルを「手数料」だけに縮めている（率は centerLabel 側。
   * 上のコメント）ので、読み上げまで「手数料」だけになると率の情報が消える。
   * 率を含む語（commissionFieldLabel）をこちらに渡して読み上げの情報量は落とさない。
   */
  accessibilityLabel?: string;
};

export function Stepper({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onChangeValue,
  accessory,
  centerLabel,
  accessibilityLabel,
}: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      {/* numberOfLines を明示しておく ── flexShrink だけだと、英語の長いラベル
          （例: 通知設定の "Listing alert (days)"）が縮みきらず ± ボタンと重なった実績がある
          （実機で確認）。2 行までなら折り返しで逃がせる */}
      <Text style={[styles.label, { color: colors.label }]} numberOfLines={2}>
        {label}
      </Text>
      {accessory}
      {/* ± は行の右端のまま。ラベルとタグボタンが左に寄った分の余りはここが吸う */}
      <View style={styles.buttonsSlot}>
        <StepperButtons
          value={value}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          onChangeValue={onChangeValue}
          accessibilityLabel={accessibilityLabel ?? label}
          centerLabel={centerLabel}
        />
      </View>
    </View>
  );
}

/** − ＋ の 2 連ボタン（＋ 任意で中央に値）。行の組み立ては呼び出し側が決める */
export function StepperButtons({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onChangeValue,
  accessibilityLabel,
  centerLabel,
}: ButtonsProps) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const canDecrement = value > minimumValue;
  const canIncrement = value < maximumValue;

  /**
   * 長押しで連続して動かす（決定 §7-14）。0〜50 を 1 ずつだと、遠い値まで何度も押し直す
   * ことになるため。
   *
   * **`value`（props）ではなく ref で最新値を追う。** setInterval のコールバックは
   * 生成した瞬間の `value` を閉じ込めてしまい、`onChangeValue` を呼んでも次の再描画が
   * 届くまでの間は古い値のまま足し続けてしまう（インターバル内の古いクロージャの罠）。
   * ref なら tick のたびに最新の(自分で先読みした)値を読めるので、間隔と実際の変化数が
   * ずれない。
   */
  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 長押しの連続変更が 1 回でも起きたか。指を離した瞬間の onPress との二重加算を防ぐ */
  const didAutoRepeatRef = useRef(false);

  const stopRepeating = () => {
    if (repeatTimerRef.current != null) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    if (repeatIntervalRef.current != null) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  // 指を離さずに画面を閉じた・他の要素に持っていかれた場合の後始末
  useEffect(() => stopRepeating, []);

  const applyDelta = (delta: number) => {
    const next = Math.min(maximumValue, Math.max(minimumValue, latestValueRef.current + delta));
    if (next === latestValueRef.current) {
      // 端まで来た。± の外側を長押しし続けても意味が無いので自分で止める
      stopRepeating();
      return;
    }
    latestValueRef.current = next;
    onChangeValue(next);
  };

  /** 押し始めてから STEPPER_HOLD_DELAY_MS 経っても離されなければ、連続変更を始める */
  const startRepeating = (delta: number) => {
    didAutoRepeatRef.current = false;
    stopRepeating();
    repeatTimerRef.current = setTimeout(() => {
      didAutoRepeatRef.current = true;
      applyDelta(delta);
      repeatIntervalRef.current = setInterval(() => applyDelta(delta), STEPPER_HOLD_INTERVAL_MS);
    }, STEPPER_HOLD_DELAY_MS);
  };

  /** 指を離した瞬間。長押しの連続変更が既に動いていれば、ここでは何もしない（二重加算防止） */
  const handleRelease = (delta: number) => {
    stopRepeating();
    if (didAutoRepeatRef.current) {
      didAutoRepeatRef.current = false;
      return;
    }
    applyDelta(delta);
  };

  return (
    <View style={[styles.buttons, { backgroundColor: colors.disabledBackground }]}>
      <Pressable
        onPress={() => handleRelease(-step)}
        onPressIn={() => startRepeating(-step)}
        onPressOut={stopRepeating}
        disabled={!canDecrement}
        accessibilityLabel={decreaseAccessibilityLabel(locale, accessibilityLabel)}
        style={({ pressed }) => [
          styles.button,
          { opacity: !canDecrement ? 0.3 : pressed ? 0.5 : 1 },
        ]}>
        <Ionicons name="remove" size={20} color={colors.label} />
      </Pressable>
      <View style={[styles.divider, { backgroundColor: colors.separator }]} />
      {/* 中央の値（centerLabel。上のコメント）。無ければこの 2 行ごと出さず、従来の区切り線 1 本のまま */}
      {centerLabel != null && (
        <>
          <Text
            style={[styles.centerLabel, { color: colors.label }]}
            numberOfLines={1}
            // 読み上げは accessibilityLabel（率込みの語）が Pressable 側で言うので、
            // ここは装飾として二重に読ませない
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden>
            {centerLabel}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        </>
      )}
      <Pressable
        onPress={() => handleRelease(step)}
        onPressIn={() => startRepeating(step)}
        onPressOut={stopRepeating}
        disabled={!canIncrement}
        accessibilityLabel={increaseAccessibilityLabel(locale, accessibilityLabel)}
        style={({ pressed }) => [
          styles.button,
          { opacity: !canIncrement ? 0.3 : pressed ? 0.5 : 1 },
        ]}>
        <Ionicons name="add" size={20} color={colors.label} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    // タグボタン（accessory）はラベルの直後に付く（設計案 29b）ので、余りはラベルではなく
    // ± の側（buttonsSlot）が吸う。ラベルが長いときだけ縮む
    flexShrink: 1,
    fontSize: 16,
  },
  buttonsSlot: {
    flex: 1,
    alignItems: 'flex-end',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  centerLabel: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 10,
    // 「0%」〜「100%」まで桁数が変わっても ± ボタンの位置が動かない幅。
    // 「100%」+ 左右の paddingHorizontal がちょうど収まる余裕を持たせてある
    minWidth: 52,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
