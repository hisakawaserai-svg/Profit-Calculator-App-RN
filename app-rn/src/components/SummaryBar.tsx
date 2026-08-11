// 記録タブの固定の集計段（UI-SPEC §1.2-3。案 34a-A で 1 段に作り替えた）。
//
//   [ この月の収支 ¥12,685        ( 売れた記録 | 出品中 ) ]
//   [ 経費 ¥2,459                                         ]
//   [ ▽ 仕入品・タグ「洋服」の14件だけ            解除    ]  ← 絞り込み中だけ
//
// **左に集計・右にセグメント**。旧構成（1 段目 = 集計 2 値 / 2 段目 = セグメント ＋ チップ）から
// 1 段減らした ── 集計段の右が 240pt ほど空いていたので、セグメントをそこへ引き上げた。
// 毎日開く画面なので、リストの見える件数が 1 段ぶん増える意味は大きい（案 34a-A）。
//
// **決定 §9-1（集計を上・操作を下）はこれで改訂される。** 同決定の趣旨は「目が最初に当たるのが
// 数字ではなくボタンになるのを避ける」ことで、集計値が段の左端にある限りその趣旨は保てる ──
// セグメントが同じ段の右に来ても、視線は左の金額から始まる。
//
// **絞り込み中の青い行はこの段の中に生える**（案 34a-C）。リストとは一緒に流れない固定段の中で、
// 段数としては増えない扱い（上部は実質 3 段のまま）。
//
// 値は「丸め済みの表示文字列」を受け取る。金額かどうか（¥ を付けるか、N 点か）は
// 呼び出し側の集計の意味で決まるため、この部品は書式に関与しない。
//
// **データタブとは共用しない**（SPEC-V4 §6 / UI-SPEC §1.5。案 36b）。あちらは 3 値で
// 収支が主役の割り付け（左に 28px の収支・右に売上と経費を小さく積む）で、
// この部品の「先頭 1 値 ＋ 残りを下に畳む ＋ 右にセグメント」とは骨格から違う ──
// 1 つの部品に両方を入れると、ほぼ全部のスタイルが分岐で二重になる。専用の
// DataSummaryBar を別に立ててある。**共有しているのは青い行（FilterNoticeRow）だけ。**
import { StyleSheet, Text, View } from 'react-native';

import { FilterNoticeRow, type FilterNotice } from '@/components/FilterNoticeRow';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useThemeColors } from '@/theme';

export type SummaryItem = {
  /** 見出し（例:「この月の収支」「出品価格の合計」） */
  label: string;
  /** 表示済みの値（例:「¥1,405」「3 点」） */
  value: string;
  /** 値の文字色 */
  color: string;
};

/** 状態セグメント（記録タブの「売れた記録 / 出品中」。§4.1） */
export type SummarySegment = {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
};

/**
 * 絞り込み中だけ**段の中に**生える青い行（案 34a-C）。中身は FilterNoticeRow が持つ。
 * データタブは同じ行を月バーの直下に単体で置く（§6 / 案 36b）── 見た目は同じで、位置だけが違う。
 */
export type SummaryFilterRow = FilterNotice;

type Props = {
  items: SummaryItem[];
  /** 省略すると集計値だけの段になる */
  segment?: SummarySegment;
  filterRow?: SummaryFilterRow;
};

export function SummaryBar({ items, segment, filterRow }: Props) {
  const colors = useThemeColors();
  const [primary, ...rest] = items;
  const showFilterRow = filterRow != null && filterRow.text != null;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.secondaryBackground, borderBottomColor: colors.separator },
      ]}>
      <View style={styles.main}>
        {/* 左 = 集計。**先頭の 1 値だけを大きく**出し、残りはその下に小さく畳む ──
            段の高さを増やさずにセグメントと横に並べるには、値を縦に積むしかない */}
        <View style={styles.values}>
          {primary != null && (
            <View style={styles.primary}>
              <Text style={[styles.primaryLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {primary.label}
              </Text>
              <Text style={[styles.primaryValue, { color: primary.color }]} numberOfLines={1}>
                {primary.value}
              </Text>
            </View>
          )}
          {rest.length > 0 && (
            <View style={styles.secondary}>
              {rest.map((item) => (
                <View key={item.label} style={styles.secondaryItem}>
                  <Text
                    style={[styles.secondaryLabel, { color: colors.secondaryLabel }]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[styles.secondaryValue, { color: item.color }]} numberOfLines={1}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 右 = 状態セグメント。幅を固定するのは、集計の桁数で位置が動くと
            「押す場所」が月ごとに変わってしまうため */}
        {segment != null && (
          <View style={styles.segment}>
            <SegmentedControl
              options={segment.options}
              selectedIndex={segment.selectedIndex}
              onChange={segment.onChange}
            />
          </View>
        )}
      </View>

      {showFilterRow && (
        <FilterNoticeRow
          text={filterRow.text as string}
          onPressFilter={filterRow.onPressFilter}
          onClear={filterRow.onClear}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  values: {
    flex: 1,
    gap: 2,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  primaryLabel: {
    flexShrink: 1,
    fontSize: 12,
  },
  primaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  secondary: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  // 2 行目は**見出しだけを縮める。** セグメント（186pt）に幅を取られた残りに
  // 「出品価格の合計 ¥1,234,567」が収まらないことがあり、縮められないと行からはみ出して
  // 隣の語と**重なって**表示される（RN の Text は切れるのではなく重なる）。
  //   - 金額側は縮めない（flexShrink 0）── 「¥1,2…」まで詰まった金額は読めても意味がなく、
  //     見出しは「出品価格の…」まで詰まっても位置と色で何の値かが分かる
  secondaryLabel: {
    flexShrink: 1,
    fontSize: 12,
  },
  secondaryValue: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  segment: {
    width: 186,
  },
});
