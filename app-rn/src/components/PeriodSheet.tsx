// 期間シート（UI-SPEC §1.2「期間シート」・**採用案 39b**）。月バーの中央タップで開く。
// **記録タブとデータタブで同じ部品を共用する**（§1.2「MonthNavBar と対で共用する」）──
// 同じ「期間を選ぶ」操作を画面ごとに違う形で覚えさせないため、月バーと同じく 1 か所に置く。
//
// **盤面そのもの（クイック選択・カード・凡例）は PeriodPicker に切り出してある。**
// ここが持つのは器だけ:
//   1. 下から出るシート（SheetModal）と見出し「表示する期間」
//   2. **選んだ時点で即座に反映してシートを閉じる**（確定ボタンを持たない）
//   3. 開くたびにカードの年を選択中の期間へ取り直す（`resetKey` に visible を渡す）
//
// 切り出したのは、書き出しシート（SPEC-V3 §5.7）が同じ盤面を**閉じない形で**中に埋め込むため。
// 選べるのは全期間 / 1 年 / 1 か月のいずれか（SPEC-V3 §5.5 の改訂）。
// 「期間を指定」は置かない（§5-5）。
//
// **カードは常に 1 枚で、見出しの ‹ › が年を送る**（案 39b）。年を縦に積む形（39a）はやめた ──
// 古い年ほど深いスクロールになるのに対し、この形は**何年前でも操作量が同じ**（矢印 1 回 = 1 年）。
// スクロールが無くなったので、**シートの高さは中身ぴったり**になる（maxHeight を持たない）。
import { StyleSheet, Text, View } from 'react-native';

import { PeriodPicker } from '@/components/PeriodPicker';
import { SheetModal } from '@/components/SheetModal';
import { periodSheetTitle } from '@/logic/labels';
import type { Period } from '@/logic/period';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** 選択中の期間（全期間 / "YYYY" / "YYYY-MM"） */
  period: Period;
  /** 記録が 1 件以上ある月キー（順不同）。詳細は PeriodPicker の同名 prop */
  monthsWithRecords: readonly string[];
  /** 今月の月キー。未来かどうかの境目と「今月」ボタンの行き先になる */
  currentMonthKey: string;
  /** 選んだ期間。null = 全期間 / "YYYY" = 年 / "YYYY-MM" = 月 */
  onSelect: (period: Period) => void;
  onClose: () => void;
};

export function PeriodSheet({
  visible,
  period,
  monthsWithRecords,
  currentMonthKey,
  onSelect,
  onClose,
}: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => {
        // 選んだ時点で反映してシートを閉じる（§1.2「挙動」）。確定ボタンは置かない。
        // 閉じるのは close 経由（下がり切ってから onClose）
        const choose = (next: Period) => {
          onSelect(next);
          close();
        };

        return (
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.title, { color: colors.label }]}>{periodSheetTitle(locale)}</Text>
            <PeriodPicker
              period={period}
              monthsWithRecords={monthsWithRecords}
              currentMonthKey={currentMonthKey}
              onSelect={choose}
              // 開き直すたびにカードの年を取り直す（開いている間の ‹ › の操作は Picker が持つ）
              resetKey={visible}
            />
          </View>
        );
      }}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  // **高さは中身ぴったり**（案 39b でスクロールが無くなった）。maxHeight は持たない
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
});
