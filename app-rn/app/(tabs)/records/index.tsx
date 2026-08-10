// 記録タブの一覧（UI-SPEC §4 ステップ 1 の仮置き）。
//
// ステップ 1 はタブを 5 本から 4 本に減らすところまでで、出品中・実績の 2 画面は
// 中身を変えずそのまま使う。1 タブに 2 画面を収めるために、ここで最小限の切替だけを持たせる。
// ステップ 2（案 8a）で RecordListScreen に 1 本化するので、この切替ごと消える。
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/SegmentedControl';
import { MonthlyRecordListScreen } from '@/screens/MonthlyRecordListScreen';
import { useThemeColors } from '@/theme';

const MODE_LISTINGS = 0;

export default function RecordsScreen() {
  const colors = useThemeColors();
  const [modeIndex, setModeIndex] = useState(MODE_LISTINGS);
  const isSoldMode = modeIndex !== MODE_LISTINGS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.switcher}>
        <SegmentedControl
          options={['出品中', '実績']}
          selectedIndex={modeIndex}
          onChange={setModeIndex}
        />
      </View>
      {/* タブが分かれていた頃と同じく、検索・ソート・月フィルタは切替のたびに初期状態へ戻す
          （決定 §7-1 の「画面ローカルの状態は共有しない」を保つ）。key の差し替えで作り直す */}
      <MonthlyRecordListScreen
        key={modeIndex}
        isSoldMode={isSoldMode}
        monthDetailPathname={
          isSoldMode ? '/records/sold/[monthKey]' : '/records/listings/[monthKey]'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  switcher: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
