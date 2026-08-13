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
export default function CalcLayout() {
  return (
    <Stack>
      {/* 起点。screen を 1 つでも宣言したら index を先頭に置く（設定タブの事故と同じ理由） */}
      <Stack.Screen name="index" />
    </Stack>
  );
}
