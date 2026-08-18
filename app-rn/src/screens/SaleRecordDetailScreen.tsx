// レコード詳細（UI-SPEC §1.4 / 採用案 3d）。SaleRecordDetailView.swift の後継。
// 記録タブの一覧・データタブの内訳の行タップからプッシュ遷移してくる。
//
// 3d のねらいは「金額の流れを 1 枚のレシートで見せ、編集・削除を下端にまとめる」。
// 商品情報カード＋費用内訳カードの 2 枚（旧構成）を 1 枚のレシートに畳み、
// 種別と日付はカードの外のメタ行に出す。ヘッダのペン・ゴミ箱アイコンは下端の
// 「編集する」「削除」に置き換えた（何をする操作なのかを語で読めるようにする）。
//
// 下端の 2 つは**全幅の帯から浮いた FAB へ移した**（components/Fab.tsx）── 計算タブ・
// 記録一覧の「記録する」と同じ形にして、どの画面でも押す口を同じ場所に置くため。
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
import { StrikeAchievementBadge } from '@/components/StrikeAchievementBadge';
import { TagChip } from '@/components/TagChip';
import { UndoBar } from '@/components/UndoBar';
import { BANNER_UNIT_ID } from '@/ads/adUnits';
import { AdBanner } from '@/components/AdBanner';
import { Fab, FAB_HEIGHT } from '@/components/Fab';
import { showAchievementToast } from '@/components/achievementToastBus';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord, Tag } from '@/db/schema';
import {
  deleteRecord,
  setSaleDate,
  setSoldStatus,
  useAchievementsData,
  useRecord,
} from '@/db/useRecords';
import { useRecordTagIds, useTagList } from '@/db/useTags';
import { formatShortDate } from '@/logic/format';
import {
  deleteConfirmTitle,
  deleteLabel,
  editRecordLabel,
  itemNameLabel,
  listingStatusLabel,
  markedAsSoldMessage,
  memoEmptyLabel,
  memoLabel,
  photoAddFromDetailLabel,
  photoImageLabel,
  photoSquareLabel,
  photoTapHint,
  revertToListingConfirmLabel,
  soldBadgeLabel,
  undoLabel,
  untitledLabel,
  cancelLabel,
  recordTimelineText,
  revertToListingConfirmTitle,
} from '@/logic/labels';
import { strikeAchievementsByRecordId, type Achievement } from '@/logic/achievements';
import { listingDays } from '@/logic/listingDays';
import { photoStore } from '@/media/expoPhotoFiles';
import { initialSaleDate } from '@/logic/saleDate';
import { selectedTags } from '@/logic/tag';
import { RecordFormSheet } from '@/screens/RecordFormSheet';
import { useLocale, type Locale } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';
import { LongPressCopy } from '@/components/LongPressCopy';

export function SaleRecordDetailScreen() {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

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
  // ⚡一撃バッジ用。全記録ぶんの実績評価から、この画面の記録が「達成した記録」に
  // なっている分だけを引く（strikeAchievementsByRecordId のコメント参照。判定はここで作り直さない）
  const { achievements } = useAchievementsData();
  const strikeBadges = useMemo(
    () => strikeAchievementsByRecordId(achievements),
    [achievements],
  );
  const strikeAchievement = id == null ? null : (strikeBadges.get(id) ?? null);
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

    const newlyCompleted = setSoldStatus(
      id,
      true,
      initialSaleDate(fromDbDate(record.saleStartDate), today),
    );
    showAchievementToast(newlyCompleted);
    refresh();
    setShowUndo(true);
    setHighlightSoldDate(true);
    // バーは数秒で消えるので、バーだけに情報を載せない（§8.3）
    AccessibilityInfo.announceForAccessibility(markedAsSoldMessage(locale));
  }, [id, record, refresh, today, locale]);

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

    Alert.alert(revertToListingConfirmTitle(locale, formatShortDate(fromDbDate(record.saleDate))), undefined, [
      { text: cancelLabel(locale), style: 'cancel' },
      { text: revertToListingConfirmLabel(locale), style: 'destructive', onPress: revert },
    ]);
  }, [hideFeedback, id, record, refresh, locale]);

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
    Alert.alert(deleteConfirmTitle(locale), undefined, [
      { text: cancelLabel(locale), style: 'cancel' },
      {
        text: deleteLabel(locale),
        style: 'destructive',
        onPress: () => {
          deleteRecord(id);
          if (router.canGoBack()) router.back();
        },
      },
    ]);
  }, [id, router, locale]);

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
        {/* 内容と下端操作列をひとまとめにして、その**下**に広告を置く（記録一覧と同じ形）。
            この View が flex: 1 なので、広告が出ると内容の高さが自動で縮む ── 操作列は
            この中の絶対配置なので、広告に重なることがそもそも起きない */}
        <View style={styles.contentArea}>
          <ScrollView contentContainerStyle={styles.content}>
            {/* 2. メタ行（UI-SPEC §1.4-2）。状態バッジ＋「種別 ・ 出品 → 販売（N日）」 */}
            <View style={styles.metaRow}>
              <StatusBadge isSold={record.isSold} colors={colors} />
              <Text style={[styles.metaText, { color: colors.secondaryLabel }]}>
                {timelineText(locale, record, today)}
              </Text>
            </View>

            {/* 3. 見出しの塊（SPEC-V5 §2.1）。**左に写真・右に商品名とタグ。**
                レシートカードの外側に置くのは、カードが金額の面だから（UI-SPEC §1.4）。
                写真が無いときは左の正方形を出さず、塊の右端の破線の正方形
                （編集フォームの空枠と同じ形）が足す口になる（§2.2 / 決定 §6-4） */}
            <RecordHeaderBlock
              record={record}
              tags={recordTags}
              strikeAchievement={strikeAchievement}
              onAddPhoto={() => setShowForm(true)}
            />

            {/* 4. レシートカード。先頭に帯グラフが入る（出品中・売却済み共通）。
                独立した凡例は置かず、レシートの各行のドットが帯の区画と色で対応する。
                出品中・価格設定済みだけ、帯の直下に pricing 画面への結論行（O3 案）が付く
                （RecordBreakdownBar が自分で判定・push する。売却済みでは出ない） */}
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
              <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{memoLabel(locale)}</Text>
              <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
                <LongPressCopy label={memoLabel(locale)} text={record.memo}>
                  <Text
                    style={[
                      styles.memoText,
                      { color: record.memo === '' ? colors.mutedLabel : colors.label },
                    ]}>
                    {record.memo === '' ? memoEmptyLabel(locale) : record.memo}
                  </Text>
                </LongPressCopy>
              </View>
            </View>
          </ScrollView>

          {/* 7. 下端の操作（UI-SPEC §1.4-7）。**他の画面と同じ浮いた FAB**（Fab）。
              全幅の帯だった頃は、画面ごとに押す口の形も置き場所も違っていた。
              編集は左（他の画面の＋と同じ位置）、削除は右に離す ── 消えると戻せない
              操作なので、いちばん押しやすい位置には置かない */}
          <Fab
            icon="pencil"
            label={editRecordLabel(locale)}
            onPress={() => setShowForm(true)}
            backgroundColor={colors.blue}
            style={styles.editFab}
          />
          <Fab
            icon="trash-outline"
            label={deleteLabel(locale)}
            onPress={handleDelete}
            // 帯だった頃と同じ主従（編集が塗り、削除は地に赤い字）。塗りつぶしの赤にすると、
            // 画面でいちばん強い色が「消す」になってしまう
            backgroundColor={colors.secondaryBackground}
            foregroundColor={colors.red}
            style={styles.deleteFab}
          />

          {/* 「売れた」を押した直後だけ出る取り消しの口（UI-SPEC §8.3）。
              数秒で消えるが、訂正口（売れた日の行）は残る。下端の FAB の上に重ねる */}
          {showUndo && (
            <UndoBar
              message={markedAsSoldMessage(locale)}
              actionLabel={undoLabel(locale)}
              onAction={handleUndoMarkSold}
              onHide={hideFeedback}
              bottomOffset={FAB_BOTTOM + FAB_HEIGHT + 8}
            />
          )}
        </View>

        {/* バナー広告。contentArea の兄弟なので、出ると内容が縮む。
            同意前・初期化前・読み込み失敗のときは何も描画しない（AdBanner が畳む） */}
        <AdBanner unitId={BANNER_UNIT_ID} />
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
// コンポーネントではないので locale は引数で受ける（フックは使えない）
function timelineText(locale: Locale, record: SaleRecord, today: Date): string {
  const saleStartDate = fromDbDate(record.saleStartDate);
  const saleDate = record.saleDate == null ? null : fromDbDate(record.saleDate);

  return recordTimelineText(locale, {
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
  strikeAchievement,
  onAddPhoto,
}: {
  record: SaleRecord;
  tags: Tag[];
  strikeAchievement: Achievement | null;
  onAddPhoto: () => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

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
            accessibilityLabel={photoImageLabel(locale)}
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
              label={itemNameLabel(locale)}
              text={record.itemName}
              style={styles.itemNameCopy}>
              <Text style={[styles.itemName, { color: colors.label }]}>
                {record.itemName === '' ? untitledLabel(locale) : record.itemName}
              </Text>
            </LongPressCopy>
            {/* ⚡一撃系のバッジ。この記録が実際に「達成した記録」になっている場合だけ
                （strikeAchievement は画面側が strikeAchievementsByRecordId で引いたもの） */}
            {strikeAchievement != null && (
              <StrikeAchievementBadge achievement={strikeAchievement} />
            )}
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
            accessibilityLabel={photoAddFromDetailLabel(locale)}
            style={({ pressed }) => [
              styles.photoPlaceholder,
              { borderColor: colors.separator, opacity: pressed ? 0.5 : 1 },
            ]}>
            <Ionicons name="image-outline" size={22} color={colors.blue} />
            <Text style={[styles.photoPlaceholderLabel, { color: colors.blue }]}>
              {photoSquareLabel(locale)}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 画像には押せる印が付かないので、押せることは語で言う（§2.1）。
          写真が無いときは押す対象そのものが無いので出さない */}
      {uri != null && (
        <Text style={[styles.photoHint, { color: colors.secondaryLabel }]}>{photoTapHint(locale)}</Text>
      )}

      {viewerOpen && uri != null && (
        <PhotoViewer uri={uri} visible={viewerOpen} onClose={() => setViewerOpen(false)} />
      )}
    </View>
  );
}

/** メタ行の状態バッジ（UI-SPEC §1.4-2）。状態を**表示**するだけで、変えるのはトグルの役割（§5-13） */
function StatusBadge({ isSold, colors }: { isSold: boolean; colors: ThemeColors }) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  return (
    <View style={[styles.badge, { backgroundColor: isSold ? colors.green : colors.orange }]}>
      <Text style={styles.badgeText}>{isSold ? soldBadgeLabel(locale) : listingStatusLabel(locale)}</Text>
    </View>
  );
}

/** 下端の操作列の高さ（余白込み）。undo バーはこの上に重ねる（UI-SPEC §8.3） */
/** FAB の下端からの距離。他の画面の addButton と同値（Fab の冒頭コメント参照） */
const FAB_BOTTOM = 24;


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
  contentArea: {
    flex: 1,
  },
  content: {
    padding: 16,
    // 下端の FAB に隠れないぶんの余白（記録一覧の listContent と同値）
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
  // FAB は 2 つとも contentArea の下端から同じ高さ。contentArea の下端が広告枠の
  // 上端なので、この値がそのまま**広告との距離**になる（広告の中身まではさらに
  // AdBanner の AD_SPACING ぶん空く）。押し損ねた指が広告に当たると無効トラフィックとして
  // 数えられるため、24 より詰めないこと。広告が出ていないときはタブバーからの距離になる
  editFab: {
    left: 20,
    bottom: FAB_BOTTOM,
  },
  deleteFab: {
    right: 20,
    bottom: FAB_BOTTOM,
  },
});
