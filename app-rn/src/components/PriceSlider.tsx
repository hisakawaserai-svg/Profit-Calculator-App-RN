// 価格を指で動かすつまみ（SPEC-V9 §9.9）。
//
// **外部ライブラリを足していない。** 必要なのは「横 1 本のつまみ」だけで、
// RN の responder（View の onResponder* プロパティ）で足りる ── 依存を 1 つ増やすと、
// Expo の SDK 更新のたびに、この 1 つのつまみのために追従することになる。
//
// 位置は `locationX`（触っている View の左端からの距離）で決める。
// 画面上の絶対座標（gestureState.moveX）を使わないのは、この行が
// カードの中に入っていて左端の位置が分からないため（measure を挟むと 1 フレーム遅れる）。
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useThemeColors } from '@/theme';

const TRACK_HEIGHT = 6;
const THUMB_SIZE = 28;

/** 値の刻み（円）。1 円刻みにすると指の 1 ピクセルの揺れが値に出て読み取れない */
const STEP = 10;

/** この距離まで近づいたら線に吸い付く（値域に対する割合）。分岐点・目標ちょうどを指で出せるように */
const SNAP_RATIO = 0.02;

type Props = {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  /**
   * 吸い付く価格（分岐点・目標達成価格）。**この画面の答えはたいていこの点そのもの**なので、
   * 指で「ちょうど」を出せるようにする。範囲外の値が混ざっていても無視される。
   */
  snapPoints?: readonly number[];
  disabled?: boolean;
  accessibilityLabel?: string;
  /**
   * 掴んだ／離した合図（任意）。**ScrollView 側の `scrollEnabled` をこの間だけ切るため**に使う。
   * `onResponderTerminationRequest={false}` は RN の JS レスポンダ同士の取り合いしか止められず、
   * ScrollView 自身のネイティブなパン認識器（UIScrollView 側）はそれとは別に並行して動くため、
   * 掴んでいる間はネイティブ側のスクロールそのものを止める必要がある。
   */
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

export function PriceSlider({
  min,
  max,
  value,
  onChange,
  snapPoints = [],
  disabled = false,
  accessibilityLabel,
  onDragStart,
  onDragEnd,
}: Props) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);

  // 幅が 0（初回描画）や範囲が潰れている記録では割れないので、つまみは左端に置く
  const span = max - min;
  const ratio = span <= 0 ? 0 : clamp((value - min) / span, 0, 1);

  /**
   * つまみが動ける幅。**器の幅ではなく「器の幅 − つまみの直径」。**
   * つまみは左端合わせで置くので、右端の値では左端が `width − THUMB_SIZE` に来る。
   *
   * **値を読むときも同じ幅で割る。** 器の幅で割っていたせいで、指の位置と
   * つまみの中心が最大で半径ぶんずれ、右へ行くほど「掴んだ場所と違うところへ飛ぶ」ように見えた。
   */
  const travel = Math.max(0, width - THUMB_SIZE);

  const handleAt = (locationX: number) => {
    if (disabled || travel <= 0 || span <= 0) return;
    // 指の位置は**つまみの中心**として読む（左端ではない）ので、半径ぶん戻してから割る
    const raw = min + (clamp(locationX - THUMB_SIZE / 2, 0, travel) / travel) * span;
    onChange(snap(round(raw, min, max), snapPoints, span));
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={styles.container}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      // PanResponder ではなく responder のプロパティを直接使う。
      // PanResponder は「1 回だけ作って使い回す」形になるため、最新のハンドラを掴ませる
      // ref が要る（描画中に ref を渡すことになる）── こちらは毎描画の関数がそのまま効く。
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      // 掴んだあとは親（ScrollView）に取り上げさせない。指を横に滑らせている間に
      // 縦スクロールへ持っていかれると、値が途中で止まる
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        onDragStart?.();
        handleAt(event.nativeEvent.locationX);
      }}
      onResponderMove={(event) => handleAt(event.nativeEvent.locationX)}
      onResponderRelease={() => onDragEnd?.()}
      onResponderTerminate={() => onDragEnd?.()}>
      {/* **中の 2 つは触れない**（pointerEvents="none"）。
          触れると `locationX` が「触った View の左端からの距離」になり、
          つまみを掴んだ瞬間に 0〜28pt の値として読まれて、値が左端へ飛ぶ。
          触れる先を常にこの器 1 つに固定すれば、locationX は器の左端からの距離で確定する */}
      <View
        pointerEvents="none"
        style={[
          styles.track,
          { backgroundColor: disabled ? colors.disabledBackground : colors.separator },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: ratio * travel,
            backgroundColor: disabled ? colors.disabledBackground : colors.secondaryBackground,
            borderColor: colors.separator,
          },
        ]}
      />
    </View>
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** 刻みに丸める。**両端だけは刻みを無視して端そのもの**（端が出せないと最大値を選べない） */
function round(value: number, min: number, max: number): number {
  const stepped = Math.round(value / STEP) * STEP;
  return clamp(stepped, Math.ceil(min), Math.floor(max));
}

function snap(value: number, points: readonly number[], span: number): number {
  const tolerance = span * SNAP_RATIO;
  const hit = points.find((point) => Math.abs(point - value) <= tolerance);
  return hit ?? value;
}

const styles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 12,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    // つまみが線の上に浮いていることを示す（地色がカードと同じなので影がないと沈む）
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
