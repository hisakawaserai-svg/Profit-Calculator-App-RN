// SPEC-V3 §5 / SPEC-V4 §5 の CSV 組み立ての単体テスト:
//   - 2 種類の列（データ保存用 18 列 / 確定申告用 11 列）と、タグ・メモの出し分け
//   - RFC 4180 のエスケープ（カンマ・引用符・改行）
//   - 桁区切りなしの素の数値（表計算が数値として読めること）
//   - 日ごとにまとめたときの合算と、**丸めが列ごとに 1 回だけ**であること
//   - 「ほか N件」の畳み方（サイト・商品名・種別の混在）
//   - BOM ＋ CRLF

import { describe, expect, it } from 'vitest';

import type { SaleRecord } from '@/db/schema';

import {
  buildCsv,
  csvColumns,
  csvRowCount,
  CSV_BOM,
  escapeCsvField,
  groupRecordsByDay,
  toCsvFileContent,
  buildCsvTable,
} from './csv';

const record = (over: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 'r1',
  itemName: 'えんぴつ',
  salesPrice: 1000,
  purchasePrice: 0,
  postage: 0,
  envelopeCost: 0,
  othersCost: 0,
  commission: 0,
  isSold: true,
  saleStartDate: '2026-08-01T12:00:00.000',
  saleDate: '2026-08-09T12:00:00.000',
  memo: '',
  kind: 'used',
  siteName: '',
  ...over,
});

/** ヘッダを除いたデータ行を、列ごとに分けて返す（引用の無い値だけを見るテスト用） */
function dataRows(csv: string): string[][] {
  const lines = csv.split('\r\n');
  // 先頭がヘッダ、末尾は終端の改行による空文字
  return lines.slice(1, -1).map((line) => line.split(','));
}

describe('§5.3 列: 種類ごとに列が変わる', () => {
  it('データ保存用は 18 列で、先頭 3 列が 販売日 / 商品名 / 販売価格（§5.2 の固定）', () => {
    const columns = csvColumns('backup');
    expect(columns).toHaveLength(18);
    expect(columns.slice(0, 3)).toEqual(['販売日', '商品名', '販売価格']);
    expect(columns.at(-1)).toBe('記録ID');
  });

  it('確定申告用は 11 列。帳簿の並び（年月日 → 相手方 → 内容）で始まる', () => {
    const columns = csvColumns('tax');
    expect(columns).toHaveLength(11);
    expect(columns.slice(0, 4)).toEqual(['販売日', '販売サイト', '商品名', '種別']);
  });

  it('確定申告用は経費を項目ごとに分け、合算した 1 列を持たない', () => {
    const columns = csvColumns('tax');
    expect(columns).toContain('送料');
    expect(columns).toContain('梱包材');
    expect(columns).toContain('その他');
    expect(columns).toContain('販売手数料');
    expect(columns).not.toContain('経費合計');
  });

  it('確定申告用にはメモとタグを出さない（帳簿に関係がなく個人的な記述が混ざる）', () => {
    const columns = csvColumns('tax');
    expect(columns).not.toContain('メモ');
    expect(columns).not.toContain('タグ');
    expect(columns).not.toContain('記録ID');
  });

  it('ヘッダ行は csvColumns そのもの', () => {
    const csv = buildCsv({ kind: 'tax', grouping: 'record', records: [] });
    expect(csv).toBe(`${csvColumns('tax').join(',')}\r\n`);
  });
});

describe('§5.3 値: 記録の内容がそのまま列に入る', () => {
  it('データ保存用は 18 列すべてを埋める（タグは「・」区切り。SPEC-V4 §5.2）', () => {
    const csv = buildCsv({
      kind: 'backup',
      grouping: 'record',
      records: [
        record({
          salesPrice: 1000,
          purchasePrice: 200,
          postage: 175,
          envelopeCost: 8,
          othersCost: 12,
          commission: 10,
          siteName: 'メルカリ',
          kind: 'sourced',
        }),
      ],
      tagsByRecord: new Map([['r1', ['洋服', '春夏物']]]),
    });

    expect(dataRows(csv)[0]).toEqual([
      '2026-08-09', // 販売日（保存値の先頭 10 文字）
      'えんぴつ',
      '1000',
      '200',
      '175',
      '100', // 販売手数料 = 1000 × 10%
      '8',
      '12',
      '495', // 経費合計 = 200 + 175 + 100 + 8 + 12
      '505', // 収支 = 1000 − 495
      '10', // 手数料率(%)
      'メルカリ',
      '仕入品',
      '洋服・春夏物',
      '売れた',
      '2026-08-01',
      '',
      'r1',
    ]);
  });

  it('確定申告用は 11 列。手数料は末尾で、経費合計の列は無い', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'record',
      records: [
        record({ salesPrice: 1000, postage: 175, envelopeCost: 8, commission: 10, siteName: 'メルカリ' }),
      ],
    });

    expect(dataRows(csv)[0]).toEqual([
      '2026-08-09',
      'メルカリ',
      'えんぴつ',
      '不用品',
      '1000',
      '0',
      '175',
      '8',
      '0',
      '100',
      '717', // 収支 = 1000 − (0 + 175 + 100 + 8 + 0)
    ]);
  });

  it('出品中の記録は販売日が空文字（§5.4 の「空値は空文字」）', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'record',
      records: [record({ isSold: false, saleDate: null })],
    });
    expect(dataRows(csv)[0][0]).toBe('');
  });

  it('タグが 1 件も付いていない記録は空文字（SPEC-V4 §5.2）', () => {
    const csv = buildCsv({ kind: 'backup', grouping: 'record', records: [record()] });
    expect(dataRows(csv)[0][13]).toBe('');
  });
});

describe('§5.4 書式', () => {
  it('金額に桁区切りを入れない（表計算が数値として読めなくなる）', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'record',
      records: [record({ salesPrice: 12685 })],
    });
    expect(dataRows(csv)[0][4]).toBe('12685');
    expect(csv).not.toContain('12,685');
  });

  it('手数料率は丸めない（10.5% を 11 にしたら率ではなくなる）', () => {
    const csv = buildCsv({
      kind: 'backup',
      grouping: 'record',
      records: [record({ commission: 10.5 })],
    });
    expect(dataRows(csv)[0][10]).toBe('10.5');
  });

  it('改行は CRLF で、末尾にも 1 つ置く', () => {
    const csv = buildCsv({ kind: 'tax', grouping: 'record', records: [record()] });
    expect(csv.split('\r\n')).toHaveLength(3); // ヘッダ + 1 行 + 終端
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('ファイルの中身には BOM が付く（Windows 版 Excel の文字化け対策）', () => {
    const body = buildCsv({ kind: 'tax', grouping: 'record', records: [] });
    const content = toCsvFileContent(body);
    expect(content.startsWith(CSV_BOM)).toBe(true);
    expect(content.slice(1)).toBe(body);
    // BOM は U+FEFF の 1 文字
    expect(CSV_BOM).toBe('﻿');
  });
});

describe('§5.4 エスケープ（RFC 4180）', () => {
  it('囲む必要のない値は囲まない', () => {
    expect(escapeCsvField('えんぴつ')).toBe('えんぴつ');
    expect(escapeCsvField('')).toBe('');
  });

  it('カンマ・引用符・改行を含む値だけを囲み、内部の " は "" に重ねる', () => {
    expect(escapeCsvField('えんぴつ, 2本')).toBe('"えんぴつ, 2本"');
    expect(escapeCsvField('12"の定規')).toBe('"12""の定規"');
    expect(escapeCsvField('1行目\n2行目')).toBe('"1行目\n2行目"');
    expect(escapeCsvField('CR\r入り')).toBe('"CR\r入り"');
  });

  it('商品名とメモに入ったカンマ・改行が行を壊さない', () => {
    const csv = buildCsv({
      kind: 'backup',
      grouping: 'record',
      records: [record({ itemName: 'えんぴつ,2本', memo: '傷あり\n値下げ済み' })],
    });
    expect(csv).toContain('"えんぴつ,2本"');
    expect(csv).toContain('"傷あり\n値下げ済み"');
  });
});

describe('§5.4 丸め: 列ごとに 1 回だけ（決定 §8-7 / §7-2）', () => {
  it('1 件ずつでも、経費合計と収支は丸めた列から作るので CSV の中で足し算が合う', () => {
    // 手数料 = 1000 × 3.33% = 33.3 → 33
    const csv = buildCsv({
      kind: 'backup',
      grouping: 'record',
      records: [record({ salesPrice: 1000, commission: 3.33 })],
    });
    const row = dataRows(csv)[0];
    expect(row[5]).toBe('33'); // 販売手数料
    expect(row[8]).toBe('33'); // 経費合計
    expect(row[9]).toBe('967'); // 収支 = 1000 − 33
    expect(Number(row[2]) - Number(row[8])).toBe(Number(row[9]));
  });

  it('日ごとにまとめたときは合算してから 1 回だけ丸める', () => {
    // 手数料は 1 件ずつ丸めると 33 + 33 = 66 だが、
    // 合算してから丸めると 66.6 → 67 になる。後者を採る
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', salesPrice: 1000, commission: 3.33 }),
        record({ id: 'b', salesPrice: 1000, commission: 3.33 }),
      ],
    });
    const row = dataRows(csv)[0];
    expect(row[9]).toBe('67'); // 販売手数料
    expect(row[4]).toBe('2000'); // 販売価格
    expect(row[10]).toBe('1933'); // 収支 = 2000 − 67
  });

  it('日ごとにまとめても、行の中で 販売価格 − 経費の各列 = 収支 が成り立つ', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', salesPrice: 1500, purchasePrice: 300, postage: 175, commission: 6.6 }),
        record({ id: 'b', salesPrice: 980, purchasePrice: 120, envelopeCost: 8.5, commission: 6.6 }),
      ],
    });
    const [sales, purchase, postage, envelope, others, commission, profit] = dataRows(csv)[0]
      .slice(4)
      .map(Number);
    expect(sales - (purchase + postage + envelope + others + commission)).toBe(profit);
  });
});

describe('§5.2.2 日ごとにまとめる', () => {
  const day1 = '2026-08-09T09:00:00.000';
  const day2 = '2026-08-10T09:00:00.000';

  it('同じ日の記録が 1 行になり、基準日の昇順で並ぶ', () => {
    const groups = groupRecordsByDay([
      record({ id: 'c', saleDate: day2 }),
      record({ id: 'a', saleDate: day1 }),
      record({ id: 'b', saleDate: day1 }),
    ]);
    expect(groups.map((group) => group.day)).toEqual(['2026-08-09', '2026-08-10']);
    expect(groups[0].records.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('出品中の記録は同じ日でも別の行にする（販売日の列に出品日を入れないため）', () => {
    const groups = groupRecordsByDay([
      record({ id: 'a', saleDate: day1 }),
      record({ id: 'b', isSold: false, saleDate: null, saleStartDate: day1 }),
    ]);
    expect(groups).toHaveLength(2);
    // 売れた行が先。出品中の行は販売日が空のまま
    expect(groups.map((group) => group.isSold)).toEqual([true, false]);

    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', saleDate: day1 }),
        record({ id: 'b', isSold: false, saleDate: null, saleStartDate: day1 }),
      ],
    });
    expect(dataRows(csv).map((row) => row[0])).toEqual(['2026-08-09', '']);
  });

  it('販売サイトは名前の種類で畳む（1 つなら名前だけ / 複数なら「ほか N件」）', () => {
    const oneSite = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', siteName: 'メルカリ' }),
        record({ id: 'b', siteName: 'メルカリ' }),
      ],
    });
    expect(dataRows(oneSite)[0][1]).toBe('メルカリ');

    const twoSites = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', siteName: 'メルカリ' }),
        record({ id: 'b', siteName: 'ラクマ' }),
      ],
    });
    expect(dataRows(twoSites)[0][1]).toBe('メルカリ ほか1件');
  });

  it('販売サイトが未設定だけの日は空文字（語を足さない）', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [record({ id: 'a' }), record({ id: 'b' })],
    });
    expect(dataRows(csv)[0][1]).toBe('');
  });

  it('商品名は「先頭の 1 件 ＋ 残りの件数」（同じ名前でも件数で数える）', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [
        record({ id: 'a', itemName: 'えんぴつ' }),
        record({ id: 'b', itemName: 'えんぴつ' }),
        record({ id: 'c', itemName: 'ノート' }),
      ],
    });
    expect(dataRows(csv)[0][2]).toBe('えんぴつ ほか2件');
  });

  it('商品名が空の記録は「無題」（一覧と同じ語）', () => {
    const csv = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [record({ id: 'a', itemName: '' })],
    });
    expect(dataRows(csv)[0][2]).toBe('無題');
  });

  it('種別は同じなら種別名、混ざっていれば「混在」', () => {
    const same = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [record({ id: 'a', kind: 'used' }), record({ id: 'b', kind: 'used' })],
    });
    expect(dataRows(same)[0][3]).toBe('不用品');

    const mixed = buildCsv({
      kind: 'tax',
      grouping: 'day',
      records: [record({ id: 'a', kind: 'used' }), record({ id: 'b', kind: 'sourced' })],
    });
    expect(dataRows(mixed)[0][3]).toBe('混在');
  });

  it('データ保存用では日ごとにまとめない（メモやタグを合算できないため）', () => {
    const csv = buildCsv({
      kind: 'backup',
      grouping: 'day',
      records: [record({ id: 'a', saleDate: day1 }), record({ id: 'b', saleDate: day1 })],
    });
    expect(dataRows(csv)).toHaveLength(2);
  });
});

describe('§5.7 行数の予告', () => {
  const day1 = '2026-08-09T09:00:00.000';
  const records = [
    record({ id: 'a', saleDate: day1 }),
    record({ id: 'b', saleDate: day1 }),
    record({ id: 'c', saleDate: '2026-08-10T09:00:00.000' }),
  ];

  it('1 件ずつなら記録の数と同じ', () => {
    expect(csvRowCount(records, 'tax', 'record')).toBe(3);
    expect(csvRowCount(records, 'backup', 'record')).toBe(3);
  });

  it('日ごとにまとめると行の方が少なくなる', () => {
    expect(csvRowCount(records, 'tax', 'day')).toBe(2);
  });

  it('データ保存用ではまとめ方を指定しても記録の数のまま', () => {
    expect(csvRowCount(records, 'backup', 'day')).toBe(3);
  });
});

describe('§5.9 プレビューと書き出しが同じデータを見る（案 40a / 40c）', () => {
  const records = [
    record({ id: 'a', itemName: 'えんぴつ,2本', memo: '傷あり\n値下げ済み', siteName: 'メルカリ' }),
    record({ id: 'b', itemName: 'ノート', saleDate: '2026-08-10T09:00:00.000' }),
    record({ id: 'c', itemName: '定規', saleDate: '2026-08-11T09:00:00.000' }),
    record({ id: 'd', itemName: '消しゴム', saleDate: '2026-08-12T09:00:00.000' }),
  ];
  const tagsByRecord = new Map([['a', ['洋服', '春夏物']]]);

  it('buildCsv は buildCsvTable を繋いだものになっている（組み立ての経路が 1 本）', () => {
    const params = { kind: 'backup' as const, grouping: 'record' as const, records, tagsByRecord };
    const table = buildCsvTable(params);
    const csv = buildCsv(params);

    // ヘッダ行 ＋ データ行 ＋ 終端の空文字
    expect(csv.split('\r\n')).toHaveLength(table.rows.length + 2);
    expect(csv.split('\r\n')[0]).toBe(table.header.join(','));
    // 引用の要らない行は、表のセルを繋いだものとそのまま一致する
    expect(csv.split('\r\n')[2]).toBe(table.rows[1].join(','));
  });

  it('引用が要る値も、表のセルは引用前の生の値（画面にはそのまま出す）', () => {
    const params = { kind: 'backup' as const, grouping: 'record' as const, records, tagsByRecord };
    const table = buildCsvTable(params);

    expect(table.rows[0][1]).toBe('えんぴつ,2本');
    expect(table.rows[0][16]).toBe('傷あり\n値下げ済み');
    // ファイル側は同じ値を引用して書く
    expect(buildCsv(params)).toContain('"えんぴつ,2本"');
  });

  it('limit はデータ行だけを打ち切る（ヘッダは数に入らない）', () => {
    const table = buildCsvTable({ kind: 'tax', grouping: 'record', records, limit: 3 });
    expect(table.header).toEqual([...csvColumns('tax')]);
    expect(table.rows).toHaveLength(3);
  });

  it('打ち切った 3 行は、全行の先頭 3 行と同じ値（プレビュー = 書き出しの先頭）', () => {
    const params = { kind: 'backup' as const, grouping: 'record' as const, records, tagsByRecord };
    const full = buildCsvTable(params);
    const limited = buildCsvTable({ ...params, limit: 3 });

    expect(limited.rows).toEqual(full.rows.slice(0, 3));
  });

  it('日ごとにまとめたときも、打ち切りは**まとめた後**の行に効く', () => {
    const sameDay = [
      record({ id: 'a', salesPrice: 1000, saleDate: '2026-08-09T09:00:00.000' }),
      record({ id: 'b', salesPrice: 2000, saleDate: '2026-08-09T18:00:00.000' }),
      record({ id: 'c', salesPrice: 3000, saleDate: '2026-08-10T09:00:00.000' }),
    ];
    const table = buildCsvTable({ kind: 'tax', grouping: 'day', records: sameDay, limit: 1 });

    // 1 行目は 8/9 の 2 件を合算したもの（先頭 1 件で切ったものではない）
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][0]).toBe('2026-08-09');
    expect(table.rows[0][4]).toBe('3000');
  });

  it('limit を渡さなければ全行', () => {
    const table = buildCsvTable({ kind: 'tax', grouping: 'record', records });
    expect(table.rows).toHaveLength(records.length);
  });
});
