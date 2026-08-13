// レコード詳細（UI-SPEC §1.4 / 採用案 3d）。SaleRecordDetailView.swift の後継。
// 記録タブの一覧・データタブの内訳の行タップからプッシュ遷移してくる。
//
// 3d のねらいは「金額の流れを 1 枚のレシートで見せ、編集・削除を下端の操作列にまとめる」。
// 商品情報カード＋費用内訳カードの 2 枚（旧構成）を 1 枚のレシートに畳み、
// 種別と日付はカードの外のメタ行に出す。ヘッダのペン・ゴミ箱アイコンは下端の
// 「編集する」「削除」に置き換えた（何をする操作なのかを語で読めるようにする）。
//
// - 状態はメタ行のバッジ（表示）と状態カード（変更）の両方を置く（§5-13。役割が違う）。
// - 写真は商品名の直後・**レシートカードの外側**（SPEC-V5 §2.1）。カードは金額の面なので、
//   金額でないものを中に入れない（タグと同じ理由。SPEC-V4 §3.4）。
//   写真が無いときは節ごと出さず、**見出しの塊の右端の破線の正方形**（編集フォームの
//   空枠と同じ形）が足す口になる（§2.2 / 決定 §6-4）。押すと編集フォームが開く。
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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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

import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { PhotoViewer } from '@/components/PhotoViewer';
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
  ITEM_NAME_LABEL,
  LISTING_STATUS_LABEL,
  MARKED_AS_SOLD_MESSAGE,
  MEMO_EMPTY_LABEL,
  MEMO_LABEL,
  PHOTO_ADD_FROM_DETAIL_LABEL,
  PHOTO_IMAGE_LABEL,
  PHOTO_SQUARE_LABEL,
  PHOTO_TAP_HINT,
  REVERT_TO_LISTING_CONFIRM_LABEL,
  SOLD_BADGE_LABEL,
  UNDO_LABEL,
  UNTITLED_LABEL,
  CANCEL_LABEL,
  recordTimelineText,
  revertToListingConfirmTitle,
} from '@/logic/labels';
import { listingDays } from '@/logic/listingDays';
import { photoStore } from '@/media/expoPhotoFiles';
import { initialSaleDate } from '@/logic/saleDate';
import { selectedTags } from '@/logic/tag';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useThemeColors, type ThemeColors } from '@/theme';
import { LongPressCopy } from '@/components/LongPressCopy';

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
  const [showHelp, setShowHelp] = useState(false);
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

  // ヘッダは「◀ 記録」と右の「？」（UI-SPEC §1.4-1）。編集・削除は下端の操作列にある。
  // 中央のタイトルを空にするのは、すぐ下のメタ行と商品名がこの画面の見出しを兼ねるため
  const screenOptions = useMemo(
    () => ({
      title: '',
      headerRight: () => <HelpButton onPress={() => setShowHelp(true)} />,
    }),
    [],
  );

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

          {/* 3. 見出しの塊（SPEC-V5 §2.1）。**左に写真・右に商品名とタグ。**
              レシートカードの外側に置くのは、カードが金額の面だから（UI-SPEC §1.4）。
              写真が無いときは左の正方形を出さず、塊の右端の破線の正方形
              （編集フォームの空枠と同じ形）が足す口になる（§2.2 / 決定 §6-4） */}
          <RecordHeaderBlock
            record={record}
            tags={recordTags}
            onAddPhoto={() => setShowForm(true)}
          />

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

          {/* 6. メモ */}
          <View style={styles.memoSection}>
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{MEMO_LABEL}</Text>
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
              <LongPressCopy label={MEMO_LABEL} text={record.memo}>
                <Text
                  style={[
                    styles.memoText,
                    { color: record.memo === '' ? colors.mutedLabel : colors.label },
                  ]}>
                  {record.memo === '' ? MEMO_EMPTY_LABEL : record.memo}
                </Text>
              </LongPressCopy>
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

      {/* ヘッダの「？」（UI-SPEC §5-9）。詳細で困るのは直し方なので、その項目が先頭に出る */}
      {showHelp && (
        <HelpSheet
          entry="recordDetail"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
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
 * 見出しの塊（SPEC-V5 §2.1 / 採用案 `41a`）。**左に写真・右に商品名とタグ。**
 *
 * レシートカードの外側に置くのは、カードが「販売価格 − 内訳 = 結果」の金額の面
 * （UI-SPEC §1.4）で、写真もタグも金額ではないため（SPEC-V4 §3.4 と同じ理由）。
 *
 * **全幅 196pt の帯（初期の実装）から、商品名の左の正方形へ改めた**（決定 §6-9）:
 * - 写真は**この画面の主役ではない**。開く目的はふつう金額の確認で、帯にすると
 *   レシートカードが毎回 1 画面ぶん下へ落ちる
 * - 帯は**写真のある記録とない記録で画面の形が大きく変わる**。正方形なら
 *   「無いときは出さない」でも段が減るだけで、商品名の位置は動かない
 * - **一覧の行（左に 56pt の枠）と同じ並び**になる。同じ記録を一覧・詳細・フォームの
 *   3 つで見るので、写真と名前の位置関係が画面ごとに入れ替わらない
 * - 大きく見たいときは押して全画面（§2.1）。**その口があるので、常時大きく出す必要がない**
 *
 * **タグはこの塊の中・商品名の下**（SPEC-V4 §3.4 の再改訂）。写真がタグの左に
 * 固定の高さ（88pt）を作るので、チップ 1 段ぶんは**縦を増やさずに収まる**ようになった
 * ── レシートカードの下へ逃がしていた理由（可変長で金額の面を押し下げる）が、
 * ここでは薄くなる。0 件なら行ごと出さない。
 *
 * チップは**表示のみ**（「✕」を出さない）── この画面に保存の口が無い。
 * 外すのは編集フォームのタグ行（§3.1）で、そこには「保存」がある。
 * 薄い地は敷く ── 見出しもカードも持たない裸の並びなので、地が無いと
 * 点と名前の連なりがどこで切れるのか読めない。
 */
function RecordHeaderBlock({
  record,
  tags,
  onAddPhoto,
}: {
  record: SaleRecord;
  tags: Tag[];
  onAddPhoto: () => void;
}) {
  const colors = useThemeColors();
  const [viewerOpen, setViewerOpen] = useState(false);
  const uri = photoStore.uri(record.photoFileName);

  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        {uri != null && (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={PHOTO_IMAGE_LABEL}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Image
              source={{ uri }}
              // 白っぽい写真がカードの地に溶けないよう枠を回す（一覧・フォームと同じヘアライン）
              style={[
                styles.photo,
                { backgroundColor: colors.secondaryBackground, borderColor: colors.separator },
              ]}
              // 正方形の枠に横長・縦長のどちらが来ても歪まないよう、はみ出す側を切る。
              // 全体を確かめるのは全画面の役割（contain）
              contentFit="cover"
              transition={0}
            />
          </Pressable>
        )}

        {/* 正方形より中身が短いときは、名前とタグを**正方形の高さの中で天地中央**に置く
            （一覧の行と同じ手当て。RecordRow の body）── 商品名 1 行だけの記録では
            右側が上に張り付いて、正方形の下半分が空いて見えるため。
            正方形そのものは上端に置いたまま（headerRow は flex-start）にするのは、
            名前が 2 行・3 行に伸びたときに写真が下へ動かないようにするため */}
        <View
          style={[
            styles.headerText,
            { minHeight: uri == null ? PHOTO_PLACEHOLDER_SIZE : PHOTO_SIZE },
          ]}>
          <View style={styles.itemNameRow}>
            <LongPressCopy
              label={ITEM_NAME_LABEL}
              text={record.itemName}
              style={styles.itemNameCopy}>
              <Text style={[styles.itemName, { color: colors.label }]}>
                {record.itemName === '' ? UNTITLED_LABEL : record.itemName}
              </Text>
            </LongPressCopy>
          </View>

          {tags.length > 0 && (
            <View style={styles.tagLine}>
              {tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} variant="selected" />
              ))}
            </View>
          )}
        </View>

        {/* 写真が無いときだけ、塊の右端に足す口（§2.2 / 決定 §6-4）。
            小さなアイコン 1 つから**編集フォームと同じ破線の正方形**に改めた ──
            同じ記録の「写真がまだ無い」状態を詳細とフォームで別の形で見せると、
            押した先（フォーム）に出るものが押す前に読めない。破線 ＋「写真」の語なのも
            フォームと同じ理由で、実線だと「写真が出る場所」に見えて押せることが読めない。
            位置は今までどおり右（写真があるときの左の正方形とは入れ替わる）。
            商品名の行の中ではなく塊の右に置くのは、タグの行が正方形の左へ回り込んで、
            写真があるときと同じ形に収まるため */}
        {uri == null && (
          <Pressable
            onPress={onAddPhoto}
            accessibilityRole="button"
            accessibilityLabel={PHOTO_ADD_FROM_DETAIL_LABEL}
            style={({ pressed }) => [
              styles.photoPlaceholder,
              { borderColor: colors.separator, opacity: pressed ? 0.5 : 1 },
            ]}>
            <Ionicons name="image-outline" size={22} color={colors.blue} />
            <Text style={[styles.photoPlaceholderLabel, { color: colors.blue }]}>
              {PHOTO_SQUARE_LABEL}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 画像には押せる印が付かないので、押せることは語で言う（§2.1）。
          写真が無いときは押す対象そのものが無いので出さない */}
      {uri != null && (
        <Text style={[styles.photoHint, { color: colors.secondaryLabel }]}>{PHOTO_TAP_HINT}</Text>
      )}

      {viewerOpen && uri != null && (
        <PhotoViewer uri={uri} visible={viewerOpen} onClose={() => setViewerOpen(false)} />
      )}
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

/**
 * 写真の一辺（SPEC-V5 §2.1）。一覧の枠（56pt）・フォームの枠（72pt）より大きい ──
 * この画面がいちばん 1 件を見る面なので、3 つの中では最大にする。
 */
const PHOTO_SIZE = 88;

/** 写真が無いときの破線の枠。編集フォームの空枠（PhotoField）と同じ 72pt */
const PHOTO_PLACEHOLDER_SIZE = 72;

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
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemNameCopy: {
    flexShrink: 1,
  },
  itemName: {
    fontSize: 26,
    fontWeight: '700',
  },
  headerBlock: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 8,
    // 正方形（写真 or 破線の枠）の高さの中で天地中央。minHeight は写真の有無で変わるので
    // 呼び出し側で足す。中身がこれより高くなったら、そこからは普通に下へ伸びる
    justifyContent: 'center',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoPlaceholder: {
    width: PHOTO_PLACEHOLDER_SIZE,
    height: PHOTO_PLACEHOLDER_SIZE,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoPlaceholderLabel: {
    fontSize: 11,
  },
  tagLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoHint: {
    fontSize: 12,
    marginLeft: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
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
