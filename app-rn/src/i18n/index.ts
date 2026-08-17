// 翻訳の解決（i18n-js）。**画面はここを直接触らない** ── 表示語の入口は
// これまでどおり labels.ts で、labels.ts の中の実装がリテラルから `t()` に変わるだけ。
//
// react-i18next ではなく i18n-js を選んだ理由:
// labels.ts は React に依存しない純粋な TS モジュールで、`src/logic/*` からも呼ばれ、
// テストが戻り値の文字列を直接アサートしている。つまり翻訳の解決は
// **フックなし・React の外**でできる必要がある。i18n-js の `t()` は素の関数なので、
// 735 個の export の型と呼び出し側をそのまま保てる。
//
// ## なぜ locale を引数で受け取るのか（React Compiler）
//
// **表示中の言語をモジュール変数に持たせてはいけない。** このアプリは React Compiler を
// 有効にしている（app.json の `experiments.reactCompiler`）。コンパイラは
// **引数を取らない関数呼び出しを「依存なし＝定数」と見なして初回の値で固定する**
// （生成コードに `Symbol.for("react.memo_cache_sentinel")` が入る）。
// つまり `helpLinkLabel()` のような形にすると、言語を切り替えて再描画させても
// 初回の文字列が返り続ける ── 実際にそれで一度壊した。
//
// locale を引数で渡せば、コンパイラは `if ($[0] !== locale)` という依存付きのキャッシュを
// 出すので正しく引き直される。渡し忘れは**型エラーになる**ので、静かに古い文字列が
// 残ることがない。この理由から、labels.ts の表示語の関数は
// **locale を第 1 引数に取る**という規約で統一する。

import { I18n } from 'i18n-js';

import type { Locale } from '@/settings/language';

import { en } from './en';
import { ja, type Translations } from './ja';

/**
 * 複数形を持つ値。`{{count}}` を渡したときに i18n-js が one / other を選ぶ。
 * キーの型を作るときは**これ自体を終端として扱う** ── 呼ぶのは `t('common.count', ...)` で、
 * `t('common.count.one')` ではないため。
 */
type PluralForms = {
  one: string;
  other: string;
};

/**
 * 辞書のネストを `'settings.help.label'` のような文字列の合併に畳む。
 * これでキーの打ち間違いと、消したキーの参照残りが型チェックで落ちる。
 */
type DottedKeys<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends PluralForms
      ? K
      : `${K}.${DottedKeys<T[K]>}`;
}[keyof T & string];

export type TranslationKey = DottedKeys<Translations>;

/** `{{version}}` などの差し込み値。`count` を渡すと複数形の選択にも使われる */
type TranslateParams = Readonly<Record<string, string | number>>;

/**
 * `enableFallback` は英語に訳し漏れたキーを日本語で埋める保険で、通常は効かない ──
 * en.ts は `Translations` に従うので、キーの欠落は型チェックで落ちる。
 *
 * **`locale` は設定しない。** 引くたびに呼び出し側から渡す（上のコメント参照）ので、
 * このインスタンスは可変の状態を持たない。
 */
const i18n = new I18n({ ja, en }, { defaultLocale: 'ja', enableFallback: true });

/**
 * 表示語をひく。labels.ts 以外からは呼ばない。
 *
 * `locale` が第 1 引数なのは、labels.ts の全ての表示語の関数で位置をそろえるため。
 */
export function t(key: TranslationKey, locale: Locale, params?: TranslateParams): string {
  return i18n.t(key, { ...params, locale });
}
