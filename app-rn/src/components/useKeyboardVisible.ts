// 鍵盤が出ているかどうかだけを返すフック。
//
// 使いどころは**広告を畳むため**（計算タブ）。iOS ではウィンドウが縮まないので、鍵盤が
// 出ると広告はその裏に隠れる ── 見えていないのにインプレッションだけが数えられる状態は
// 避けたいので、鍵盤が出ている間は枠ごと畳む。
// **Android も同じ**（edgeToEdge が有効なのでウィンドウは縮まない。EDGE_TO_EDGE_ENFORCED）。
//
// **鍵盤の情報の出どころは react-native-keyboard-controller 1 本に揃えてある。**
// RN 標準の `Keyboard.addListener` でも「出ているか」は取れるが、逃がし（KeyboardAwareScrollView・
// KeyboardAvoidingView）が全部ライブラリ側に移った以上、畳む合図だけ別の経路から取ると、
// 鍵盤が動いている最中の一瞬だけ両者が食い違う余地が残る。読む値は 1 か所から。
//
// `useKeyboardState` が聴いているのは `keyboardWillShow` と `keyboardDidHide`（ライブラリの実装）。
// 出るときは動き始め ── 広告は鍵盤が上がりきる前に畳む。
// 引っ込むときは動き終わり ── 旧実装（iOS は keyboardWillHide）より一拍遅く戻るが、
// 下がりきる前に広告を戻すと、まだ鍵盤に覆われている枠を「表示中」にしてしまう。
//
// **この「引っ込むときだけ遅い」は、ここでは仕様。** 同じ非対称が記録フォームの
// スティッキーバーでは不具合になり（閉じたあとも帯が 0.4〜0.7 秒降りてくる）、あちらは
// `useKeyboardTargetHeight`（行き先を返す。`keyboardWillHide` も聴く）へ移した。
// **こちらを釣られて移さないこと** ── 広告は遅いほうが正しい。
//
// 読む口は用途で選び分ける。どれも同じライブラリの中にある:
// - 出ているか（遅く戻ってよい）── このフック
// - 落ち着く先の高さ（閉じ始めた時点で 0）── `useKeyboardTargetHeight`
// - いまの高さ（毎フレーム追従する連続値）── `useReanimatedKeyboardAnimation`（KeyboardSaveBar）
import { useKeyboardState } from 'react-native-keyboard-controller';

export function useKeyboardVisible(): boolean {
  return useKeyboardState((state) => state.isVisible);
}
