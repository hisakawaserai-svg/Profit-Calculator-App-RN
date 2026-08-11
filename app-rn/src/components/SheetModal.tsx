// 下から出るシートの共通の器（期間シート・カレンダー・並び替え・電卓）。
//
// RN の `Modal animationType="slide"` は**モーダルの中身を丸ごと**下から動かすため、
// 暗い背景まで一緒にせり上がってきて、地の画面に薄い幕が降りたようには見えなかった。
// ここでは slide をやめ（`animationType="none"`）、自前で 2 つを別々に動かす:
//
// - 背景（幕）: 画面全体に固定したまま、不透明度だけを 0 → 1 で上げる
// - シート: 画面の下端の外から定位置へ滑り込ませる（translateY）
//
// 閉じるときは逆再生する。**閉じ切ってから `onClose` を呼ぶ**のがこの部品の肝で、
// 中身から閉じる操作（「閉じる」ボタン・選択して即閉じる行）も children に渡す `close` を通す。
// 直接 `onClose` を呼ぶと親がその場でアンマウントしてしまい、下がるところが見えない。
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';

import { CLOSE_LABEL } from '@/logic/labels';

/** 幕の濃さ。明暗どちらの外観でも同じ（下の画面を沈めるのが役目で、地色ではない） */
const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.3)';

// 開くときの方が少し長い。出るものは見せて、引っ込むものは待たせない
const OPEN_DURATION = 260;
const CLOSE_DURATION = 200;

type Props = {
  /**
   * 親が開閉を持つ場合に渡す（省略時は「開いている間だけマウントする」使い方）。
   * `false` にしたときも、下がり切るまで Modal は外さない。
   */
  visible?: boolean;
  /** 閉じ切ってから呼ばれる。親はここでアンマウント（または visible を false に）する */
  onClose: () => void;
  /** シートの中身。渡される `close` を「閉じる」等に繋ぐ（アニメーションしてから onClose） */
  children: (close: () => void) => ReactNode;
};

export function SheetModal({ visible = true, onClose, children }: Props) {
  const { height } = useWindowDimensions();
  // ref ではなく state で持つ（値は差し替えない）。React Compiler の下では
  // 描画中に ref の中身を読めないため、補間の元になる値は state 側に置く
  const [progress] = useState(() => new Animated.Value(0));
  /** 閉じるアニメーションの間だけ true。下がり切るまで Modal を外さないための状態 */
  const [closing, setClosing] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // visible の変化は描画中に取り込む（effect で setState すると 1 描画ぶん遅れて幕が出る）
  if (wasVisible !== visible) {
    setWasVisible(visible);
    setClosing(!visible);
  }

  const rendered = visible || closing;

  useEffect(() => {
    if (!visible) return;
    animate(progress, 1, OPEN_DURATION);
  }, [visible, progress]);

  useEffect(() => {
    if (!closing) return;
    // 親が visible を落とした場合の下ろし。close() 経由で既に下がっていれば見た目は変わらず、
    // 下ろし終わったことにして Modal を外すだけになる
    animate(progress, 0, CLOSE_DURATION, () => setClosing(false));
  }, [closing, progress]);

  // 連打しても onClose は 1 回だけ（先に走っていた分は finished=false で終わる）
  const close = () => animate(progress, 0, CLOSE_DURATION, onClose);

  return (
    <Modal
      visible={rendered}
      transparent
      // 動かすのはこの中の 2 つだけ。Modal 自身の slide は使わない
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}
        pointerEvents="none"
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityLabel={CLOSE_LABEL}
      />
      {/* シートは下端合わせ。box-none で、シートを外したタップは下の幕へ抜ける */}
      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
        ]}
        pointerEvents="box-none">
        {children(close)}
      </Animated.View>
    </Modal>
  );
}

function animate(
  value: Animated.Value,
  toValue: number,
  duration: number,
  onDone?: () => void,
) {
  Animated.timing(value, {
    toValue,
    duration,
    // 出るときは減速、引っ込むときは加速（iOS のシートと同じ効き方）
    easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    useNativeDriver: true,
  }).start(({ finished }) => {
    if (finished) onDone?.();
  });
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: BACKDROP_COLOR,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
