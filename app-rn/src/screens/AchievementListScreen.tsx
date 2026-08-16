// 実績一覧画面（データタブ「実績」の「獲得した実績」見出し横「すべて見る ›」から遷移）。
//
// 成長系 5 ジャンル（⚡一撃 / 💰累計利益 / 📦販売件数 / 🎯得意分野 / 🔍売れ筋）+
// 特殊実績 2 種（🌱はじめる系 / 🏷️タグ系）の計 7 セクションに分け、ジャンルごとに
// 見出し付きの独立したカードとして縦に並べる（今回の再編）。各カード内は
// groupAchievementsByGenre が難易度昇順（ブロンズ→レジェンド）に揃えて返した順で
// 横一列に並べる。既存の丸いバッジ（AchievementsSection の AchievementBadge。
// 色分けアイコン + 名前 + 達成日）をそのまま再利用し、この画面だけの新しい見た目は作らない
// ── 未達成は同じ部品がグレーアウトして「次はここ」を示す。
//
// **未達成もタップできる。** 達成済み・未達成のどちらも onPress を渡し、既存の全画面詳細
// モーダル（AchievementDetailModal）を開く ── 未達成は「達成した記録」の代わりに
// 現在値 / 目標値の進捗バーで表示される（モーダル側の分岐。旧グリッド版と同じ考え方）。
// モーダルのスワイプはカードの並び順（ジャンル→ジャンル内の難易度昇順）どおりに、
// 達成済み・未達成を通しで巡回する。
import { Stack } from 'expo-router';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AchievementBadge, resolveTagFrom } from '@/components/AchievementsSection';
import { AchievementDetailModal } from '@/components/AchievementDetailModal';
import { useAchievementsData } from '@/db/useRecords';
import { useTagList } from '@/db/useTags';
import { groupAchievementsByGenre } from '@/logic/achievements';
import { ACHIEVEMENT_LIST_TITLE, achievementGenreTitle } from '@/logic/labels';
import { useThemeColors } from '@/theme';

/**
 * 実績の見た目プレビュー（src/dev/。__DEV__ 専用）。**import ではなく require で読む** ──
 * settings/index.tsx の DevSeedCard と同じ理由（そちらのコメント参照）。production ビルドでは
 * この三項演算子が依存収集の前に `null` に畳まれ、src/dev/AchievementPreviewCard.tsx は
 * バンドルに含まれない。DB を書き換えない表示専用のプレビューなので、
 * 仮に何かの理由で production に残っても実害は無いが、それでも入れない
 */
const AchievementPreviewCard: ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- import では本番ビルドから落とせない（上記）
    (require('@/dev/AchievementPreviewCard') as typeof import('@/dev/AchievementPreviewCard'))
      .AchievementPreviewCard
  : null;

export function AchievementListScreen() {
  const colors = useThemeColors();
  const { achievements } = useAchievementsData();
  // タグ系実績（🎯得意分野・🔍売れ筋・🏷️タグの総合力・タグの達人）の「達成した記録」に
  // タグの色 + 名前を出すための解決。DataScreen（AchievementsSection 側）と同じ形で、
  // この画面は DataScreen 経由で tags を受け取らない独立ルートなので自前で取得する
  const { tags } = useTagList();
  const resolveTag = useMemo(() => resolveTagFrom(tags), [tags]);
  const genreSections = useMemo(
    () => groupAchievementsByGenre(achievements),
    [achievements],
  );
  // モーダルのスワイプ対象。達成済み・未達成の両方を、カードの並び順
  // （ジャンル→ジャンル内の難易度昇順）どおりに通しで並べる
  const allInOrder = useMemo(
    () => genreSections.flatMap((section) => section.achievements),
    [genreSections],
  );
  const detailIndexById = useMemo(() => {
    const map = new Map<string, number>();
    allInOrder.forEach((achievement, index) => {
      map.set(achievement.id, index);
    });
    return map;
  }, [allInOrder]);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  const screenOptions = useMemo(() => ({ title: ACHIEVEMENT_LIST_TITLE }), []);

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
      >
        {genreSections.map(
          (section) =>
            section.achievements.length > 0 && (
              <View
                key={section.category}
                style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
              >
                <Text style={[styles.cardTitle, { color: colors.label }]}>
                  {achievementGenreTitle(section.category)}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.rowScroll}
                >
                  <View style={styles.row}>
                    {section.achievements.map((achievement) => (
                      <AchievementBadge
                        key={achievement.id}
                        achievement={achievement}
                        colors={colors}
                        onPress={() =>
                          setDetailIndex(
                            detailIndexById.get(achievement.id) ?? 0,
                          )
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>
            ),
        )}

        {/* 開発ビルドだけに出る。production では AchievementPreviewCard が null になり、
            この行自体が描画されない（DevSeedCard と同じ形。settings/index.tsx 参照） */}
        {AchievementPreviewCard != null && <AchievementPreviewCard />}
      </ScrollView>

      <AchievementDetailModal
        achievements={allInOrder}
        initialIndex={detailIndex ?? 0}
        visible={detailIndex != null}
        onClose={() => setDetailIndex(null)}
        resolveTag={resolveTag}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  rowScroll: {
    marginHorizontal: -16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
  },
});
