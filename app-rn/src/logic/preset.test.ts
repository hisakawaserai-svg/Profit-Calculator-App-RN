// SPEC-V3 §6.3 のテスト方針のうち、純粋関数の側。
// 頭文字の導出（§1.2）・検証の境界（§1.4）・色キーの正規化（§1.6）。

import { describe, expect, it } from 'vitest';

import {
  clampPresetInitial,
  DEFAULT_PRESET_COLOR_KEY,
  findPresetByName,
  findPresetByValue,
  isRatePreset,
  normalizePresetColor,
  PRESET_COLOR_KEYS,
  PRESET_TYPES,
  presetInitial,
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

describe('§1.2 入力欄の打ち止め', () => {
  it('2 文字を超えたぶんを落とす', () => {
    expect(clampPresetInitial('100')).toBe('10');
    expect(clampPresetInitial('A4')).toBe('A4');
    expect(clampPresetInitial('')).toBe('');
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

    expect(result).toEqual({ valid: true, name: 'あ'.repeat(20), initial: '', value: 210 });
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

describe('§1.4 検証: 金額（shipping / packaging は 0〜999,999 の整数）', () => {
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

  it('小数は無効（率と違って整数のみ）', () => {
    expect(valid('210.5')).toBe(false);
    expect(validatePreset(draft('packaging', '15.5')).valid).toBe(false);
  });

  it('梱包材も同じ規則', () => {
    expect(validatePreset(draft('packaging', '15')).valid).toBe(true);
    expect(validatePreset(draft('packaging', '-1')).valid).toBe(false);
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

    expect(result).toEqual({ valid: true, name: 'A4・厚さ3cm以内', initial: 'A4', value: 210 });
  });

  it('頭文字は空のまま保存してよい（表示時に名前から導出する）', () => {
    const result = validatePreset({
      type: 'shipping',
      name: '宅配 100サイズ',
      initial: '',
      value: '1050',
    });

    expect(result).toEqual({ valid: true, name: '宅配 100サイズ', initial: '', value: 1050 });
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
