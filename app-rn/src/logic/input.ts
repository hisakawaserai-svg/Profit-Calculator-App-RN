// SPEC.md §5.1 数値入力のフィルタリング

/**
 * 入力文字列から数字と小数点以外を除去し、小数点は 1 個までに制限する
 * （決定 §7-9。許容形式: /^\d*\.?\d*$/）。
 */
export function sanitizeNumericInput(text: string): string {
  const stripped = text.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  return (
    stripped.slice(0, firstDot + 1) +
    stripped.slice(firstDot + 1).replace(/\./g, '')
  );
}

/** 数値化。空文字・"." のみは 0 扱い（SPEC §5.1）。 */
export function parseNumericInput(text: string): number {
  const value = Number.parseFloat(text);
  return Number.isNaN(value) ? 0 : value;
}
