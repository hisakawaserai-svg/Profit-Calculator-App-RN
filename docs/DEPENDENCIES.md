# 依存パッケージの固定

`app-rn/package.json` で、**バージョン範囲ではなく特定の版に固定してある**パッケージと、
その理由を置く。

固定は放っておくと理由が分からなくなり、「古いから」という理由だけで外される。
外していい条件をここに書いておく ── 条件が満たされたら固定を解いてよい、という意味で、
永久に留め置くためのものではない。

## expo-store-review — `57.0.1`

```json
"expo-store-review": "57.0.1"
```

**`57.0.2` を入れると iOS がビルドできない。**

```
node_modules/expo-store-review/ios/StoreReviewModule.swift:28:12:
error: cannot find 'SceneGeometry' in scope
```

`57.0.2` は `getForegroundActiveScene()` の中身を `SceneGeometry.foregroundScene()` の
呼び出しに置き換えた。`SceneGeometry` は ExpoModulesCore が持つ Swift の enum
（`expo-modules-core/ios/Utilities/SceneGeometry.swift`）で、**入ったのは 57.0.11 から**。
いま入っているのは 57.0.10 ── `expo@57.0.12` の依存が `~57.0.10` なので、
存在しないシンボルを呼ぶことになり、`ExpoStoreReview` ターゲットのコンパイルが通らない。

名前から visionOS の API に見えるが、そうではない。ファイルの冒頭は
`#if os(iOS) || os(tvOS)` で、iOS 27 で iPhone アプリが自由にリサイズできるように
なったことへの対応として入ったユーティリティ。iOS のビルドで普通に参照される。

### なぜチルダではなく完全固定か

**`npx expo install` の互換判定を通しても直らない。** SDK が期待する版を書いた
`bundledNativeModules.json` の指定が `~57.0.1` で、これは `57.0.2` を許容する。
つまり `~` を付けて書いた時点で、`npx expo install --fix` でも `npm install` でも
壊れたほうが選ばれる。だから `~` を外した完全固定にしてある。

### 固定を外していい条件

**`expo` を `~57.0.13` 以上に上げたとき**（ExpoModulesCore が 57.0.11 以上になる）。
そのときは `expo-store-review` を `~57.0.2` に戻してよい。

| expo | expo-modules-core |
| ---- | ----------------- |
| 57.0.12 | ~57.0.10 |
| 57.0.13 | ~57.0.11 |
| 57.0.15 | ~57.0.12 |
| 57.0.17 | ~57.0.14 |

### 固定による機能差は無い

`57.0.1` と `57.0.2` の差分は上記の関数だけで、JS 側のビルド成果物は完全に同一
（`diff -rq` で差分なし）。`SceneGeometry.foregroundScene()` の中身も `57.0.1` の
実装と同じ順序で探している ── `foregroundActive` を先に探し、
無ければ `foregroundInactive`。**呼び出し側から見た動きは変わらない。**

### 壊れたときの見分け方

`npx expo install --fix` や `npm update` を流したあとに疑う。

```bash
grep SceneGeometry app-rn/node_modules/expo-store-review/ios/StoreReviewModule.swift
```

これが引っかかったら `57.0.2` が入っている。

このとき Xcode には `Command PhaseScriptExecution failed with a nonzero exit code` が
**もう 1 つ並んで出ることがある**が、そちらは追わなくていい。Swift のコンパイルエラーで
Xcode がビルドを打ち切った際に、並行して走っていたスクリプトフェーズ
（`ExpoImage` の `[CP] Copy XCFrameworks` など）が道連れで殺されたもので、
`SceneGeometry` を直せば一緒に消える。
