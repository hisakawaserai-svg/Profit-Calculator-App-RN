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

/**
 * 頭文字を 2 文字に切り詰める（§1.2）。
 *
 * **打っている最中には通さない。** 日本語入力は「ふうとう」と打ってから「封筒」に変換するので、
 * 1 文字ごとに切ると変換前のひらがなが入り切らず、漢字に辿り着けない。
 * 通すのは**変換が確定したあと** ── 欄を離れたとき（PresetFormScreen の onBlur）と、
 * 保存の直前（validatePreset）の 2 箇所だけ。
 */
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
 * 欄の値と一致するプリセット（§4.1 のバッジ・§4.3 のチェック）。
 *
 * 空欄（null）は「選んでいない」── 0 円のプリセットがあると、何も入れていない欄に
 * バッジが出てしまうため、値がないことと 0 であることを分ける。
 * 同じ値が 2 件あるときは並び順で先の 1 件（§3.4 の sortOrder 昇順で渡ってくる）。
 */
export function findPresetByValue<T extends { value: number }>(
  presets: readonly T[],
  value: number | null,
): T | null {
  if (value == null) return null;
  return presets.find((preset) => preset.value === value) ?? null;
}

/**
 * 写した名前から引く（§1.5.1 の販売サイト）。
 *
 * 率ではなく名前で引くのは、手で率を変えても札が残る仕様だから ── 10% → 8% にした
 * 記録でも、選んだサイトのバッジは出たままにする。プリセットを消したり改名したりすると
 * 引けなくなるが、そのときバッジが消えるだけで名前の写し自体は記録に残る。
 */
export function findPresetByName<T extends { name: string }>(
  presets: readonly T[],
  name: string,
): T | null {
  if (name === '') return null;
  return presets.find((preset) => preset.name === name) ?? null;
}

/**
 * タグボタンに出す見た目（SPEC-V3 §4.1 / §1.5.1）。判定はここで済ませ、部品は描くだけにする。
 *
 * - `unselected` … タグアイコン ＋ ▾
 * - `selected` … バッジ ＋ ▾（プリセットの値がそのまま入っている）
 * - `rate-changed` … **薄いバッジ・▾ なし**（名前は残っているが、率は手で動かされている）
 */
export type PresetTagState<T> =
  | { kind: 'unselected' }
  | { kind: 'selected'; preset: T }
  | { kind: 'rate-changed'; preset: T };

/**
 * 欄の状態からタグボタンの見た目を決める（§4.1 / §1.5.1）。
 *
 * `selectedName` を渡す欄（販売サイト）は**名前と値の両方**を照合する。
 * 名前を写す仕様（§1.5.1）は「10% のサイトで 8% で売った」を記録できるようにするためのもので、
 * 名前が残ること自体は正しい。ただし選択直後と同じバッジのままだと
 * 「プリセットの率がそのまま入っている」と読めてしまうので、
 * 率がプリセットと違うときは薄いバッジ（▾ なし）に落として、例外的な率だと分かるようにする。
 *
 * `selectedName` を渡さない欄（送料など）は値だけで引く。手で額を変えれば
 * その時点でどのプリセットとも一致しなくなり、バッジは消える（`unselected`）。
 * この欄には「名前は合っているが値が違う」状態が存在しないので、`rate-changed` にはならない。
 *
 * **プリセットが削除・改名されていて名前で引けないときは `unselected`。**
 * バッジの色と頭文字はプリセットの保存値そのものなので、消えた行の札は描きようがない
 * （名前だけから色を作ると、同じ記録が編集のたびに違う色で出る）。
 * 販売サイト名は欄の下の行（SiteNameRow）に残るので、どこで売ったかは読める。
 */
export function resolvePresetTag<T extends { name: string; value: number }>(
  presets: readonly T[],
  value: number | null,
  selectedName?: string,
): PresetTagState<T> {
  if (selectedName == null) {
    const matched = findPresetByValue(presets, value);
    return matched == null ? { kind: 'unselected' } : { kind: 'selected', preset: matched };
  }

  const named = findPresetByName(presets, selectedName);
  if (named == null) return { kind: 'unselected' };
  return named.value === value
    ? { kind: 'selected', preset: named }
    : { kind: 'rate-changed', preset: named };
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
    // 欄を離れずに保存を押した場合の安全網（§1.2）。入力中は切らないので、
    // ここに 3 文字以上が渡ってくることがある
    initial: clampPresetInitial(draft.initial.trim()),
    value: parsed,
  };
}
