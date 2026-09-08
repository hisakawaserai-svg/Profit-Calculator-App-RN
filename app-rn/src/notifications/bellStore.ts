// ベル(記録タブだけでなく全タブのヘッダー)が共有する「今の通知の中身」。
//
// **achievementToastBus（単一リスナー前提。コード内に明記あり）ではなく Zustand にする。**
// ベルは4タブぶん同時にマウントされ、どのタブのヘッダーも同じ値（中身・未読）を
// 見る必要がある ── 単一リスナーのバスでは後から登録した1つしか受け取れない。
//
// 中身の計算そのものは logic/notifications.ts の純粋関数（OS通知と共有）。
// ここはその結果を「呼ばれた瞬間の日時」で持つだけの薄いストア。
import { create } from 'zustand';

import { repository } from '@/db/client';
import {
  currentNotification,
  listingAlertItems,
  type ListingAlertItem,
  type NotificationContent,
} from '@/logic/notifications';
import {
  getDismissedMonthlyReview,
  getIgnoredListingAlerts,
  getListingAlertThresholdDays,
} from '@/settings';

type BellState = {
  content: NotificationContent | null;
  /** 月次振り返りのときだけ使う、先月の純利益合計 */
  monthlyReviewTotal: number;
  /**
   * 出品滞留アラートの対象、しきい値以上の**全件**（お知らせ画面「滞留中」タブ用）。
   *
   * `content` とは別に持つ。`content` は月初だけ月次振り返りを優先する「今どれか1つを
   * 出すなら」の値（ベルの未読ドット・旧「自分宛て」1枚カード用）で、月初は listingAlert 側が
   * 隠れる。「滞留中」タブは月初かどうかに関係なく常に現在の滞留状況を一覧したいので、
   * こちらは currentNotification の優先判定を経由せず、listingAlertItems を直接計算する。
   */
  listingAlertItems: readonly ListingAlertItem[];
  /** 今その場のデータで引き直す */
  refresh: () => void;
};

export const useBellStore = create<BellState>((set) => ({
  content: null,
  monthlyReviewTotal: 0,
  listingAlertItems: [],
  refresh: () => {
    const unsold = repository.filteredRecords({ isSoldMode: false }, 'saleDateDesc');
    const today = new Date();
    const thresholdDays = getListingAlertThresholdDays();
    const ignoredRecordIds = new Set(getIgnoredListingAlerts());

    const items = listingAlertItems(unsold, today, thresholdDays, ignoredRecordIds);
    const content = currentNotification(
      unsold,
      today,
      thresholdDays,
      ignoredRecordIds,
      getDismissedMonthlyReview(),
    );

    if (content?.kind === 'monthlyReview') {
      const summary = repository.careerSummary({ isSoldMode: true, period: content.monthKey });
      // 先月の記録が0件なら振り返ることが無いので、月次振り返りごと出さない（空状態）。
      // 出品滞留アラート側の「対象0件なら null」（logic/notifications.ts）と同じ考え方
      if (summary.recordCount === 0) {
        set({ content: null, monthlyReviewTotal: 0, listingAlertItems: items });
        return;
      }
      set({ content, monthlyReviewTotal: summary.totalNetProfit, listingAlertItems: items });
      return;
    }

    set({ content, monthlyReviewTotal: 0, listingAlertItems: items });
  },
}));

/** React の外（settings のような非フックの場所）から読みたいとき用 */
export function refreshBell(): void {
  useBellStore.getState().refresh();
}
