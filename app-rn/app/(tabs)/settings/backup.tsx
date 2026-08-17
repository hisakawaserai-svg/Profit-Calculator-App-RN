// バックアップと復元のルート（SPEC-V8 §5.2）。設定タブ「データ」群の 3 行目からの push。
//
// **`_layout.tsx` に `Stack.Screen` を宣言していない。** 見出しは画面の中の
// `<Stack.Screen options>` が出すので、レイアウト側に足す理由がない ──
// 宣言を足すと `index` を先頭に書き直す必要があり（settings/_layout.tsx の冒頭）、
// 足す理由が無いのに順序の制約だけを増やすことになる。
// タグ一覧（`tags/index`）・プリセット一覧（`presets/[type]`）と同じ扱い。
//
// **モーダルにしない**理由は BackupScreen.tsx の冒頭を参照（書き出しシートとの違い）。
import { BackupScreen } from '@/screens/BackupScreen';

export default function BackupRoute() {
  return <BackupScreen />;
}
