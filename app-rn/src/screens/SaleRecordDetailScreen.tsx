// レコード詳細（UI-SPEC §1.4 / 採用案 3d）。SaleRecordDetailView.swift の後継。
// 記録タブの一覧・データタブの内訳の行タップからプッシュ遷移してくる。
//
// 3d のねらいは「金額の流れを 1 枚のレシートで見せ、編集・削除を下端の操作列にまとめる」。
// 商品情報カード＋費用内訳カードの 2 枚（旧構成）を 1 枚のレシートに畳み、
// 種別と日付はカードの外のメタ行に出す。ヘッダのペン・ゴミ箱アイコンは下端の
// 「編集する」「削除」に置き換えた（何をする操作なのかを語で読めるようにする）。
//
// - 状態はメタ行のバッジ（表示）と売却トグル（変更）の両方を置く（§5-13。役割が違う）。
// - 画面下部の 1 件サマリー（Swift 版 CareerSummarySection）は置かない（§5-12）。
//   レシートの結果行（種別語＋額）が同じ役割を果たす。
// - 経過日数は出品日起算・当日 0 日（§5-2。算出は logic/listingDays.ts）。
// - 種別の変更 UI は置かない。編集フォーム経由のみ（SPEC-V2 §1.3）。
// - 表示語はすべて labels.ts 経由（SPEC-V2 §5.3）。
//
// 売却トグルの挙動は SPEC §3.2 のまま:
// - 切り替えた瞬間に即保存し、useRecord の refresh で引き直して表示に反映する
//   （ON で saleDate = 今日、OFF で null。書き込みは repository.setSoldStatus）。
// - トグルでレコードが一覧の現在の絞り込みから外れても、この画面は閉じない。
//   押し間違いをその場で戻せる・ON にした結果（販売日）を確認できるほうが妥当なため。
//   一覧側は戻ったタイミングの useFocusEffect で引き直される。
// - 削除は確認アラート「削除しますか？」を挟んでから削除し、前画面へ戻る（SPEC §5.4）。
//
// 決定 §7-6 のとおり、Swift 版の careerProfit / careerExpenses と、
// それらのためだけにあった allRecords の @FetchRequest は移植していない（計算のみで未使用）。
// 同じく未使用だった targetMonth も引き継がない。
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ReceiptCard } from '@/components/RecordDetailSections';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { deleteRecord, setSoldStatus, useRecord } from '@/db/useRecords';
import { formatShortDate } from '@/logic/format';
import {
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  EDIT_RECORD_LABEL,
  LISTING_STATUS_LABEL,
  MARK_AS_SOLD_LABEL,
  MEMO_EMPTY_LABEL,
  MEMO_LABEL,
  SOLD_BADGE_LABEL,
  UNTITLED_LABEL,
  CANCEL_LABEL,
  recordTimelineText,
} from '@/logic/labels';
import { listingDays } from '@/logic/listingDays';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors, type ThemeColors } from '@/theme';

export function SaleRecordDetailScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { record, refresh } = useRecord(id);
  const [showForm, setShowForm] = useState(false);
  /** 「今日」はマウント時に 1 回だけ決める（出品中の経過日数の基準） */
  const today = useMemo(() => new Date(), []);

  // レコードが無くなったら詳細を出し続ける意味がないので前画面へ戻る。
  // 自分で削除したときは下の handleDelete が先に戻すので、ここが効くのは
  // 他画面（一覧のスワイプ削除）で消えた状態で戻ってきた場合。
  useEffect(() => {
    if (record == null && router.canGoBack()) {
      router.back();
    }
  }, [record, router]);

  const handleDelete = useCallback(() => {
    // SPEC §5.4: 詳細画面の削除は確認アラートを挟む（一覧のスワイプ削除とは違い即削除しない）
    Alert.alert(DELETE_CONFIRM_TITLE, undefined, [
      { text: CANCEL_LABEL, style: 'cancel' },
      {
        text: DELETE_LABEL,
        style: 'destructive',
        onPress: () => {
          deleteRecord(id);
          if (router.canGoBack()) router.back();
        },
      },
    ]);
  }, [id, router]);

  // ヘッダは「◀ 記録」だけ（UI-SPEC §1.4-1）。編集・削除は下端の操作列へ移したので
  // headerRight は空にしてある（「？」の配線はステップ 6）。
  // 中央のタイトルを空にするのは、すぐ下のメタ行と商品名がこの画面の見出しを兼ねるため
  const screenOptions = useMemo(() => ({ title: '' }), []);

  // record が無いときは上の useEffect が前画面へ戻す。戻るまでの 1 フレームぶんの表示
  if (record == null) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={[styles.container, { backgroundColor: colors.background }]} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* 2. メタ行（UI-SPEC §1.4-2）。状態バッジ＋「種別 ・ 出品 → 販売（N日）」 */}
          <View style={styles.metaRow}>
            <StatusBadge isSold={record.isSold} colors={colors} />
            <Text style={[styles.metaText, { color: colors.secondaryLabel }]}>
              {timelineText(record, today)}
            </Text>
          </View>

          {/* 3. 商品名 */}
          <Text style={[styles.itemName, { color: colors.label }]}>
            {record.itemName === '' ? UNTITLED_LABEL : record.itemName}
          </Text>

          {/* 4. レシートカード */}
          <ReceiptCard record={record} />

          {/* 5. 売却トグル。メタ行のバッジとは役割が違うので両方置く（UI-SPEC §5-13） */}
          <SaleStatusToggleCard record={record} onChanged={refresh} />

          {/* 6. メモ */}
          <View style={styles.memoSection}>
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{MEMO_LABEL}</Text>
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
              <Text
                style={[
                  styles.memoText,
                  { color: record.memo === '' ? colors.mutedLabel : colors.label },
                ]}>
                {record.memo === '' ? MEMO_EMPTY_LABEL : record.memo}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* 7. 下端操作列（UI-SPEC §1.4-7）。地色＋上境界線で内容から浮かせる */}
        <View
          style={[
            styles.actionBar,
            { backgroundColor: colors.barBackground, borderTopColor: colors.separator },
          ]}>
          <Pressable
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionButton,
              styles.editButton,
              { backgroundColor: colors.blue, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={styles.editLabel}>{EDIT_RECORD_LABEL}</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionButton,
              styles.deleteButton,
              { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text style={[styles.deleteLabel, { color: colors.red }]}>{DELETE_LABEL}</Text>
          </Pressable>
        </View>
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

/** メタ行の「不用品 ・ 8/2 出品 → 8/9 販売（7日）」（UI-SPEC §1.4-2。文の組み立ては labels.ts） */
function timelineText(record: SaleRecord, today: Date): string {
  const saleStartDate = fromDbDate(record.saleStartDate);
  const saleDate = record.saleDate == null ? null : fromDbDate(record.saleDate);

  return recordTimelineText({
    kind: record.kind,
    listedDate: formatShortDate(saleStartDate),
    // 出品中は行き先の日付がない。バッジが「出品中」でも saleDate を見て判定するのは、
    // 「売れた記録なのに販売日が無い」状態（旧データ）でも矢印の右が空にならないようにするため
    soldDate: saleDate == null ? null : formatShortDate(saleDate),
    days: listingDays({ saleStartDate, saleDate }, today),
  });
}

/** メタ行の状態バッジ（UI-SPEC §1.4-2）。状態を**表示**するだけで、変えるのはトグルの役割（§5-13） */
function StatusBadge({ isSold, colors }: { isSold: boolean; colors: ThemeColors }) {
  return (
    <View style={[styles.badge, { backgroundColor: isSold ? colors.green : colors.orange }]}>
      <Text style={styles.badgeText}>{isSold ? SOLD_BADGE_LABEL : LISTING_STATUS_LABEL}</Text>
    </View>
  );
}

/**
 * 売却トグル（UI-SPEC §1.4-5 / Swift 版 SaleStatusToggleCard）。
 * 切り替えた瞬間に保存する。販売日の付け外しは repository.setSoldStatus に任せる（SPEC §3.2）。
 */
function SaleStatusToggleCard({
  record,
  onChanged,
}: {
  record: SaleRecord;
  onChanged: () => void;
}) {
  const colors = useThemeColors();

  const handleChange = (isSold: boolean) => {
    setSoldStatus(record.id, isSold);
    onChanged();
  };

  return (
    <View style={[styles.card, styles.toggleCard, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.toggleLabel, { color: colors.label }]}>{MARK_AS_SOLD_LABEL}</Text>
      <Switch
        value={record.isSold}
        onValueChange={handleChange}
        accessibilityLabel={MARK_AS_SOLD_LABEL}
        trackColor={{ true: colors.green, false: colors.disabledBackground }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    // 下端の操作列に隠れないぶんの余白
    paddingBottom: 96,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    flexShrink: 1,
    fontSize: 13,
  },
  itemName: {
    fontSize: 26,
    fontWeight: '700',
  },
  card: {
    padding: 16,
    borderRadius: 12,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  toggleLabel: {
    fontSize: 16,
  },
  memoSection: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  memoText: {
    fontSize: 15,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    flex: 1,
  },
  editLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  deleteButton: {
    width: 104,
  },
  deleteLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
});
