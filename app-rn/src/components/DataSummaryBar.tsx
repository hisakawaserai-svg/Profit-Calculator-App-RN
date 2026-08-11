// データタブの固定の集計段（UI-SPEC §1.5-3。案 36b）。
//
//   [ この月の収支                                  売上  ¥15,145 ]
//   [ ¥12,686                                      経費   ¥2,460 ]
//
// **収支を主役にする。** 左に見出しと金額を大きく（28px）、右に売上と経費を 2 行に積んで
// 小さく（15px）出す。3 値を対等に並べない理由:
//   - この画面は「今月いくら残ったか」を見に来る画面で、グラフの主題も収支の推移。
//     収支だけが大きいのが読みの順番と合う
//   - **3 値は元々対等ではない** ── グラフが描いているのは収支だけで、売上と経費は文脈。
//     対等に並べると数字の壁になり、毎回どれかを探すことになる
//
// **記録タブの SummaryBar とは共用しない**（案 36b の帰結）。あちらは 2 値で対等（収支と経費）、
// こちらは 3 値で収支が主役 ── 違うものを違う形で出しているので一貫性の問題にはならない。
// 1 つの部品にまとめると、ほぼ全部のスタイルが分岐で二重になる。
//
// **種別セグメントは持たない**（SPEC-V4 §6）。種別は絞り込みページの中の 1 節に一本化した。
// 絞り込み中の青い行はこの段の中ではなく**月バーの直下**に出る（FilterNoticeRow のコメント）。
//
// 値は「丸め済みの表示文字列」を受け取る。書式には関与しない（SummaryBar と同じ約束）。
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type DataSummaryValue = {
  label: string;
  /** 表示済みの値（例:「¥12,686」） */
  value: string;
  color: string;
};

type Props = {
  /** 主役（収支）。見出しは期間で変わる（「この月の収支」/「全期間の収支」） */
  profit: DataSummaryValue;
  /** 右に積む文脈の 2 値（売上・経費）。上から順に並ぶ */
  context: [DataSummaryValue, DataSummaryValue];
};

export function DataSummaryBar({ profit, context }: Props) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.secondaryBackground, borderBottomColor: colors.separator },
      ]}>
      {/* 左 = 収支。**見出しは縮み、金額は縮まない** ── 7 桁（¥1,234,567）で約 146pt を使うので、
          右の 2 値（約 78pt）と合わせても iPhone 幅に収まる。それでも足りない場合に
          削るのは見出しの側（位置と色で何の値かは分かる） */}
      <View style={styles.primary}>
        <Text style={[styles.primaryLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {profit.label}
        </Text>
        <Text style={[styles.primaryValue, { color: profit.color }]} numberOfLines={1}>
          {profit.value}
        </Text>
      </View>

      {/* 右 = 売上・経費。**金額の右端を揃える**（alignItems: flex-end）── 桁の違う 2 値が
          縦に並ぶので、右端で揃えないと桁の比較ができない */}
      <View style={styles.context}>
        {context.map((item) => (
          <View key={item.label} style={styles.contextRow}>
            <Text style={[styles.contextLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.contextValue, { color: item.color }]} numberOfLines={1}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  primary: {
    flexShrink: 1,
    gap: 1,
  },
  primaryLabel: {
    fontSize: 13,
  },
  primaryValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  // 右の 2 値は縮めない。ここが縮むと金額が切れる（左の見出しが先に縮む）
  context: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  contextLabel: {
    fontSize: 13,
  },
  contextValue: {
    fontSize: 15,
    fontWeight: '600',
  },
});
