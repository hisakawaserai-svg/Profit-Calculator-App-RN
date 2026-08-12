// SPEC-V3 §5.4「ファイル名」の単体テスト。
// 期間は 3 値（全期間 / 年 / 月。§5.5 の改訂）なので、種類 2 × 期間 3 の 6 通りを確かめる。

import { describe, expect, it } from 'vitest';

import {
  exportFileName,
  exportPeriodSlug,
  fromExportParams,
  toExportParams,
} from './exportPeriod';

describe('§5.4 ファイル名: 種類 ＋ 期間', () => {
  it('データ保存用は「売上記録_」で始まる', () => {
    expect(exportFileName('backup', '2026-08')).toBe('売上記録_2026-08.csv');
    expect(exportFileName('backup', '2025')).toBe('売上記録_2025.csv');
    expect(exportFileName('backup', null)).toBe('売上記録_全期間.csv');
  });

  it('確定申告用は「確定申告_」で始まる', () => {
    expect(exportFileName('tax', '2026-08')).toBe('確定申告_2026-08.csv');
    expect(exportFileName('tax', '2025')).toBe('確定申告_2025.csv');
    expect(exportFileName('tax', null)).toBe('確定申告_全期間.csv');
  });

  it('期間は期間キーのまま入れる（名前で並べたときに月の順が崩れないため）', () => {
    // 「2026年8月」だと 10 月が 1 月の隣に来る
    expect(exportPeriodSlug('2026-08')).toBe('2026-08');
    expect(exportPeriodSlug('2026-10')).toBe('2026-10');
    expect(exportPeriodSlug('2026-08') < exportPeriodSlug('2026-10')).toBe(true);
  });

  it('対象とまとめ方は名前に入れない（読めない長さになる）', () => {
    expect(exportFileName('tax', '2026-08')).not.toContain('売れた');
    expect(exportFileName('tax', '2026-08')).not.toContain('日ごと');
  });
});

describe('§5.9 全画面プレビューへ渡す条件（案 40c）', () => {
  it('4 つの条件をルートの引数へ写す（全期間は空文字）', () => {
    expect(toExportParams('tax', 'day', '2026-08', true)).toEqual({
      kind: 'tax',
      grouping: 'day',
      period: '2026-08',
      includeListing: '1',
    });
    expect(toExportParams('backup', 'record', null, false)).toEqual({
      kind: 'backup',
      grouping: 'record',
      period: '',
      includeListing: '0',
    });
  });

  it('往復して元に戻る', () => {
    const cases = [
      { kind: 'tax', grouping: 'day', period: '2026-08', includeListing: true },
      { kind: 'backup', grouping: 'record', period: null, includeListing: false },
      { kind: 'tax', grouping: 'record', period: '2025', includeListing: false },
    ] as const;

    for (const original of cases) {
      const params = toExportParams(
        original.kind,
        original.grouping,
        original.period,
        original.includeListing,
      );
      expect(fromExportParams(params)).toEqual(original);
    }
  });

  it('壊れた引数・欠けた引数は既定へ倒す（外から開かれても表が出る）', () => {
    expect(fromExportParams({})).toEqual({
      kind: 'backup',
      grouping: 'record',
      period: null,
      includeListing: false,
    });
    expect(fromExportParams({ kind: 'xxx', grouping: 'yyy', includeListing: 'true' })).toEqual({
      kind: 'backup',
      grouping: 'record',
      period: null,
      includeListing: false,
    });
  });
});
