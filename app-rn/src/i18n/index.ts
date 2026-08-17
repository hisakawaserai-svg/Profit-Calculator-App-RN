// 翻訳の解決（i18n-js）。**画面はここを直接触らない** ── 表示語の入口は
// これまでどおり labels.ts で、labels.ts の中の実装がリテラルから `t()` に変わるだけ。
//
// react-i18next ではなく i18n-js を選んだ理由:
// labels.ts は React に依存しない純粋な TS モジュールで、`src/logic/*` からも呼ばれ、
// テストが戻り値の文字列を直接アサートしている。つまり翻訳の解決は
// **フックなし・React の外**でできる必要がある。i18n-js の `t()` は素の関数なので、
// 735 個の export の型と呼び出し側をそのまま保てる。
//
// **再描画はこのモジュールの担当ではない。** `i18n.locale` を書き換えても React は気付かない。
// 言語を購読するのは settings ストア（zustand）で、画面は `useLocale()` を呼んで購読する。

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
 * 既定は日本語。`enableFallback` は英語に訳し漏れたキーを日本語で埋める保険で、
 * 通常は効かない ── en.ts は `Translations` に従うので、キーの欠落は型チェックで落ちる。
 *
 * 初期値を 'ja' にしてあるのは、端末の言語を読む前（settings ストアの初期化前）に
 * うっかり `t()` が呼ばれても、翻訳なしの目印ではなく日本語が出るようにするため。
 */
const i18n = new I18n(
  { ja, en },
  { defaultLocale: 'ja', locale: 'ja', enableFallback: true },
);

/** 表示語をひく。labels.ts 以外からは呼ばない */
export function t(key: TranslationKey, params?: TranslateParams): string {
  return i18n.t(key, params);
}

/**
 * いまの言語に関わらず**日本語で**ひく。
 *
 * 移行の途中でだけ要る。labels.ts の定数（`export const X = '...'`）は import 時に
 * 一度きり評価されるので言語の切り替えに追従できず、関数に変えるしかない。
 * だが 1 つの定数を関数にすると、まだ移していない画面の呼び出し側まで巻き込む。
 *
 * そこで**移行の済んでいない画面が参照している定数だけ**は定数のまま残し、
 * 値をこの関数から取る ── こうすれば日本語の文言はどれも辞書 1 か所にあり、
 * 定数と関数で文が食い違うことがない。**ステップ 2 で呼び出し側を関数に移し終えたら、
 * この関数ごと消える。**
 */
export function tJa(key: TranslationKey, params?: TranslateParams): string {
  return i18n.t(key, { ...params, locale: 'ja' });
}

/**
 * 表示言語を切り替える。**呼ぶのは settings ストアだけ** ──
 * ここだけを書き換えても購読している画面は再描画されないので、
 * ストア側が state の更新とセットで呼ぶ（src/settings/index.ts）。
 */
export function setI18nLocale(locale: Locale): void {
  i18n.locale = locale;
}
