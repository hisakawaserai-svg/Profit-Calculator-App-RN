// 期間シートの月グリッドの組み立て（UI-SPEC §1.2「期間シート」・案 39b）。純粋関数。
//
// **カードは常に 1 枚**（1 年ぶん）。年を積み上げる形（案 39a）はやめたので、ここが組み立てるのは
// 「指定された 1 年の盤面」と「その年から前後へ動けるか」の 2 つになる。
// 盤面の規則はすべてここに置き、画面（components/PeriodSheet.tsx）は描くだけにする。
//
//   1. 出せる年の範囲 ── 今年から「記録の最も古い月を含む年」まで（記録が 0 件なら今年だけ）
//   2. その年は 1〜12 月を必ず全部出す（最古の記録より前の月・未来の月も枠としては出る）
//   3. 各月が「記録あり」か「未来」か ── 見た目の濃淡と押せるかどうかの元になる
//   4. 見出しの ‹ › を押せるか ── 今年で ›、最古の年で ‹ が無効（月バーと同じ考え方。§5-14）
//
// 「記録がある」の判定は種別・状態・検索を無視した全記録で行う（§1.2 の派生決定）。
// その集合を作るのは repository.monthsWithRecords で、ここは受け取った集合を引くだけ。

/** 月グリッドの 1 マス */
export type MonthCell = {
  /** 月キー "YYYY-MM" */
  monthKey: string;
  /** 月（1〜12）。表示用 */
  month: number;
  /** 記録が 1 件以上ある月か。false なら薄く出す */
  hasRecord: boolean;
  /**
   * 今月より後の月か。**薄さは記録なしと同じで、違うのは押せるかどうかだけ**（§1.2）。
   * 見た目で区別しないのは設計案の決定そのもの。
   */
  isFuture: boolean;
};

/** カード 1 枚ぶん（年見出し ＋ 4 列 × 3 行の月グリッド） */
export type YearBlock = {
  year: number;
  /** 1 月から 12 月まで、必ず 12 マス */
  months: MonthCell[];
  /** ‹（前年）を押せるか。データのある最古の年で false */
  canGoBack: boolean;
  /** ›（翌年）を押せるか。今年で false */
  canGoForward: boolean;
};

const MONTHS_IN_YEAR = 12;

/** 月キー "YYYY-MM" の年の部分。固定長なので前 4 文字でよい */
function yearOf(monthKey: string): number {
  return Number(monthKey.slice(0, 4));
}

function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * 出せる年の範囲（UI-SPEC §1.2）。今年から「記録の最も古い月を含む年」まで。
 *
 * 記録が 1 件もないときは今年だけ（グリッドが空にならないようにする。§1.2 の派生決定）。
 * 出品日は未来にできない（§8.10.4）ので今年より後の記録は入らないが、
 * 既存データが将来そうなっても範囲が逆転しないよう min を噛ませる。
 */
export function gridYearRange(params: {
  currentMonthKey: string;
  monthsWithRecords: readonly string[];
}): { oldest: number; newest: number } {
  const newest = yearOf(params.currentMonthKey);
  const oldest = params.monthsWithRecords.reduce(
    (year, monthKey) => Math.min(year, yearOf(monthKey)),
    newest,
  );
  return { oldest, newest };
}

/**
 * 指定された年のカードを組み立てる（UI-SPEC §1.2・案 39b）。
 *
 * `year` が出せる範囲の外なら**範囲の端に丸める** ── 呼び出し側（シート）は選択中の期間から
 * 初期表示の年を決めるが、その年に記録が無くなっている場合があり得るため（絞り込みではなく
 * 削除で範囲が縮むケース）。空のカードを出すより端の年を出すほうが操作を続けられる。
 *
 * @param currentMonthKey   今月の月キー。未来かどうかの境目になる
 * @param monthsWithRecords 記録が 1 件以上ある月キー（順不同でよい）
 */
export function periodGrid(params: {
  year: number;
  currentMonthKey: string;
  monthsWithRecords: readonly string[];
}): YearBlock {
  const { currentMonthKey, monthsWithRecords } = params;
  const recorded = new Set(monthsWithRecords);
  const { oldest, newest } = gridYearRange({ currentMonthKey, monthsWithRecords });
  const year = Math.min(newest, Math.max(oldest, params.year));

  const months: MonthCell[] = [];
  for (let month = 1; month <= MONTHS_IN_YEAR; month += 1) {
    const monthKey = toMonthKey(year, month);
    months.push({
      monthKey,
      month,
      hasRecord: recorded.has(monthKey),
      // 月キーは固定長なので大小比較はそのまま文字列比較でよい
      isFuture: monthKey > currentMonthKey,
    });
  }

  return {
    year,
    months,
    // 月バーの ◀ ▶ と同じ考え方（§5-14）── 記録より前と未来へは動かさない
    canGoBack: year > oldest,
    canGoForward: year < newest,
  };
}
