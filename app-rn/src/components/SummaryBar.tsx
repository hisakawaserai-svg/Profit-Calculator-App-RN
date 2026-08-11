// 固定の集計段（UI-SPEC §1.2-3 / §1.5-3。案 34a-A で 1 段に作り替えた）。
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
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/SegmentedControl';
import { FILTER_CLEAR_LABEL } from '@/logic/labels';
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
 * 絞り込み中だけ段の下に生える青い行（案 34a-C）。
 *
 * **押せる場所が 1 行に 2 つある。** 左（▽ ＋ 条件文）で絞り込みの面を開き、右端の「解除」で外す。
 * 当たり判定は右端に余白を取って明確に分け、読み上げでも 2 つのボタンとして扱う。
 */
export type SummaryFilterRow = {
  /** filterSummaryText の返り値（「仕入品・タグ「洋服」の14件だけ」）。null なら行ごと出ない */
  text: string | null;
  onPressFilter: () => void;
  onClear: () => void;
};

type Props = {
  items: SummaryItem[];
  /** 省略すると集計値だけの段になる（データタブ。§6 で同じ形に揃える） */
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
        <FilterRow
          text={filterRow.text as string}
          onPressFilter={filterRow.onPressFilter}
          onClear={filterRow.onClear}
        />
      )}
    </View>
  );
}

function FilterRow({ text, onPressFilter, onClear }: { text: string } & Omit<SummaryFilterRow, 'text'>) {
  const colors = useThemeColors();

  return (
    // 段の左右の余白を打ち消して端まで届かせる。青い地が段の中で「生えた」ように見えるため
    <View style={[styles.filterRow, { backgroundColor: FILTER_ROW_BACKGROUND }]}>
      <Pressable
        onPress={onPressFilter}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint="絞り込みの条件を変えます"
        style={({ pressed }) => [styles.filterRowMain, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="funnel" size={13} color={colors.blue} />
        <Text style={[styles.filterRowText, { color: colors.label }]} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      {/* 「解除」は左の当たり判定と重ならないよう、余白ごと自分の側に持つ */}
      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={`${FILTER_CLEAR_LABEL}する`}
        style={({ pressed }) => [styles.filterRowClear, { opacity: pressed ? 0.5 : 1 }]}>
        <Text style={[styles.filterRowClearLabel, { color: colors.blue }]}>
          {FILTER_CLEAR_LABEL}
        </Text>
      </Pressable>
    </View>
  );
}

/** 青い行の地。明暗どちらでも「青みの薄い地」に見える透過（解除バーから引き継ぎ） */
const FILTER_ROW_BACKGROUND = 'rgba(0, 122, 255, 0.10)';

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
  secondaryLabel: {
    fontSize: 12,
  },
  secondaryValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  segment: {
    width: 186,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 9,
  },
  filterRowText: {
    flexShrink: 1,
    fontSize: 13,
  },
  filterRowClear: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 9,
  },
  filterRowClearLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
