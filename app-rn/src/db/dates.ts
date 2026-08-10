// DB の日付表現の変換を一箇所に集約する。
//
// 保存形式: 端末ローカル時刻の ISO 8601 風文字列 "YYYY-MM-DDTHH:mm:ss.SSS"（タイムゾーン記号なし）。
// - 辞書順ソート = 時系列ソートになる
// - substr(値, 1, 7) がそのまま「ローカル暦の年月キー」になり、
//   月次グループ化 (SPEC §6.1) を SQL 側で完結できる

import type { ChartUnit } from '../logic/analytics';

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Date → DB 保存文字列（端末ローカル時刻） */
export function toDbDate(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

/** DB 保存文字列 → Date（端末ローカル時刻として解釈） */
export function fromDbDate(value: string): Date {
  // タイムゾーン記号なしの ISO 文字列は JS の Date コンストラクタでローカル時刻として解釈される
  return new Date(value);
}

/** Date → 月キー "YYYY-MM"（ローカル暦） */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** 月キー "YYYY-MM" → その月の 1 日 0:00（ローカル） */
export function monthKeyToDate(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * 月キーを delta か月ずらす（月バーの ◀ ▶。UI-SPEC §1.2）。
 * Date の月加算に任せるので年の繰り上がり・繰り下がりも自動で効く。
 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const date = monthKeyToDate(monthKey);
  return toMonthKey(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

/**
 * from から to まで（両端含む）の月キーを新しい順に並べる（期間シートの選択肢。UI-SPEC §1.2）。
 * from > to のときは空配列。月キーは固定長なので大小比較は文字列比較でよい。
 */
export function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let key = to; key >= from; key = shiftMonthKey(key, -1)) keys.push(key);
  return keys;
}

/** その日の 00:00:00.000。DataView の期間開始（決定 §7-10） */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** その日の 23:59:59.999。DataView の期間終了（決定 §7-10: 終了日当日ぶんを漏らさない） */
export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * DataView の集計キーとして販売日から切り出す先頭文字数（SPEC §6.2）。
 * 保存形式 "YYYY-MM-DDTHH:mm:ss.SSS"（23 文字）が前提。
 * 明細は丸めなしなので全文字＝販売日そのものがキーになる。
 */
export const CHART_KEY_LENGTH: Record<ChartUnit, number> = {
  record: 23, // YYYY-MM-DDTHH:mm:ss.SSS（丸めなし）
  day: 10, // YYYY-MM-DD
  month: 7, // YYYY-MM
  year: 4, // YYYY
};

/** 集計キー → その単位の代表日（日別 = その日 0:00 / 月別 = 月初 / 年別 = 年初。SPEC §6.2） */
export function chartKeyToDate(key: string, unit: ChartUnit): Date {
  switch (unit) {
    case 'record':
      return fromDbDate(key);
    case 'day':
      return fromDbDate(`${key}T00:00:00.000`);
    case 'month':
      return fromDbDate(`${key}-01T00:00:00.000`);
    case 'year':
      return fromDbDate(`${key}-01-01T00:00:00.000`);
  }
}
