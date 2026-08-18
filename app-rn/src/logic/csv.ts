// CSV の組み立て（SPEC-V3 §5 / SPEC-V4 §5）。**純粋関数だけを置く。**
// DB も expo-file-system も触らない ── 引数は「記録の配列」と「記録 ID → タグ名」の 2 つで、
// 返すのは文字列。書き出しの経路（一時ファイル・共有シート）は screens 側の責務（§5.6）。
//
// **書き出しは 2 種類**（SPEC-V3 §5.2 の改訂）:
//
//   | 種類 | 列 | 用途 |
//   |---|---|---|
//   | `backup`（データ保存用） | 19 列 | バックアップ・表計算で自分で集計する |
//   | `tax`（確定申告用）      | 11 列 | 帳簿の材料。経費を**項目ごとに**分けた形 |
//
// 当初は「1 パターンに統一する」（§5.2 案 A）と決めていたが覆した。理由は §5.2 の改訂欄に置く。
// メモとタグが `tax` に入らないのは、帳簿に関係がなく個人的な記述が混ざるため。
//
// **まとめ方（grouping）は `tax` のときだけ 2 通り**（§5.2.2）:
//   - `record`（既定）… 1 行 = 1 記録
//   - `day`          … 同じ日の記録を 1 行に合算（国税庁が認める「日々の合計金額のみ」の形）
// `backup` に `day` を出さないのは、メモとタグが合算できないため。
//
// 書式（§5.4）: ヘッダ行あり / CRLF / RFC 4180 の引用 / **桁区切りなし**の素の数値 /
// 日付は `YYYY-MM-DD` / 空値は空文字。文字コードの BOM は `toCsvFileContent` が付ける。
//
// **入口は `buildCsvTable`（行の配列）で、`buildCsv`（文字列）はそれを繋ぐだけ**（§5.9）。
// プレビューの表とファイルが同じ 1 本からデータを取るようにするための形で、
// CSV の文字列を作ってから分割し直す経路は持たない。
//
// 丸め（§5.4・決定 §8-7）: **各列を先に整数へ丸め、経費合計はその和、収支は 販売価格 − 経費合計。**
// CSV の中で足し算が合う方を採る決定なので、`day` でも同じ ──
// **合算は丸めなしの生の値で行い、丸めるのは列ごとに 1 回だけ**（決定 §7-2 / §2.6）。
// 合算後に丸めた列どうしなら、表計算で縦に足しても横に引いても合う。

import type { RecordKind, SaleRecord } from '@/db/schema';

import {
  CSV_BACKUP_COLUMNS,
  csvKindMixedLabel,
  CSV_LISTING_STATUS_VALUE,
  CSV_SOLD_STATUS_VALUE,
  CSV_TAG_SEPARATOR,
  CSV_TAX_COLUMNS,
  csvDaySiteNames,
  csvDayItemNames,
  recordKindLabel,
} from './labels';
import { commissionCost, roundForDisplay } from './profit';

/** 書き出しの種類（§5.2 の改訂）。ファイル名も列もこれで決まる */
export type CsvExportKind = 'backup' | 'tax';

/** まとめ方（§5.2.2）。`backup` は常に `record`（選択肢を出さない） */
export type CsvGrouping = 'record' | 'day';

/** 改行は CRLF 固定（§5.4。RFC 4180 / Excel の互換が最も広い） */
const CRLF = '\r\n';

/**
 * UTF-8 の BOM（§5.4）。これが無いと Windows 版 Excel が Shift_JIS と誤認して日本語が化ける。
 * **文字列の側に付ける** ── `expo-file-system` の `File.write(string)` は UTF-8 で書くだけで、
 * BOM を付ける口を持たないため。
 */
export const CSV_BOM = '﻿';

/** 保存する 1 ファイルぶんの中身（BOM ＋ 本文）。ファイルへ書くのはこれ */
export function toCsvFileContent(body: string): string {
  return CSV_BOM + body;
}

/** 種類ごとの列名（§5.3 / §5.3.1）。ヘッダ行そのもの */
export function csvColumns(kind: CsvExportKind): readonly string[] {
  return kind === 'tax' ? CSV_TAX_COLUMNS : CSV_BACKUP_COLUMNS;
}

/**
 * RFC 4180 の引用（§5.4）。`,` `"` 改行のいずれかを含む値だけを `"` で囲み、
 * 内部の `"` は `""` に重ねる。商品名・メモにカンマと改行が入り得る。
 *
 * **囲む必要のない値は囲まない** ── 全部囲んでも規格上は正しいが、
 * 書き出したファイルをそのまま人が読む場面（メールに添付して確認する）で読みづらくなる。
 */
export function escapeCsvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** 1 行ぶん。値はすべて文字列にしてから渡す（数値の書式は呼び出し側の責務） */
function toCsvLine(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * 金額の列（§5.4 の「桁区切りなし・通貨記号なし」）。
 * 丸めは呼び出し側で済んでいる前提で、ここは文字列にするだけ。
 */
function toAmountField(value: number): string {
  return String(value);
}

/**
 * 手数料率（§5.3-11）。**率は額と別列**で、小数を持ち得る（決定 §8-12）。
 * 金額と違って丸めない ── 10.5% を 11 にしたら率ではなくなる。
 */
function toRateField(value: number): string {
  return String(value);
}

/** 日付の列（§5.4）。保存値 "YYYY-MM-DDTHH:mm:ss.SSS" の先頭 10 文字。null は空文字 */
function toDateField(value: string | null): string {
  return value == null ? '' : value.slice(0, DATE_FIELD_LENGTH);
}

/** `YYYY-MM-DD` の文字数 */
const DATE_FIELD_LENGTH = 10;

/**
 * 期間の判定・並び・日ごとのまとめに使う基準日（§5.5 / 決定 §8-8）。
 * 売れた記録は販売日、出品中は出品日。一覧・データタブと同じ「基準日」の規則。
 */
export function basisDate(record: SaleRecord): string {
  if (record.isSold) return record.saleDate ?? record.saleStartDate;
  return record.saleStartDate;
}

/** 基準日の暦日（`YYYY-MM-DD`）。日ごとのまとめのキー */
function basisDay(record: SaleRecord): string {
  return basisDate(record).slice(0, DATE_FIELD_LENGTH);
}

// ---- 金額（§5.4 の丸め規則） ----

/** 丸める前の 6 つの金額。合算はこの形のまま行う（決定 §7-2） */
type RawAmounts = {
  salesPrice: number;
  purchasePrice: number;
  postage: number;
  commissionCost: number;
  envelopeCost: number;
  othersCost: number;
};

/** 丸めたあとの金額。経費合計と収支は**丸めた列から**作る（決定 §8-7） */
type CsvAmounts = RawAmounts & {
  totalExpenses: number;
  netProfit: number;
};

const ZERO_AMOUNTS: RawAmounts = {
  salesPrice: 0,
  purchasePrice: 0,
  postage: 0,
  commissionCost: 0,
  envelopeCost: 0,
  othersCost: 0,
};

/** 1 記録ぶんの生の金額。手数料額だけは計算値（§5.3-6。式は profit.ts から借りる） */
function rawAmountsOf(record: SaleRecord): RawAmounts {
  return {
    salesPrice: record.salesPrice,
    purchasePrice: record.purchasePrice,
    postage: record.postage,
    commissionCost: commissionCost(record),
    envelopeCost: record.envelopeCost,
    othersCost: record.othersCost,
  };
}

/** 生の値のまま足す（丸めない）。日ごとのまとめで使う */
function sumRawAmounts(records: readonly SaleRecord[]): RawAmounts {
  return records.reduce<RawAmounts>((acc, record) => {
    const raw = rawAmountsOf(record);
    return {
      salesPrice: acc.salesPrice + raw.salesPrice,
      purchasePrice: acc.purchasePrice + raw.purchasePrice,
      postage: acc.postage + raw.postage,
      commissionCost: acc.commissionCost + raw.commissionCost,
      envelopeCost: acc.envelopeCost + raw.envelopeCost,
      othersCost: acc.othersCost + raw.othersCost,
    };
  }, ZERO_AMOUNTS);
}

/**
 * 列ごとに 1 回だけ丸め、経費合計と収支を**丸めた列から**組み立てる（決定 §8-7 / §7-2）。
 * 日ごとにまとめた行でもここを通すので、丸めの回数は 1 行につき列の数ぶんで変わらない。
 */
export function toCsvAmounts(raw: RawAmounts): CsvAmounts {
  const rounded: RawAmounts = {
    salesPrice: roundForDisplay(raw.salesPrice),
    purchasePrice: roundForDisplay(raw.purchasePrice),
    postage: roundForDisplay(raw.postage),
    commissionCost: roundForDisplay(raw.commissionCost),
    envelopeCost: roundForDisplay(raw.envelopeCost),
    othersCost: roundForDisplay(raw.othersCost),
  };
  const totalExpenses =
    rounded.purchasePrice +
    rounded.postage +
    rounded.commissionCost +
    rounded.envelopeCost +
    rounded.othersCost;

  return { ...rounded, totalExpenses, netProfit: rounded.salesPrice - totalExpenses };
}

// ---- 日ごとのまとめ（§5.2.2） ----

/**
 * 日ごとにまとめた 1 行ぶん。
 *
 * **キーは「基準日」と「状態」の 2 つ**（§5.2.2）── 出品中を含めたとき、同じ日の
 * 出品中の記録を売れた記録に混ぜると、販売日の列に出品日が入ってしまう。
 * 分けておけば、出品中の行は販売日が空のまま（1 件ずつのときと同じ）で済む。
 */
export type CsvDayGroup = {
  /** 基準日 `YYYY-MM-DD`。売れた行は販売日、出品中の行は出品日 */
  day: string;
  isSold: boolean;
  records: SaleRecord[];
};

/**
 * 同じ日・同じ状態の記録をまとめる（§5.2.2）。並びは基準日の昇順（§5.4）で、
 * 同じ日は売れた記録を先に置く（1 列目が埋まっている行から読める）。
 */
export function groupRecordsByDay(records: readonly SaleRecord[]): CsvDayGroup[] {
  const groups = new Map<string, CsvDayGroup>();
  for (const record of records) {
    const day = basisDay(record);
    const key = `${day} ${record.isSold ? '1' : '0'}`;
    const group = groups.get(key);
    if (group) group.records.push(record);
    else groups.set(key, { day, isSold: record.isSold, records: [record] });
  }

  return [...groups.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || Number(b.isSold) - Number(a.isSold),
  );
}

/** 混在していれば「混在」、同じなら種別名（§5.2.2） */
function dayKindField(records: readonly SaleRecord[]): string {
  const kinds = new Set<RecordKind>(records.map((record) => record.kind));
  const [only] = [...kinds];
  return kinds.size === 1 ? recordKindLabel('ja', only) : csvKindMixedLabel('ja');
}

// ---- 行の組み立て ----

/**
 * 目標利益の列（SPEC-V9 §3）。**決めていない記録は空欄**で、0 とは書かない ──
 * 「目標 0 円」と書いてある行と区別できなくなるため（日付の null と同じ扱い）。
 * 既に整数で保存されているので丸めない。
 */
function toTargetProfitField(value: number | null): string {
  return value == null ? '' : String(value);
}

/** データ保存用の 1 行（19 列。§5.3 ＋ SPEC-V9 §3） */
function backupRow(record: SaleRecord, tagNames: readonly string[]): string[] {
  const amounts = toCsvAmounts(rawAmountsOf(record));
  return [
    toDateField(record.saleDate),
    record.itemName,
    toAmountField(amounts.salesPrice),
    toAmountField(amounts.purchasePrice),
    toAmountField(amounts.postage),
    toAmountField(amounts.commissionCost),
    toAmountField(amounts.envelopeCost),
    toAmountField(amounts.othersCost),
    toAmountField(amounts.totalExpenses),
    toAmountField(amounts.netProfit),
    toTargetProfitField(record.targetProfit),
    toRateField(record.commission),
    record.siteName,
    recordKindLabel('ja', record.kind),
    tagNames.join(CSV_TAG_SEPARATOR),
    record.isSold ? CSV_SOLD_STATUS_VALUE : CSV_LISTING_STATUS_VALUE,
    toDateField(record.saleStartDate),
    record.memo,
    record.id,
  ];
}

/** 確定申告用の 1 行・1 件ずつ（11 列。§5.3.1） */
function taxRow(record: SaleRecord): string[] {
  const amounts = toCsvAmounts(rawAmountsOf(record));
  return [
    toDateField(record.saleDate),
    record.siteName,
    record.itemName,
    recordKindLabel('ja', record.kind),
    toAmountField(amounts.salesPrice),
    toAmountField(amounts.purchasePrice),
    toAmountField(amounts.postage),
    toAmountField(amounts.envelopeCost),
    toAmountField(amounts.othersCost),
    toAmountField(amounts.commissionCost),
    toAmountField(amounts.netProfit),
  ];
}

/** 確定申告用の 1 行・日ごとにまとめたもの（11 列。§5.2.2） */
function taxDayRow(group: CsvDayGroup): string[] {
  const amounts = toCsvAmounts(sumRawAmounts(group.records));
  return [
    // 出品中の行は販売日を空のままにする（グループを状態で分けてある理由。CsvDayGroup 参照）
    group.isSold ? group.day : '',
    // CSV の中身はまだ日本語のまま（列名も CSV_TAX_COLUMNS で固定）。隣の行と同じく 'ja' を渡す
    csvDaySiteNames('ja', group.records.map((record) => record.siteName)),
    csvDayItemNames('ja', group.records.map((record) => record.itemName)),
    dayKindField(group.records),
    toAmountField(amounts.salesPrice),
    toAmountField(amounts.purchasePrice),
    toAmountField(amounts.postage),
    toAmountField(amounts.envelopeCost),
    toAmountField(amounts.othersCost),
    toAmountField(amounts.commissionCost),
    toAmountField(amounts.netProfit),
  ];
}

export type BuildCsvParams = {
  kind: CsvExportKind;
  /** `backup` では常に `record`（呼び出し側が保証する。UI にも選択肢を出さない） */
  grouping: CsvGrouping;
  /** 書き出す記録。**並びは呼び出し側（repository）が基準日の昇順にしてある**（§5.4） */
  records: readonly SaleRecord[];
  /** 記録 ID → タグ名（`tags.sortOrder` 昇順。SPEC-V4 §5.4）。`tax` では読まない */
  tagsByRecord?: ReadonlyMap<string, readonly string[]>;
  /**
   * データ行の上限（プレビューの先頭 3 行。§5.9）。省略 = 全行。
   * **ヘッダ行は数に入れない。** 打ち切るのは行の組み立てが済んだ後なので、
   * 値そのものは全行ぶんと同じものが出る。
   */
  limit?: number;
};

/**
 * CSV の中身を**行の配列**として組み立てる（§5.9）。
 *
 * **文字列にする前の形をここで返すのが要点。** プレビュー（画面の表）と書き出し（ファイル）が
 * 同じ 1 本からデータを取るようにするため ── CSV の文字列を作ってから分割し直す形にすると、
 * 引用（§5.4）を解く処理をプレビュー側が持つことになり、片方だけ直したときに食い違う。
 * `buildCsv` はこの結果を繋ぐだけになっている。
 */
export function buildCsvTable(params: BuildCsvParams): CsvTable {
  const { kind, grouping, records, tagsByRecord, limit } = params;

  const rows: string[][] =
    kind === 'tax'
      ? grouping === 'day'
        ? groupRecordsByDay(records).map(taxDayRow)
        : records.map(taxRow)
      : records.map((record) => backupRow(record, tagsByRecord?.get(record.id) ?? []));

  return {
    header: [...csvColumns(kind)],
    rows: limit == null ? rows : rows.slice(0, limit),
  };
}

/** 行の配列としての CSV（ヘッダ ＋ データ行）。画面もファイルもこの形から作る */
export type CsvTable = {
  /** 列名（§5.3 / §5.3.1） */
  header: string[];
  /** データ行。値は**ファイルに書かれるのと同じ文字列**（引用は付いていない生の値） */
  rows: string[][];
};

/**
 * CSV の本文（ヘッダ行 ＋ データ行）。BOM は付けない（`toCsvFileContent` の責務）。
 *
 * 末尾にも改行を 1 つ置く ── RFC 4180 は任意としているが、無いと
 * `cat` で繋いだときや一部のツールで最終行が次の行と繋がる。
 */
export function buildCsv(params: BuildCsvParams): string {
  const table = buildCsvTable(params);
  return [table.header, ...table.rows].map(toCsvLine).join(CRLF) + CRLF;
}

/**
 * 書き出される**行数**（ヘッダを除く）。シート下部の予告に使う（§5.7）。
 * 記録の件数とは別の数 ── 日ごとにまとめると行の方が少なくなる。
 */
export function csvRowCount(
  records: readonly SaleRecord[],
  kind: CsvExportKind,
  grouping: CsvGrouping,
): number {
  if (kind === 'tax' && grouping === 'day') return groupRecordsByDay(records).length;
  return records.length;
}
