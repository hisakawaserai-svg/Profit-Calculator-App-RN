// DB の日付表現の変換を一箇所に集約する。
//
// 保存形式: 端末ローカル時刻の ISO 8601 風文字列 "YYYY-MM-DDTHH:mm:ss.SSS"（タイムゾーン記号なし）。
// - 辞書順ソート = 時系列ソートになる
// - substr(値, 1, 7) がそのまま「ローカル暦の年月キー」になり、
//   月次グループ化 (SPEC §6.1) を SQL 側で完結できる

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
