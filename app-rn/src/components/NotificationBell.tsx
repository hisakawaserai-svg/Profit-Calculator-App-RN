// お知らせ画面(app/notifications.tsx)を開くベル。全タブのヘッダーから同じものを使う
// (headerLeft。記録タブだけに置いていたものを共通化した)。
//
// 中身の計算はしない ── useBellStore（Zustand、複数タブから同時に購読できる）を
// 読むだけ。押した瞬間に一度引き直す（refresh）のは、フォーカスが変わらないタブの
// 上で日をまたいだ・記録を変更した直後、といった「中身が変わっているはずなのに
// まだ引き直されていない」ケースを取りこぼさないため。
//
// 未読ドットは「滞留中の出品が残っている」では点灯しない（hasUnreadBell）。滞留は
// お知らせ画面の「滞留中」タブで常時見られるので、ベルは新しい知らせ（月初の振り返り・
// 届いた履歴）だけを知らせる。
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { toDbDate } from '@/db/dates';
import { notificationBellLabel } from '@/logic/labels';
import { hasUnreadBell } from '@/logic/notifications';
import { useBellStore } from '@/notifications/bellStore';
import { markNotificationsChecked, useLocale, useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

export function NotificationBell() {
  const locale = useLocale();
  const colors = useThemeColors();
  const content = useBellStore((state) => state.content);
  const refresh = useBellStore((state) => state.refresh);
  const { lastNotificationsCheckedAt, notificationHistory } = useSettings();

  const hasUnread = hasUnreadBell(
    lastNotificationsCheckedAt,
    new Date(),
    content?.kind === 'monthlyReview',
    notificationHistory,
  );

  const handlePress = () => {
    refresh();
    markNotificationsChecked(toDbDate(new Date()));
    router.push('/notifications');
  };

  return (
    <Pressable onPress={handlePress} hitSlop={8} accessibilityLabel={notificationBellLabel(locale)}>
      <View>
        <Ionicons name="notifications-outline" size={22} color={colors.blue} />
        {hasUnread && (
          <View style={[styles.unreadDot, { backgroundColor: colors.blue, borderColor: colors.background }]} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
