// 鍵盤が**これから落ち着く高さ**を返すフック（出ていく途中なら 0）。
//
// **「いま何 pt あるか」ではなく「終わったら何 pt になるか」を返す**のがこのフックの役目。
// 使いどころは、鍵盤に隠れているかどうかで出し分ける表示 ── 記録フォームのスティッキーバー
// （StickyBreakdownBar / StickyTargetBar）。閉じ始めた時点で「もう隠れない」と分かるので、
// アニメーションの最中に一瞬だけ出す、という無駄がなくなる。
//
// **なぜ `useKeyboardState` を使わないか。**
// あちらが聴いているのは `["keyboardWillShow", "keyboardDidHide"]` の 2 つだけで、
// **出るときは動き始め・引っ込むときは動き終わり**という非対称な購読になっている
// （ライブラリの実装。src/hooks/useKeyboardState/index.ts）。
//
// この非対称が実際に不具合になった: 商品名の欄で改行キーを押して鍵盤を閉じると、
// **帯グラフのスティッキーバーが上から一瞬降りてくる**。商品名を打っている間は
// バーを黙らせている（RecordFormSheet の `!itemNameFocused`）が、
//
//   1. `onBlur` は改行キーで**即座に**発火し、黙らせる条件だけが先に外れる
//   2. 「隠れているか」の判定は鍵盤の高さが変わるまで走らない
//   3. その高さが届くのは `keyboardDidHide` ＝ **閉じるアニメーションが終わってから**
//
// の順になり、鍵盤が消えたあともバーが残っていた。**実測（blur → 再判定）**:
//
// | | 修正前 | 修正後 |
// |---|---|---|
// | iOS（iPhone 17 / iOS 26） | 719ms・695ms | **2ms** |
// | Android（Pixel 8 エミュレータ） | 2502ms（didHide まで） | 735ms（willHide が blur の 362ms 後・そこから描画に 373ms） |
//
// Android に残る差は**エミュレータの遅さ**（IME への往復と debug ビルドの描画）で、
// 仕組みとしては両 OS とも「閉じ始めた時点」で反応している。実機での見えかたは要確認。
// 商品名はフォームの最上部にあって逃がしのスクロールが 1pt も動かないため、
// `onScroll` 側の再判定も走らず、この遅れがそのまま出る。
//
// **`useReanimatedKeyboardAnimation` でも直りきらない。** あちらが返すのは
// **いまの高さ**（UI スレッドで毎フレーム変わる連続値）なので、閉じ始めの数フレームは
// まだ高さが残っており、その間はやはり「隠れている」と判定される。行き先が要る場面には
// 行き先を答えるものを使う ── 連続値が要る追従（KeyboardSaveBar）とは用途が違う。
//
// **広告を畳む `useKeyboardVisible` はこちらに寄せないこと。** あちらは
// **遅いほうが正しい**（下がりきる前に広告を戻すと、まだ鍵盤に覆われている枠を
// 「表示中」にしてしまう）。同じライブラリの中で、用途ごとに読む口を選び分ける。
import { useEffect, useState } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

/** マウント時の初期値。既に出ている鍵盤の上でこの画面が開くことがある（電卓から戻る等） */
function initialHeight(): number {
  return KeyboardController.isVisible() ? KeyboardController.state().height : 0;
}

export function useKeyboardTargetHeight(): number {
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    // will* だけでも足りるが、did* も対にして張っておく ── 端末や IME によっては
    // will* が来ない経路（別アプリからの復帰など）があり、そのときの取りこぼしを防ぐ。
    // 同じ値なら React が再レンダーを畳むので、二重に来ても害はない
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', (event) => setHeight(event.height)),
      KeyboardEvents.addListener('keyboardDidShow', (event) => setHeight(event.height)),
      KeyboardEvents.addListener('keyboardWillHide', () => setHeight(0)),
      KeyboardEvents.addListener('keyboardDidHide', () => setHeight(0)),
    ];

    // `useKeyboardState` はここで現在値を読み直しているが、こちらでは要らない ──
    // 初期値を描画時に読んでおり（useState の引数）、その描画とこの効果は同じコミットの中で
    // 続けて走るので、間に鍵盤のイベントが割り込む余地がない。
    // 仮に取りこぼしても次のイベントで直る値なので、効果の中で setState はしない
    // （react-hooks/set-state-in-effect）。

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  return height;
}
