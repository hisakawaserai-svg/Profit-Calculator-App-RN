// お知らせ画面（ベルから開くモーダル）。app/notifications.tsx から呼ばれる。
//
// **ルート直下（(tabs) の兄弟）のモーダルルートにする**（app/_layout.tsx）── 4タブどこの
// ヘッダーからでも同じ画面を開けるようにするため。以前のボトムシート（NotificationsSheet、
// 記録タブにしか無かった）は廃止した。
//
// **3 タブ構成**（「順番に積み上げていく履歴と、今の滞留一覧は別物にした方がいい」という
// 実機テスト後の見直しで、2 タブ「自分宛て/アップデート情報」から移行。合意: 2026-09）:
//   - すべて: 実際に届いた OS 通知をそのまま届いた順に並べる履歴
//     （settings/notificationHistory.ts。上限 200 件）。月初の生きた振り返り
//     （まだ履歴に載っていない当日ぶん）は先頭にピン留めで重ねて出す
//   - 滞留中: 出品滞留アラートの対象を、月初かどうかに関係なく常に全件出す
//     （bellStore の listingAlertItems。currentNotification の優先判定は経由しない）
//   - アップデート情報: 器だけで中身は後回し（クロードデザインでのデザインレビュー時の合意）
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/SegmentedControl';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord } from '@/db/schema';
import { formatMonthKeyTitle, formatShortDate, formatYenSymbol } from '@/logic/format';
import {
  cancelLabel,
  closeLabel,
  listingAlertDiscountRoomLabel,
  listingAlertElapsedDays,
  listingAlertEyebrow,
  listingAlertHistorySubtitle,
  listingAlertIgnoreConfirmAction,
  listingAlertIgnoreConfirmTitle,
  listingAlertOsTitle,
  listingAlertPriceLabel,
  monthlyReviewEyebrow,
  monthlyReviewOsBody,
  monthlyReviewTotalLabel,
  notificationEmptyMessage,
  notificationHistoryClearAllConfirmTitle,
  notificationHistoryClearAllLabel,
  notificationHistoryEmptyMessage,
  notificationHistoryLimitNote,
  notificationScreenTitle,
  notificationTabHistory,
  notificationTabStagnant,
  notificationTabUpdates,
  notificationUpdatesPlaceholder,
  updateNotesList,
} from '@/logic/labels';
import type { ListingAlertItem } from '@/logic/notifications';
import { photoStore } from '@/media/expoPhotoFiles';
import { useBellStore } from '@/notifications/bellStore';
import {
  clearNotificationHistory,
  dismissMonthlyReview,
  ignoreListingAlert,
  removeNotificationHistoryEntry,
  useLocale,
  useNotificationHistory,
  type Locale,
  type NotificationHistoryEntry,
} from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

const RECORD_DETAIL_PATHNAME = '/records/record/[id]' as const;
const RECORD_PRICING_PATHNAME = '/records/record/[id]/pricing' as const;

export default function NotificationsScreen() {
  const locale = useLocale();
  const colors = useThemeColors();
  const content = useBellStore((state) => state.content);
  const monthlyReviewTotal = useBellStore((state) => state.monthlyReviewTotal);
  const listingAlertItems = useBellStore((state) => state.listingAlertItems);
  const history = useNotificationHistory();
  const [tabIndex, setTabIndex] = useState(0);

  /**
   * このモーダル（お知らせ）を閉じて、記録一覧 → 記録詳細 → 損益分岐点の順にちゃんと積む。
   *
   * **「記録一覧 → 損益分岐点」の2段階で直接飛ばしていたのをやめた。** 普通に記録一覧の
   * 行から長押しで開く経路（RecordListScreen）と同じ深さに揃えるため（実機の指摘）──
   * 通知だけ記録詳細を飛ばして直接損益分岐点に着地すると、戻ったときに詳細を経由できず
   * 「これは別の商品の損益分岐点みたいだ」と感じる違和感になっていた。
   *
   * `dismissTo('/records')` でモーダルを閉じつつ記録一覧の起点に戻し、そこから
   * 詳細・損益分岐点を順に push する。これで戻る履歴が「一覧 → 詳細 → 損益分岐点」の
   * 普通の形になり、**戻る矢印も既定のままで正しく機能する**（fromNotification の
   * ような自前の印は要らなくなった）。
   *
   * **3 回とも同期的に呼ぶと、途中の遷移が上書きされて最後の 1 回しか残らない**
   * （実機で確認：戻る矢印が出ないまま、いきなり損益分岐点だけが開いた状態になっていた）。
   * ナビゲーションの状態更新が 1 フレームで畳まれてしまうとみられるので、
   * `requestAnimationFrame` で 1 コマずつ間を空けて、それぞれ確実に積ませる。
   *
   * **recordId だけで足りる。** SaleRecord 全体を受けないのは、履歴タブの行が
   * （軽さのため）id・商品名・経過日数の3値しか持たず、フルレコードを持たないため。
   */
  const openPricing = (recordId: string) => {
    router.dismissTo('/records');
    requestAnimationFrame(() => {
      router.push({ pathname: RECORD_DETAIL_PATHNAME, params: { id: recordId } });
      requestAnimationFrame(() => {
        router.push({ pathname: RECORD_PRICING_PATHNAME, params: { id: recordId } });
      });
    });
  };
  /** 「すべて」タブの先頭に重ねて出す、今月分の生きた振り返り（押すとベルから消す） */
  const openLiveMonthlyReview = (monthKey: string) => {
    // 押したらベルから消す。isMonthlyReviewActive は月初1日ずっと true なので、
    // 消さないと同じ日にもう一度ベルを開くたびに同じ振り返りがまた出てしまう
    dismissMonthlyReview(monthKey);
    router.dismissTo({ pathname: '/data', params: { month: monthKey } });
  };
  /**
   * 履歴の月次振り返り行（過去分）。**dismissMonthlyReview は呼ばない** ── あれは
   * 「今月分の生きた振り返り」を消すための状態で、過去の月を指す履歴行が上書きすると、
   * 今アクティブな月の抑制状態を壊しかねない（例: 今は9月なのに8月の履歴行を押すと
   * dismissedMonthlyReview が "2026-08" に戻り、9月分の振り返りがまた出てしまう）
   */
  const openHistoryMonthlyReview = (monthKey: string) => {
    router.dismissTo({ pathname: '/data', params: { month: monthKey } });
  };

  const refreshBell = useBellStore((state) => state.refresh);
  /**
   * 長押しの確認。以後この記録の出品滞留アラートを出さないようにする。
   * **recordId・itemName だけで足りる**（SaleRecord 全体を受けない） ── 「滞留中」タブの
   * 行はフルレコードを持つが、「すべて」タブの履歴行は軽さのため id・商品名しか持たない
   * （HistoryRow のコメント参照）ので、どちらからも同じ形で呼べるようにしてある。
   */
  const ignoreListingAlertItem = (recordId: string, itemName: string) => {
    Alert.alert(listingAlertIgnoreConfirmTitle(locale, itemName), undefined, [
      { text: cancelLabel(locale), style: 'cancel' },
      {
        text: listingAlertIgnoreConfirmAction(locale),
        style: 'destructive',
        onPress: () => {
          ignoreListingAlert(recordId);
          refreshBell();
        },
      },
    ]);
  };
  /** 「すべて」タブの行の長押し。無視するのと同時に、その履歴行も消す */
  const ignoreHistoryItem = (entry: Extract<NotificationHistoryEntry, { kind: 'listingAlert' }>) => {
    Alert.alert(listingAlertIgnoreConfirmTitle(locale, entry.itemName), undefined, [
      { text: cancelLabel(locale), style: 'cancel' },
      {
        text: listingAlertIgnoreConfirmAction(locale),
        style: 'destructive',
        onPress: () => {
          ignoreListingAlert(entry.recordId);
          removeNotificationHistoryEntry(entry.id);
          refreshBell();
        },
      },
    ]);
  };
  /**
   * 「すべて」タブの行タップ。**開いたら、その行はもう対応済みとして履歴から消す**
   * （合意: 2026-09。実機での「確認したら消えてほしい」という指摘）。
   */
  const openHistoryEntry = (entry: NotificationHistoryEntry) => {
    removeNotificationHistoryEntry(entry.id);
    if (entry.kind === 'listingAlert') {
      openPricing(entry.recordId);
      return;
    }
    openHistoryMonthlyReview(entry.monthKey);
  };

  // 今日すでに history に載っている「生きた振り返り」と同じ対象は、履歴側から二重に
  // 出さない（liveMonthlyReview が上にピン留めで出すため）
  const liveMonthlyReview = content?.kind === 'monthlyReview' ? content : null;
  const visibleHistory =
    liveMonthlyReview == null
      ? history
      : history.filter(
          (entry) => !(entry.kind === 'monthlyReview' && entry.monthKey === liveMonthlyReview.monthKey),
        );

  /**
   * 「すべて消す」。**ピン留め中の生きた振り返りも一緒に消す**（今表示されているものを
   * 全部消す、という利用者の意図に合わせる）── history 配列だけ空にすると、上の
   * liveMonthlyReview カードだけ残ってしまう
   */
  const clearAllHistory = () => {
    Alert.alert(notificationHistoryClearAllConfirmTitle(locale), undefined, [
      { text: cancelLabel(locale), style: 'cancel' },
      {
        text: notificationHistoryClearAllLabel(locale),
        style: 'destructive',
        onPress: () => {
          clearNotificationHistory();
          if (liveMonthlyReview != null) dismissMonthlyReview(liveMonthlyReview.monthKey);
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: notificationScreenTitle(locale),
          // モーダルには自動で戻る導線が付かない（ExportSheet と同じ理由）ので自前で置く。
          // アイコンだけの✕は右上（iOSでよく見る「モーダルを閉じる」の定位置。カード型シート・
          // 写真アプリ等）。文字ボタン（左に「キャンセル」）は「戻る」の代わりに使う場所
          // （損益分岐点画面のような push 画面）向けで、この画面はモーダルなので✕を使う
          headerRight: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={closeLabel(locale)}>
              <Ionicons name="close" size={24} color={colors.secondaryLabel} />
            </Pressable>
          ),
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.tabRow}>
          <SegmentedControl
            options={[
              notificationTabHistory(locale),
              notificationTabStagnant(locale),
              notificationTabUpdates(locale),
            ]}
            selectedIndex={tabIndex}
            onChange={setTabIndex}
          />
        </View>

        {tabIndex === 0 && (
          <ScrollView contentContainerStyle={styles.content}>
            {(liveMonthlyReview != null || visibleHistory.length > 0) && (
              <Pressable
                onPress={clearAllHistory}
                style={styles.clearAllRow}
                accessibilityRole="button">
                <Text style={[styles.clearAllText, { color: colors.red }]}>
                  {notificationHistoryClearAllLabel(locale)}
                </Text>
              </Pressable>
            )}

            {liveMonthlyReview == null && visibleHistory.length === 0 && (
              <EmptyState text={notificationHistoryEmptyMessage(locale)} colors={colors} />
            )}

            {liveMonthlyReview != null && (
              <MonthlyReviewCard
                monthKey={liveMonthlyReview.monthKey}
                totalNetProfit={monthlyReviewTotal}
                onPress={() => openLiveMonthlyReview(liveMonthlyReview.monthKey)}
                locale={locale}
                colors={colors}
              />
            )}

            {visibleHistory.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onPress={() => openHistoryEntry(entry)}
                onLongPress={entry.kind === 'listingAlert' ? () => ignoreHistoryItem(entry) : undefined}
                locale={locale}
                colors={colors}
              />
            ))}

            {(liveMonthlyReview != null || visibleHistory.length > 0) && (
              <Text style={[styles.historyLimitNote, { color: colors.secondaryLabel }]}>
                {notificationHistoryLimitNote(locale)}
              </Text>
            )}
          </ScrollView>
        )}

        {tabIndex === 1 && (
          <ScrollView contentContainerStyle={styles.content}>
            {listingAlertItems.length === 0 ? (
              <EmptyState text={notificationEmptyMessage(locale)} colors={colors} />
            ) : (
              <ListingAlertCard
                items={listingAlertItems}
                onSelect={(record) => openPricing(record.id)}
                onIgnore={(record) => ignoreListingAlertItem(record.id, record.itemName)}
                locale={locale}
                colors={colors}
              />
            )}
          </ScrollView>
        )}

        {tabIndex === 2 && <UpdateNotesTab locale={locale} colors={colors} />}
      </View>
    </>
  );
}

function EmptyState({ text, colors }: { text: string; colors: ThemeColors }) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>{text}</Text>
    </View>
  );
}

function UpdateNotesTab({ locale, colors }: { locale: Locale; colors: ThemeColors }) {
  const notes = updateNotesList(locale);
  // アコーディオン。複数同時に開ける（1つに絞る理由が無い ── 版どうしを見比べたいことがある）
  const [expandedVersions, setExpandedVersions] = useState<ReadonlySet<string>>(new Set());
  const toggle = (version: string) => {
    setExpandedVersions((current) => {
      const next = new Set(current);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  if (notes.length === 0) {
    return <EmptyState text={notificationUpdatesPlaceholder(locale)} colors={colors} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {notes.map((note) => {
        const expanded = expandedVersions.has(note.version);
        return (
          <Pressable
            key={note.version}
            onPress={() => toggle(note.version)}
            style={[styles.card, styles.updateCard, { backgroundColor: colors.secondaryBackground }]}
            accessibilityRole="button">
            <View style={styles.updateHeaderRow}>
              <View style={styles.updateHeaderText}>
                <Text style={[styles.updateTitle, { color: colors.label }]}>{note.title}</Text>
                <Text style={[styles.updateDate, { color: colors.secondaryLabel }]}>{note.date}</Text>
              </View>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.secondaryLabel}
              />
            </View>
            {expanded && (
              <Text style={[styles.updateDescription, { color: colors.label }]}>
                {note.description}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * 出品滞留アラートの全件（「滞留中」タブ）。**上限を設けず全件出す** ── 専用タブに
 * なった以上、「自分宛て」1枚のカードに間借りしていた頃のような表示件数の節約は要らない
 * （合意: 2026-09）。
 */
function ListingAlertCard({
  items,
  onSelect,
  onIgnore,
  locale,
  colors,
}: {
  items: readonly ListingAlertItem[];
  onSelect: (record: SaleRecord) => void;
  onIgnore: (record: SaleRecord) => void;
  locale: Locale;
  colors: ThemeColors;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: colors.warningBackground }]}>
          <Ionicons name="pricetag-outline" size={17} color={colors.orange} />
        </View>
        <Text style={[styles.cardHeaderText, { color: colors.orange }]} numberOfLines={1}>
          {listingAlertEyebrow(locale, items.length)}
        </Text>
      </View>
      {items.map((item) => (
        <ListingAlertRow
          key={item.record.id}
          item={item}
          onPress={() => onSelect(item.record)}
          onLongPress={() => onIgnore(item.record)}
          locale={locale}
          colors={colors}
        />
      ))}
    </View>
  );
}

function ListingAlertRow({
  item,
  onPress,
  onLongPress,
  locale,
  colors,
}: {
  item: ListingAlertItem;
  onPress: () => void;
  onLongPress: () => void;
  locale: Locale;
  colors: ThemeColors;
}) {
  const photoUri = photoStore.uri(item.record.photoFileName);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, { borderTopColor: colors.separator }]}
      accessibilityRole="button">
      {photoUri != null && (
        <Image source={{ uri: photoUri }} style={styles.thumbnail} contentFit="cover" transition={0} />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.label }]} numberOfLines={1}>
          {item.record.itemName}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.secondaryLabel }]}>
          {listingAlertElapsedDays(locale, item.elapsedDays)}
        </Text>
      </View>
      <View style={styles.rowValues}>
        <View style={styles.rowValueItem}>
          <Text style={[styles.rowValueLabel, { color: colors.secondaryLabel }]}>
            {listingAlertPriceLabel(locale)}
          </Text>
          <Text style={[styles.rowValueAmount, { color: colors.label }]}>
            {formatYenSymbol(item.record.salesPrice)}
          </Text>
        </View>
        <View style={styles.rowValueItem}>
          <Text style={[styles.rowValueLabel, { color: colors.secondaryLabel }]}>
            {listingAlertDiscountRoomLabel(locale)}
          </Text>
          <Text style={[styles.rowValueAmount, { color: colors.label }]}>
            {formatYenSymbol(item.discountRoom)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.secondaryLabel} />
    </Pressable>
  );
}

function MonthlyReviewCard({
  monthKey,
  totalNetProfit,
  onPress,
  locale,
  colors,
}: {
  monthKey: string;
  totalNetProfit: number;
  onPress: () => void;
  locale: Locale;
  colors: ThemeColors;
}) {
  const isLoss = totalNetProfit < 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, styles.row, styles.monthlyRow, { backgroundColor: colors.secondaryBackground }]}
      accessibilityRole="button">
      <View style={[styles.iconBadge, { backgroundColor: colors.highlightBackground }]}>
        <Ionicons name="calendar-outline" size={17} color={colors.blue} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.monthlyEyebrow, { color: colors.blue }]}>{monthlyReviewEyebrow(locale)}</Text>
        <Text style={[styles.monthlyMonth, { color: colors.label }]}>
          {formatMonthKeyTitle(locale, monthKey)}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.secondaryLabel }]}>
          {monthlyReviewTotalLabel(locale)}
        </Text>
      </View>
      <Text style={[styles.monthlyAmount, { color: isLoss ? colors.red : colors.green }]}>
        {formatYenSymbol(totalNetProfit)}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={colors.secondaryLabel} />
    </Pressable>
  );
}

/**
 * 「すべて」タブの履歴1行（新規）。
 *
 * **出品滞留アラートは商品名(1行)とそれ以外(サブタイトル)を分ける。** 当初は実際に届いた
 * OS 通知の文言（listingAlertOsBody の一続きの文）をそのまま出していたが、商品名が長いと
 * numberOfLines の中で文字が切れてしまい、経過日数まで読めなくなる不具合が実機で見つかった
 * （合意: 2026-09）。商品名は省略されても仕方ないが、経過日数・届いた日は必ず全部見える方を
 * 優先し、listingAlertHistorySubtitle 側にまとめた。月次振り返りは月名が短く長さの心配が
 * 無いので、従来どおり monthlyReviewOsBody の一続きの文のまま。値（days・totalNetProfit）は
 * 記録した時点のまま凍結されている（NotificationHistoryEntry 参照）。
 */
function HistoryRow({
  entry,
  onPress,
  onLongPress,
  locale,
  colors,
}: {
  entry: NotificationHistoryEntry;
  onPress: () => void;
  /** 出品滞留アラートの行だけ渡る（「今後知らせない」。月次振り返りには無い） */
  onLongPress?: () => void;
  locale: Locale;
  colors: ThemeColors;
}) {
  const isListingAlert = entry.kind === 'listingAlert';
  const dateLabel = formatShortDate(locale, fromDbDate(entry.occurredAt));
  const title = isListingAlert ? entry.itemName : formatMonthKeyTitle(locale, entry.monthKey);
  const subtitle = isListingAlert
    ? listingAlertHistorySubtitle(locale, entry.days, dateLabel)
    : dateLabel;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      // card + row の組み合わせは MonthlyReviewCard と同じ（単独行そのものを1枚のカードにする）
      style={[styles.card, styles.row, { backgroundColor: colors.secondaryBackground }]}
      accessibilityRole="button">
      <View
        style={[
          styles.iconBadge,
          { backgroundColor: isListingAlert ? colors.warningBackground : colors.highlightBackground },
        ]}>
        <Ionicons
          name={isListingAlert ? 'pricetag-outline' : 'calendar-outline'}
          size={17}
          color={isListingAlert ? colors.orange : colors.blue}
        />
      </View>
      <View style={styles.rowText}>
        {isListingAlert ? (
          <>
            <Text style={[styles.rowTitle, { color: colors.label }]} numberOfLines={1}>
              {title}
            </Text>
            {/* 商品名・経過日数だけだと「だから何？」になる（実機での指摘）ので、OS通知の
                タイトルと同じ「値下げの検討はいかがですか？」を差し込んで意図を伝える。
                商品名の長さに関わらず一定の文言なので、numberOfLines の心配は無い */}
            <Text style={[styles.rowMessage, { color: colors.orange }]} numberOfLines={1}>
              {listingAlertOsTitle(locale)}
            </Text>
          </>
        ) : (
          <Text style={[styles.rowTitle, { color: colors.label }]} numberOfLines={2}>
            {monthlyReviewOsBody(locale, title, entry.totalNetProfit)}
          </Text>
        )}
        <Text style={[styles.rowSubtitle, { color: colors.secondaryLabel }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.secondaryLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  content: {
    padding: 16,
    paddingTop: 0,
    gap: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 11,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  rowMessage: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
  },
  rowValues: {
    flexDirection: 'row',
    gap: 14,
  },
  rowValueItem: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowValueLabel: {
    fontSize: 10.5,
  },
  rowValueAmount: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  monthlyRow: {
    paddingVertical: 14,
  },
  historyLimitNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: -2,
  },
  clearAllRow: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  monthlyEyebrow: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  monthlyMonth: {
    fontSize: 15,
    fontWeight: '600',
  },
  monthlyAmount: {
    fontSize: 20,
    fontWeight: '700',
  },
  updateCard: {
    padding: 16,
    gap: 4,
  },
  updateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateHeaderText: {
    flex: 1,
    gap: 4,
  },
  updateTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  updateDate: {
    fontSize: 11.5,
  },
  updateDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
