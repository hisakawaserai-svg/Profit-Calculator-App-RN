// SaleRecordDetailView.swift の移植。レコード詳細画面（SPEC §3.2 / §5.4）。
// 月別詳細リスト（SaleRecordScreen）の行タップからプッシュ遷移してくる。
//
// - 売却トグルは切り替えた瞬間に即保存し、useRecord の refresh で引き直して表示に反映する
//   （ON で saleDate = 今日、OFF で null。書き込みは repository.setSoldStatus。SPEC §3.2）。
// - トグルでレコードが現在のタブ（出品中 / 実績）の対象外になっても、この画面は閉じない。
//   Swift 版の SaleRecordDetailView も dismiss せず、@ObservedObject の再描画で
//   「売却済み」表示に変わるだけだった。SPEC §3.2 でも詳細画面を閉じる条件は削除時のみで、
//   自動 dismiss の規定はない。押し間違いをその場で戻せる・ON にした結果（販売日）を
//   確認できる、という点でも閉じないほうが妥当と判断した。
//   一覧側は戻ったタイミングの useFocusEffect で引き直されるので、
//   出品中の一覧からは消え、実績の一覧に現れる（対象月が 0 件になれば月別詳細も自動で戻る）。
// - 編集（ペン）は既存の RecordFormSheet をそのまま開く。保存後は refresh で引き直す。
// - 削除（ゴミ箱）は確認アラート「削除しますか？」を挟んでから削除し、前画面へ戻る（SPEC §5.4）。
// - 下部の累計はこの 1 件のみの純利益・経費。合算相手がいないので repository を引かず、
//   レコードから logic/profit で計算する（値は Double のまま、丸めは表示時のみ）。
// - 商品情報カード / 費用内訳カードは components/RecordDetailSections.tsx に置いてある。
//   Swift 版でも DataView が同じ 2 つを使い回していたため（SPEC §6.2 の内訳リスト）。
//
// 決定 §7-6 のとおり、Swift 版の careerProfit / careerExpenses と、
// それらのためだけにあった allRecords の @FetchRequest は移植していない（計算のみで未使用）。
// 同じく未使用だった targetMonth も引き継がない。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  DetailCard,
  ExpenseDetailSection,
  ProductInfoSection,
} from '@/components/RecordDetailSections';
import { CareerSummarySection } from '@/components/SummarySection';
import type { SaleRecord } from '@/db/schema';
import { deleteRecord, setSoldStatus, useRecord } from '@/db/useRecords';
import { netProfit, totalExpenses } from '@/logic/profit';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors } from '@/theme';

export function SaleRecordDetailScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { record, refresh } = useRecord(id);
  const [showForm, setShowForm] = useState(false);

  // レコードが無くなったら詳細を出し続ける意味がないので前画面へ戻る。
  // 自分で削除したときは下の handleDelete が先に戻すので、ここが効くのは
  // 他画面（月別詳細のスワイプ削除）で消えた状態で戻ってきた場合。
  // 月別詳細の「対象月が 0 件になったら戻る」と同じ考え方（SPEC §3.2）。
  useEffect(() => {
    if (record == null && router.canGoBack()) {
      router.back();
    }
  }, [record, router]);

  const handleDelete = useCallback(() => {
    // SPEC §5.4: 詳細画面の削除は確認アラートを挟む（月別詳細のスワイプ削除とは違い即削除しない）
    Alert.alert('削除しますか？', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteRecord(id);
          if (router.canGoBack()) router.back();
        },
      },
    ]);
  }, [id, router]);

  const screenOptions = useMemo(
    () => ({
      title: '詳細',
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable onPress={() => setShowForm(true)} hitSlop={8} accessibilityLabel="編集">
            <Ionicons name="pencil" size={22} color={colors.blue} />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8} accessibilityLabel="削除">
            <Ionicons name="trash" size={22} color={colors.red} />
          </Pressable>
        </View>
      ),
    }),
    [colors.blue, colors.red, handleDelete],
  );

  // record が無いときは上の useEffect が前画面へ戻す。戻るまでの 1 フレームぶんの表示
  if (record == null) {
    return (
      <>
        <Stack.Screen options={{ title: '詳細' }} />
        <View style={[styles.container, { backgroundColor: colors.background }]} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <SaleStatusToggleCard record={record} onChanged={refresh} />
          <ProductInfoSection record={record} />
          <ExpenseDetailSection record={record} />
          <MemoSection record={record} />
        </ScrollView>

        <View style={[styles.divider, { backgroundColor: colors.separator }]} />
        {/* 画面下部の累計。この 1 件のみが対象（Swift 版 CareerSummarySection(record)） */}
        <CareerSummarySection
          totalNetProfit={netProfit(record)}
          totalExpenses={totalExpenses(record)}
        />
      </View>

      <RecordFormSheet
        visible={showForm}
        record={record}
        onClose={() => setShowForm(false)}
        onSaved={refresh}
      />
    </>
  );
}

/**
 * 出品中⇔売却済みのトグル（Swift 版 SaleStatusToggleCard）。
 * 切り替えた瞬間に保存する。販売日の付け外しは repository.setSoldStatus に任せる。
 */
function SaleStatusToggleCard({
  record,
  onChanged,
}: {
  record: SaleRecord;
  onChanged: () => void;
}) {
  const colors = useThemeColors();
  const statusColor = record.isSold ? colors.green : colors.orange;

  const handleChange = (isSold: boolean) => {
    setSoldStatus(record.id, isSold);
    onChanged();
  };

  return (
    <View style={[styles.card, styles.toggleCard, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.toggleLabel}>
        <Ionicons
          name={record.isSold ? 'checkmark-circle' : 'cube'}
          size={20}
          color={statusColor}
        />
        <Text style={[styles.toggleLabelText, { color: statusColor }]}>
          {record.isSold ? '売却済み' : '出品中'}
        </Text>
      </View>
      <Switch
        value={record.isSold}
        onValueChange={handleChange}
        accessibilityLabel="売却済み"
        trackColor={{ true: colors.orange, false: colors.disabledBackground }}
      />
    </View>
  );
}

/** メモカード（Swift 版 MemoSection）。メモが空なら「なし」 */
function MemoSection({ record }: { record: SaleRecord }) {
  const colors = useThemeColors();

  return (
    <DetailCard title="📝 メモ">
      <View style={[styles.memoBox, { borderColor: colors.separator }]}>
        <Text style={[styles.memoText, { color: colors.label }]}>
          {record.memo === '' ? 'なし' : record.memo}
        </Text>
      </View>
    </DetailCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingRight: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 20,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabelText: {
    fontSize: 17,
    fontWeight: '600',
  },
  memoBox: {
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  memoText: {
    fontSize: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
