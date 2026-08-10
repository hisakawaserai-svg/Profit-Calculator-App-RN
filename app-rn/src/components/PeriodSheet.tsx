// 期間シート（UI-SPEC §1.2「期間シート」）。月バーの中央タップで開く。
// **記録タブとデータタブで同じ部品を共用する**（§1.2「MonthNavBar と対で共用する」）──
// 同じ「期間を選ぶ」操作を画面ごとに違う形で覚えさせないため、月バーと同じく 1 か所に置く。
//
// 選べるのは全期間か 1 か月のいずれかだけ。「期間を指定」は置かない（§5-5）。
import { OptionSheet, type SheetOption } from '@/components/OptionSheet';
import { monthKeyToDate, monthKeysBetween } from '@/db/dates';
import { formatMonthTitle } from '@/logic/format';
import { ALL_PERIOD_LABEL, PERIOD_SHEET_TITLE } from '@/logic/labels';

/** 「全期間」に割り当てる値（月キーと同じ文字列型で扱うため） */
const ALL_PERIOD_VALUE = 'all';

type Props = {
  visible: boolean;
  /** 選択中の月キー "YYYY-MM"。null = 全期間 */
  monthKey: string | null;
  /** データのある最古の月キー。null = 0 件（このときは今月だけを出す） */
  earliestMonthKey: string | null;
  /** 今月の月キー。選択肢の新しい側の端になる */
  currentMonthKey: string;
  /** 選んだ期間。null = 全期間 */
  onSelect: (monthKey: string | null) => void;
  onClose: () => void;
};

export function PeriodSheet({
  visible,
  monthKey,
  earliestMonthKey,
  currentMonthKey,
  onSelect,
  onClose,
}: Props) {
  // 全期間 ＋ 今月〜最古の月。0 件のときは今月だけになる
  const months = monthKeysBetween(earliestMonthKey ?? currentMonthKey, currentMonthKey);
  const groups: SheetOption<string>[][] = [
    [{ label: ALL_PERIOD_LABEL, value: ALL_PERIOD_VALUE }],
    months.map((key) => ({ label: formatMonthTitle(monthKeyToDate(key)), value: key })),
  ];

  return (
    <OptionSheet
      visible={visible}
      title={PERIOD_SHEET_TITLE}
      groups={groups}
      selectedValue={monthKey ?? ALL_PERIOD_VALUE}
      onSelect={(value) => onSelect(value === ALL_PERIOD_VALUE ? null : value)}
      onClose={onClose}
    />
  );
}
