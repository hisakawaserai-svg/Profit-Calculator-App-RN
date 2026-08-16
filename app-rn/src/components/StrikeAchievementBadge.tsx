// 一覧行・記録詳細に出す⚡一撃実績の小さなバッジ。
//
// **表示対象は、その実績が実際に「達成」になった記録（completedRecord）だけ**
// （logic/achievements.strikeAchievementsByRecordId が recordId → Achievement の対応表を作る）。
// 呼び出し側はこの対応表から自分の記録ぶんを引いて、無ければ何もレンダーしない
// （このコンポーネント自体は「渡された 1 件を表示するだけ」で、判定はしない）。
//
// タップすると、この記録が「達成した記録」になっている状態で既存の AchievementDetailModal
// （★・装飾込みの全画面表示）を開く ── 実績タブ（AchievementsSection・AchievementListScreen）
// と同じ見た目・同じ「達成した記録」行の仕組みをそのまま再利用する。バッジ 1 個につき
// モーダルを 1 つ持つ（AchievementsSection のような複数バッジで 1 モーダルを使い回す形は
// 採らない）── 一覧の各行が指す記録・実績がそれぞれ別物なので、共有すると
// index の付け替えなど記録タブ側の別ロジックが要る。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AchievementDetailModal } from '@/components/AchievementDetailModal';
import { CATEGORY_ICONS, categoryColor, TIER_COLORS } from '@/components/AchievementsSection';
import { achievementBadgeTier, achievementCategory, type Achievement } from '@/logic/achievements';
import { achievementName } from '@/logic/labels';
import { useThemeColors } from '@/theme';

const BADGE_SIZE = 20;

/** ⚡一撃はタグに紐づかない実績なので、達成した記録の tagId は常に null（呼ばれない） */
const NO_TAG_LOOKUP = () => undefined;

type Props = {
  /** strikeAchievementsByRecordId で引いた、この記録ぶんの⚡一撃実績（達成済みのもの） */
  achievement: Achievement;
};

export function StrikeAchievementBadge({ achievement }: Props) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  const category = achievementCategory(achievement.id);
  const tier = achievementBadgeTier(achievement.id);
  const tint = categoryColor(category, colors);
  const tierColor = TIER_COLORS[tier];

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={achievementName(achievement.id)}
        style={[styles.badge, { backgroundColor: tint, borderColor: tierColor }]}
      >
        <Ionicons name={CATEGORY_ICONS[category]} size={12} color="#FFFFFF" />
      </Pressable>

      <AchievementDetailModal
        achievements={[achievement]}
        initialIndex={0}
        visible={visible}
        onClose={() => setVisible(false)}
        resolveTag={NO_TAG_LOOKUP}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
