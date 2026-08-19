// SPEC-V8 §2（CSV の形）・§3（読み込みと検証）のテスト。
//
// **端末も DB も要らない部分だけをここで確かめる。** 復元が本当に巻き戻るかは
// db/backup.test.ts（better-sqlite3）が見る。
//
// ここで一番確かめたいのは「壊れたファイルが必ず止まること」（§3.2）──
// 全置換の機能なので、通してはいけないものを通すと戻す先が無い。

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  backupBaseName,
  backupEntryName,
  backupFileName,
  BACKUP_FORMAT_VERSION,
  BACKUP_PHOTO_SIZE_LIMIT,
  classifyBackupEntry,
  missingPhotoNames,
  selectPhotoNames,
  BACKUP_RECORDS_FILE,
  BACKUP_PRESETS_FILE,
  BACKUP_RECORD_TAGS_FILE,
  BACKUP_TAGS_FILE,
  BackupError,
  buildBackupFile,
  buildBackupInfo,
  parseBackupFile,
  parseCsv,
  readBackupContents,
  selectBackupFiles,
} from './backup';
import {
  backupErrorHint,
  backupErrorTitle,
  backupErrorUnchangedNote,
  BACKUP_INFO_FILE,
  backupErrorCopyText,
  backupPhotoIncludeDetail,
  formatByteSize,
} from './labels';

// ---- 素材（正しいバックアップ 1 つぶん） ----

const RECORD_ROW = {
  id: 'r1',
  item_name: 'えんぴつ',
  sales_price: '1500',
  purchase_price: '300',
  postage: '210',
  envelope_cost: '15',
  others_cost: '0',
  commission: '10',
  is_sold: '1',
  sale_start_date: '2026-08-01T12:00:00.000',
  sale_date: '2026-08-10T09:30:00.000',
  memo: '',
  kind: 'sourced',
  site_name: 'フリマA',
  photo_file_name: '',
  shipping_material_cost: '0',
  excludes_shipping_material: '0',
  // SPEC-V9 §3。目標を決めた記録（空欄なら「決めていない」）と、
  // まだ書き込まない出品日（常に空欄）
  target_profit: '2000',
  listed_at: '',
};

const PRESET_ROW = {
  id: 'p1',
  type: 'site',
  name: '手数料 10%',
  color_key: '#FF3B30',
  initial: '10',
  value: '10',
  pack_quantity: '0',
  pack_price: '0',
  material_cost: '0',
  sort_order: '1',
};

const TAG_ROW = { id: 't1', name: '洋服', color_key: '#007AFF', sort_order: '1' };

const RECORD_TAG_ROW = { record_id: 'r1', tag_id: 't1' };

/** 正しい 5 ファイル。個々のテストが 1 つだけ差し替えて壊す */
function goodFiles(overrides: Partial<Record<string, string>> = {}): Map<string, string> {
  const files = new Map<string, string>([
    [
      BACKUP_INFO_FILE,
      buildBackupInfo(
        { records: 1, presets: 1, tags: 1, recordTags: 1 },
        '2026-08-13T14:30:00.000',
        0,
      ),
    ],
    [BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW])],
    [BACKUP_PRESETS_FILE, buildBackupFile(BACKUP_PRESETS_FILE, [PRESET_ROW])],
    [BACKUP_TAGS_FILE, buildBackupFile(BACKUP_TAGS_FILE, [TAG_ROW])],
    [BACKUP_RECORD_TAGS_FILE, buildBackupFile(BACKUP_RECORD_TAGS_FILE, [RECORD_TAG_ROW])],
  ]);
  for (const [name, text] of Object.entries(overrides)) {
    if (text == null) files.delete(name);
    else files.set(name, text);
  }
  return files;
}

/** records.csv を 1 セルだけ書き換えて壊す */
function recordsWith(overrides: Partial<typeof RECORD_ROW>): string {
  return buildBackupFile(BACKUP_RECORDS_FILE, [{ ...RECORD_ROW, ...overrides }]);
}

// ---- §2.2 CSV の組み立て ----

describe('§2.2 buildBackupFile', () => {
  it('ヘッダは DB のカラム名がそのまま並ぶ（19 列）', () => {
    const [header] = parseCsv(buildBackupFile(BACKUP_RECORDS_FILE, []));

    expect(header).toEqual([
      'id',
      'item_name',
      'sales_price',
      'purchase_price',
      'postage',
      'envelope_cost',
      'others_cost',
      'commission',
      'is_sold',
      'sale_start_date',
      'sale_date',
      'memo',
      'kind',
      'site_name',
      'photo_file_name',
      'shipping_material_cost',
      'excludes_shipping_material',
      // SPEC-V9 §3 で足した 2 列。**末尾に足す**ので、古いファイルは
      // 「先頭 17 列が一致するか」で読める（RECORD_COLUMNS_LEGACY）
      'target_profit',
      'listed_at',
    ]);
  });

  it('桁区切りを入れない（1500 であって 1,500 ではない。§2.2）', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]);

    expect(csv).toContain(',1500,');
    expect(csv).not.toContain('1,500');
  });

  it('日付は時刻まで入る（既存 19 列 CSV と違い先頭 10 文字で切らない。§2.3）', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]);

    expect(csv).toContain('2026-08-10T09:30:00.000');
  });

  it('カンマ・引用符・改行を含む値は RFC 4180 で囲む', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [
      { ...RECORD_ROW, item_name: 'a,b', memo: '1"2\n3' },
    ]);
    const rows = parseCsv(csv);

    expect(rows[1][1]).toBe('a,b');
    expect(rows[1][11]).toBe('1"2\n3');
  });
});

// ---- §3.1 CSV の解析 ----

describe('§3.1 parseCsv', () => {
  it('引用の中のカンマ・改行・二重引用符を復元する', () => {
    expect(parseCsv('a,"b,c","d""e","f\ng"\r\n')).toEqual([['a', 'b,c', 'd"e', 'f\ng']]);
  });

  it('CRLF でも LF でも読める（表計算を経由すると変わる）', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual(parseCsv('a,b\nc,d\n'));
  });

  it('末尾の改行で空の行を作らない', () => {
    expect(parseCsv('a,b\r\n')).toHaveLength(1);
  });

  it('先頭の BOM を落とす', () => {
    expect(parseCsv('﻿a,b\r\n')).toEqual([['a', 'b']]);
  });

  it('空欄は空文字として残る（sale_date の null。§2.3）', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

// ---- §2 / §3 の往復 ----

describe('§3 書いたものが読み戻せる', () => {
  it('buildBackupFile → parseBackupFile で値が一致する', () => {
    const rows = parseBackupFile('ja', BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]));

    expect(rows).toEqual([RECORD_ROW]);
  });

  it('5 ファイル揃っていれば件数と作成日が読める（§5.4 のプレビュー）', () => {
    const { preview, tables } = readBackupContents('ja', goodFiles());

    expect(preview.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(preview.createdAt).toBe('2026-08-13T14:30:00.000');
    expect(preview.counts).toEqual({ records: 1, presets: 1, tags: 1, recordTags: 1 });
    expect(tables.records[0].id).toBe('r1');
  });

  it('件数は実データから数え直す（backup-info の数字は信じない。§1.2）', () => {
    // info には 999 件と書いてあるが、records.csv には 1 件しかない
    const files = goodFiles({
      [BACKUP_INFO_FILE]: buildBackupInfo(
        { records: 999, presets: 1, tags: 1, recordTags: 1 },
        '2026-08-13T14:30:00.000',
        0,
      ),
    });

    expect(readBackupContents('ja', files).preview.counts.records).toBe(1);
  });

  it('売れていない記録は sale_date が空欄で通る（§2.3）', () => {
    const files = goodFiles({
      [BACKUP_RECORDS_FILE]: recordsWith({ is_sold: '0', sale_date: '' }),
    });

    expect(readBackupContents('ja', files).tables.records[0].sale_date).toBe('');
  });
});

// ---- §3.2 検証（通してはいけないもの） ----

describe('§3.2 壊れたバックアップは必ず止まる', () => {
  it('ファイルが 1 つ欠けている', () => {
    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_TAGS_FILE]: undefined }))).toThrow(
      /tags\.csv が見つかりません/,
    );
  });

  it('列が足りない（数が違うことと、いくつ足りないかを出す）', () => {
    const broken = 'id,item_name\r\nr1,えんぴつ\r\n';

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: broken }))).toThrow(
      'records.csv の列の数が違います。必要な列は 19 ですが、ファイルには 2 あります。',
    );
  });

  it('列名が書き換えられている（何列目がどう違うかを出す）', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]).replace('sales_price', 'price');

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: csv }))).toThrow(
      'records.csv の列名が違います。3 列目は「sales_price」のはずですが「price」になっています。',
    );
  });

  // 列名を全部並べると 19 列 × 2 で画面が埋まり、肝心の食い違いが読めなくなる
  // （実機で確認して直した）。長くならないことをテストで固定しておく
  it('列の食い違いの文言は 1 行に収まる（列名を全部は並べない）', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]).replace('sales_price', 'price');

    try {
      readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: csv }));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('\n');
      expect((error as Error).message.length).toBeLessThan(80);
    }
  });

  it('金額が数値でない（§3.3 の例文そのもの）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ purchase_price: 'abc' }) });

    expect(() => readBackupContents('ja', files)).toThrow(
      'records.csv 2行目：「仕入価格」が正しい数値ではありません。',
    );
  });

  it('桁区切りの入った金額は弾く（表計算で書式が付いた場合。§2.2）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sales_price: '1,500' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「販売価格」が正しい数値ではありません/);
  });

  it('金額が空欄', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ postage: '' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「送料」が正しい数値ではありません/);
  });

  it('日付の形式が違う（Excel が付ける 2026/8/9 など）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026/8/9' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「出品日」が正しい日付ではありません/);
  });

  it('日付の形は合っていても実在しない日は弾く（2026-02-31）', () => {
    const files = goodFiles({
      [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026-02-31T00:00:00.000' }),
    });

    expect(() => readBackupContents('ja', files)).toThrow(/「出品日」が正しい日付ではありません/);
  });

  it('時刻の無い日付は弾く（§2.3 は時刻まで必須）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026-08-01' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「出品日」が正しい日付ではありません/);
  });

  it('is_sold が 0 / 1 でない', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ is_sold: 'true' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「状態」が 0 か 1 ではありません/);
  });

  it('kind が決まった語でない', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ kind: 'unknown' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「種別」が used \/ sourced のどれでもありません/);
  });

  it('必須の列が空（id）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ id: '' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「記録ID」が空です/);
  });

  it('項目の数が行によって違う', () => {
    const csv = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]) + 'r2,足りない\r\n';

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: csv }))).toThrow(
      /3行目：項目の数が 19 ではなく 2 です/,
    );
  });

  it('行番号はヘッダを 1 行目として数える（§3.3）', () => {
    const rows = [RECORD_ROW, RECORD_ROW, { ...RECORD_ROW, id: 'r3', sales_price: 'x' }];
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: buildBackupFile(BACKUP_RECORDS_FILE, rows) });

    // 3 件目 = 4 行目
    expect(() => readBackupContents('ja', files)).toThrow(/records\.csv 4行目/);
  });

  it('record_tags が存在しない記録を指している（FK が効かないぶんの検査。§3.2）', () => {
    const files = goodFiles({
      [BACKUP_RECORD_TAGS_FILE]: buildBackupFile(BACKUP_RECORD_TAGS_FILE, [
        { record_id: 'missing', tag_id: 't1' },
      ]),
    });

    expect(() => readBackupContents('ja', files)).toThrow(
      /記録ID「missing」が records\.csv にありません/,
    );
  });

  it('record_tags が存在しないタグを指している', () => {
    const files = goodFiles({
      [BACKUP_RECORD_TAGS_FILE]: buildBackupFile(BACKUP_RECORD_TAGS_FILE, [
        { record_id: 'r1', tag_id: 'missing' },
      ]),
    });

    expect(() => readBackupContents('ja', files)).toThrow(/タグID「missing」が tags\.csv にありません/);
  });

  it('未来のバージョンは読まない（§1.2）', () => {
    const info = buildBackupFile(BACKUP_INFO_FILE, [
      {
        format_version: String(BACKUP_FORMAT_VERSION + 1),
        created_at: '2026-08-13T14:30:00.000',
        record_count: '1',
        preset_count: '1',
        tag_count: '1',
        record_tag_count: '1',
        photo_count: '0',
      },
    ]);

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_INFO_FILE]: info }))).toThrow(
      new RegExp(`バージョン ${BACKUP_FORMAT_VERSION + 1}）には対応していません`),
    );
  });

  it('backup-info.csv が 2 行以上ある', () => {
    const row = {
      format_version: '1',
      created_at: '2026-08-13T14:30:00.000',
      record_count: '1',
      preset_count: '1',
      tag_count: '1',
      record_tag_count: '1',
      photo_count: '0',
    };
    const info = buildBackupFile(BACKUP_INFO_FILE, [row, row]);

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_INFO_FILE]: info }))).toThrow(
      /1行だけのファイルです/,
    );
  });

  it('投げるのは BackupError（画面がそのまま文言を出せる）', () => {
    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_TAGS_FILE]: undefined }))).toThrow(
      BackupError,
    );
  });
});

// ---- §3.3 エラーの出し方 ----

describe('§3.3 エラーの文言', () => {
  it('コピーする文は題名から始まる（画面と同じ 3 行を持ち出せる）', () => {
    const text = backupErrorCopyText('ja', 'records.csv 501行目：「仕入価格」が正しい数値ではありません。');

    expect(text.startsWith(backupErrorTitle('ja'))).toBe(true);
  });

  it('コピーする文の最後は必ず「変更されていません」（§3.3 の 3 行目）', () => {
    expect(backupErrorCopyText('ja', 'なにか')).toMatch(
      new RegExp(`${backupErrorUnchangedNote('ja')}$`),
    );
  });

  it('題名・理由・対処・無事だったことの 4 行になる（案 53h）', () => {
    const reason = 'records.csv 501行目：「仕入価格」が正しい数値ではありません。';

    expect(backupErrorCopyText('ja', reason)).toBe(
      'バックアップを読み込めませんでした。\n' +
        'records.csv 501行目：「仕入価格」が正しい数値ではありません。\n' +
        `${backupErrorHint('ja')}\n` +
        '現在のデータは変更されていません。',
    );
  });
});

// ---- §3.1 ZIP の中の構造（決定 §8-2 / §8-3） ----

describe('§3.1 エントリ名の正規化', () => {
  it('フォルダが 1 つある形（自分で作った ZIP）', () => {
    expect(backupEntryName('backup_2026-08-13/records.csv')).toBe('records.csv');
  });

  it('直下に置かれている形（他のツール）', () => {
    expect(backupEntryName('records.csv')).toBe('records.csv');
  });

  it('入れ子が深くても基底名で引ける', () => {
    expect(backupEntryName('a/b/c/records.csv')).toBe('records.csv');
  });

  it('__MACOSX 配下は無視する（Finder で再圧縮すると必ず入る）', () => {
    expect(backupEntryName('__MACOSX/records.csv')).toBeNull();
    expect(backupEntryName('__MACOSX/backup_2026-08-13/._records.csv')).toBeNull();
    expect(backupEntryName('backup_2026-08-13/__MACOSX/records.csv')).toBeNull();
  });

  it('.DS_Store と ._ 始まりは無視する', () => {
    expect(backupEntryName('backup_2026-08-13/.DS_Store')).toBeNull();
    expect(backupEntryName('backup_2026-08-13/._records.csv')).toBeNull();
  });

  it('ディレクトリ自身のエントリは無視する', () => {
    expect(backupEntryName('backup_2026-08-13/')).toBeNull();
  });
});

describe('§3.1 selectBackupFiles', () => {
  it('フォルダ 1 つの ZIP から 5 ファイルを取り出す', () => {
    const entries: [string, string][] = [
      ['backup_2026-08-13/', ''],
      ['backup_2026-08-13/backup-info.csv', 'info'],
      ['backup_2026-08-13/records.csv', 'rec'],
      ['backup_2026-08-13/presets.csv', 'pre'],
      ['backup_2026-08-13/tags.csv', 'tag'],
      ['backup_2026-08-13/record_tags.csv', 'rt'],
    ];

    expect([...selectBackupFiles(entries).keys()].sort()).toEqual([
      'backup-info.csv',
      'presets.csv',
      'record_tags.csv',
      'records.csv',
      'tags.csv',
    ]);
  });

  it('Finder で再圧縮された ZIP でも 5 ファイルが揃う', () => {
    const entries: [string, string][] = [
      ['backup_2026-08-13/backup-info.csv', 'info'],
      ['backup_2026-08-13/records.csv', 'rec'],
      ['backup_2026-08-13/presets.csv', 'pre'],
      ['backup_2026-08-13/tags.csv', 'tag'],
      ['backup_2026-08-13/record_tags.csv', 'rt'],
      ['backup_2026-08-13/.DS_Store', 'junk'],
      ['__MACOSX/backup_2026-08-13/._records.csv', 'junk'],
      ['__MACOSX/backup_2026-08-13/._.DS_Store', 'junk'],
    ];

    expect(selectBackupFiles(entries).size).toBe(5);
    expect(selectBackupFiles(entries).get('records.csv')).toBe('rec');
  });

  it('関係のないファイルは黙って無視する', () => {
    const entries: [string, string][] = [
      ['records.csv', 'rec'],
      ['readme.txt', 'x'],
      ['photo.jpg', 'x'],
    ];

    expect([...selectBackupFiles(entries).keys()]).toEqual(['records.csv']);
  });
});

// ---- §1.1 / §3.1 fflate を通した往復 ----
//
// media/backupArchive.ts は expo-file-system を import するのでここでは動かせないが、
// **ZIP の組み立てと展開そのもの（fflate）は純粋**なので、実物で往復させられる。
// 端末に行く前に「作った ZIP が読み戻せる」ことをここで押さえておく。

describe('§3.1 ZIP の往復（fflate の同期 API）', () => {
  /** writeBackupZip と同じ組み立て方（フォルダを 1 つ作る） */
  function zipOf(files: ReadonlyMap<string, string>, folder = 'backup_2026-08-13'): Uint8Array {
    const entries: Record<string, Uint8Array> = {};
    for (const [name, text] of files) entries[`${folder}/${name}`] = strToU8(text);
    return zipSync(entries, { level: 6 });
  }

  /** readBackupZip と同じ読み方 */
  function filesOf(zipped: Uint8Array): Map<string, string> {
    const unzipped = unzipSync(zipped);
    const entries: [string, string][] = Object.entries(unzipped)
      .filter(([path]) => !path.endsWith('/'))
      .map(([path, bytes]) => [path, strFromU8(bytes)]);
    return selectBackupFiles(entries);
  }

  it('作った ZIP をそのまま読み戻せる', () => {
    const contents = readBackupContents('ja', filesOf(zipOf(goodFiles())));

    expect(contents.preview.counts.records).toBe(1);
    expect(contents.tables.records[0].item_name).toBe('えんぴつ');
  });

  it('日本語が UTF-8 で往復する（TextEncoder の有無に関わらず）', () => {
    const files = goodFiles({
      [BACKUP_RECORDS_FILE]: recordsWith({ item_name: '鉛筆・消しゴム 🖊', memo: '値引き 10%' }),
    });

    const [record] = readBackupContents('ja', filesOf(zipOf(files))).tables.records;
    expect(record.item_name).toBe('鉛筆・消しゴム 🖊');
    expect(record.memo).toBe('値引き 10%');
  });

  it('CSV は圧縮で小さくなる（level 6 が効いている）', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ ...RECORD_ROW, id: `r${i}` }));
    const raw = buildBackupFile(BACKUP_RECORDS_FILE, rows);
    const zipped = zipOf(new Map([[BACKUP_RECORDS_FILE, raw]]));

    expect(zipped.length).toBeLessThan(strToU8(raw).length / 2);
  });

  it('フォルダを作らず直下に置いた ZIP も読める（他のツールが作った形）', () => {
    const entries: Record<string, Uint8Array> = {};
    for (const [name, text] of goodFiles()) entries[name] = strToU8(text);

    expect(readBackupContents('ja', filesOf(zipSync(entries))).preview.counts.records).toBe(1);
  });

  it('__MACOSX と .DS_Store が混ざった ZIP でも読める（Finder で再圧縮した形）', () => {
    const entries: Record<string, Uint8Array> = {};
    for (const [name, text] of goodFiles()) {
      entries[`backup_2026-08-13/${name}`] = strToU8(text);
      entries[`__MACOSX/backup_2026-08-13/._${name}`] = strToU8('rsrc');
    }
    entries['backup_2026-08-13/.DS_Store'] = strToU8('junk');
    entries['__MACOSX/._backup_2026-08-13'] = strToU8('rsrc');

    expect(readBackupContents('ja', filesOf(zipSync(entries))).preview.counts.records).toBe(1);
  });
});

// ---- §1.1 ファイル名 ----

describe('§1.1 ファイル名は ASCII だけ（決定 §8-1）', () => {
  it('アプリ名 ＋ 日付（保存先で何のバックアップか分かるように）', () => {
    expect(backupBaseName(new Date(2026, 7, 13, 14, 30))).toBe(
      'profit-calculator-backup_2026-08-13',
    );
    expect(backupFileName(new Date(2026, 7, 13, 14, 30))).toBe(
      'profit-calculator-backup_2026-08-13.zip',
    );
  });

  it('日本語が混ざらない（ZIP のエントリ名が化けないようにするため）', () => {
    expect(/^[\x20-\x7E]+$/.test(backupFileName(new Date(2026, 0, 5)))).toBe(true);
  });
});

// **名前を変えても読める**ことが、名前を変えられる前提そのもの（§3.1）。
// アプリ名を足した改名（2026-08-14）で古いバックアップが読めなくなっていないか、
// ここで固定しておく。
describe('§3.1 読み込みは名前に依存しない', () => {
  const entriesFrom = (folder: string): [string, string][] =>
    [...goodFiles()].map(([name, text]) => [folder === '' ? name : `${folder}/${name}`, text]);

  it('旧名（backup_2026-08-13/）のフォルダでも読める', () => {
    expect(
      readBackupContents('ja', selectBackupFiles(entriesFrom('backup_2026-08-13'))).preview.counts.records,
    ).toBe(1);
  });

  it('新名（profit-calculator-backup_2026-08-14/）でも読める', () => {
    expect(
      readBackupContents('ja', selectBackupFiles(entriesFrom('profit-calculator-backup_2026-08-14')))
        .preview.counts.records,
    ).toBe(1);
  });

  it('利用者が好きにリネームしたフォルダでも読める', () => {
    expect(
      readBackupContents('ja', selectBackupFiles(entriesFrom('きろく 2026年8月 (1)'))).preview.counts
        .records,
    ).toBe(1);
  });

  it('フォルダが無く直下に置かれていても読める', () => {
    expect(readBackupContents('ja', selectBackupFiles(entriesFrom(''))).preview.counts.records).toBe(1);
  });
});

// ---- §4 写真 ----

describe('§4.1 写真のエントリの見分け', () => {
  it('photos/ の下は写真', () => {
    expect(classifyBackupEntry('backup_2026-08-14/photos/a.jpg')).toEqual({
      kind: 'photo',
      name: 'a.jpg',
    });
  });

  it('フォルダが無く photos/ が直下にあっても写真', () => {
    expect(classifyBackupEntry('photos/a.jpg')).toEqual({ kind: 'photo', name: 'a.jpg' });
  });

  it('photos/ の外の .jpg は無視する（バックアップの一部ではない）', () => {
    expect(classifyBackupEntry('backup_2026-08-14/a.jpg')).toBeNull();
  });

  // 基底名だけで見分けると photos/records.csv を CSV と取り違える
  it('photos/ の下の CSV は写真として扱う（CSV と取り違えない）', () => {
    expect(classifyBackupEntry('backup_2026-08-14/photos/records.csv')?.kind).toBe('photo');
  });

  it('__MACOSX 配下の写真は無視する', () => {
    expect(classifyBackupEntry('__MACOSX/backup_2026-08-14/photos/._a.jpg')).toBeNull();
  });

  it('5 つの CSV は csv として返る', () => {
    expect(classifyBackupEntry('backup_2026-08-14/records.csv')).toEqual({
      kind: 'csv',
      name: 'records.csv',
    });
  });

  it('selectPhotoNames は写真の名前だけを集める', () => {
    const names = selectPhotoNames([
      'b/photos/a.jpg',
      'b/photos/c.jpg',
      'b/records.csv',
      '__MACOSX/b/photos/._a.jpg',
      'b/photos/.DS_Store',
    ]);

    expect([...names].sort()).toEqual(['a.jpg', 'c.jpg']);
  });
});

describe('§4.3 欠けている写真の照合', () => {
  const rows = [
    { ...RECORD_ROW, id: 'r1', photo_file_name: 'a.jpg' },
    { ...RECORD_ROW, id: 'r2', photo_file_name: 'b.jpg' },
    { ...RECORD_ROW, id: 'r3', photo_file_name: '' },
  ];

  it('揃っていれば空', () => {
    expect(missingPhotoNames(rows, new Set(['a.jpg', 'b.jpg']))).toEqual(new Set());
  });

  it('足りないものを返す（**投げない**。§4.3）', () => {
    expect(missingPhotoNames(rows, new Set(['a.jpg']))).toEqual(new Set(['b.jpg']));
  });

  it('写真なしの記録（空欄）は欠落に数えない', () => {
    expect(missingPhotoNames(rows, new Set()).has('')).toBe(false);
  });

  // **逆方向は見ない**（孤児は容量を食うだけで整合を壊さない）
  it('CSV が指していない写真があっても欠落にならない', () => {
    expect(missingPhotoNames(rows, new Set(['a.jpg', 'b.jpg', 'orphan.jpg']))).toEqual(new Set());
  });
});

describe('§4.1 写真込みの読み込み', () => {
  const withPhoto = () =>
    goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ photo_file_name: 'a.jpg' }) });

  it('写真の枚数は実物を数える（backup-info の photo_count は読まない）', () => {
    const contents = readBackupContents('ja', withPhoto(), new Set(['a.jpg', 'b.jpg']));

    expect(contents.preview.photoCount).toBe(2);
    expect(contents.missingPhotos.size).toBe(0);
  });

  it('写真が欠けていてもエラーにならず、名前が持ち帰られる', () => {
    const contents = readBackupContents('ja', withPhoto(), new Set());

    expect(contents.missingPhotos).toEqual(new Set(['a.jpg']));
    expect(contents.tables.records[0].id).toBe('r1');
  });

  it('写真を渡さなければ 0 枚（写真なしのバックアップ）', () => {
    expect(readBackupContents('ja', goodFiles()).preview.photoCount).toBe(0);
  });
});

// **版を上げても古いバックアップは読める**（§1.2）。
// photo_count を末尾に足したのはこのため
describe('§1.2 版 1（photo_count が無い）も読める', () => {
  // **版 1 が実際に書き出していた 6 列**をそのまま書く（buildBackupFile は
  // 現在の版＝7 列で組むので、古いファイルの再現には使えない）
  const v1Info =
    'format_version,created_at,record_count,preset_count,tag_count,record_tag_count\r\n' +
    '1,2026-08-13T14:30:00.000,1,1,1,1\r\n';

  it('6 列の backup-info.csv を受け付ける', () => {
    const contents = readBackupContents('ja', goodFiles({ [BACKUP_INFO_FILE]: v1Info }));

    expect(contents.preview.formatVersion).toBe(1);
    expect(contents.preview.counts.records).toBe(1);
  });

  it('版 1 は写真を持たない（0 枚）', () => {
    expect(readBackupContents('ja', goodFiles({ [BACKUP_INFO_FILE]: v1Info })).preview.photoCount).toBe(0);
  });

  it('いま書き出すのは版 3（目標利益の 2 列が付く。SPEC-V9 §3）', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(3);
    expect(parseCsv(goodFiles().get(BACKUP_INFO_FILE)!)[0]).toContain('photo_count');
  });
});

describe('SPEC-V9 §3 目標利益の 2 列が無い古い records.csv も読める', () => {
  /**
   * **版 3 より前が実際に書き出していた 17 列**をそのまま書く
   * （buildBackupFile は現在の 19 列で組むので、古いファイルの再現には使えない）。
   */
  const LEGACY_HEADER =
    'id,item_name,sales_price,purchase_price,postage,envelope_cost,others_cost,' +
    'commission,is_sold,sale_start_date,sale_date,memo,kind,site_name,' +
    'photo_file_name,shipping_material_cost,excludes_shipping_material';

  const legacyRecords = (row = '') =>
    `${LEGACY_HEADER}\r\n${row || 'r1,えんぴつ,1500,300,210,15,0,10,1,2026-08-01T12:00:00.000,2026-08-10T09:30:00.000,,sourced,フリマA,,0,0'}\r\n`;

  it('**エラーにならず**、足りない 2 列は空欄（= null）として読める', () => {
    const rows = parseBackupFile('ja', BACKUP_RECORDS_FILE, legacyRecords());

    expect(rows).toHaveLength(1);
    expect(rows[0].target_profit).toBe('');
    expect(rows[0].listed_at).toBe('');
    // 17 列ぶんの値はそのまま入る（読み落としが無いことの確認）
    expect(rows[0].sales_price).toBe('1500');
    expect(rows[0].site_name).toBe('フリマA');
  });

  it('5 ファイル揃った古いバックアップがそのまま復元の手前まで通る', () => {
    const contents = readBackupContents(
      'ja',
      goodFiles({ [BACKUP_RECORDS_FILE]: legacyRecords() }),
    );

    expect(contents.preview.counts.records).toBe(1);
    expect(contents.tables.records[0].target_profit).toBe('');
  });

  it('「1 件でもエラーなら一切読み込まない」の例外はこの 2 列だけ ── 他の列は今までどおり弾く', () => {
    const broken = legacyRecords(
      'r1,えんぴつ,abc,300,210,15,0,10,1,2026-08-01T12:00:00.000,2026-08-10T09:30:00.000,,sourced,フリマA,,0,0',
    );

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: broken }))).toThrow(
      /「販売価格」が正しい数値ではありません/,
    );
  });

  it('17 列でも 19 列でもない中途半端な列数は今までどおりエラー', () => {
    const broken = `${LEGACY_HEADER},target_profit\r\nr1,えんぴつ,1500,300,210,15,0,10,1,2026-08-01T12:00:00.000,2026-08-10T09:30:00.000,,sourced,フリマA,,0,0,100\r\n`;

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: broken }))).toThrow(
      /records\.csv の列の数が違います/,
    );
  });

  it('新しい版では空欄と 0 が書き分かれる（「決めていない」と「目標 0 円」）', () => {
    const rows = parseBackupFile(
      'ja',
      BACKUP_RECORDS_FILE,
      buildBackupFile(BACKUP_RECORDS_FILE, [
        { ...RECORD_ROW, id: 'r1', target_profit: '' },
        { ...RECORD_ROW, id: 'r2', target_profit: '0' },
      ]),
    );

    expect(rows[0].target_profit).toBe('');
    expect(rows[1].target_profit).toBe('0');
  });

  it('目標利益に数値でない値が入っていれば弾く（空欄だけが特別）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ target_profit: 'abc' }) });

    expect(() => readBackupContents('ja', files)).toThrow(/「目標利益」が正しい数値ではありません/);
  });
});

describe('§4.4 サイズの表示', () => {
  it('MB は小数 1 桁', () => {
    expect(formatByteSize('ja', 8.6 * 1024 * 1024)).toBe('8.6MB');
  });

  it('割り切れるときは小数を落とす（上限の 50MB に .0 を出さない）', () => {
    expect(formatByteSize('ja', 50 * 1024 * 1024)).toBe('50MB');
  });

  it('1MB 未満は KB', () => {
    expect(formatByteSize('ja', 320 * 1024)).toBe('320KB');
  });

  it('ごく小さいものは「1KB未満」', () => {
    expect(formatByteSize('ja', 200)).toBe('1KB未満');
  });

  it('「含める」の下に枚数と合計サイズを出す（案 53a）', () => {
    expect(backupPhotoIncludeDetail('ja', 53, 8.2 * 1024 * 1024)).toBe('53枚・8.2MB');
  });

  it('上限は 50MB（§4.4 / §6.2 のメモリ実測が根拠）', () => {
    expect(BACKUP_PHOTO_SIZE_LIMIT).toBe(50 * 1024 * 1024);
  });
});

describe('SPEC-V10 §1.6 計算方式の 5 列が無い古い presets.csv も読める', () => {
  /**
   * **この機能より前が実際に書き出していた 10 列**をそのまま書く
   * （buildBackupFile は現在の 15 列で組むので、古いファイルの再現には使えない）。
   */
  const LEGACY_HEADER =
    'id,type,name,color_key,initial,value,pack_quantity,pack_price,material_cost,sort_order';

  const legacyPresets = (row = '') =>
    `${LEGACY_HEADER}\r\n${row || 'p1,packaging,封筒（A4）,#FFCC00,封,8,100,800,0,1'}\r\n`;

  it('**エラーにならず**、足りない 5 列は空欄として読める', () => {
    const rows = parseBackupFile('ja', BACKUP_PRESETS_FILE, legacyPresets());

    expect(rows).toHaveLength(1);
    expect(rows[0].calc_method).toBe('');
    expect(rows[0].pack_height).toBe('');
    expect(rows[0].use_width).toBe('');
    // 10 列ぶんの値はそのまま入る（既存の梱包材が個数方式のまま戻ることの土台）
    expect(rows[0].value).toBe('8');
    expect(rows[0].pack_quantity).toBe('100');
  });

  it('5 ファイル揃った古いバックアップがそのまま復元の手前まで通る', () => {
    const contents = readBackupContents(
      'ja',
      goodFiles({ [BACKUP_PRESETS_FILE]: legacyPresets() }),
    );

    expect(contents.preview.counts.presets).toBe(1);
    expect(contents.tables.presets[0].calc_method).toBe('');
  });

  it('10 列でも 15 列でもない中途半端な列数は今までどおりエラー', () => {
    const broken = `${LEGACY_HEADER},calc_method\r\np1,packaging,封筒（A4）,#FFCC00,封,8,100,800,0,1,area\r\n`;

    expect(() => readBackupContents('ja', goodFiles({ [BACKUP_PRESETS_FILE]: broken }))).toThrow(
      /presets\.csv の列の数が違います/,
    );
  });

  it('新しい版は方式とサイズをそのまま往復させる', () => {
    const rows = parseBackupFile(
      'ja',
      BACKUP_PRESETS_FILE,
      buildBackupFile(BACKUP_PRESETS_FILE, [
        {
          ...PRESET_ROW,
          type: 'packaging',
          calc_method: 'area',
          pack_height: '100',
          pack_width: '100',
          use_height: '30',
          use_width: '20',
        },
      ]),
    );

    expect(rows[0]).toMatchObject({
      calc_method: 'area',
      pack_height: '100',
      use_width: '20',
    });
  });
});

// ---- §2.3 日付の検証は端末のタイムゾーンに依らない ----
//
// **実際に復元が丸ごと失敗した壊れ方の回帰テスト。** 以前は `new Date(value)` で
// 組み直して一致を見ていたので、タイムゾーンを持たないこの文字列が**現地時刻**として
// 解釈され、夏時間で**春に飛ぶ 1 時間**が「実在しない日時」になっていた。
// バックアップは 1 件でもエラーがあれば一切読み込まない（§3）ため、
// **その 1 件で復元が全部止まる** ── 機種変更という取り返しのつかない場面で。

describe('§2.3 夏時間のある端末でも日付が通る', () => {
  /** 実行中に TZ を差し替える（Node 16 以降は Date がその場で追随する） */
  function withTimeZone(zone: string, run: () => void): void {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
      run();
    } finally {
      process.env.TZ = original;
    }
  }

  /** America/New_York で 2026-03-08 02:00〜02:59 は現地時刻として存在しない */
  const SPRING_FORWARD_GAP = '2026-03-08T02:30:00.000';

  it('この検査が機能していること（その時刻は現地時刻としては本当に存在しない）', () => {
    withTimeZone('America/New_York', () => {
      // 直したのはここに依存しない形にしたことなので、前提そのものを先に確かめる
      expect(new Date(SPRING_FORWARD_GAP).getHours()).toBe(3);
    });
  });

  it('夏時間で飛ぶ 1 時間に当たる記録でも復元できる（America/New_York）', () => {
    withTimeZone('America/New_York', () => {
      const files = goodFiles({
        [BACKUP_RECORDS_FILE]: recordsWith({
          sale_start_date: SPRING_FORWARD_GAP,
          sale_date: SPRING_FORWARD_GAP,
        }),
      });

      expect(readBackupContents('ja', files).tables.records[0].sale_start_date).toBe(
        SPRING_FORWARD_GAP,
      );
    });
  });

  it('夏時間の終わりで重なる 1 時間も同じく通る（America/New_York）', () => {
    withTimeZone('America/New_York', () => {
      const files = goodFiles({
        [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026-11-01T01:30:00.000' }),
      });

      expect(readBackupContents('ja', files).preview.counts.records).toBe(1);
    });
  });

  it('日本のタイムゾーンでも同じ結果になる（どの端末でも同じファイルが読める）', () => {
    const files = goodFiles({
      [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: SPRING_FORWARD_GAP }),
    });

    withTimeZone('Asia/Tokyo', () => {
      expect(readBackupContents('ja', files).preview.counts.records).toBe(1);
    });
  });

  it('実在しない日を弾く働きは変わらない（タイムゾーンを変えても弾く）', () => {
    for (const zone of ['Asia/Tokyo', 'America/New_York', 'UTC']) {
      withTimeZone(zone, () => {
        const files = goodFiles({
          [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026-02-31T00:00:00.000' }),
        });

        expect(() => readBackupContents('ja', files)).toThrow(BackupError);
      });
    }
  });
});

describe('§2.3 暦として実在するかの判定', () => {
  /** その日付 1 つだけを差し替えた 5 ファイルが読めるか */
  function accepts(date: string): boolean {
    try {
      readBackupContents('ja', goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: date }) }));
      return true;
    } catch {
      return false;
    }
  }

  it('うるう年の 2 月 29 日は通り、平年の 2 月 29 日は弾く', () => {
    expect(accepts('2028-02-29T00:00:00.000')).toBe(true);
    expect(accepts('2026-02-29T00:00:00.000')).toBe(false);
  });

  it('100 年ごとの例外まで見る（2100 年は平年、2000 年はうるう年）', () => {
    expect(accepts('2100-02-29T00:00:00.000')).toBe(false);
    expect(accepts('2000-02-29T00:00:00.000')).toBe(true);
  });

  it('月ごとの日数を見る（4 月 31 日は無い）', () => {
    expect(accepts('2026-04-30T00:00:00.000')).toBe(true);
    expect(accepts('2026-04-31T00:00:00.000')).toBe(false);
  });

  it('月と日の 0 と 13 月を弾く', () => {
    expect(accepts('2026-00-10T00:00:00.000')).toBe(false);
    expect(accepts('2026-13-10T00:00:00.000')).toBe(false);
    expect(accepts('2026-08-00T00:00:00.000')).toBe(false);
  });

  it('時刻の範囲を見る（24 時・60 分・60 秒は無い）', () => {
    expect(accepts('2026-08-01T23:59:59.999')).toBe(true);
    expect(accepts('2026-08-01T24:00:00.000')).toBe(false);
    expect(accepts('2026-08-01T12:60:00.000')).toBe(false);
    expect(accepts('2026-08-01T12:00:60.000')).toBe(false);
  });
});

// ---- §3.3 エラーの文言は locale で切り替わる ----
//
// **これも取りこぼしの回帰テスト。** 検証の文言だけ `'ja'` で固定されていたので、
// 英語で使っている人には**復元のエラーだけ日本語**で出ていた。
// 直し方は他の画面と同じで、locale を引数で受け取る（i18n/frozenJapanese.test.ts）。

describe('§3.3 復元のエラーは表示言語で出る', () => {
  it('列の食い違い', () => {
    const broken = buildBackupFile(BACKUP_RECORDS_FILE, [RECORD_ROW]).replace('item_name', 'name');
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: broken });

    expect(() => readBackupContents('en', files)).toThrow(/has a wrong column name/);
    expect(() => readBackupContents('ja', files)).toThrow(/列名が違います/);
  });

  it('値が読めない（数値・日付・真偽）', () => {
    const number = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sales_price: '1,500' }) });
    const date = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sale_start_date: '2026/8/9' }) });
    const boolean = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ is_sold: 'true' }) });

    expect(() => readBackupContents('en', number)).toThrow(/is not a valid number/);
    expect(() => readBackupContents('en', date)).toThrow(/is not a valid date/);
    expect(() => readBackupContents('en', boolean)).toThrow(/is neither 0 nor 1/);
  });

  it('**列の名前も英語で出る**（文の途中に日本語が混ざらない）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sales_price: 'abc' }) });

    let message = '';
    try {
      readBackupContents('en', files);
    } catch (error) {
      message = (error as BackupError).message;
    }

    expect(message).toBe('records.csv line 2: “Selling price” is not a valid number.');
    // 画面に出る 1 文まるごとを見る ── 「英語のキーワードを含む」だけの検査だと、
    // 列名が日本語のまま残っていても通ってしまう（実際にそこが残っていた）
    expect(message).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });

  it('日本語の文言はこれまでどおり（既存のバックアップの読み方は変えていない）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ sales_price: 'abc' }) });

    expect(() => readBackupContents('ja', files)).toThrow(
      'records.csv 2行目：「販売価格」が正しい数値ではありません。',
    );
  });

  it('決まった語のどれでもない（enum）', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ kind: 'unknown' }) });

    expect(() => readBackupContents('en', files)).toThrow(/is none of used \/ sourced/);
  });

  it('必須の列が空', () => {
    const files = goodFiles({ [BACKUP_RECORDS_FILE]: recordsWith({ id: '' }) });

    expect(() => readBackupContents('en', files)).toThrow(/is empty/);
  });

  it('ファイルが欠けている・空', () => {
    expect(() => readBackupContents('en', goodFiles({ [BACKUP_TAGS_FILE]: undefined }))).toThrow(
      /tags\.csv is missing/,
    );
    expect(() => readBackupContents('en', goodFiles({ [BACKUP_TAGS_FILE]: '' }))).toThrow(
      /tags\.csv is empty/,
    );
  });

  it('backup-info.csv が 1 行でない', () => {
    const info = buildBackupInfo({ records: 1, presets: 1, tags: 1, recordTags: 1 }, '2026-08-13T14:30:00.000', 0);
    const twoRows = info + info.split('\r\n')[1] + '\r\n';

    expect(() => readBackupContents('en', goodFiles({ [BACKUP_INFO_FILE]: twoRows }))).toThrow(
      /must have exactly one row/,
    );
  });

  it('知らないバージョン', () => {
    const info = buildBackupInfo({ records: 1, presets: 1, tags: 1, recordTags: 1 }, '2026-08-13T14:30:00.000', 0)
      .replace(`\r\n${BACKUP_FORMAT_VERSION},`, '\r\n99,');

    expect(() => readBackupContents('en', goodFiles({ [BACKUP_INFO_FILE]: info }))).toThrow(
      /is not supported/,
    );
  });

  it('参照先の無いタグ付け', () => {
    const files = goodFiles({
      [BACKUP_RECORD_TAGS_FILE]: buildBackupFile(BACKUP_RECORD_TAGS_FILE, [
        { record_id: 'r1', tag_id: 'missing' },
      ]),
    });

    expect(() => readBackupContents('en', files)).toThrow(/is not in tags\.csv/);
  });
});
