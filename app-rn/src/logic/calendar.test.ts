// UI-SPEC §8.10「日付の選び方 ── 行内チップとカレンダー」の検証。
//
// 要点は 3 つ ──
//   1. **月の全日が必ず盤面に出る**（選べない日も消さない。旧ホイールの誤解を繰り返さない）
//   2. 週の始まりは日曜固定
//   3. **チップも年月グリッドも、選べない候補を消さずに残す**（同上）

import { describe, expect, it } from 'vitest';

import {
  canShiftMonth,
  dayChips,
  monthGrid,
  shiftMonth,
  startOfMonth,
  yearMonthGrid,
} from './calendar';
import { saleDateRange } from './saleDate';

/** 時刻付きで作る。暦日で判定していることを見るため、境界の日は 0:00 / 23:59 を使う */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

/** 盤面から実日付のマスだけを取り出す（埋めマスの null を落とす） */
const daysOf = (weeks: ReturnType<typeof monthGrid>) =>
  weeks.flat().filter((cell) => cell != null);

describe('monthGrid: 月の全日を出す（選べない日も消さない。§8.10）', () => {
  const range = saleDateRange(at(2026, 8, 2), at(2026, 8, 10));

  it('範囲が月の一部でも 31 日ぶん全部のマスが出る', () => {
    const days = daysOf(monthGrid({ month: at(2026, 8, 5), range }));

    expect(days).toHaveLength(31);
    expect(days.map((cell) => cell.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it('範囲内だけが selectable。前後は false で盤面に残る', () => {
    const days = daysOf(monthGrid({ month: at(2026, 8, 5), range }));
    const selectable = days.filter((cell) => cell.selectable).map((cell) => cell.day);

    expect(selectable).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 消さずに残っていることを明示的に見る（§8.10 の要点）
    expect(days.find((cell) => cell.day === 1)?.selectable).toBe(false);
    expect(days.find((cell) => cell.day === 11)?.selectable).toBe(false);
  });

  it('選べる日が 1 日もない月でも全日を出す（空の盤面にはしない）', () => {
    const days = daysOf(monthGrid({ month: at(2026, 7, 15), range }));

    expect(days).toHaveLength(31);
    expect(days.every((cell) => !cell.selectable)).toBe(true);
  });

  it('境界と同じ暦日なら時刻が前後していても選べる', () => {
    const sameDay = saleDateRange(at(2026, 8, 10, 9), at(2026, 8, 10, 23, 59));
    const days = daysOf(monthGrid({ month: at(2026, 8, 1), range: sameDay }));

    expect(days.filter((cell) => cell.selectable).map((cell) => cell.day)).toEqual([10]);
  });

  it('範囲を渡さなければ全部選べる（制約のない日付欄へ流用するとき）', () => {
    const days = daysOf(monthGrid({ month: at(2026, 8, 5) }));

    expect(days.every((cell) => cell.selectable)).toBe(true);
  });
});

describe('monthGrid: 週の始まりは日曜固定（§8.10）', () => {
  it('1 日の曜日ぶんだけ頭を空ける（2026/8/1 は土曜なので 6 マス）', () => {
    const [firstWeek] = monthGrid({ month: at(2026, 8, 1) });

    expect(firstWeek.slice(0, 6).every((cell) => cell == null)).toBe(true);
    expect(firstWeek[6]?.day).toBe(1);
  });

  it('1 日が日曜の月は頭を空けない（2026/11/1 は日曜）', () => {
    const [firstWeek] = monthGrid({ month: at(2026, 11, 1) });

    expect(firstWeek[0]?.day).toBe(1);
  });

  it('どの週も 7 マスに揃える（最終週の余りも埋める）', () => {
    const weeks = monthGrid({ month: at(2026, 8, 1) });

    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('同じ列は同じ曜日になる', () => {
    const weeks = monthGrid({ month: at(2026, 8, 1) });
    const column = weeks.map((week) => week[3]).filter((cell) => cell != null);

    expect(column.every((cell) => cell.date.getDay() === 3)).toBe(true);
  });
});

describe('monthGrid: 印（§8.10）', () => {
  const today = at(2026, 8, 10, 15, 45);
  const listed = at(2026, 8, 2, 9, 30);

  it('今日・出品日・選択中の日にそれぞれ印が立つ', () => {
    const days = daysOf(
      monthGrid({ month: today, today, flagged: listed, selected: at(2026, 8, 5) }),
    );

    expect(days.filter((cell) => cell.isToday).map((cell) => cell.day)).toEqual([10]);
    expect(days.filter((cell) => cell.isFlagged).map((cell) => cell.day)).toEqual([2]);
    expect(days.filter((cell) => cell.isSelected).map((cell) => cell.day)).toEqual([5]);
  });

  it('出品当日に売れた記録では 1 つのマスに印が重なる', () => {
    const days = daysOf(monthGrid({ month: today, today, flagged: today, selected: today }));
    const cell = days.find((day) => day.day === 10);

    expect(cell).toMatchObject({ isToday: true, isFlagged: true, isSelected: true });
  });

  it('別の月を見ているときは今日の印を出さない', () => {
    const days = daysOf(monthGrid({ month: at(2026, 7, 1), today }));

    expect(days.some((cell) => cell.isToday)).toBe(false);
  });
});

describe('canShiftMonth: 選べる日が皆無の月へは動かさない', () => {
  const range = saleDateRange(at(2026, 8, 2), at(2026, 10, 10));

  it('範囲の中の月では両方向へ動かせる', () => {
    expect(canShiftMonth(at(2026, 9, 1), -1, range)).toBe(true);
    expect(canShiftMonth(at(2026, 9, 1), 1, range)).toBe(true);
  });

  it('下限の月からは前へ戻れない', () => {
    expect(canShiftMonth(at(2026, 8, 1), -1, range)).toBe(false);
  });

  it('上限の月からは先へ進めない', () => {
    expect(canShiftMonth(at(2026, 10, 1), 1, range)).toBe(false);
  });

  it('範囲を渡さなければどちらへも動かせる', () => {
    expect(canShiftMonth(at(2026, 8, 1), -1)).toBe(true);
    expect(canShiftMonth(at(2026, 8, 1), 1)).toBe(true);
  });

  it('範囲が 1 か月に収まるときは両方向とも無効', () => {
    const sameMonth = saleDateRange(at(2026, 8, 2), at(2026, 8, 10));

    expect(canShiftMonth(at(2026, 8, 1), -1, sameMonth)).toBe(false);
    expect(canShiftMonth(at(2026, 8, 1), 1, sameMonth)).toBe(false);
  });
});

describe('startOfMonth / shiftMonth', () => {
  it('startOfMonth はその月の 1 日 0:00', () => {
    expect(startOfMonth(at(2026, 8, 31, 23, 59))).toEqual(new Date(2026, 7, 1));
  });

  it('shiftMonth は年をまたいでも正しい月の 1 日', () => {
    expect(shiftMonth(new Date(2026, 0, 1), -1)).toEqual(new Date(2025, 11, 1));
    expect(shiftMonth(new Date(2026, 11, 1), 1)).toEqual(new Date(2027, 0, 1));
  });
});

describe('dayChips: 行に常設する「今日・昨日・一昨日」（§8.10.1）', () => {
  const today = at(2026, 8, 10, 15, 45);

  it('並びは今日 → 昨日 → 一昨日の固定で、添字がそのまま遡る日数', () => {
    const chips = dayChips('ja', { today });

    expect(chips.map((chip) => chip.label)).toEqual(['今日', '昨日', '一昨日']);
    expect(chips.map((chip) => chip.date.getDate())).toEqual([10, 9, 8]);
  });

  it('時刻は today から引き継ぐ（日付だけを選ぶ欄なので時刻は編集しない）', () => {
    const [chip] = dayChips('ja', { today });

    expect(chip.date.getHours()).toBe(15);
    expect(chip.date.getMinutes()).toBe(45);
  });

  it('月をまたいでも遡れる（8/1 の「昨日」は 7/31）', () => {
    const chips = dayChips('ja', { today: at(2026, 8, 1) });

    expect(chips.map((chip) => [chip.date.getMonth() + 1, chip.date.getDate()])).toEqual([
      [8, 1],
      [7, 31],
      [7, 30],
    ]);
  });

  it('範囲外のチップは落とさず selectable = false で残す（§8.10 の方針 3）', () => {
    // 当日出品なら「昨日」「一昨日」が出品日より前になって落ちる
    const chips = dayChips('ja', { today, range: saleDateRange(today, today) });

    expect(chips).toHaveLength(3);
    expect(chips.map((chip) => chip.selectable)).toEqual([true, false, false]);
  });

  it('出品日が 1 日前なら「一昨日」だけが落ちる', () => {
    const chips = dayChips('ja', { today, range: saleDateRange(at(2026, 8, 9), today) });

    expect(chips.map((chip) => chip.selectable)).toEqual([true, true, false]);
  });

  it('範囲を渡さなければ全部選べる（出品日の欄は過去に下限がない）', () => {
    expect(dayChips('ja', { today }).every((chip) => chip.selectable)).toBe(true);
  });

  it('選択中のチップだけが isSelected（暦日で判定するので時刻は問わない）', () => {
    const chips = dayChips('ja', { today, selected: at(2026, 8, 9, 3, 20) });

    expect(chips.filter((chip) => chip.isSelected).map((chip) => chip.label)).toEqual(['昨日']);
  });

  it('チップにない日付を選んでいるときはどれも選択状態にならない', () => {
    const chips = dayChips('ja', { today, selected: at(2026, 7, 3) });

    expect(chips.some((chip) => chip.isSelected)).toBe(false);
  });
});

describe('yearMonthGrid: ◀ の連打を避ける年月グリッド（§8.10.3）', () => {
  it('年は降順・各年は 1〜12 月をすべて並べる（期間選択シートと同じ形式）', () => {
    const blocks = yearMonthGrid({ displayed: at(2026, 8, 1), span: 1 });

    expect(blocks.map((block) => block.year)).toEqual([2027, 2026, 2025]);
    expect(blocks[0].months.map((cell) => cell.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('範囲外の月は淡色で選べない（消さない。盤面と同じ規則）', () => {
    const range = saleDateRange(at(2026, 8, 2), at(2026, 10, 10));
    const [block] = yearMonthGrid({ displayed: at(2026, 9, 1), range });

    expect(block.months).toHaveLength(12);
    expect(block.months.filter((cell) => cell.selectable).map((cell) => cell.month)).toEqual([
      8, 9, 10,
    ]);
  });

  it('範囲のある側は年もその年で頭打ちになる', () => {
    const range = saleDateRange(at(2025, 11, 2), at(2026, 10, 10));
    const blocks = yearMonthGrid({ displayed: at(2026, 9, 1), range });

    expect(blocks.map((block) => block.year)).toEqual([2026, 2025]);
  });

  it('片側が開いている欄（出品日）は span 年で打ち切る', () => {
    const blocks = yearMonthGrid({ displayed: at(2026, 8, 1), range: { max: at(2026, 8, 10) } });

    expect(blocks[0].year).toBe(2026);
    expect(blocks[blocks.length - 1].year).toBe(2021);
  });

  it('表示中の月は範囲の外にいても必ずグリッドに含まれる（居場所を見失わせない）', () => {
    const range = saleDateRange(at(2026, 8, 2), at(2026, 8, 10));
    const blocks = yearMonthGrid({ displayed: at(2023, 3, 1), range });
    const current = blocks
      .flatMap((block) => block.months.map((cell) => ({ year: block.year, ...cell })))
      .filter((cell) => cell.isCurrent);

    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ year: 2023, month: 3, selectable: false });
  });

  it('表示中の月に isCurrent が立つ', () => {
    const blocks = yearMonthGrid({ displayed: at(2026, 8, 1), span: 0 });

    expect(blocks[0].months.filter((cell) => cell.isCurrent).map((cell) => cell.month)).toEqual([
      8,
    ]);
  });
});
