// SPEC-V3 §1.2（頭文字の導出）・§1.3（色）・§1.4（検証規則）の純粋関数。
//
// 画面はここで決まった結果を出すだけで、文字列を切ったり範囲を判定したりしない。
// 表示に出る文言は labels.ts が持つので、ここが返すのは理由コードまで
// （calcMemo の CalcSubmitBlockedReason → calculatorBlockedNote と同じ分担）。
//
// 数値入力のフィルタ（sanitizeNumericInput）は変更しない（§1.4 / UI-SPEC §7.4）。
// 同関数は `/^\d*\.?\d*$/` を通すので小数点は既に入る ── 率の小数第 1 位も、
// 金額の「整数のみ」も、フィルタではなくここの検証で決める。

import type { PresetType } from '@/db/schema';

/**
 * 固定パレット（§1.3）。カラーピッカー（自由な色指定）は持たない。
 *
 * §1.3 は 8 色で決めていたが、編集画面（設計案 25b）が色の丸を**折り返して 2 段**に
 * 並べるため 10 色にした。8 色の根拠は「選択肢が 8 個なら 1 行に収まる横並びで選べる」で、
 * 1 段に詰め込む前提のもの。段を折り返すなら、丸の大きさ（＝押しやすさ）を変えずに 10 色置ける。
 * 足したのは pink と brown ── 既存 8 色と色相が重ならず、白か黒のどちらかの文字が乗る 2 色。
 */
export const PRESET_COLOR_KEYS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'brown',
] as const;

export type PresetColorKey = (typeof PRESET_COLOR_KEYS)[number];

/**
 * 不正な colorKey を倒す先（§1.6）。DB の color_key は drizzle の enum を付けていない
 * （色を 1 つ足すたびにマイグレーションが要るのは重い）ので、読み出し側で必ずここを通す。
 */
export const DEFAULT_PRESET_COLOR_KEY: PresetColorKey = 'blue';

/** 名前の上限（§1.4）。書記素単位で数える */
export const PRESET_NAME_MAX_LENGTH = 20;

/** 頭文字の上限（§1.2）。入力欄はここで打ち止める */
export const PRESET_INITIAL_MAX_LENGTH = 2;

/** 手数料率の上限（§1.4） */
export const PRESET_RATE_MAX = 100;

/** 金額の上限（§1.4） */
export const PRESET_AMOUNT_MAX = 999_999;

/**
 * 書記素の配列。`length` で数えないのは、絵文字・サロゲートペアで
 * 2 文字判定が壊れるため（§1.2）。
 */
export function presetGraphemes(text: string): string[] {
  return Array.from(text);
}

/** 不正値・未知の色キーを既定色へ倒す（§1.6）。表示の直前に必ず通す */
export function normalizePresetColor(colorKey: string): PresetColorKey {
  return (PRESET_COLOR_KEYS as readonly string[]).includes(colorKey)
    ? (colorKey as PresetColorKey)
    : DEFAULT_PRESET_COLOR_KEY;
}

/**
 * バッジに出す頭文字（§1.2）。保存値が空なら name の先頭 1 文字を使う。
 *
 * 導出で落とすのは先頭の空白（半角・全角）だけで、それ以外の加工はしない。
 * name は空では保存されない（§1.4）ので、通常この結果が空文字になる経路はないが、
 * DB を直接いじられた場合の防御として空文字も返し得る（呼び出し側はバッジを空で描く）。
 */
export function presetInitial(preset: { name: string; initial: string }): string {
  const explicit = presetGraphemes(preset.initial.trim());
  if (explicit.length > 0) return explicit.slice(0, PRESET_INITIAL_MAX_LENGTH).join('');

  const name = presetGraphemes(preset.name);
  return name.find((char) => char.trim().length > 0) ?? '';
}

/** 頭文字の入力欄の打ち止め（§1.2）。2 文字を超えたぶんを落とすだけ */
export function clampPresetInitial(text: string): string {
  return presetGraphemes(text).slice(0, PRESET_INITIAL_MAX_LENGTH).join('');
}

/** 3 種の並び。一覧・編集画面のルートパラメータ（`presets/[type]`）の検証にも使う（§3.2） */
export const PRESET_TYPES: readonly PresetType[] = ['site', 'shipping', 'packaging'];

/**
 * ルートパラメータ（文字列）を種類に倒す（§3.2）。
 * URL は手で叩けるので、知らない値は null にして画面側で引き返す。
 */
export function toPresetType(value: string | undefined): PresetType | null {
  return PRESET_TYPES.includes(value as PresetType) ? (value as PresetType) : null;
}

/** value の単位（§2.1）。site だけ率で、他は金額 */
export function isRatePreset(type: PresetType): boolean {
  return type === 'site';
}

/**
 * 保存が無効な理由（§1.4）。文言は labels.presetBlockedNote が持つ。
 * 名前の重複は**弾かない**ので、ここに理由として現れない（§1.4）。
 */
export type PresetInvalidReason = 'name-required' | 'name-too-long' | 'value-out-of-range';

/** 編集シートが持つ入力そのまま（§3.3）。value は NumericField の生の文字列 */
export type PresetDraft = {
  type: PresetType;
  name: string;
  initial: string;
  /** sanitizeNumericInput 済みの文字列（`/^\d*\.?\d*$/`） */
  value: string;
};

export type PresetValidation =
  | {
      valid: true;
      /** 前後の空白を落とした保存値 */
      name: string;
      /** 2 文字に切り詰めた保存値。空文字なら表示時に name から導出する（§1.2） */
      initial: string;
      value: number;
    }
  | { valid: false; reason: PresetInvalidReason };

/** 小数第 n 位までかを、丸めではなく文字列の桁数で見る（浮動小数の誤差を持ち込まない） */
function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * 編集シートの保存ボタンの活性を決める（§1.4）。
 *
 * 率（site）は 0〜100 で**小数第 1 位まで**（決定 §8-12）、
 * 金額（shipping / packaging）は 0〜999,999 の**整数**。
 * 空文字・"." は 0 として扱う（SPEC §5.1 の parseNumericInput と同じ扱い）。
 */
export function validatePreset(draft: PresetDraft): PresetValidation {
  const name = draft.name.trim();
  if (name.length === 0) return { valid: false, reason: 'name-required' };
  if (presetGraphemes(name).length > PRESET_NAME_MAX_LENGTH) {
    return { valid: false, reason: 'name-too-long' };
  }

  const rate = isRatePreset(draft.type);
  const maxPlaces = rate ? 1 : 0;
  const max = rate ? PRESET_RATE_MAX : PRESET_AMOUNT_MAX;
  if (decimalPlaces(draft.value) > maxPlaces) {
    return { valid: false, reason: 'value-out-of-range' };
  }

  // 入力は sanitizeNumericInput を通っているので符号は付かないが、
  // 直接呼ばれても壊れないよう下限も見る（§4.3 の「範囲外でも正規化される」の裏返し）
  const value = Number.parseFloat(draft.value);
  const parsed = Number.isNaN(value) ? 0 : value;
  if (parsed < 0 || parsed > max) return { valid: false, reason: 'value-out-of-range' };

  return {
    valid: true,
    name,
    initial: clampPresetInitial(draft.initial.trim()),
    value: parsed,
  };
}
