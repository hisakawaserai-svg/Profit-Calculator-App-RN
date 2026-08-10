// 表示用の文字列組み立て。金額の丸めは必ず roundForDisplay を通す（SPEC §2.6）。

import { roundForDisplay } from './profit';

/** 金額表示「1234 円」。丸めは §2.6 の Math.round（桁区切りは Swift 版に合わせて付けない） */
export function formatYen(value: number): string {
  return `${roundForDisplay(value)} 円`;
}

/**
 * 金額表示「1234円」。文中や詰めて並べる 2 値（計算タブの逆算結果）で使う。
 *
 * formatYen との違いは数字と「円」の間の空白だけ。逆算結果の説明文
 * 「962円で売ると、手数料96円と…」のように 1 文に金額が 3 つ以上入る場所では、
 * 空白があるぶんだけ語の切れ目が読み取りにくくなるため詰める。
 * 単独のセル（内訳の行など）は従来どおり formatYen。
 */
export function formatYenTight(value: number): string {
  return `${roundForDisplay(value)}円`;
}

/** 金額表示「¥1234」。月カード（Swift 版 MonthlySummaryCard）の表記 */
export function formatYenSymbol(value: number): string {
  return `¥${roundForDisplay(value)}`;
}

/**
 * 見込み額「約¥1234」。出品中の行の「売れたら 約¥…」で使う。
 * 「約」は常に付く（UI-SPEC §5-3: 送料未入力かどうかの判定はしない）。
 */
export function formatApproxYenSymbol(value: number): string {
  return `約${formatYenSymbol(value)}`;
}

/** 経過日数「7日経過」（UI-SPEC §5-2。日数の算出は logic/listingDays.ts） */
export function formatElapsedDays(days: number): string {
  return `${days}日経過`;
}

/** 一覧のメタ行に出す短い日付「8/9」（UI-SPEC §1.2「M/D 販売」） */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 選択した棒の見出しに出す日付「8月9日」（UI-SPEC §1.5-5「8月9日の記録　N件」）。
 * メタ行の formatShortDate（「8/9」）と分けてあるのは、こちらが見出しの語
 * （「…の記録」）に続く位置にあり、スラッシュ表記だと日付の切れ目が読み取りにくいため。
 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
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

// 日時「2026/08/09 14:30」を組み立てる formatRecordDateTime は、データタブの「明細」
// （時刻まで含めた販売日がそのまま集計キーになる単位）の廃止で参照元がなくなったため削除した
// （UI-SPEC §6-10）。刻みは日ごと / 月ごとの 2 値になり、時刻を出す場所はもうない。
