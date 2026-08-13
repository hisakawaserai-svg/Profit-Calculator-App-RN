// SPEC-V3 §6.3 のテスト方針のうち、純粋関数の側。
// 頭文字の導出（§1.2）・検証の境界（§1.4）・色キーの正規化（§1.6）。

import { describe, expect, it } from 'vitest';

import {
  clampPresetInitial,
  DEFAULT_PRESET_COLOR_KEY,
  findPresetByName,
  findPresetByValue,
  isPackBuy,
  isRatePreset,
  normalizePresetColor,
  packBuyTarget,
  PRESET_COLOR_KEYS,
  PRESET_TYPES,
  presetDraftUnitPrice,
  presetInitial,
  presetUnitPrice,
  resolvePresetTag,
  toPresetType,
  validatePreset,
  type PresetDraft,
} from './preset';

describe('§1.2 頭文字の導出', () => {
  it('保存値があればそれを出す（名前は見ない）', () => {
    expect(presetInitial({ name: 'A4・厚さ3cm以内', initial: 'A4' })).toBe('A4');
  });

  it('空なら名前の先頭 1 文字を出す（§2.3 の「宅配 100サイズ」がこの経路）', () => {
    expect(presetInitial({ name: '宅配 100サイズ', initial: '' })).toBe('宅');
    expect(presetInitial({ name: '封筒（A4）', initial: '' })).toBe('封');
  });

  it('先頭が空白なら次の文字へ進む（半角・全角とも）', () => {
    expect(presetInitial({ name: '  段ボール', initial: '' })).toBe('段');
    expect(presetInitial({ name: '　段ボール', initial: '' })).toBe('段');
  });

  it('空白以外の加工はしない（記号もそのまま先頭 1 文字）', () => {
    expect(presetInitial({ name: '（小）箱', initial: '' })).toBe('（');
  });

  it('絵文字は 1 文字として数える（サロゲートペアで割らない）', () => {
    // '📦'.length は 2 だが、書記素としては 1 文字
    expect(presetInitial({ name: '📦の箱', initial: '' })).toBe('📦');
    expect(presetInitial({ name: '箱', initial: '📦📦' })).toBe('📦📦');
    expect(presetInitial({ name: '箱', initial: '📦📦📦' })).toBe('📦📦');
  });

  it('保存値が 2 文字を超えていても 2 文字で打ち止める', () => {
    expect(presetInitial({ name: '宅配', initial: '100' })).toBe('10');
  });

  it('空白だけの保存値は「空」として扱い、名前から導出する', () => {
    expect(presetInitial({ name: '封筒', initial: '  ' })).toBe('封');
  });

  it('名前も空なら空文字（名前が空では保存されないので、通常は通らない防御）', () => {
    expect(presetInitial({ name: '', initial: '' })).toBe('');
    expect(presetInitial({ name: '   ', initial: '' })).toBe('');
  });
});

describe('§1.2 確定後の打ち止め', () => {
  it('2 文字を超えたぶんを落とす', () => {
    expect(clampPresetInitial('100')).toBe('10');
    expect(clampPresetInitial('A4')).toBe('A4');
    expect(clampPresetInitial('')).toBe('');
  });

  it('日本語入力の変換途中（ひらがな）も、通せば切れてしまう', () => {
    // だから打っている最中には通さない（§1.2）。「ふうとう」を 2 文字で切ると
    // 「封筒」に変換できなくなる ── 通すのは onBlur と保存の直前だけ
    expect(clampPresetInitial('ふうとう')).toBe('ふう');
  });

  it('変換が確定していれば 2 文字に収まる（切り落としが起きない）', () => {
    expect(clampPresetInitial('封筒')).toBe('封筒');
    expect(clampPresetInitial('段ボール')).toBe('段ボ');
  });
});

describe('§1.6 色キーの正規化', () => {
  it('パレットの 10 色はそのまま通る', () => {
    for (const key of PRESET_COLOR_KEYS) {
      expect(normalizePresetColor(key)).toBe(key);
    }
    expect(PRESET_COLOR_KEYS).toHaveLength(10);
  });

  it('未知の値・空文字・hex は既定色へ倒す（DB に enum を付けていないので必ずここを通す）', () => {
    expect(normalizePresetColor('magenta')).toBe(DEFAULT_PRESET_COLOR_KEY);
    expect(normalizePresetColor('')).toBe(DEFAULT_PRESET_COLOR_KEY);
    expect(normalizePresetColor('#FF0000')).toBe(DEFAULT_PRESET_COLOR_KEY);
    expect(normalizePresetColor('RED')).toBe(DEFAULT_PRESET_COLOR_KEY);
  });

  it('既定色はパレットの中から選ばれている', () => {
    expect(PRESET_COLOR_KEYS).toContain(DEFAULT_PRESET_COLOR_KEY);
  });
});

describe('§2.1 value の単位', () => {
  it('率なのは販売サイトだけ', () => {
    expect(isRatePreset('site')).toBe(true);
    expect(isRatePreset('shipping')).toBe(false);
    expect(isRatePreset('packaging')).toBe(false);
  });
});

describe('§3.2 ルートパラメータ（presets/[type]）の検証', () => {
  it('3 種はそのまま通る', () => {
    for (const type of PRESET_TYPES) expect(toPresetType(type)).toBe(type);
  });

  it('知らない値・未指定は null（URL は手で叩ける）', () => {
    expect(toPresetType('sites')).toBeNull();
    expect(toPresetType('')).toBeNull();
    expect(toPresetType(undefined)).toBeNull();
  });
});

describe('§1.4 検証: 名前', () => {
  const draft = (name: string): PresetDraft => ({
    type: 'shipping',
    name,
    initial: '',
    value: '210',
  });

  it('0 文字は無効', () => {
    expect(validatePreset(draft(''))).toEqual({ valid: false, reason: 'name-required' });
  });

  it('空白だけも無効（前後の空白を落として数える）', () => {
    expect(validatePreset(draft('   '))).toEqual({ valid: false, reason: 'name-required' });
  });

  it('1 文字は有効', () => {
    expect(validatePreset(draft('箱')).valid).toBe(true);
  });

  it('20 文字は有効、21 文字は無効', () => {
    expect(validatePreset(draft('あ'.repeat(20))).valid).toBe(true);
    expect(validatePreset(draft('あ'.repeat(21)))).toEqual({
      valid: false,
      reason: 'name-too-long',
    });
  });

  it('上限は書記素単位（絵文字 20 個は有効。length なら 40 で落ちる）', () => {
    expect(validatePreset(draft('📦'.repeat(20))).valid).toBe(true);
    expect(validatePreset(draft('📦'.repeat(21))).valid).toBe(false);
  });

  it('前後の空白を落とせば 20 文字に収まるものは有効（落とした値が保存される）', () => {
    const result = validatePreset(draft(`  ${'あ'.repeat(20)}  `));

    expect(result).toEqual({
      valid: true,
      name: 'あ'.repeat(20),
      initial: '',
      value: 210,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('名前の重複は検証しない（弾かないのが決定。§1.4）', () => {
    expect(validatePreset(draft('段ボール（小）')).valid).toBe(true);
  });
});

describe('§1.4 検証: 手数料率（site は 0〜100・小数第 1 位まで）', () => {
  const draft = (value: string): PresetDraft => ({
    type: 'site',
    name: '手数料 10%',
    initial: '',
    value,
  });
  const valid = (value: string) => validatePreset(draft(value)).valid;

  it('0 と 100 は境界として有効', () => {
    expect(valid('0')).toBe(true);
    expect(valid('100')).toBe(true);
  });

  it('100.1 は上限を超えるので無効', () => {
    expect(validatePreset(draft('100.1'))).toEqual({
      valid: false,
      reason: 'value-out-of-range',
    });
  });

  it('小数第 1 位までは有効（決定 §8-12）', () => {
    expect(validatePreset(draft('8.8'))).toEqual({
      valid: true,
      name: '手数料 10%',
      initial: '',
      value: 8.8,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('小数第 2 位まで入っていると無効', () => {
    expect(valid('8.85')).toBe(false);
  });

  it('末尾が小数点だけなら整数として扱う（入力途中の "8." が弾かれない）', () => {
    expect(valid('8.')).toBe(true);
  });

  it('空文字・"." は 0 扱いで有効（SPEC §5.1 と同じ）', () => {
    expect(validatePreset(draft('')).valid).toBe(true);
    expect(validatePreset(draft('.')).valid).toBe(true);
  });

  it('負の値は無効（フィルタを通れば来ないが、直接呼ばれても壊れない）', () => {
    expect(valid('-1')).toBe(false);
  });
});

describe('§1.4 検証: 金額（shipping / packaging は 0〜999,999。小数は送料だけ不可）', () => {
  const draft = (type: 'shipping' | 'packaging', value: string): PresetDraft => ({
    type,
    name: '専用箱（小）',
    initial: '',
    value,
  });
  const valid = (value: string) => validatePreset(draft('shipping', value)).valid;

  it('0 と 999999 は境界として有効', () => {
    expect(valid('0')).toBe(true);
    expect(valid('999999')).toBe(true);
  });

  it('1000000 は上限を超えるので無効', () => {
    expect(validatePreset(draft('shipping', '1000000'))).toEqual({
      valid: false,
      reason: 'value-out-of-range',
    });
  });

  it('送料は整数のみ（§2.6.6 で小数を許したのは梱包材だけ）', () => {
    expect(valid('210.5')).toBe(false);
    expect(valid('210')).toBe(true);
  });

  it('梱包材は小数第 1 位まで有効（まとめ買いの単価が入る欄。§2.6.3）', () => {
    expect(validatePreset(draft('packaging', '9.8')).valid).toBe(true);
    expect(validatePreset(draft('packaging', '0.1')).valid).toBe(true);
    // 第 2 位まで入っていれば無効なのは率と同じ
    expect(validatePreset(draft('packaging', '9.85')).valid).toBe(false);
  });

  it('梱包材も範囲は同じ', () => {
    expect(validatePreset(draft('packaging', '15')).valid).toBe(true);
    expect(validatePreset(draft('packaging', '-1')).valid).toBe(false);
    expect(validatePreset(draft('packaging', '1000000')).valid).toBe(false);
  });
});

describe('§1.4 検証: 有効なときに返る保存値', () => {
  it('名前は trim 済み、頭文字は 2 文字に切り詰め、値は数値になる', () => {
    const result = validatePreset({
      type: 'shipping',
      name: '  A4・厚さ3cm以内  ',
      initial: ' A4B ',
      value: '210',
    });

    expect(result).toEqual({
      valid: true,
      name: 'A4・厚さ3cm以内',
      initial: 'A4',
      value: 210,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('頭文字は空のまま保存してよい（表示時に名前から導出する）', () => {
    const result = validatePreset({
      type: 'shipping',
      name: '宅配 100サイズ',
      initial: '',
      value: '1050',
    });

    expect(result).toEqual({
      valid: true,
      name: '宅配 100サイズ',
      initial: '',
      value: 1050,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('欄を離れずに保存した長い頭文字も、ここで切り詰まる（§1.2 の安全網）', () => {
    // 入力中は切らないので、変換直後の 3 文字以上がそのまま渡ってくることがある
    const result = validatePreset({
      type: 'packaging',
      name: '封筒（A4）',
      initial: '封筒だ',
      value: '15',
    });

    expect(result).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '封筒',
      value: 15,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('長い名前は切らずに無効にする（変換中の入力を消さない。§1.4）', () => {
    // 名前は打ち止めず、20 文字を超えたら保存を止めるだけ ── 変換途中で
    // 上限を超えても、確定して縮めば有効に戻る
    expect(validatePreset({
      type: 'packaging',
      name: 'あ'.repeat(21),
      initial: '',
      value: '15',
    })).toEqual({ valid: false, reason: 'name-too-long' });
  });
});

// ---- SPEC-V3 §2.6 梱包材のまとめ買い ----

describe('§2.6.4 まとめ買いかの判定（列を足さず packQuantity > 0 で見る）', () => {
  it('入数が 1 以上ならまとめ買い', () => {
    expect(isPackBuy({ packQuantity: 1 })).toBe(true);
    expect(isPackBuy({ packQuantity: 100 })).toBe(true);
  });

  it('0 は「1 個ずつ」（既存 6 件と既存の利用者データがこれ。§2.6.5）', () => {
    expect(isPackBuy({ packQuantity: 0 })).toBe(false);
  });
});

describe('§2.6.3 まとめ買いの単価と端数', () => {
  it('割り切れる場合はそのまま（100 枚 800 円 → 8 円）', () => {
    expect(presetUnitPrice(800, 100)).toBe(8);
    expect(presetUnitPrice(1500, 100)).toBe(15);
  });

  it('小数第 1 位まで残す（980 ÷ 100 = 9.8）', () => {
    expect(presetUnitPrice(980, 100)).toBe(9.8);
  });

  it('四捨五入する（800 ÷ 30 = 26.66… → 26.7。決定 §2.6.8-2）', () => {
    expect(presetUnitPrice(800, 30)).toBe(26.7);
    // 切り捨てなら 26.6、切り上げなら 26.7 なので、切り下がる側でも確かめる
    expect(presetUnitPrice(700, 30)).toBe(23.3);
  });

  it('小数第 2 位が 5 のちょうど半分も四捨五入で上がる（985 ÷ 100 = 9.85 → 9.9）', () => {
    // 浮動小数のまま丸めると 9.8 に落ちる値（§2.6.3 の実装欄）
    expect(presetUnitPrice(985, 100)).toBe(9.9);
  });

  it('丸めて 0 円になるときは 0.1 円に上げる（決定 §2.6.8-4）', () => {
    expect(presetUnitPrice(500, 10000)).toBe(0.1); // 0.05
    expect(presetUnitPrice(1, 1000)).toBe(0.1); // 0.001
  });

  it('購入価格が 0 のときは 0 円のまま（もらい物を 0.1 円に押し上げない）', () => {
    expect(presetUnitPrice(0, 100)).toBe(0);
  });

  it('入数が 0 以下なら計算できないので null（0 除算はここで塞ぐ）', () => {
    expect(presetUnitPrice(800, 0)).toBeNull();
    expect(presetUnitPrice(800, -1)).toBeNull();
  });

  it('小数の和に誤差を持ち込まない（0.1 円が 3 件で 0.30000000000000004 にならない）', () => {
    const unit = presetUnitPrice(1, 1000) ?? 0;
    expect(unit * 3).toBe(0.30000000000000004); // 浮動小数の素の挙動（比較のため）
    expect(Number((unit * 3).toFixed(1))).toBe(0.3);
  });
});

describe('§2.6.6 検証: まとめ買い（入数・購入価格）', () => {
  const draft = (
    packQuantity: string,
    packPrice: string,
    overrides: Partial<PresetDraft> = {},
  ): PresetDraft => ({
    type: 'packaging',
    name: '封筒（A4）',
    initial: '',
    value: '15',
    packBuy: true,
    packQuantity,
    packPrice,
    ...overrides,
  });

  it('入数と購入価格から 1 個あたりを確定して返す（§2.6.4。value はこの値）', () => {
    expect(validatePreset(draft('100', '800'))).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 8,
      packQuantity: 100,
      packPrice: 800,
      materialCost: 0,
    });
  });

  it('金額欄の値は見ない（まとめ買いでは入数と購入価格だけが単価を決める）', () => {
    const result = validatePreset(draft('100', '980', { value: '999999' }));

    expect(result).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 9.8,
      packQuantity: 100,
      packPrice: 980,
      materialCost: 0,
    });
  });

  it('入数が空・0 なら保存できない（1 個ずつに倒したり 1 とみなしたりしない）', () => {
    expect(validatePreset(draft('', '800'))).toEqual({
      valid: false,
      reason: 'pack-quantity-required',
    });
    expect(validatePreset(draft('0', '800'))).toEqual({
      valid: false,
      reason: 'pack-quantity-required',
    });
  });

  it('入数は 9,999 まで（決定 §2.6.8-6）', () => {
    expect(validatePreset(draft('9999', '800')).valid).toBe(true);
    expect(validatePreset(draft('10000', '800'))).toEqual({
      valid: false,
      reason: 'pack-quantity-required',
    });
  });

  it('入数は整数（個数が小数になる余地はない）', () => {
    expect(validatePreset(draft('10.5', '800'))).toEqual({
      valid: false,
      reason: 'pack-quantity-required',
    });
  });

  it('購入価格は 0〜999,999 の整数', () => {
    expect(validatePreset(draft('100', '0')).valid).toBe(true);
    expect(validatePreset(draft('100', '999999')).valid).toBe(true);
    expect(validatePreset(draft('100', '1000000'))).toEqual({
      valid: false,
      reason: 'pack-price-out-of-range',
    });
    expect(validatePreset(draft('100', '800.5'))).toEqual({
      valid: false,
      reason: 'pack-price-out-of-range',
    });
  });

  it('購入価格が空なら 0 円扱いで有効（1 個あたりも 0 円。§2.6.3）', () => {
    expect(validatePreset(draft('100', ''))).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 0,
      packQuantity: 100,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('名前の検証が先（入数の前に名前を直させる。文言は 1 行しか出せない）', () => {
    expect(validatePreset(draft('', '800', { name: '' }))).toEqual({
      valid: false,
      reason: 'name-required',
    });
  });

  it('販売サイトでは 2 択を出さないので、packBuy が立っていても 1 個ずつとして扱う', () => {
    expect(validatePreset(draft('100', '800', { type: 'site', value: '10' }))).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 10,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('送料のまとめ買いは**専用資材の代金**になる（送料そのものは金額欄のまま。SPEC-V6 §2）', () => {
    expect(validatePreset(draft('100', '800', { type: 'shipping', value: '450' }))).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 450,
      packQuantity: 100,
      packPrice: 800,
      materialCost: 8,
    });
  });

  it('「1 個ずつ」に戻すと入数・購入価格は 0 に戻る（決定 §2.6.8-3）', () => {
    const result = validatePreset(draft('100', '800', { packBuy: false, value: '8' }));

    expect(result).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      // 金額欄にはそのときの 1 個あたりが残る（値は変わらない。§2.6.6）
      value: 8,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });

  it('packBuy を渡さない下書き（送料・販売サイトの画面）は従来どおり', () => {
    expect(
      validatePreset({ type: 'packaging', name: '封筒（A4）', initial: '', value: '15' }),
    ).toEqual({
      valid: true,
      name: '封筒（A4）',
      initial: '',
      value: 15,
      packQuantity: 0,
      packPrice: 0,
      materialCost: 0,
    });
  });
});

describe('§2.6.2 下書きの「1 個あたり」（青字の行）', () => {
  const draft = (packQuantity: string, packPrice: string): PresetDraft => ({
    type: 'packaging',
    name: '封筒（A4）',
    initial: '',
    value: '',
    packBuy: true,
    packQuantity,
    packPrice,
  });

  it('入数と購入価格が入っていれば計算結果を返す', () => {
    expect(presetDraftUnitPrice(draft('100', '800'))).toBe(8);
  });

  it('入数が空・0 のあいだは null（行は「—」のまま。行ごと消すと高さが動く）', () => {
    expect(presetDraftUnitPrice(draft('', '800'))).toBeNull();
    expect(presetDraftUnitPrice(draft('0', '800'))).toBeNull();
  });

  it('1 個ずつのときは行そのものが出ないので null', () => {
    expect(
      presetDraftUnitPrice({ type: 'packaging', name: '封筒', initial: '', value: '15' }),
    ).toBeNull();
  });
});

describe('§4.1 / §4.3 欄の値・名前からプリセットを引く', () => {
  const shipping = [
    { name: 'ネコポス', value: 210 },
    { name: 'ゆうパケット', value: 250 },
    { name: '手渡し', value: 0 },
  ];
  const sites = [
    { name: 'メルカリ', value: 10 },
    { name: 'ラクマ', value: 10 },
  ];

  it('値が一致する行を返す', () => {
    expect(findPresetByValue(shipping, 250)?.name).toBe('ゆうパケット');
  });

  it('一致しない値は null', () => {
    expect(findPresetByValue(shipping, 999)).toBeNull();
  });

  it('空欄（null）は 0 円のプリセットに当てない ── 未入力の欄にバッジを出さないため', () => {
    expect(findPresetByValue(shipping, null)).toBeNull();
    expect(findPresetByValue(shipping, 0)?.name).toBe('手渡し');
  });

  it('同じ値が 2 件あるときは並び順で先の 1 件', () => {
    expect(findPresetByName(sites, 'ラクマ')?.value).toBe(10);
    expect(findPresetByValue(sites, 10)?.name).toBe('メルカリ');
  });

  it('名前が空文字（未設定）なら null。消えたプリセットの名前も引けない（§1.5.1）', () => {
    expect(findPresetByName(sites, '')).toBeNull();
    expect(findPresetByName(sites, 'もう無いサイト')).toBeNull();
  });
});

describe('§4.1 / §1.5.1 タグボタンの見た目', () => {
  const shipping = [
    { name: 'ネコポス', value: 210 },
    { name: '手渡し', value: 0 },
  ];
  const sites = [
    { name: 'メルカリ', value: 10 },
    { name: 'ラクマ', value: 6 },
  ];

  it('名前を写さない欄は値だけで引く（送料）', () => {
    expect(resolvePresetTag(shipping, 210)).toEqual({
      kind: 'selected',
      preset: shipping[0],
    });
    expect(resolvePresetTag(shipping, 999)).toEqual({ kind: 'unselected' });
    expect(resolvePresetTag(shipping, null)).toEqual({ kind: 'unselected' });
  });

  it('名前も率も一致していれば通常のバッジ', () => {
    expect(resolvePresetTag(sites, 10, 'メルカリ')).toEqual({
      kind: 'selected',
      preset: sites[0],
    });
  });

  it('名前は一致するが率が違えば rate-changed（薄いバッジ・▾ なし）', () => {
    expect(resolvePresetTag(sites, 8, 'メルカリ')).toEqual({
      kind: 'rate-changed',
      preset: sites[0],
    });
  });

  it('率だけが他のプリセットと一致しても、写した名前の側で判定する', () => {
    // 10% のメルカリを選んでから 6%（ラクマの率）に下げても、札はメルカリのまま薄くする
    expect(resolvePresetTag(sites, 6, 'メルカリ')).toEqual({
      kind: 'rate-changed',
      preset: sites[0],
    });
  });

  it('名前が未設定なら、率が一致していても未選択（§1.5.1 の「率では決めない」）', () => {
    expect(resolvePresetTag(sites, 10, '')).toEqual({ kind: 'unselected' });
  });

  it('プリセットが削除・改名されて引けないときは未選択（バッジの色と頭文字が無い）', () => {
    expect(resolvePresetTag(sites, 10, 'もう無いサイト')).toEqual({ kind: 'unselected' });
    expect(resolvePresetTag([], 10, 'メルカリ')).toEqual({ kind: 'unselected' });
  });

  it('空欄は選んだ率と一致しないので rate-changed', () => {
    expect(resolvePresetTag(sites, null, 'メルカリ')).toEqual({
      kind: 'rate-changed',
      preset: sites[0],
    });
  });
});

describe('SPEC-V6 §2 検証: 送料プリセットの専用資材の代金', () => {
  const shipping = (over: Partial<PresetDraft> = {}): PresetDraft => ({
    type: 'shipping',
    name: '専用箱（小）',
    initial: '',
    value: '450',
    ...over,
  });

  it('資材費を入れると送料と別に返る（合計は画面が出す）', () => {
    expect(validatePreset(shipping({ materialCost: '70' }))).toMatchObject({
      valid: true,
      value: 450,
      materialCost: 70,
    });
  });

  it('資材費は空でも 0 円で有効（多くの配送方法では資材費がかからない。§2）', () => {
    expect(validatePreset(shipping())).toMatchObject({ valid: true, value: 450, materialCost: 0 });
    expect(validatePreset(shipping({ materialCost: '' }))).toMatchObject({
      valid: true,
      materialCost: 0,
    });
    expect(validatePreset(shipping({ materialCost: '0' }))).toMatchObject({
      valid: true,
      materialCost: 0,
    });
  });

  it('まとめ買いの単価（小数第 1 位）をそのまま入れられる', () => {
    expect(validatePreset(shipping({ materialCost: '15.5' }))).toMatchObject({
      valid: true,
      materialCost: 15.5,
    });
  });

  it('小数第 2 位・範囲外は保存できない', () => {
    expect(validatePreset(shipping({ materialCost: '15.55' }))).toEqual({
      valid: false,
      reason: 'material-cost-out-of-range',
    });
    expect(validatePreset(shipping({ materialCost: '1000000' }))).toEqual({
      valid: false,
      reason: 'material-cost-out-of-range',
    });
  });

  it('送料そのものは従来どおり整数のみ（資材費と桁数の規則が違う）', () => {
    expect(validatePreset(shipping({ value: '450.5' }))).toEqual({
      valid: false,
      reason: 'value-out-of-range',
    });
  });

  it('まとめ買いのときは資材費の欄を見ない（入数と購入価格が決める）', () => {
    expect(
      validatePreset(
        shipping({ packBuy: true, packQuantity: '100', packPrice: '1500', materialCost: '999' }),
      ),
    ).toMatchObject({ valid: true, value: 450, materialCost: 15, packQuantity: 100, packPrice: 1500 });
  });

  it('まとめ買いに戻しても送料の検証は効く（両方を同時に見る）', () => {
    expect(
      validatePreset(shipping({ value: '1000000', packBuy: true, packQuantity: '10', packPrice: '100' })),
    ).toEqual({ valid: false, reason: 'value-out-of-range' });
  });

  it('送料以外では資材費を渡しても 0 になる（列を持たない種類）', () => {
    expect(
      validatePreset({
        type: 'packaging',
        name: '封筒',
        initial: '',
        value: '15',
        materialCost: '70',
      }),
    ).toMatchObject({ valid: true, value: 15, materialCost: 0 });
  });
});

describe('SPEC-V6 §2 packBuyTarget', () => {
  it('単価が何になるかを種類が決める', () => {
    expect(packBuyTarget('packaging')).toBe('value');
    expect(packBuyTarget('shipping')).toBe('materialCost');
    expect(packBuyTarget('site')).toBeNull();
  });
});

describe('SPEC-V6 §3 送料プリセットの札（合計でも引ける）', () => {
  const shippings = [
    { name: 'A4・厚さ3cm以内', value: 210, materialCost: 0 },
    { name: '専用箱（小）', value: 450, materialCost: 70 },
  ];

  it('合計（送料 ＋ 専用資材）で引ける ── 選んだ直後の欄はこの額', () => {
    expect(findPresetByValue(shippings, 520)?.name).toBe('専用箱（小）');
    expect(resolvePresetTag(shippings, 520)).toEqual({
      kind: 'selected',
      preset: shippings[1],
    });
  });

  it('送料そのものでも引ける ──「専用資材を使わない」を立てた記録の欄はこの額', () => {
    expect(findPresetByValue(shippings, 450)?.name).toBe('専用箱（小）');
  });

  it('どちらにも当たらない額では札が出ない（手で打った送料）', () => {
    expect(findPresetByValue(shippings, 500)).toBeNull();
  });

  it('資材費を持たないプリセット（他の 2 種）はこれまでどおり value だけで引ける', () => {
    expect(findPresetByValue([{ name: '封筒', value: 15 }], 15)?.name).toBe('封筒');
    expect(findPresetByValue([{ name: '封筒', value: 15 }], 20)).toBeNull();
  });
});
