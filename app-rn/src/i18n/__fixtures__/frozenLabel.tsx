// reactCompiler.test.ts 専用の**壊れた書き方の見本**。アプリからは読まない。
//
// 表示語を引数なしで呼ぶと React Compiler がどうするかを固定するためだけに置いてある。
// 検査（frozenLabelCalls）が本当に捕まえられるかの確認に使う ── 見本が無いと、
// 検査が空振りしていても「問題なし」に見えてしまう。
import { Text } from 'react-native';

import { settingsTabLabel } from '@/logic/labels';

export function FrozenLabelScreen() {
  // @ts-expect-error 引数なしの呼び出しは型でも弾かれる（これがまさに防ぎたい書き方）
  return <Text>{settingsTabLabel()}</Text>;
}
