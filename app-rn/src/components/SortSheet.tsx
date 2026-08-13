// 並び替えシート（⇅。採用案 22b）。UI-SPEC §1.2「並び替えシート」。
//
// 8 択の縦並び（旧 OptionSheet の使い方）をやめ、**項目の行 ＋ 方向の 2 択**にした:
//
//   販売日   [ 新しい順 | 古い順   ]
//   出品日   [ 新しい順 | 古い順   ]
//   収支     [ 多い順   | 少ない順 ]
//   経費     [ 多い順   | 少ない順 ]
//
// - **開いた時点で 8 通りがすべて見える。** 旧メニューは「販売日 ↓」を選んでから
//   逆順にするために選び直す形で、対になる選択肢が縦に離れていた。
// - **選択中は 1 か所だけ青**（項目 × 方向で 1 つ）。チェックマークは置かない ──
//   青いセグメントが選択中を指すので、同じことを 2 つの記号で言わない。
// - **押せるのはセグメントだけ。** 項目名は方向を決められないので押せる形にしない
//   （押しても何も起きない領域を作らない）。
// - 行の並びと出し分けは logic/recordSort.ts（この部品は並べるだけ）。
import { StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/SegmentedControl';
import { SheetModal } from '@/components/SheetModal';
import type { RecordSortType } from '@/db/repository';
import type { SortRow } from '@/logic/recordSort';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  title: string;
  /** 出す行（売れた記録は 4 行 / 出品中は 3 行。sortRows が決める） */
  rows: readonly SortRow[];
  selectedValue: RecordSortType;
  onSelect: (value: RecordSortType) => void;
  onClose: () => void;
};

export function SortSheet({ visible, title, rows, selectedValue, onSelect, onClose }: Props) {
  const colors = useThemeColors();

  return (
    // 幕はシートと一緒に上がってこない（不透明度だけで出る。SheetModal 参照）。
    // 選んだ時点で閉じる操作も close を通し、下がり切ってから onClose が呼ばれるようにする
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
          <View style={[styles.group, { backgroundColor: colors.secondaryBackground }]}>
            {rows.map((row, index) => {
              const selectedIndex = row.segments.findIndex(
                (segment) => segment.value === selectedValue,
              );
              const active = selectedIndex >= 0;
              return (
                <View key={row.segments[0].value}>
                  {index > 0 && (
                    <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                  )}
                  {/* 効いている行だけ薄い青を敷く。**行全体をグレーアウトはしない** ──
                      どの行もいつでも選べるので、選べなさそうに見せない */}
                  <View
                    style={[
                      styles.row,
                      active && { backgroundColor: colors.highlightBackground },
                    ]}>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowLabel, { color: active ? colors.blue : colors.label }]}>
                      {row.label}
                    </Text>
                    <View style={styles.segments}>
                      <SegmentedControl
                        tone="accent"
                        options={row.segments.map((segment) => segment.label)}
                        // 効いていない行は「どちらも選ばれていない」（null）。
                        // 便宜的に 0 を渡すと、押していない向きが選択中に見える
                        selectedIndex={active ? selectedIndex : null}
                        onChange={(segmentIndex) => {
                          // 項目と方向はこの 1 タップで同時に決まる（2 段階にしない）
                          onSelect(row.segments[segmentIndex].value);
                          close();
                        }}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  group: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    // セグメント（44pt）と合わせて行の高さを 56pt にする
    paddingVertical: 6,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 16,
  },
  // 方向の 2 択は**どの行でも同じ幅**にする。語の長さ（「古い順」と「少ない順」）で
  // 幅が変わると、行ごとにセグメントの境目の位置がずれて縦に読めなくなる
  segments: {
    width: 176,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
