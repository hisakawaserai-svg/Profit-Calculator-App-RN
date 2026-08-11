// レコード詳細（UI-SPEC §1.4 / 採用案 3d）。SaleRecordDetailView.swift の後継。
// 記録タブの一覧・データタブの内訳の行タップからプッシュ遷移してくる。
//
// 3d のねらいは「金額の流れを 1 枚のレシートで見せ、編集・削除を下端の操作列にまとめる」。
// 商品情報カード＋費用内訳カードの 2 枚（旧構成）を 1 枚のレシートに畳み、
// 種別と日付はカードの外のメタ行に出す。ヘッダのペン・ゴミ箱アイコンは下端の
// 「編集する」「削除」に置き換えた（何をする操作なのかを語で読めるようにする）。
//
// - 状態はメタ行のバッジ（表示）と状態カード（変更）の両方を置く（§5-13。役割が違う）。
// - 画面下部の 1 件サマリー（Swift 版 CareerSummarySection）は置かない（§5-12）。
//   レシートの結果行（種別語＋額）が同じ役割を果たす。
// - 経過日数は出品日起算・当日 0 日（§5-2。算出は logic/listingDays.ts）。
// - 種別の変更 UI は置かない。編集フォーム経由のみ（SPEC-V2 §1.3）。
// - 表示語はすべて labels.ts 経由（SPEC-V2 §5.3）。
//
// 状態の切り替え（§8 / 案 15c。旧・売却トグルの置き換え）:
// - **押した時点で保存する**（§8.6）。useRecord の refresh で引き直して表示に反映する。
// - 出品中 →「売れた」: saleDate = 今日（出品日が未来なら出品日。§8.5）を即座に入れる。
//   確認は挟まない。代わりに合図を 2 つ出す ── 売れた日の行の薄い青の下地（どこを直すか）と、
//   画面下部の undo バー（取り消しの口）。**バーが消えても日付行は残る**（§8.3）。
// - 売れた →「出品中に戻す」: 確認を 1 枚だけ出してから saleDate = null（§8.4）。
//   入力済みの日付が消える破壊的操作なので、順方向とは非対称でよい。
// - 切り替えでレコードが一覧の現在の絞り込みから外れても、この画面は閉じない。
//   押し間違いをその場で戻せる・入った販売日を確認できるほうが妥当なため。
//   一覧側は戻ったタイミングの useFocusEffect で引き直される。
// - 削除は確認アラート「削除しますか？」を挟んでから削除し、前画面へ戻る（SPEC §5.4）。
//
// 決定 §7-6 のとおり、Swift 版の careerProfit / careerExpenses と、
// それらのためだけにあった allRecords の @FetchRequest は移植していない（計算のみで未使用）。
// 同じく未使用だった targetMonth も引き継がない。
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ReceiptCard, SaleStatusCard } from '@/components/RecordDetailSections';
import { TagChip } from '@/components/TagChip';
import { UndoBar } from '@/components/UndoBar';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord, Tag } from '@/db/schema';
import { deleteRecord, setSaleDate, setSoldStatus, useRecord } from '@/db/useRecords';
import { useRecordTagIds, useTagList } from '@/db/useTags';
import { formatShortDate } from '@/logic/format';
import {
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  EDIT_RECORD_LABEL,
  LISTING_STATUS_LABEL,
  MARKED_AS_SOLD_MESSAGE,
  MEMO_EMPTY_LABEL,
  MEMO_LABEL,
  REVERT_TO_LISTING_CONFIRM_LABEL,
  SOLD_BADGE_LABEL,
  TAG_SECTION_LABEL,
  UNDO_LABEL,
  UNTITLED_LABEL,
  CANCEL_LABEL,
  recordTimelineText,
  revertToListingConfirmTitle,
} from '@/logic/labels';
import { listingDays } from '@/logic/listingDays';
import { initialSaleDate } from '@/logic/saleDate';
import { selectedTags } from '@/logic/tag';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors, type ThemeColors } from '@/theme';

export function SaleRecordDetailScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { record, refresh } = useRecord(id);
  // タグ（SPEC-V4 §3.4 / 設計案 32b）。名前と色は tags の側にしかないので 2 つ合わせて解決する。
  // フォームで付け替えるとどちらも変わり得るので、保存の後は両方を引き直す
  const { tags } = useTagList();
  const { tagIds, refresh: refreshTagIds } = useRecordTagIds(id);
  const recordTags = selectedTags(tags, tagIds);
  const [showForm, setShowForm] = useState(false);
  /** 「今日」はマウント時に 1 回だけ決める（出品中の経過日数の基準） */
  const today = useMemo(() => new Date(), []);

  /**
   * 「売れた」を押した直後の 2 つの合図（UI-SPEC §8.3）。役割が違うので別の state にする ──
   * ハイライトは日付行を押した時点で役目を終える（バーはそのまま残る）。
   * 消えるタイミングは UndoBar のタイマー（TRANSIENT_FEEDBACK_MS）が両方に効く。
   */
  const [showUndo, setShowUndo] = useState(false);
  const [highlightSoldDate, setHighlightSoldDate] = useState(false);

  const hideFeedback = useCallback(() => {
    setShowUndo(false);
    setHighlightSoldDate(false);
  }, []);

  /** 出品中 → 売れた（§8.1）。追加タップ 0 で今日として確定し、直せる場所を画面に残す */
  const handleMarkSold = useCallback(() => {
    if (record == null) return;

    setSoldStatus(id, true, initialSaleDate(fromDbDate(record.saleStartDate), today));
    refresh();
    setShowUndo(true);
    setHighlightSoldDate(true);
    // バーは数秒で消えるので、バーだけに情報を載せない（§8.3）
    AccessibilityInfo.announceForAccessibility(MARKED_AS_SOLD_MESSAGE);
  }, [id, record, refresh, today]);

  /** バーの「元に戻す」（§8.3）。直前の操作の取り消しなので §8.4 の確認は出さない */
  const handleUndoMarkSold = useCallback(() => {
    setSoldStatus(id, false);
    refresh();
    hideFeedback();
  }, [hideFeedback, id, refresh]);

  /** 売れた → 出品中（§8.4）。入力済みの販売日が消えるので確認を 1 枚だけ挟む */
  const handleRevertToListing = useCallback(() => {
    if (record == null) return;

    const revert = () => {
      setSoldStatus(id, false);
      refresh();
      hideFeedback();
    };

    // 販売日のない売れた記録（旧データ）では消えるものがないので、そのまま戻す
    if (record.saleDate == null) {
      revert();
      return;
    }

    Alert.alert(revertToListingConfirmTitle(formatShortDate(fromDbDate(record.saleDate))), undefined, [
      { text: CANCEL_LABEL, style: 'cancel' },
      { text: REVERT_TO_LISTING_CONFIRM_LABEL, style: 'destructive', onPress: revert },
    ]);
  }, [hideFeedback, id, record, refresh]);

  /** 売れた日の行から日付を直したとき（§8.2）。状態は変えず、その場で保存する */
  const handleChangeSaleDate = useCallback(
    (value: Date) => {
      setSaleDate(id, value);
      refresh();
    },
    [id, refresh],
  );

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

          {/* 5. 状態カード。メタ行のバッジとは役割が違うので両方置く（UI-SPEC §5-13 / §8.7） */}
          <SaleStatusCard
            record={record}
            today={today}
            highlighted={highlightSoldDate}
            onMarkSold={handleMarkSold}
            onRevertToListing={handleRevertToListing}
            onChangeSaleDate={handleChangeSaleDate}
            // 直す場所へ自分でたどり着いたなら、指し示す下地はもう要らない（§8.3）
            onPressSoldDate={() => setHighlightSoldDate(false)}
          />

          {/* 5a. タグ（SPEC-V4 §3.4 / 設計案 32b）。**表示のみ**で、付け替えはフォーム経由
              （SiteNameRow と同じ扱い）。メモと同じ「補足」の並びに置くのは、レシートカードの
              位置と大きさをタグの数で動かさないため ── 決定 §9-12 は「メタ行の下・商品名の直後」
              としていたが、そこに置くとタグが増えるたびに金額の面が下へ押し出される。
              **0 件のときはカードごと出さない**（メモと違い、空欄を埋める操作がこの画面に無い） */}
          {recordTags.length > 0 && <TagSection tags={recordTags} />}

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

        {/* 「売れた」を押した直後だけ出る取り消しの口（UI-SPEC §8.3）。
            数秒で消えるが、訂正口（売れた日の行）は残る。下端の操作列の上に重ねる */}
        {showUndo && (
          <UndoBar
            message={MARKED_AS_SOLD_MESSAGE}
            actionLabel={UNDO_LABEL}
            onAction={handleUndoMarkSold}
            onHide={hideFeedback}
            bottomOffset={ACTION_BAR_HEIGHT + 8}
          />
        )}
      </View>

      <RecordFormSheet
        visible={showForm}
        record={record}
        onClose={() => setShowForm(false)}
        // フォームはこの画面の上のモーダルなので焦点が動かない ──
        // タグの節も明示的に引き直さないと、付け替えが反映されない
        onSaved={() => {
          refresh();
          refreshTagIds();
        }}
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

/**
 * タグの節（SPEC-V4 §3.4 / 設計案 32b）。メモと同じ「見出し ＋ カード」の形。
 *
 * チップは**表示のみ**（「✕」を出さない）── この画面に保存の口が無いため。
 * 外すのは編集フォームのタグ行（§3.1）で、そこには「保存」がある。
 *
 * 地色は敷く（§2.3 の表は記録詳細を `plain` としていたが、案 32b の絵は薄い地のチップ）──
 * カードの中に複数のチップが折り返して並ぶので、地が無いと点と名前の連なりが
 * 1 つの文に見えてしまい、どこまでが 1 つのタグなのか読めない。
 * 「✕」は `onRemove` を渡さなければ出ないので、押せる印は付かない。
 * 並びは tags.sortOrder 昇順（§1.5）。呼び出し側が selectedTags で解決して渡す。
 */
function TagSection({ tags }: { tags: Tag[] }) {
  const colors = useThemeColors();

  return (
    <View style={styles.tagSection}>
      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        {TAG_SECTION_LABEL}
      </Text>
      {/* チップは折り返して下に伸びる。カードの高さがタグの数で変わっても、
          上のレシートカードは動かない（この節をレシートの下に置いた理由そのもの） */}
      <View style={[styles.card, styles.tagCard, { backgroundColor: colors.secondaryBackground }]}>
        {/* **表示のみ**（§3.4 / 決定 §9-12）。`selected` の薄い地を敷くと、
            外せない場所なのに「押せば外せる」ように読める */}
        {tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} variant="plain" />
        ))}
      </View>
    </View>
  );
}

/** メタ行の状態バッジ（UI-SPEC §1.4-2）。状態を**表示**するだけで、変えるのはトグルの役割（§5-13） */
function StatusBadge({ isSold, colors }: { isSold: boolean; colors: ThemeColors }) {
  return (
    <View style={[styles.badge, { backgroundColor: isSold ? colors.green : colors.orange }]}>
      <Text style={styles.badgeText}>{isSold ? SOLD_BADGE_LABEL : LISTING_STATUS_LABEL}</Text>
    </View>
  );
}

/** 下端の操作列の高さ（余白込み）。undo バーはこの上に重ねる（UI-SPEC §8.3） */
const ACTION_BAR_HEIGHT = 88;

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
  memoSection: {
    gap: 6,
  },
  tagSection: {
    gap: 6,
  },
  tagCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    // チップが自前で左右の余白を持つので、カードの内側は少し詰めて名前の左端を揃える
    padding: 12,
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
