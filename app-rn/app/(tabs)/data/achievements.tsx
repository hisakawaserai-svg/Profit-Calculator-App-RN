import { AchievementListScreen } from '@/screens/AchievementListScreen';

// 実績一覧画面（データタブの Stack に積む。AchievementsSection「すべて見る ›」の遷移先）。
// data/filter.tsx と同じ「ルートは薄く、実体は screens/」の形。
export default function AchievementsRoute() {
  return <AchievementListScreen />;
}
