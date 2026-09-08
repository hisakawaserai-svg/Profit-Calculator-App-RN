// お知らせ画面(app/notifications.tsx)を開くベル。全タブのヘッダーから同じものを使う
// (headerLeft。記録タブだけに置いていたものを共通化した)。
//
// 中身の計算はしない ── useBellStore（Zustand、複数タブから同時に購読できる）を
// 読むだけ。押した瞬間に一度引き直す（refresh）のは、フォーカスが変わらないタブの
// 上で日をまたいだ・記録を変更した直後、といった「中身が変わっているはずなのに
// まだ引き直されていない」ケースを取りこぼさないため。
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { fromDbDate, toDbDate } from '@/db/dates';
import { notificationBellLabel } from '@/logic/labels';
import { daysBetween } from '@/logic/listingDays';
import { useBellStore } from '@/notifications/bellStore';
import { markNotificationsChecked, useLocale, useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

export function NotificationBell() {
  const locale = useLocale();
  const colors = useThemeColors();
  const content = useBellStore((state) => state.content);
  const refresh = useBellStore((state) => state.refresh);
  const { lastNotificationsCheckedAt } = useSettings();

  // 未読ドット。ベルを最後に開いた日と今日が違えば「未読」(設定に依存しないシンプルな粒度)
  const hasUnread =
    content != null &&
    (lastNotificationsCheckedAt == null ||
      daysBetween(fromDbDate(lastNotificationsCheckedAt), new Date()) !== 0);

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
