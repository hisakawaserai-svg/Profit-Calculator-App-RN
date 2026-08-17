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

import { normalizeHex, readableForeground } from './color';

/**
 * 固定パレット（§1.3 / SPEC-V7 §2）。**これに加えて自由色（カラーピッカー）を選べる。**
 *
 * §1.3 は 8 色で決めていたが、編集画面（設計案 25b）が色の丸を**折り返して 2 段**に
 * 並べるため 10 色にした。8 色の根拠は「選択肢が 8 個なら 1 行に収まる横並びで選べる」で、
 * 1 段に詰め込む前提のもの。段を折り返すなら、丸の大きさ（＝押しやすさ）を変えずに 10 色置ける。
 * 足したのは pink と brown ── 既存 8 色と色相が重ならず、白か黒のどちらかの文字が乗る 2 色。
 *
 * **11 色目は gray**（SPEC-V7 §2.1）。12 個目を自由色の口にすると段が揃うため
 * （当初は 6 × 2、設計案 49c で 4 × 3）── 残っている色相はどれも既存の 10 色と
 * 隣り合ってしまうので、**色相を持たない 1 色**を足した。
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
  'gray',
] as const;

export type PresetColorKey = (typeof PRESET_COLOR_KEYS)[number];

/**
 * 固定色の**保存値**（SPEC-V7 §2.1）。プリセットは色キーではなく **hex を保存する**
 * ようになった（自由色と同じ形にするため）ので、この 11 個が「固定色として選ばれた」
 * ことを表す識別子になる。
 *
 * **値はライトテーマの地色そのもの。** 保存された hex がここに一致したときだけ
 * テーマの対応表（theme.presetTones）を引くので、**明暗で色を出し分ける従来の挙動が
 * そのまま残る**（SPEC-V3 §1.3 が hex 保存を避けた理由への答え）。
 * 自由色は一致しないので、選ばれた hex がそのまま両テーマで出る。
 */
export const PRESET_COLOR_HEXES: Record<PresetColorKey, string> = {
  red: '#FF3B30',
  orange: '#F07800',
  yellow: '#FFCC00',
  green: '#2E9E4F',
  teal: '#1E93AE',
  blue: '#007AFF',
  indigo: '#5856D6',
  purple: '#9A3FCB',
  pink: '#FF2D55',
  brown: '#8E6B4A',
  gray: '#6E6E73',
};

/** 固定色の hex → キー。保存値がどの固定色かを引く（見つからなければ自由色） */
const PRESET_COLOR_KEY_BY_HEX = new Map<string, PresetColorKey>(
  PRESET_COLOR_KEYS.map((key) => [PRESET_COLOR_HEXES[key], key]),
);

/**
 * 保存値がどの固定色か（SPEC-V7 §2.1）。自由色・空・壊れた値では null。
 * 旧形式の色キー（`'blue'` など）もここで拾う ── マイグレーション後に残ることは
 * ないが、タグ（SPEC-V4）は今もキーを保存しており、同じ関数で読めるようにしておく。
 */
export function presetColorKeyOf(stored: string): PresetColorKey | null {
  if ((PRESET_COLOR_KEYS as readonly string[]).includes(stored)) {
    return stored as PresetColorKey;
  }
  const hex = normalizeHex(stored);
  return hex == null ? null : (PRESET_COLOR_KEY_BY_HEX.get(hex) ?? null);
}

/**
 * 保存する色の値（SPEC-V7 §2.1）。**編集画面の state はこれで初期化する。**
 * 旧形式の色キーは対応する hex へ、自由色はそのまま、読めない値は既定色（青）へ倒す。
 */
export function presetColorValue(stored: string): string {
  const key = presetColorKeyOf(stored);
  if (key != null) return PRESET_COLOR_HEXES[key];
  return normalizeHex(stored) ?? PRESET_COLOR_HEXES[DEFAULT_PRESET_COLOR_KEY];
}

/**
 * バッジに使う地色と文字色（SPEC-V7 §2）。**固定色と自由色の分かれ道はここ 1 か所。**
 *
 * - 固定色（保存値が PRESET_COLOR_HEXES のどれか / 旧形式のキー）
 *   … テーマの対応表をそのまま使う。**文字色も表のまま**で、輝度の判定は通さない
 *     ── 比率だけで決めると `#007AFF` が黒文字になり、既存の見た目が変わる（§2.2）
 * - 自由色 … 選ばれた hex をそのまま地色にし、**文字色は輝度から決める**
 * - 読めない値 … 既定色（青）に倒す
 */
export function resolvePresetTone(
  stored: string,
  tones: Record<PresetColorKey, { background: string; foreground: string }>,
): { background: string; foreground: string } {
  const key = presetColorKeyOf(stored);
  if (key != null) return tones[key];

  const hex = normalizeHex(stored);
  if (hex == null) return tones[DEFAULT_PRESET_COLOR_KEY];
  return { background: hex, foreground: readableForeground(hex) };
}

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
 * 入数の上限（§2.6.6。決定 §2.6.8-6）。
 * PRESET_AMOUNT_MAX に揃えないのは、金額と個数が別の単位で、同じ上限にする理由がないため。
 */
export const PRESET_PACK_QUANTITY_MAX = 9_999;

/**
 * 丸めて 0 円になったときに押し上げる下限（§2.6.3。決定 §2.6.8-4）。
 * 0 円だと経費に計上されず、登録した意味がなくなる。
 */
export const PRESET_UNIT_PRICE_MIN = 0.1;

/**
 * サイズの上限（cm。SPEC-V10 §1.4）。入数（PRESET_PACK_QUANTITY_MAX）と同じ桁にしてある ──
 * 4 桁あればロール状の梱包材（50m = 5,000cm）まで入り、これ以上の値は打ち間違いの方が疑わしい。
 */
export const PRESET_SIZE_MAX = 9_999;

/**
 * 単価の計算方式（SPEC-V10 §1.1）。**梱包材だけが 3 通りを持つ。**
 *
 * - `individual` … 購入価格 ÷ 購入数量 → 1 個あたり（§2.6 の既存方式）
 * - `area`       … 購入価格 ÷ 購入面積 → ¥/㎡。平均使用サイズがあれば 1 回あたりまで
 * - `usage`      … 購入価格 ÷ 想定使用回数 → 1 回あたり
 *
 * 並びはそのまま編集画面の 3 択の並び（既定の `individual` が先頭）。
 */
export const PRESET_CALC_METHODS = ['individual', 'area', 'usage'] as const;

export type PresetCalcMethod = (typeof PRESET_CALC_METHODS)[number];

/**
 * 方式を持たない行・知らない値の倒し先（SPEC-V10 §1.1）。
 * **0010 以前に登録された梱包材はすべてこれ**（列の DEFAULT もこの値）。
 */
export const DEFAULT_PRESET_CALC_METHOD: PresetCalcMethod = 'individual';

/**
 * 保存値を方式に倒す（§1.6 の normalizePresetColor と同じ役目）。
 * calc_method に drizzle の enum を付けていないので、読み出しは必ずここを通す。
 */
export function normalizePresetCalcMethod(value: string | undefined): PresetCalcMethod {
  return (PRESET_CALC_METHODS as readonly string[]).includes(value ?? '')
    ? (value as PresetCalcMethod)
    : DEFAULT_PRESET_CALC_METHOD;
}

/**
 * 行（または下書き）の計算方式（SPEC-V10 §1.1）。**梱包材以外は常に `individual`。**
 *
 * 種類で打ち止めるのは、送料・販売サイトに面積も使用回数も意味がないため ──
 * 画面が 3 択を出さないだけでなく、値が紛れ込んでも読み方が変わらないようにしておく
 * （packBuyTarget が種類でまとめ買いの行き先を振り分けるのと同じ考え方）。
 */
export function presetCalcMethod(preset: {
  type: PresetType;
  calcMethod?: string;
}): PresetCalcMethod {
  if (preset.type !== 'packaging') return DEFAULT_PRESET_CALC_METHOD;
  return normalizePresetCalcMethod(preset.calcMethod);
}

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
export function findPresetByValue<T extends { value: number; materialCost?: number }>(
  presets: readonly T[],
  value: number | null,
): T | null {
  if (value == null) return null;
  // 送料プリセットは**合計でも引ける**（SPEC-V6 §3）── 選ぶと欄に入るのは
  // 「送料 ＋ 専用資材」なので、value だけで引くと選んだ直後に札が消える。
  // 「専用資材を使わない」を立てた記録では欄が送料そのものになるので、両方を見る
  return (
    presets.find(
      (preset) =>
        preset.value === value || preset.value + (preset.materialCost ?? 0) === value,
    ) ?? null
  );
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
 * まとめ買い（＝単価を計算して登録した行）か（§2.6.4 / SPEC-V10 §1.2）。
 * **モードの列は持たない** ── `priceMode` を別に持つと「まとめ買いなのに入数が 0」のような
 * 不整合な行が作れてしまうので、判定は材料が入っているかどうかに閉じる。
 *
 * 方式が増えても考え方は同じで、見る列だけが方式で変わる:
 * 個数・使用回数は割る数（packQuantity）、面積は購入サイズ。
 * `calcMethod` は**どの列を見るか**を言うだけで、これ単独でまとめ買いを名乗ることはない。
 */
export function isPackBuy(preset: {
  type?: PresetType;
  calcMethod?: string;
  packQuantity: number;
  packHeight?: number;
  packWidth?: number;
}): boolean {
  const method = presetCalcMethod({ type: preset.type ?? 'packaging', calcMethod: preset.calcMethod });
  if (method === 'area') return (preset.packHeight ?? 0) > 0 && (preset.packWidth ?? 0) > 0;
  return preset.packQuantity > 0;
}

/**
 * 小数第 1 位までに丸めた単価（§2.6.3）。**引数は単価そのものではなく 10 倍した値。**
 *
 * 10 倍してから割るのは、`Math.round(x * 10) / 10` が浮動小数の誤差を持ち込むため
 * （§2.6.3）── `985 / 100 = 9.85` は二進で 9.8499… になり、10 倍してから丸めると 9.8 に落ちる。
 * 割る前に 10 倍した値を受け取ることで、呼び出し側がその順序を守れる。
 *
 * `basePrice`（購入価格）を別に受けるのは、**丸めで 0 円に落ちた分だけを押し上げる**ため
 * （決定 §2.6.8-4）── もらい物（購入価格 0）は 0 円のままにする。
 */
function roundUnitPrice(scaledPrice: number, basePrice: number): number | null {
  const rounded = Math.round(scaledPrice) / 10;
  if (!Number.isFinite(rounded)) return null;
  // もらい物・在庫の使い回し（購入価格 0）は 0 円のまま。押し上げるのは丸めで消えた分だけ
  if (rounded === 0 && basePrice > 0) return PRESET_UNIT_PRICE_MIN;
  return rounded;
}

/**
 * 「個数から」「使用回数から」の単価（§2.6 / SPEC-V10 §1.2）。
 * **2 方式で同じ 1 本**を使う ── 割る数が入数か想定使用回数かが違うだけで、
 * 購入価格 ÷ その数という割り算そのものは同じ。
 *
 * 割る数が 0 以下なら計算できないので null。
 */
export function presetUnitPrice(packPrice: number, packQuantity: number): number | null {
  if (!(packQuantity > 0)) return null;
  return roundUnitPrice((packPrice * 10) / packQuantity, packPrice);
}

/** 1 ㎡ の cm²（面積方式の換算。10,000 cm² = 1 ㎡） */
const CM2_PER_M2 = 10_000;

/** 縦 × 横（cm²）。どちらかが 0 以下なら面積として使えないので null（SPEC-V10 §1.2） */
function presetAreaCm2(heightCm: number, widthCm: number): number | null {
  if (!(heightCm > 0) || !(widthCm > 0)) return null;
  const area = heightCm * widthCm;
  return Number.isFinite(area) ? area : null;
}

/**
 * 面積方式の ¥/㎡（SPEC-V10 §1.2）。購入価格 ÷ 購入面積(㎡)。
 * 購入サイズが片方でも空・0 なら null（1 ㎡あたりの行は「—」のまま）。
 *
 * 10 倍（丸めのため）と 10,000 倍（cm² → ㎡）をまとめて先に掛けてから割る ──
 * 個数方式と同じ「割る前に整数倍する」順序で、100cm × 100cm のような素直な入力では誤差が出ない。
 */
export function presetAreaUnitPrice(
  packPrice: number,
  packHeightCm: number,
  packWidthCm: number,
): number | null {
  const packArea = presetAreaCm2(packHeightCm, packWidthCm);
  if (packArea == null) return null;
  return roundUnitPrice((packPrice * 10 * CM2_PER_M2) / packArea, packPrice);
}

/**
 * 面積方式の 1 回あたり（SPEC-V10 §1.2）:「¥/㎡ × 平均使用面積」。
 * 購入サイズか平均使用サイズのどちらかが空・0 なら null（＝ 1 回あたりは出せない。§1.3）。
 *
 * **丸めた ¥/㎡ からではなく購入価格から直に出す** ── ¥/㎡ を丸めてから掛けると、
 * 小さな使用面積では丸め誤差がそのまま単価の何割にもなる（0.05 円の丸めが 100 倍される）。
 * 式としては同じ「購入価格 × 使用面積 ÷ 購入面積」なので、㎡ の換算は約分されて消える。
 */
export function presetAreaUsePrice(
  packPrice: number,
  packHeightCm: number,
  packWidthCm: number,
  useHeightCm: number,
  useWidthCm: number,
): number | null {
  const packArea = presetAreaCm2(packHeightCm, packWidthCm);
  const useArea = presetAreaCm2(useHeightCm, useWidthCm);
  if (packArea == null || useArea == null) return null;
  return roundUnitPrice((packPrice * 10 * useArea) / packArea, packPrice);
}

/**
 * 保存済みの行の「1 回（1 個・1 ㎡）あたり」を計算し直す（SPEC-V10 §1.3）。
 *
 * **value と同じ値が返る**（保存時に確定して書いてあるため）。あくまで
 * 「控えの列から value を作り直せる」ことを保つための 1 本で、記録に入るのは value そのもの。
 * 方式ごとの割り算がどこか 1 か所に閉じていないと、編集画面と保存値が食い違い得る。
 */
export function presetRowUnitPrice(preset: {
  type: PresetType;
  calcMethod?: string;
  value: number;
  packQuantity: number;
  packPrice: number;
  packHeight?: number;
  packWidth?: number;
  useHeight?: number;
  useWidth?: number;
}): number | null {
  if (!isPackBuy(preset)) return null;

  switch (presetCalcMethod(preset)) {
    case 'area': {
      const packHeight = preset.packHeight ?? 0;
      const packWidth = preset.packWidth ?? 0;
      return (
        presetAreaUsePrice(
          preset.packPrice,
          packHeight,
          packWidth,
          preset.useHeight ?? 0,
          preset.useWidth ?? 0,
        ) ?? presetAreaUnitPrice(preset.packPrice, packHeight, packWidth)
      );
    }
    // 個数・使用回数は割る数が違うだけ（§1.2）
    default:
      return presetUnitPrice(preset.packPrice, preset.packQuantity);
  }
}

/**
 * 面積方式で「1 回あたり」まで出せる行か（SPEC-V10 §1.3）。
 * **平均使用サイズが両方入っているとき**だけ true ── false のとき value は ¥/㎡ で、
 * 一覧の行も「1 ㎡あたり」と言う（labels.presetUnitNote）。
 */
export function hasPresetUseSize(preset: {
  type: PresetType;
  calcMethod?: string;
  useHeight?: number;
  useWidth?: number;
}): boolean {
  if (presetCalcMethod(preset) !== 'area') return false;
  return (preset.useHeight ?? 0) > 0 && (preset.useWidth ?? 0) > 0;
}

/**
 * 保存が無効な理由（§1.4 / §2.6.6）。文言は labels.presetBlockedNote が持つ。
 * 名前の重複は**弾かない**ので、ここに理由として現れない（§1.4）。
 */
export type PresetInvalidReason =
  | 'name-required'
  | 'name-too-long'
  | 'value-out-of-range'
  | 'material-cost-out-of-range'
  // 割る数（個数方式 = 入数 / 使用回数方式 = 想定使用回数）。文言は方式で言い分ける
  | 'pack-quantity-required'
  | 'pack-price-out-of-range'
  // 面積方式（SPEC-V10 §1.4）
  | 'pack-size-required'
  | 'use-size-invalid';

/** 編集シートが持つ入力そのまま（§3.3）。value は NumericField の生の文字列 */
export type PresetDraft = {
  type: PresetType;
  name: string;
  initial: string;
  /** sanitizeNumericInput 済みの文字列（`/^\d*\.?\d*$/`） */
  value: string;
  /**
   * 「金額の入れ方」の 2 択（§2.6.2）。**画面の状態であって列ではない** ──
   * 保存後の行では packQuantity > 0 が同じことを言う（isPackBuy。§2.6.4）。
   * 入力途中は入数が空でもまとめ買いのままでいる必要があるので、下書きだけがこれを持つ。
   */
  packBuy?: boolean;
  /**
   * 単価の計算方式（SPEC-V10 §1.1）。**省略 = `individual`（既存方式）。**
   * まとめ買いのときだけ見る（梱包材以外では presetCalcMethod が種類で打ち止める）。
   */
  calcMethod?: PresetCalcMethod;
  /**
   * sanitizeNumericInput 済みの**割る数**（まとめ買いのときだけ見る）。
   * 個数方式では入数、使用回数方式では想定使用回数（§1.2。列も欄も 1 本で兼ねる）。
   */
  packQuantity?: string;
  /** sanitizeNumericInput 済みの購入価格（まとめ買いのときだけ見る。3 方式に共通） */
  packPrice?: string;
  /** sanitizeNumericInput 済みの購入サイズ（cm。面積方式のときだけ見る） */
  packHeight?: string;
  packWidth?: string;
  /** sanitizeNumericInput 済みの平均使用サイズ（cm。面積方式の**任意入力**） */
  useHeight?: string;
  useWidth?: string;
  /**
   * sanitizeNumericInput 済みの専用資材の代金（SPEC-V6 §2。送料のときだけ見る）。
   * まとめ買いのときはこの欄を見ず、入数と購入価格から確定する。
   */
  materialCost?: string;
};

export type PresetValidation =
  | {
      valid: true;
      /** 前後の空白を落とした保存値 */
      name: string;
      /** 2 文字に切り詰めた保存値。空文字なら表示時に name から導出する（§1.2） */
      initial: string;
      /** 1 個あたり。まとめ買いなら presetUnitPrice を確定して書く（§2.6.4） */
      value: number;
      /** 入数 / 想定使用回数。1 個ずつ・送料・販売サイトでは 0（§2.6.4 / 決定 §2.6.8-3） */
      packQuantity: number;
      /** 購入価格。同上 */
      packPrice: number;
      /** 専用資材の代金（SPEC-V6 §1）。送料以外は 0 */
      materialCost: number;
      /**
       * 面積・使用回数方式の保存値（SPEC-V10 §1.2）。**既存方式（個数から）では入らない。**
       *
       * 省略と 0 / 'individual' は同じ意味で、書き込み側（db/presets.ts）が既定値へ倒す ──
       * 既存方式の下書きから既存と同じ形の結果が返ることを、型の側でも見えるようにしてある。
       */
      calcMethod?: PresetCalcMethod;
      packHeight?: number;
      packWidth?: number;
      useHeight?: number;
      useWidth?: number;
    }
  | { valid: false; reason: PresetInvalidReason };

/** 小数第 n 位までかを、丸めではなく文字列の桁数で見る（浮動小数の誤差を持ち込まない） */
function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/** 空文字・"." は 0 として扱う（SPEC §5.1 の parseNumericInput と同じ扱い） */
function parseDraftNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** 入数が空・0 のあいだは「1 個あたり」を出せない（§2.6.6。行は — にする） */
function isPackQuantityBlank(draft: PresetDraft): boolean {
  return parseDraftNumber(draft.packQuantity ?? '') <= 0;
}

/**
 * まとめ買いの単価が**何の金額になるか**（§2.6.2 / SPEC-V6 §2）。
 *
 * - 梱包材 … 1 個あたりがそのまま登録額（value）
 * - 送料   … 1 個あたりが**専用資材の代金**（materialCost）。送料そのもの（value）は
 *            「1 回いくら」で箱買いの概念を持たないので、まとめ買いの対象にならない
 * - 販売サイト … 率（%）なので個数の単位がない。2 択そのものを出さない
 */
export function packBuyTarget(type: PresetType): 'value' | 'materialCost' | null {
  if (type === 'packaging') return 'value';
  if (type === 'shipping') return 'materialCost';
  return null;
}

/**
 * 下書きが「まとめ買い」か（§2.6.2 / SPEC-V6 §2）。2 択を出すのは梱包材と送料だけなので、
 * 販売サイトでは packBuy が立っていても 1 個ずつとして扱う（行は 2 列とも 0）。
 */
export function isPackBuyDraft(draft: PresetDraft): boolean {
  return packBuyTarget(draft.type) != null && draft.packBuy === true;
}

/** 下書きの計算方式（SPEC-V10 §1.1）。梱包材以外・省略時は既存方式 */
export function presetDraftCalcMethod(draft: PresetDraft): PresetCalcMethod {
  return presetCalcMethod({ type: draft.type, calcMethod: draft.calcMethod });
}

/**
 * 下書きの ¥/㎡（SPEC-V10 §1.3 の 1 枚目の帯）。**面積方式のときだけ値が入る。**
 * 購入サイズが片方でも空・0 のあいだは null（行は — のまま）。
 */
export function presetDraftAreaUnitPrice(draft: PresetDraft): number | null {
  if (!isPackBuyDraft(draft) || presetDraftCalcMethod(draft) !== 'area') return null;
  return presetAreaUnitPrice(
    parseDraftNumber(draft.packPrice ?? ''),
    parseDraftNumber(draft.packHeight ?? ''),
    parseDraftNumber(draft.packWidth ?? ''),
  );
}

/**
 * 下書きの「1 回（1 個）あたり」（§2.6.2 の青字の行 / SPEC-V10 §1.3）。
 * **画面の帯に出るのはこの値**で、材料が揃っていないあいだは null（行は — のまま）。
 *
 * 面積方式で**平均使用サイズが未入力のときも null** ── ¥/㎡ は出せても
 * 「1 回でいくらか」はまだ言えないため（§1.3）。登録額は
 * presetDraftUnitPrice が ¥/㎡ に倒す。
 */
export function presetDraftUsePrice(draft: PresetDraft): number | null {
  if (!isPackBuyDraft(draft)) return null;

  switch (presetDraftCalcMethod(draft)) {
    case 'area':
      return presetAreaUsePrice(
        parseDraftNumber(draft.packPrice ?? ''),
        parseDraftNumber(draft.packHeight ?? ''),
        parseDraftNumber(draft.packWidth ?? ''),
        parseDraftNumber(draft.useHeight ?? ''),
        parseDraftNumber(draft.useWidth ?? ''),
      );
    // 個数・使用回数は割る数が違うだけで同じ割り算（§1.2）
    default:
      return presetUnitPrice(
        parseDraftNumber(draft.packPrice ?? ''),
        parseDraftNumber(draft.packQuantity ?? ''),
      );
  }
}

/**
 * 下書きから決まる**登録額**（§2.6.2 / SPEC-V10 §1.3）。保存すると value に入る値そのもので、
 * 「1 個ずつ」へ戻したときに金額欄へ残るのもこれ。検証を通る前でも呼べる。
 *
 * 面積方式で平均使用サイズが未入力のときだけ、1 回あたりの代わりに **¥/㎡** が返る ──
 * 記録に計上されるのも ¥/㎡（＝ 1 ㎡使ったときの額）で、一覧の行がその単位を明示する
 * （labels.presetUnitNote）。ここで null に倒すと、面積と価格を入れただけでは
 * 保存できないプリセットになってしまい、あとから使用サイズを足す使い方ができない。
 */
export function presetDraftUnitPrice(draft: PresetDraft): number | null {
  return presetDraftUsePrice(draft) ?? presetDraftAreaUnitPrice(draft);
}

/**
 * 編集シートの保存ボタンの活性を決める（§1.4 / §2.6.6）。
 *
 * 率（site）は 0〜100、金額は 0〜999,999。**小数第 1 位まで許すのは送料以外**
 * （率は決定 §8-12、梱包材はまとめ買いの単価が小数になるため。§2.6.3）。
 * まとめ買い（梱包材）のときは金額欄を見ず、入数と購入価格から単価を確定して返す。
 */
export function validatePreset(draft: PresetDraft): PresetValidation {
  const name = draft.name.trim();
  if (name.length === 0) return { valid: false, reason: 'name-required' };
  if (presetGraphemes(name).length > PRESET_NAME_MAX_LENGTH) {
    return { valid: false, reason: 'name-too-long' };
  }

  // 欄を離れずに保存を押した場合の安全網（§1.2）。入力中は切らないので、
  // ここに 3 文字以上が渡ってくることがある
  const initial = clampPresetInitial(draft.initial.trim());

  const pack = validatePackBuy(draft);
  if (pack != null && !pack.valid) return pack;

  // 梱包材のまとめ買いでは、金額欄そのものを出していない（単価が登録額になる）
  const valueFromPack = pack != null && packBuyTarget(draft.type) === 'value';
  let value: number;
  if (valueFromPack) {
    value = pack.value;
  } else {
    const maxPlaces = draft.type === 'shipping' ? 0 : 1;
    const max = isRatePreset(draft.type) ? PRESET_RATE_MAX : PRESET_AMOUNT_MAX;
    if (decimalPlaces(draft.value) > maxPlaces) {
      return { valid: false, reason: 'value-out-of-range' };
    }

    // 入力は sanitizeNumericInput を通っているので符号は付かないが、
    // 直接呼ばれても壊れないよう下限も見る（§4.3 の「範囲外でも正規化される」の裏返し）
    const parsed = parseDraftNumber(draft.value);
    if (parsed < 0 || parsed > max) return { valid: false, reason: 'value-out-of-range' };
    value = parsed;
  }

  const materialCost = shippingMaterialCostOf(draft, pack);
  if (materialCost == null) return { valid: false, reason: 'material-cost-out-of-range' };

  return {
    valid: true,
    name,
    initial,
    value,
    materialCost,
    // 「1 個ずつ」に戻して保存すると控えは捨てる（決定 §2.6.8-3）。
    // 残すと「1 個ずつなのに入数がある」不整合な行ができ、isPackBuy の判定と食い違う
    packQuantity: pack?.valid ? pack.packQuantity : 0,
    packPrice: pack?.valid ? pack.packPrice : 0,
    // 面積・使用回数方式のときだけ足す（SPEC-V10 §1.2）。既存方式の結果は従来と同じ形のまま ──
    // 書き込み側が既定値（'individual' / 0）へ倒すので、無い＝既定と読める
    ...(pack?.valid ? pack.calc : undefined),
  };
}

/**
 * まとめ買いの控え（割る数・購入価格）と、そこから出る単価。1 個ずつのときは null。
 *
 * `calc` は**面積・使用回数方式のときだけ**入る（SPEC-V10 §1.2）── 既存方式では
 * 保存する列が増えないので、そのまま validatePreset の結果へ展開できる。
 */
type PackBuyValidation =
  | {
      valid: true;
      packQuantity: number;
      packPrice: number;
      value: number;
      calc?: {
        calcMethod: PresetCalcMethod;
        packHeight: number;
        packWidth: number;
        useHeight: number;
        useWidth: number;
      };
    }
  | { valid: false; reason: PresetInvalidReason };

/**
 * まとめ買いの欄（§2.6.6 / SPEC-V10 §1.4）。1 個ずつの下書きでは見るものが無いので null を返す。
 * 単価が何になるか（登録額 / 資材費）は呼び出し側が packBuyTarget で振り分ける。
 *
 * 面積方式だけ別の関数に分けてある ── 見る欄が 5 つ（購入サイズ 2・購入価格・平均使用サイズ 2）で、
 * 割る数を持たないため。個数と使用回数は**同じ検証**（割る数の意味が違うだけ。§1.2）。
 */
function validatePackBuy(draft: PresetDraft): PackBuyValidation | null {
  if (!isPackBuyDraft(draft)) return null;
  const method = presetDraftCalcMethod(draft);
  if (method === 'area') return validateAreaPackBuy(draft);

  const packQuantity = parseDraftNumber(draft.packQuantity ?? '');
  // 割る数が空・0 のときは保存できない（§2.6.6）。1 個ずつに倒したり 1 とみなしたりしない ──
  // 黙って別の意味で保存されると、次に開いたときモードが戻っていて理由が分からない
  if (
    isPackQuantityBlank(draft) ||
    decimalPlaces(draft.packQuantity ?? '') > 0 ||
    packQuantity > PRESET_PACK_QUANTITY_MAX
  ) {
    return { valid: false, reason: 'pack-quantity-required' };
  }

  const packPrice = validatePackPrice(draft);
  if (packPrice == null) return { valid: false, reason: 'pack-price-out-of-range' };

  return {
    valid: true,
    packQuantity,
    packPrice,
    // 割る数が 1 以上あることは上で確かめてあるので null にはならない（保険として 0 に倒す）
    value: presetUnitPrice(packPrice, packQuantity) ?? 0,
    // 使用回数方式は方式だけを控える（サイズは持たない）。個数方式は従来どおり何も足さない
    ...(method === 'usage'
      ? { calc: { calcMethod: method, packHeight: 0, packWidth: 0, useHeight: 0, useWidth: 0 } }
      : undefined),
  };
}

/**
 * 面積方式の欄（SPEC-V10 §1.4）。
 *
 * - **購入サイズ（縦・横）は必須**。片方でも空・0 なら ¥/㎡ が出せない
 * - **平均使用サイズは任意**。両方空なら「未入力」で、登録額は ¥/㎡ のまま（§1.3）
 * - **片方だけ入っているのは弾く** ── 0 と読んで面積 0 にすると単価が 0 円になり、
 *   打ち終わっていないだけの状態が「無料の梱包材」として保存されてしまう
 *
 * サイズは小数第 1 位まで（21.5cm のような実寸が入る）。割る数（packQuantity）はこの方式では
 * 使わないので、保存値は 0 に倒す（呼び出し側が packQuantity: 0 を書く）。
 */
function validateAreaPackBuy(draft: PresetDraft): PackBuyValidation {
  const packHeight = validateSize(draft.packHeight);
  const packWidth = validateSize(draft.packWidth);
  if (packHeight == null || packWidth == null || packHeight === 0 || packWidth === 0) {
    return { valid: false, reason: 'pack-size-required' };
  }

  const packPrice = validatePackPrice(draft);
  if (packPrice == null) return { valid: false, reason: 'pack-price-out-of-range' };

  const useHeight = validateSize(draft.useHeight);
  const useWidth = validateSize(draft.useWidth);
  if (useHeight == null || useWidth == null) return { valid: false, reason: 'use-size-invalid' };
  // 片方だけ空（＝ 0）は打ちかけ。両方空なら未入力として通す（§1.3）
  const useBlank = useHeight === 0;
  if (useBlank !== (useWidth === 0)) return { valid: false, reason: 'use-size-invalid' };

  const usePrice = presetAreaUsePrice(packPrice, packHeight, packWidth, useHeight, useWidth);
  const areaUnitPrice = presetAreaUnitPrice(packPrice, packHeight, packWidth);

  return {
    valid: true,
    // 面積方式は割る数を持たない（列は個数・使用回数のためのもの。§1.2）
    packQuantity: 0,
    packPrice,
    // 平均使用サイズが未入力なら ¥/㎡ が登録額（§1.3）。購入サイズは上で 0 を弾いてあるので、
    // どちらかは必ず値を返す（保険として 0 に倒す）
    value: usePrice ?? areaUnitPrice ?? 0,
    calc: { calcMethod: 'area', packHeight, packWidth, useHeight, useWidth },
  };
}

/** 購入価格（3 方式に共通。§2.6.6）。範囲外・小数のときだけ null */
function validatePackPrice(draft: PresetDraft): number | null {
  const text = draft.packPrice ?? '';
  const parsed = parseDraftNumber(text);
  if (decimalPlaces(text) > 0 || parsed < 0 || parsed > PRESET_AMOUNT_MAX) return null;
  return parsed;
}

/**
 * サイズ 1 つぶん（cm。SPEC-V10 §1.4）。**空欄は 0（＝未入力）として返す** ──
 * 必須かどうかは呼び出し側が決める（購入サイズは必須、平均使用サイズは任意）。
 * 範囲外・小数第 2 位以下のときだけ null。
 */
function validateSize(text: string | undefined): number | null {
  const value = text ?? '';
  if (decimalPlaces(value) > 1) return null;
  const parsed = parseDraftNumber(value);
  if (parsed < 0 || parsed > PRESET_SIZE_MAX) return null;
  return parsed;
}

/**
 * 専用資材の代金（SPEC-V6 §2）。**送料以外は常に 0。**
 * 範囲外・桁数オーバーのときだけ null を返す（呼び出し側が理由に倒す）。
 *
 * 小数第 1 位まで許すのは、まとめ買いの単価（15.5 円など）がそのまま入り得るため ──
 * 送料そのもの（整数のみ）と桁数の規則が違うのは、由来が違うからで、梱包材と同じ扱いになる。
 */
function shippingMaterialCostOf(
  draft: PresetDraft,
  pack: PackBuyValidation | null,
): number | null {
  if (draft.type !== 'shipping') return 0;
  if (pack != null && pack.valid) return pack.value;

  const text = draft.materialCost ?? '';
  if (decimalPlaces(text) > 1) return null;
  const parsed = parseDraftNumber(text);
  if (parsed < 0 || parsed > PRESET_AMOUNT_MAX) return null;
  return parsed;
}
