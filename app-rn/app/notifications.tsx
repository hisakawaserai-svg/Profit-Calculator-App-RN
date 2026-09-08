import NotificationsScreen from '@/screens/NotificationsScreen';

// お知らせ（ベルから開くモーダル）。(tabs) の兄弟としてルート直下に置く（app/_layout.tsx）
// ── どのタブのヘッダーからでも router.push('/notifications') で開けるようにするため。
export default function NotificationsRoute() {
  return <NotificationsScreen />;
}
