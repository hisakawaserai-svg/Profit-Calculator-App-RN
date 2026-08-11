// SPEC-V4 §7.3 のテスト方針のうち、純粋関数の側。
// - 検証の境界（0 / 1 / 12 / 13 文字、「・」を含む名前、前後空白、重複の判定。§1.3）
// - 色の自動割り当てが使用済みの色を避けること・使い切ったら先頭へ戻ること（決定 §9-8）
// - チップの並びが tags.sortOrder に従うこと（§1.5）
// - 絞り込みページの検索欄が含む一致で絞ること（§4.2.2 / 案 35f）

import { describe, expect, it } from 'vitest';

import { PRESET_COLOR_KEYS } from './preset';
import {
  liveTagIds,
  nextTagColor,
  searchTags,
  selectedTags,
  TAG_NAME_MAX_LENGTH,
  validateTag,
} from './tag';

const named = (name: string) => ({ name });

describe('§1.3 validateTag: 名前の検証', () => {
  it('空・空白だけは name-required（前後の空白を落としてから数える）', () => {
    expect(validateTag({ name: '', colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-required',
    });
    expect(validateTag({ name: '   ', colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-required',
    });
  });

  it('1 文字は有効。前後の空白は落として保存する', () => {
    expect(validateTag({ name: '  服  ', colorKey: 'red' }, [])).toEqual({
      valid: true,
      name: '服',
      colorKey: 'red',
    });
  });

  it(`${TAG_NAME_MAX_LENGTH} 文字は有効、${TAG_NAME_MAX_LENGTH + 1} 文字は name-too-long`, () => {
    const just = 'あ'.repeat(TAG_NAME_MAX_LENGTH);
    const over = 'あ'.repeat(TAG_NAME_MAX_LENGTH + 1);

    expect(validateTag({ name: just, colorKey: 'red' }, [])).toMatchObject({ valid: true });
    expect(validateTag({ name: over, colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-too-long',
    });
  });

  it('書記素で数える（サロゲートペアを 2 文字と数えない）', () => {
    // 𠮷（サロゲートペア）12 個 = 12 文字。String#length なら 24 で弾かれてしまう
    expect(validateTag({ name: '𠮷'.repeat(12), colorKey: 'red' }, [])).toMatchObject({
      valid: true,
    });
    expect(validateTag({ name: '𠮷'.repeat(13), colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-too-long',
    });
  });

  it('「・」を含むと name-has-separator（CSV の区切りに使うため。§5.2）', () => {
    expect(validateTag({ name: '洋服・春夏物', colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-has-separator',
    });
    expect(validateTag({ name: '・', colorKey: 'red' }, [])).toEqual({
      valid: false,
      reason: 'name-has-separator',
    });
  });

  it('上限超えは切り詰めずに弾く（入力を切らない。SPEC-V3 §1.2）', () => {
    const result = validateTag({ name: 'あ'.repeat(20), colorKey: 'red' }, []);

    expect(result.valid).toBe(false);
    // 「12 文字に切って保存」はしない ── 変換途中で超えても、縮めば有効に戻る形にする
    expect(result).not.toHaveProperty('name');
  });

  it('未知の色キーは既定色へ倒す（§1.3 の normalizePresetColor）', () => {
    expect(validateTag({ name: '洋服', colorKey: 'chartreuse' }, [])).toEqual({
      valid: true,
      name: '洋服',
      colorKey: 'blue',
    });
  });
});

describe('§1.3 validateTag: 名前の重複は弾く（プリセットと逆）', () => {
  it('完全一致は name-duplicated', () => {
    expect(validateTag({ name: '洋服', colorKey: 'red' }, [named('洋服')])).toEqual({
      valid: false,
      reason: 'name-duplicated',
    });
  });

  it('前後の空白を落としてから比べる（両側とも）', () => {
    expect(validateTag({ name: ' 洋服 ', colorKey: 'red' }, [named('洋服')])).toEqual({
      valid: false,
      reason: 'name-duplicated',
    });
    expect(validateTag({ name: '洋服', colorKey: 'red' }, [named(' 洋服 ')])).toEqual({
      valid: false,
      reason: 'name-duplicated',
    });
  });

  it('別の名前なら通る', () => {
    expect(validateTag({ name: '食器', colorKey: 'red' }, [named('洋服')])).toMatchObject({
      valid: true,
    });
  });

  it('編集で自分を除いて渡せば、色だけ変える保存が止まらない', () => {
    // others には「自分以外」を渡す約束なので、自分の名前は候補に入らない
    expect(validateTag({ name: '洋服', colorKey: 'green' }, [named('食器')])).toEqual({
      valid: true,
      name: '洋服',
      colorKey: 'green',
    });
  });
});

describe('§1.2 nextTagColor: 使用済みの色を避ける（決定 §9-8）', () => {
  const [first, second, third] = PRESET_COLOR_KEYS;

  it('0 件ならパレットの先頭', () => {
    expect(nextTagColor([])).toBe(first);
  });

  it('使われていない色のうちパレットの並び順で最初のもの', () => {
    expect(nextTagColor([{ colorKey: first }])).toBe(second);
    expect(nextTagColor([{ colorKey: second }])).toBe(first);
    expect(nextTagColor([{ colorKey: first }, { colorKey: second }])).toBe(third);
  });

  it('並び順は登録順ではなくパレット順（後から先頭の色が空けば先頭に戻る）', () => {
    expect(nextTagColor([{ colorKey: second }, { colorKey: third }])).toBe(first);
  });

  it('すべて使い切ったら先頭から一巡する（重複を許す）', () => {
    const all = PRESET_COLOR_KEYS.map((colorKey) => ({ colorKey }));

    expect(nextTagColor(all)).toBe(first);
  });

  it('未知の色キーは既定色（blue）を使っているものとして数える', () => {
    // 表示上は blue になるので、次の色として blue を選ばない
    expect(nextTagColor([{ colorKey: 'chartreuse' }])).not.toBe('blue');
  });
});

describe('§1.5 selectedTags / liveTagIds: チップの並びは sortOrder に従う', () => {
  // listAll が返す並び（sortOrder 昇順）
  const tags = [
    { id: 'a', name: '洋服' },
    { id: 'b', name: '食器' },
    { id: 'c', name: '本' },
  ];

  it('選んだ順ではなく一覧の並びで返す（記録ごとに並びが変わらない）', () => {
    expect(selectedTags(tags, ['c', 'a']).map((tag) => tag.id)).toEqual(['a', 'c']);
  });

  it('存在しない id は黙って落ちる（別画面で消されたタグ。§4.7）', () => {
    expect(selectedTags(tags, ['a', 'zzz']).map((tag) => tag.id)).toEqual(['a']);
    expect(liveTagIds(tags, ['zzz'])).toEqual([]);
  });

  it('0 件は空配列', () => {
    expect(selectedTags(tags, [])).toEqual([]);
    expect(liveTagIds(tags, [])).toEqual([]);
  });
});

describe('§4.2.2 searchTags: 絞り込みページの検索欄（案 35f）', () => {
  // listAll が返す並び（sortOrder 昇順）
  const tags = [
    { id: 'a', name: '洋服' },
    { id: 'b', name: 'こども服' },
    { id: 'c', name: '食器' },
    { id: 'd', name: '本・雑誌' },
  ];

  it('含む一致。「服」で「洋服」も「こども服」も出る（前方一致にしない）', () => {
    expect(searchTags(tags, '服').map((tag) => tag.id)).toEqual(['a', 'b']);
  });

  it('空文字なら全件返す（絞っていない状態）', () => {
    expect(searchTags(tags, '')).toHaveLength(4);
  });

  it('空白だけでも全件返す', () => {
    expect(searchTags(tags, '　 ')).toHaveLength(4);
  });

  it('前後の空白は落としてから照合する（変換確定で末尾に空白が入っても見つかる）', () => {
    expect(searchTags(tags, ' 洋服 ').map((tag) => tag.id)).toEqual(['a']);
  });

  it('一致しなければ空配列（0 件表示はここでは決めない）', () => {
    expect(searchTags(tags, 'くつ')).toEqual([]);
  });

  it('並びは元のまま（sortOrder 昇順。一致順に並べ替えない）', () => {
    expect(searchTags(tags, '').map((tag) => tag.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('元の配列は書き換えない', () => {
    const original = [...tags];
    searchTags(tags, '服');
    expect(tags).toEqual(original);
  });
});
