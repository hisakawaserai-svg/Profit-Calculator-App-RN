// RecordFormView（新規追加 / 編集フォーム）の値の扱い。SPEC §3.2 / §5.2 / 決定 §7-7・§7-8。
//
// 画面（RecordFormSheet）から「入力値の組み立て・変換・バリデーション」を切り出した純粋関数。
// UI を起動せずに SPEC の保存条件を検証できるようにするのが目的で、
// DB への書き込みや saleDate の正規化（isSold=false → null）はここでは行わない。
// 正規化は repository 側の責務（SPEC §5.2 / src/db/repository.ts の normalizeSaleDate）。

import { fromDbDate } from '@/db/dates';
import type { SaveRecordInput } from '@/db/repository';
import type { RecordKind, SaleRecord } from '@/db/schema';

import { parseNumericInput } from './input';
import type { CostInput } from './profit';

/** 手数料 Stepper の初期値と範囲（SPEC §3.2 RecordFormView: 0〜50、初期 10） */
export const DEFAULT_COMMISSION = 10;
export const MIN_COMMISSION = 0;
export const MAX_COMMISSION = 50;

/** 商品名が空のときに商品名欄へ出す警告（SPEC §5.2）。他の欄には警告を出さない */
export const ITEM_NAME_REQUIRED_MESSAGE = '⚠️ 商品名を入力してください';

/** フォームの一時状態（Swift 版 RecordFormView の @State 群に対応） */
export type RecordFormValues = {
  itemName: string;
  /** レコード種別（SPEC-V2 §1.1）。'used' のとき仕入価格欄は出さない（§1.3） */
  kind: RecordKind;
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
  /**
   * 販売サイト名の写し（SPEC-V3 §1.5.1）。空文字 = 未設定。
   *
   * 入るのは**販売サイトのプリセットを選んだときだけ**で、率（commission）と同時に入る（§4.3）。
   * 手で率を変えても消さない ── 名前は利用者が付けた札で、率の微調整で無効になるものではない。
   * 消せるのは伝票カードの「✕」からだけ。計算にも集計にも入らない。
   */
  siteName: string;
  /**
   * 付けるタグの id（SPEC-V4 §3.1）。**空配列でも保存できる**（§0：必須にしない）。
   *
   * 並びは `tags.sortOrder` 昇順（§1.5）── 選択シートは一覧の並びのままチェックを付けるので、
   * ここも同じ順で入る。DB への書き込みは保存の瞬間だけで、フォームを開いている間は
   * この配列が正（UI-SPEC §8.6）。**タグ本体の新規作成だけは先に書き込む**（§3.2）が、
   * 記録との紐付けはここに載るまで DB に無い。
   */
  tagIds: string[];
};

/**
 * 計算タブの＋ボタンから引き継ぐ入力値（SPEC §3.2 CalcView の prepareNewRecord 相当）。
 * 決定 §7-7 によりレコードは作らず、この値をフォームの初期値としてメモリ上で渡すだけ。
 */
export type InitialAmounts = Pick<
  RecordFormValues,
  | 'kind'
  | 'salesPrice'
  | 'purchasePrice'
  | 'postage'
  | 'envelopeCost'
  | 'othersCost'
  | 'commission'
  // 計算タブで選んだ販売サイトの名前も引き継ぐ（§1.5.1）。率だけ渡すと、
  // 「この内容で記録する」を押した瞬間に札だけが落ちる
  | 'siteName'
>;

/**
 * 新規追加時の初期値。
 * isSold は常に false（決定 §7-8）、出品日・販売日は当日（決定 §7-11）。
 *
 * 種別の初期値は SPEC-V2 §1.4 のとおり 2 通りある:
 * 計算タブの＋からは画面で選択中の種別（= amounts.kind）を引き継ぎ、
 * それ以外（一覧・月別詳細の＋）は設定の既定種別を使う。
 *
 * @param defaultKind 設定の既定種別（SPEC-V2 §3.1）。amounts が種別を持たないときに使う
 * @param amounts     計算タブから引き継ぐ入力値。省略時はすべて空欄・手数料 10%
 * @param now         テストから固定できるようにした「当日」
 */
export function newFormValues(
  defaultKind: RecordKind,
  amounts?: InitialAmounts,
  now: Date = new Date(),
): RecordFormValues {
  return {
    itemName: '',
    kind: amounts?.kind ?? defaultKind,
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
    siteName: amounts?.siteName ?? '',
    // タグは常に 0 件から始まる（SPEC-V4 §3.4 / 決定 §9-4）。計算タブにはタグ行が無いので、
    // siteName のように引き継ぐ元も無い ── InitialAmounts が tagIds を持たないのはそのため
    tagIds: [],
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

/**
 * 編集時の初期値。DB のレコードをフォームの一時状態へ展開する。
 *
 * タグだけは `sale_records` の列ではなく中間テーブルにあるので、引いたものを外から渡す
 * （SPEC-V4 §3.1。tagRepository.tagIdsByRecord が sortOrder 昇順で返す）。
 * ここで DB を触らないのは、この関数が純粋関数だから。
 */
export function recordToFormValues(
  record: SaleRecord,
  now: Date = new Date(),
  tagIds: readonly string[] = [],
): RecordFormValues {
  return {
    itemName: record.itemName,
    // 編集時の種別はそのレコードの kind（SPEC-V2 §1.4）。設定の既定種別は使わない
    kind: record.kind,
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
    siteName: record.siteName,
    tagIds: [...tagIds],
  };
}

/**
 * 種別を切り替えたあとのフォーム値（SPEC-V2 §1.5）。
 *
 * - 仕入品 → 不用品: 入力済みの仕入価格をその場でクリアする。保存時に黙って 0 にする方式
 *   （値を保持したまま非表示）は採らない。見えない金額が経費に効き続ける状態を作らないため。
 * - 不用品 → 仕入品: 仕入価格は空欄で現れる（クリア済みなので何もしなくてよい）。他の値は変えない。
 * - 確認ダイアログは出さず即クリアする（決定 §7-3）。
 */
export function changeKind(values: RecordFormValues, kind: RecordKind): RecordFormValues {
  if (kind === values.kind) return values;
  return { ...values, kind, purchasePrice: kind === 'used' ? '' : values.purchasePrice };
}

/**
 * SPEC §5.2 の保存バリデーション。
 * 必須は商品名のみ（金額 0・メモ空でも保存可）。Swift 版 `itemName.isEmpty` と同じく trim はしない。
 */
export function canSave(values: RecordFormValues): boolean {
  return values.itemName !== '';
}

/**
 * 伝票カードの各行と結果行が使う金額（UI-SPEC §1.3）。
 *
 * 入力中の文字列を数値に直すだけで、丸めはしない（丸めは表示の瞬間だけ。SPEC §2.6）。
 * 保存前のフォーム上でも「販売価格 − 各経費 = 純利益」が成り立って見えるようにするためのもので、
 * 計算そのものは logic/profit.ts に委ねる（画面でも、ここでも、式を再実装しない）。
 *
 * 不用品の仕入価格を 0 に落とすのは calcForm.toCostInput と同じ扱い。
 * changeKind が切替時にクリアしているので通常は 0 だが、行を出していない金額が
 * 結果に効かないことを、表示に使う側でも保証しておく（SPEC-V2 §1.3）。
 */
export function toCostInput(values: RecordFormValues): CostInput {
  return {
    salesPrice: parseNumericInput(values.salesPrice),
    purchasePrice: values.kind === 'used' ? 0 : parseNumericInput(values.purchasePrice),
    postage: parseNumericInput(values.postage),
    envelopeCost: parseNumericInput(values.envelopeCost),
    othersCost: parseNumericInput(values.othersCost),
    commission: values.commission,
  };
}

/** repository に渡す保存入力へ変換する。空文字・"." は 0 扱い（SPEC §5.1） */
export function toSaveInput(values: RecordFormValues): SaveRecordInput {
  return {
    itemName: values.itemName,
    kind: values.kind,
    salesPrice: parseNumericInput(values.salesPrice),
    // 不用品の仕入価格 0 はフォーム側（changeKind）でクリア済みだが、
    // DB に入る値の保証は repository の責務（SPEC-V2 §2.4）なのでここでは強制しない
    purchasePrice: parseNumericInput(values.purchasePrice),
    postage: parseNumericInput(values.postage),
    envelopeCost: parseNumericInput(values.envelopeCost),
    othersCost: parseNumericInput(values.othersCost),
    commission: values.commission,
    isSold: values.isSold,
    saleStartDate: values.saleStartDate,
    // isSold=false のときの null 化は repository に任せる（SPEC §5.2、二重実装しない）
    saleDate: values.saleDate,
    memo: values.memo,
    // 販売サイト名（SPEC-V3 §1.5.1）。計算にも buildWhere にも入らない、表示と CSV だけの列
    siteName: values.siteName,
    // タグ（SPEC-V4 §1.4 / §3.1）。**中間テーブルは全消し → 入れ直し**なので、
    // ここが空配列ならその記録からタグが全部外れる。SaveRecordInput 側を省略可に
    // しないのは「渡し忘れて静かに全部外れる」を防ぐため
    tagIds: values.tagIds,
  };
}
