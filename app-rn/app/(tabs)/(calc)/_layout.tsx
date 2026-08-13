import { Stack } from 'expo-router';

// 計算タブの中の Stack（UI-SPEC §1.1）。**push する行き先は無い。**
//
// それでも Stack を置くのは**ヘッダの出どころを他の 3 タブと揃えるため。**
// 記録・データ・設定はいずれも自前の Stack を持ち、タブ側のヘッダを切っている
// （(tabs)/_layout.tsx の headerShown: false）。ここだけ Stack が無いと、
// ヘッダが `Tabs`（ボトムタブ）の **JS ヘッダ**になり、見た目が 2 点ずれる:
//
//   - iOS 26 の**ガラスのピルが出ない**（あれを描くのは react-native-screens の
//     ネイティブヘッダで、JS ヘッダには無い）
//   - **右の余白が違う**（「？」の右端が画面端から 2.7pt。ネイティブ側は 27pt）
//
// 毎日 4 つのタブを行き来する画面なので、1 つだけヘッダの作りが違うのは目に付く。
//
// **ルートグループ（丸括弧）にしてあるので URL は変わらない** ── 計算タブは
// これまでどおり `/` のまま。`index.tsx` を素のディレクトリへ移すと URL が変わってしまう。
// **screen は 1 つも宣言しない。** ここは束ねるルートが index 1 本きりなので、
// 宣言しても並びは変わらない。むしろ `(calc)` はルートグループで、expo-router が
// 親の階層へ畳むため、`<Stack.Screen name="index">` は (tabs) 側の子
// （`(calc)/index` / `data` / `records` / `settings`）と突き合わされて
// 「No route named "index"」の警告とともに捨てられていた（実機のログで見つけた）。
export default function CalcLayout() {
  return <Stack />;
}
