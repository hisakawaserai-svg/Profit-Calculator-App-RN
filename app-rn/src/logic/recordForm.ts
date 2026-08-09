// RecordFormView（新規追加 / 編集フォーム）の値の扱い。SPEC §3.2 / §5.2 / 決定 §7-7・§7-8。
//
// 画面（RecordFormSheet）から「入力値の組み立て・変換・バリデーション」を切り出した純粋関数。
// UI を起動せずに SPEC の保存条件を検証できるようにするのが目的で、
// DB への書き込みや saleDate の正規化（isSold=false → null）はここでは行わない。
// 正規化は repository 側の責務（SPEC §5.2 / src/db/repository.ts の normalizeSaleDate）。

import { fromDbDate } from '@/db/dates';
import type { SaveRecordInput } from '@/db/repository';
import type { SaleRecord } from '@/db/schema';

import { parseNumericInput } from './input';

/** 手数料 Stepper の初期値と範囲（SPEC §3.2 RecordFormView: 0〜50、初期 10） */
export const DEFAULT_COMMISSION = 10;
export const MIN_COMMISSION = 0;
export const MAX_COMMISSION = 50;

/** 商品名が空のときに商品名欄へ出す警告（SPEC §5.2）。他の欄には警告を出さない */
export const ITEM_NAME_REQUIRED_MESSAGE = '⚠️ 商品名を入力してください';

/** フォームの一時状態（Swift 版 RecordFormView の @State 群に対応） */
export type RecordFormValues = {
  itemName: string;
  /** 金額は入力中の文字列のまま持つ（sanitizeNumericInput 済みの値。SPEC §5.1） */
  salesPrice: string;
  purchasePrice: string;
  postage: string;
  envelopeCost: string;
  othersCost: string;
  /** 手数料「率」(%)。10 = 10% */
  commission: number;
  /** 出品日。RN 版では必須（決定 §7-11）。新規時の初期値は当日 */
  saleStartDate: Date;
  /**
   * 販売日。出品中でもフォーム上は保持しておき（トグルを戻したときに値が消えないように）、
   * 保存時に isSold=false なら repository が null 化する（SPEC §5.2）。
   */
  saleDate: Date;
  isSold: boolean;
  memo: string;
};

/**
 * 計算タブの＋ボタンから引き継ぐ入力値（SPEC §3.2 CalcView の prepareNewRecord 相当）。
 * 決定 §7-7 によりレコードは作らず、この値をフォームの初期値としてメモリ上で渡すだけ。
 */
export type InitialAmounts = Pick<
  RecordFormValues,
  'salesPrice' | 'purchasePrice' | 'postage' | 'envelopeCost' | 'othersCost' | 'commission'
>;

/**
 * 新規追加時の初期値。
 * isSold は常に false（決定 §7-8）、出品日・販売日は当日（決定 §7-11）。
 *
 * @param amounts 計算タブから引き継ぐ金額。省略時はすべて空欄・手数料 10%
 * @param now     テストから固定できるようにした「当日」
 */
export function newFormValues(
  amounts?: InitialAmounts,
  now: Date = new Date(),
): RecordFormValues {
  return {
    itemName: '',
    salesPrice: amounts?.salesPrice ?? '',
    purchasePrice: amounts?.purchasePrice ?? '',
    postage: amounts?.postage ?? '',
    envelopeCost: amounts?.envelopeCost ?? '',
    othersCost: amounts?.othersCost ?? '',
    commission: amounts?.commission ?? DEFAULT_COMMISSION,
    saleStartDate: now,
    saleDate: now,
    isSold: false,
    memo: '',
  };
}

/**
 * 保存済みの金額を入力欄の文字列に戻す。0 以下は空欄（Swift 版 loadInitialData と同じ）。
 *
 * Swift 版は `String(format: "%.0f")` で整数に丸めていたが、それだと 99.9 の記録を開いて
 * 保存し直しただけで 100 に変わってしまう。SPEC §2.6「保存値は Double のまま・丸めは表示時のみ」
 * に合わせ、RN 版は保存値をそのまま文字列にする。
 */
export function amountToInput(value: number): string {
  return value > 0 ? String(value) : '';
}

/** 編集時の初期値。DB のレコードをフォームの一時状態へ展開する */
export function recordToFormValues(
  record: SaleRecord,
  now: Date = new Date(),
): RecordFormValues {
  return {
    itemName: record.itemName,
    salesPrice: amountToInput(record.salesPrice),
    purchasePrice: amountToInput(record.purchasePrice),
    postage: amountToInput(record.postage),
    envelopeCost: amountToInput(record.envelopeCost),
    othersCost: amountToInput(record.othersCost),
    commission: record.commission,
    saleStartDate: fromDbDate(record.saleStartDate),
    // 出品中は saleDate が null（SPEC §1）。トグルを ON にしたときの初期表示は当日にする
    saleDate: record.saleDate == null ? now : fromDbDate(record.saleDate),
    isSold: record.isSold,
    memo: record.memo,
  };
}

/**
 * SPEC §5.2 の保存バリデーション。
 * 必須は商品名のみ（金額 0・メモ空でも保存可）。Swift 版 `itemName.isEmpty` と同じく trim はしない。
 */
export function canSave(values: RecordFormValues): boolean {
  return values.itemName !== '';
}

/** repository に渡す保存入力へ変換する。空文字・"." は 0 扱い（SPEC §5.1） */
export function toSaveInput(values: RecordFormValues): SaveRecordInput {
  const purchasePrice = parseNumericInput(values.purchasePrice);
  return {
    itemName: values.itemName,
    // SPEC-V2 Step 1 の暫定措置。フォームはまだ種別を持たない（Step 2 で
    // RecordFormValues.kind を追加して差し替える）ので、SPEC-V2 §2.2 のバックフィルと
    // 同じ規則で入力値から導出する。ここで一律 'used' にすると §2.4 の正規化が効いて
    // 入力済みの仕入価格が 0 で保存されてしまい、Step 1 の「見た目を変えない」条件を破る。
    kind: purchasePrice > 0 ? 'sourced' : 'used',
    salesPrice: parseNumericInput(values.salesPrice),
    purchasePrice,
    postage: parseNumericInput(values.postage),
    envelopeCost: parseNumericInput(values.envelopeCost),
    othersCost: parseNumericInput(values.othersCost),
    commission: values.commission,
    isSold: values.isSold,
    saleStartDate: values.saleStartDate,
    // isSold=false のときの null 化は repository に任せる（SPEC §5.2、二重実装しない）
    saleDate: values.saleDate,
    memo: values.memo,
  };
}
