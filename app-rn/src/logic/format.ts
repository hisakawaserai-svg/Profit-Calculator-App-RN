// 表示用の文字列組み立て。金額の丸めは必ず roundForDisplay を通す（SPEC §2.6）。

import { roundForDisplay } from './profit';

/** 金額表示「1234 円」。丸めは §2.6 の Math.round（桁区切りは Swift 版に合わせて付けない） */
export function formatYen(value: number): string {
  return `${roundForDisplay(value)} 円`;
}

/** 金額表示「¥1234」。月カード（Swift 版 MonthlySummaryCard）の表記 */
export function formatYenSymbol(value: number): string {
  return `¥${roundForDisplay(value)}`;
}

/** 月セクションの見出し「2026年08月」（Swift 版 .dateTime.year().month(.twoDigits) 相当） */
export function formatMonthHeader(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}年${month}月`;
}

/** ナビゲーションタイトル用の「2026年8月」（SPEC §3.2「YYYY年M月の収支」） */
export function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/** 行に出す日付「2026/08/09」（Swift 版 .year().month(.twoDigits).day() の ja 表記相当） */
export function formatRecordDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}/${month}/${day}`;
}
