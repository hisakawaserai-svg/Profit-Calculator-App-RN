// 画面 3〜5（設計案 53f / 53g / 53k）が出す数字と分岐のテスト。
//
// ここで一番確かめたいのは「**減ることが必ず目に見えること**」──
// 復元は全置換で取り消せないので、間違ったファイルに気付ける手がかりは
// 差の表の赤い行と注意帯しかない。

import { describe, expect, it } from 'vitest';

import type { BackupRow } from './backup';
import {
  backupDiffRows,
  exceedsPhotoLimit,
  isLargeDecrease,
  newestBackupRecord,
  photoLimitMarkerRatio,
} from './backupView';
import {
  backupLastCreatedNote,
  backupMissingPhotoNote,
  backupNewestRecordNote,
  backupPreviewCreatedLine,
  backupRelativeDayLabel,
  backupRestoredPhotoValue,
} from './labels';

const CURRENT = { records: 8, tags: 4, presets: 2, photos: 1 };
const FILE = { records: 53, tags: 12, presets: 18, photos: 20 };

describe('案 53f 差の表', () => {
  it('並びは記録・タグ・プリセット・写真で固定', () => {
    expect(backupDiffRows(CURRENT, FILE).map((row) => row.label)).toEqual([
      '記録',
      'タグ',
      'プリセット',
      '写真',
    ]);
  });

  it('増える行は赤くしない', () => {
    expect(backupDiffRows(CURRENT, FILE).every((row) => !row.decreasing)).toBe(true);
  });

  it('減る行だけを赤くする', () => {
    const rows = backupDiffRows(FILE, CURRENT);

    expect(rows.map((row) => row.decreasing)).toEqual([true, true, true, true]);
  });

  it('同じ数の行は減っていない（境界）', () => {
    const rows = backupDiffRows(CURRENT, CURRENT);

    expect(rows.some((row) => row.decreasing)).toBe(false);
  });

  it('写真の行は 0 枚でも消さない（案 53g の「31枚 → 0枚」）', () => {
    const rows = backupDiffRows({ ...CURRENT, photos: 31 }, { ...FILE, photos: 0 });
    const photos = rows[3];

    expect(photos).toMatchObject({ label: '写真', current: 31, next: 0, decreasing: true });
  });

  it('写真だけ単位が「枚」', () => {
    expect(backupDiffRows(CURRENT, FILE).map((row) => row.unit)).toEqual([
      'count',
      'count',
      'count',
      'photo',
    ]);
  });
});

describe('案 53f 大きく減るときの注意帯', () => {
  it('半分未満になれば出す', () => {
    expect(isLargeDecrease(53, 8)).toBe(true);
  });

  it('ちょうど半分では出さない（減ってはいるが「大きく」ではない）', () => {
    expect(isLargeDecrease(20, 10)).toBe(false);
  });

  it('減り幅が 5 件未満なら出さない（3 件 → 1 件は試し書きの整理）', () => {
    expect(isLargeDecrease(3, 1)).toBe(false);
  });

  it('増えるときは出さない', () => {
    expect(isLargeDecrease(8, 53)).toBe(false);
  });

  it('0 件の端末に入れるのは「減る」ではない', () => {
    expect(isLargeDecrease(0, 53)).toBe(false);
  });
});

// ---- 案 53f の 1 文（中で一番新しい記録） ----

function record(over: Partial<BackupRow>): BackupRow {
  return {
    id: 'r1',
    item_name: 'ワンピース 白',
    sale_start_date: '2026-08-01T10:00:00.000',
    sale_date: '',
    ...over,
  } as BackupRow;
}

describe('案 53f 一番新しい記録', () => {
  it('売れた日で比べる（出品日より後にくるため）', () => {
    const newest = newestBackupRecord([
      record({ item_name: 'えんぴつ', sale_start_date: '2026-08-05T10:00:00.000' }),
      record({
        item_name: 'ワンピース 白',
        sale_start_date: '2026-08-01T10:00:00.000',
        sale_date: '2026-08-11T09:00:00.000',
      }),
    ]);

    expect(newest).toEqual({ date: '2026-08-11T09:00:00.000', itemName: 'ワンピース 白' });
  });

  it('出品中（販売日が空）は出品日で比べる', () => {
    const newest = newestBackupRecord([
      record({ item_name: '古い', sale_start_date: '2026-07-01T10:00:00.000' }),
      record({ item_name: '新しい', sale_start_date: '2026-08-12T10:00:00.000' }),
    ]);

    expect(newest?.itemName).toBe('新しい');
  });

  it('記録が 1 件も無ければ null（出す文が無い）', () => {
    expect(newestBackupRecord([])).toBe(null);
  });

  it('文は日付と商品名を名指しする', () => {
    expect(backupNewestRecordNote('ja', '2026-08-11T09:00:00.000', 'ワンピース 白')).toBe(
      '中で一番新しい記録は 2026年8月11日「ワンピース 白」です。見覚えがなければ、別の人のファイルです。',
    );
  });

  it('商品名が空なら一覧と同じ「無題」', () => {
    expect(backupNewestRecordNote('ja', '2026-08-11T09:00:00.000', '')).toContain('「無題」');
  });
});

// ---- 案 53e の棒グラフ ----

const LIMIT = 50 * 1024 * 1024;

describe('案 53e 上限の棒グラフ', () => {
  it('上限ちょうどは超過ではない', () => {
    expect(exceedsPhotoLimit(LIMIT, LIMIT)).toBe(false);
  });

  it('1 バイトでも超えれば止める', () => {
    expect(exceedsPhotoLimit(LIMIT + 1, LIMIT)).toBe(true);
  });

  it('62MB のとき上限の目盛りは 8 割あたり（超過分が右に残る）', () => {
    const ratio = photoLimitMarkerRatio(62 * 1024 * 1024, LIMIT);

    expect(ratio).toBeGreaterThan(0.79);
    expect(ratio).toBeLessThan(0.82);
  });

  it('大幅に超えるほど目盛りは左へ寄る（超過が見た目に出る）', () => {
    expect(photoLimitMarkerRatio(200 * 1024 * 1024, LIMIT)).toBeLessThan(
      photoLimitMarkerRatio(62 * 1024 * 1024, LIMIT),
    );
  });

  it('棒からはみ出さない（0 で割らない）', () => {
    expect(photoLimitMarkerRatio(0, LIMIT)).toBe(1);
  });
});

// ---- 日付の見せ方（案 53a / 53f） ----

const TODAY = new Date(2026, 7, 14);

describe('案 53f 作成日の相対表示', () => {
  it('きょう', () => {
    expect(backupRelativeDayLabel('ja', '2026-08-14T09:00:00.000', TODAY)).toBe('きょう');
  });

  it('きのう', () => {
    expect(backupRelativeDayLabel('ja', '2026-08-13T23:59:00.000', TODAY)).toBe('きのう');
  });

  it('おとといより前は日付だけで足りる', () => {
    expect(backupRelativeDayLabel('ja', '2026-08-12T09:00:00.000', TODAY)).toBe(null);
  });

  it('月をまたいでも「きのう」', () => {
    expect(backupRelativeDayLabel('ja', '2026-07-31T09:00:00.000', new Date(2026, 7, 1))).toBe('きのう');
  });

  it('カードの 2 行目（写真あり）', () => {
    expect(backupPreviewCreatedLine('ja', '2026-08-13T14:30:00.000', TODAY, true)).toBe(
      '作成日 2026年8月13日（きのう）',
    );
  });

  it('写真の入っていないファイルはここでも言う（§4.6）', () => {
    expect(backupPreviewCreatedLine('ja', '2026-08-13T14:30:00.000', TODAY, false)).toBe(
      '作成日 2026年8月13日（きのう）・写真なし',
    );
  });

  it('前回作った日（案 53a）', () => {
    expect(backupLastCreatedNote('ja', '2026-07-02T10:00:00.000')).toBe('前回作ったのは 2026年7月2日');
  });

  it('一度も作っていないことは隠さない', () => {
    expect(backupLastCreatedNote('ja', null)).toBe('まだ一度も作っていません');
  });
});

// ---- 案 53k 完了画面 ----

describe('案 53k 復元の結果', () => {
  it('全部そろえば枚数だけ', () => {
    expect(backupRestoredPhotoValue('ja', 20, 0)).toBe('20枚');
  });

  it('欠けたぶんは括弧で添える', () => {
    expect(backupRestoredPhotoValue('ja', 17, 3)).toBe('17枚（3枚は復元できず）');
  });

  it('注記は理由と、その記録がどうなったかを言う', () => {
    expect(backupMissingPhotoNote('ja', 3)).toBe(
      '写真3枚はファイルの中に無いか壊れていたため、その3件は写真なしの記録として入りました。金額や日付は入っています。',
    );
  });
});
