// 実績の見た目プレビュー（__DEV__ 専用）。実績一覧画面の末尾に出る。
//
// ★5（レジェンド。累計利益¥500,000・利益ハンター）を含む全種類は、実機でまだ条件を
// 満たすデータが無いと見た目を確認できない。ここは DevSeedCard と同じ考え方で、
// **DB には一切触らず**、logic/achievements.ts の判定結果を表示直前に上書きして
// 「たった今すべて達成した」ことにしたダミーの Achievement 配列を作り、
// 既存の AchievementDetailModal にそのまま渡すだけ ── 判定ロジックも達成状態も書き換えない、
// 表示だけのプレビュー。
//
// 本番ビルドには入らない ── screens/AchievementListScreen.tsx が import ではなく
// `__DEV__ ? require(...) : null` で読むので、production では require ごと畳まれて
// このファイルもバンドルに含まれない（settings/index.tsx の DevSeedCard 読み込みと同じ理由。
// そちらのコメント参照）。

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AchievementDetailModal } from '@/components/AchievementDetailModal';
import { AchievementBadge } from '@/components/AchievementsSection';
import { evaluateAchievements, type Achievement } from '@/logic/achievements';
import { useThemeColors } from '@/theme';

/** 「達成した記録」行に出すダミー商品の id。DB には存在しない値なので、万一タップしても記録詳細には飛べない */
const PREVIEW_RECORD_ID = 'dev-preview-record';
const PREVIEW_ITEM_NAME = '（プレビュー用のダミー商品）';
const PREVIEW_NET_PROFIT = 12345;
/** ダミー記録は tagId を持たない（下記 buildPreviewAchievements）ので呼ばれない */
const NO_TAG_LOOKUP = () => undefined;

/**
 * evaluateAchievements([]) が返す「全実績の並び（id・target）」だけを借りて、
 * 全件を「たった今 target ぶん達成した」ことにしたダミーの Achievement 配列を作る。
 * 実データを 1 件も読まない（引数が空配列）ので、DB の状態に一切影響しない。
 *
 * 「はじめる系」の一部（sale_debut・tag_debut・record_count_10）は本来 netProfit を
 * 持たない実績（AchievementCompletedRecord.netProfit が null になる）なので、
 * そちらもプレビューできるよう id で分けて null を入れる。
 */
const LISTING_BASED_IDS = new Set(['sale_debut', 'tag_debut', 'record_count_10']);

function buildPreviewAchievements(): Achievement[] {
  const now = new Date();
  return evaluateAchievements([]).map((achievement) => {
    const dummyRecord = {
      id: PREVIEW_RECORD_ID,
      itemName: PREVIEW_ITEM_NAME,
      netProfit: LISTING_BASED_IDS.has(achievement.id) ? null : PREVIEW_NET_PROFIT,
      saleDate: now,
      tagId: null,
    };
    return {
      ...achievement,
      current: achievement.target,
      completed: true,
      completedAt: now,
      completedRecord: dummyRecord,
      // 「達成した記録」アコーディオンのプレビューなので、ダミー 1 件だけ入れておく
      // （複数件の見た目は実データが無いと再現できない。DevSeedCard で実データを作って確認する）
      completedRecords: [dummyRecord],
    };
  });
}

export function AchievementPreviewCard() {
  const colors = useThemeColors();
  // 一度作ったダミー配列を使い回す（毎レンダー作り直すと、開いたモーダルの中身が
  // 別オブジェクトに入れ替わってスワイプ位置がずれる）
  const previewAchievements = useMemo(() => buildPreviewAchievements(), []);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        開発用（__DEV__ のみ）
      </Text>
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <Text style={[styles.label, { color: colors.label }]}>実績の見た目プレビュー</Text>
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>
          タップした実績を「達成済み」に見せかけて全画面表示を開くだけの確認用です。
          実際の達成状態・DBは変更しません。★5（レジェンド）を含む全種類をここから確認できます。
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          <View style={styles.row}>
            {previewAchievements.map((achievement, index) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                colors={colors}
                onPress={() => setDetailIndex(index)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <AchievementDetailModal
        achievements={previewAchievements}
        initialIndex={detailIndex ?? 0}
        visible={detailIndex != null}
        onClose={() => setDetailIndex(null)}
        resolveTag={NO_TAG_LOOKUP}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
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
