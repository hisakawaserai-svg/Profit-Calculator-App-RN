// 表示言語の設定のうち、保存先にも端末にも依存しない部分。
//
// defaultRecordKind.ts と同じ作りにしてある ── kv-store は文字列しか返さないので、
// 妥当性の検証と既定値へのフォールバックはアプリ側の責務になる。その規則をここに置き、
// I/O（kv-store・zustand・expo-localization）は ./index.ts が持つ。
// 分けてあるのは、言語の決まり方を native モジュールなしで単体テストできるようにするため。

/** kv-store のキー。設定名をそのまま使う（defaultRecordKind と同じ流儀） */
export const LANGUAGE_KEY = 'language';

/**
 * 設定タブで選べる 3 択。**「システムに従う」は言語ではなく「決め方」**なので、
 * 実際に表示に使う Locale とは別の型にする ── 一緒にすると、
 * 「保存されている値」と「いま表示している言語」の区別が付かなくなる。
 */
export const LANGUAGE_SETTINGS = ['system', 'ja', 'en'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** 実際に表示に使う言語。辞書（src/i18n/）が持つのはこの 2 つだけ */
export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** 未設定・不正値のときの設定値。初回起動は「システムに従う」から始める */
export const FALLBACK_LANGUAGE: LanguageSetting = 'system';

/**
 * 「システムに従う」で端末の言語をどれとも判定できなかったときに使う言語。
 * **日本語ではなく英語**にする ── 日本語以外の端末には英語を出す、という方針の帰結。
 */
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * kv-store から読んだ文字列を設定値に変換する。
 * 未設定（null）も、想定外の文字列（手で書き換えられた・将来の値からのダウングレード）も
 * 常に既定値へ倒す（defaultRecordKind の normalizeRecordKind と同じ扱い）。
 */
export function normalizeLanguage(value: string | null | undefined): LanguageSetting {
  return (LANGUAGE_SETTINGS as readonly string[]).includes(value ?? '')
    ? (value as LanguageSetting)
    : FALLBACK_LANGUAGE;
}

/**
 * 設定値と端末の言語から、実際に表示する言語を決める。
 *
 * `deviceLanguages` には expo-localization の `getLocales()` が返す並び
 * （**ユーザーが端末で付けた優先順**）をそのまま渡す。`languageCode`（'ja'）でも
 * `languageTag`（'ja-JP'）でも受けられるように、地域の部分は落としてから見る。
 *
 * **並びの先頭だけを見るのではなく、対応している言語のうちいちばん優先度が高いものを採る。**
 * 端末が「フランス語 → 日本語」の順に設定されている人は、フランス語を出せない以上、
 * 3 番目の英語ではなく 2 番目の日本語を読みたいはず ── iOS 自体が
 * アプリの対応言語を上から順に探すのと同じ決め方に揃えてある。
 * 端末が日本語 1 つなら日本語、日本語を含まなければ英語になるので、
 * 「日本語以外の端末は英語」という方針はそのまま満たす。
 */
export function resolveLocale(
  setting: LanguageSetting,
  deviceLanguages: readonly (string | null | undefined)[],
): Locale {
  if (setting !== 'system') return setting;

  for (const language of deviceLanguages) {
    // 'ja-JP' → 'ja'。大文字で来る経路（'JA'）にも備えて畳んでおく
    const code = language?.toLowerCase().split('-')[0];
    if (code === 'ja' || code === 'en') return code;
  }
  return FALLBACK_LOCALE;
}
