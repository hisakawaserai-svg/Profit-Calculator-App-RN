// 実績獲得トースト（記録保存時。RecordFormSheet → achievementToastBus 経由）の受け手。
// Toast 本体（react-native-toast-message）と同じ理由で、app/_layout.tsx の Stack の外に
// 常駐 1 つだけ置く ── 記録タブ・計算タブなど、保存操作がどの画面から起きても拾えるようにするため。
//
// タップ時（カード全体、またはデザイン確定仕様版・3c のチップ個別）は AchievementDetailModal
// （既存。実績一覧・一撃バッジと共通のコンポーネント）を、今回新規獲得した実績だけの配列で開く。
// チップごとの initialIndex を渡せるので、「どれを獲ったか」からそのまま該当の実績詳細へ飛べる。
// 「モーダルだけで完結」という指定どおり、タブ遷移は行わない（onClose で閉じるだけ）。
//
// タグ（resolveTag）はタップされた瞬間に tagRepository.listAll() で読む。トースト表示中に
// タグが変わることは実質なく、常時購読する理由がない（useTagList の useFocusEffect は
// 画面＝ナビゲーションのスクリーンを前提にした仕組みで、Stack の外に置くこのホストには合わない）。
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import Toast from 'react-native-toast-message';

import { tagRepository } from '@/db/client';
import { achievementCategory, type Achievement, type AchievementId } from '@/logic/achievements';
import { achievementName, achievementToastEyebrow, achievementToastTitle } from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

import {
  ACHIEVEMENT_TOAST_TYPE,
  registerAchievementToastListener,
  type AchievementToastProps,
} from './achievementToastBus';
import { AchievementDetailModal } from './AchievementDetailModal';
import { achievementIcon, categoryColor, resolveTagFrom, type TagLookup } from './AchievementsSection';

type Pending = { achievements: Achievement[]; initialIndex: number; resolveTag: TagLookup };

/**
 * トースト用のアイコン。基本は achievementIcon（実績詳細・バッジと共通）をそのまま使うが、
 * 「その他」（sales_technique）カテゴリの 5 種（長期戦突破・即売れ・有言実行・目標マスター・
 * なんでも屋）は性質がバラバラで個別アイコン（砂時計・ロケット等）が付いているものの、
 * トースト上は小さく一瞬しか出ないため見分けにくい。ユーザー確認の結果、この 5 種は
 * 「達成した」という共通の意味が伝わればよいとして、チェックマークに統一する
 * （achievementIcon 自体は変えない ── 実績一覧・詳細モーダルの見分けやすさはそのまま残す）
 */
function toastAchievementIcon(id: AchievementId): keyof typeof Ionicons.glyphMap {
  return achievementCategory(id) === 'sales_technique' ? 'checkmark-circle' : achievementIcon(id);
}

export function AchievementToastHost() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    registerAchievementToastListener((achievements) => {
      const list = [...achievements];
      const ids = list.map((a) => a.id);

      const open = (index: number) => {
        Toast.hide();
        // タップされた瞬間の最新タグで解決する（常時購読はしない。ファイル冒頭コメント参照）
        setPending({
          achievements: list,
          initialIndex: index,
          resolveTag: resolveTagFrom(tagRepository.listAll()),
        });
      };

      const props: AchievementToastProps = {
        eyebrow: achievementToastEyebrow(locale, ids),
        title: achievementToastTitle(locale, ids),
        badges: list.map((a) => ({
          name: achievementName(locale, a.id),
          icon: toastAchievementIcon(a.id),
          color: categoryColor(achievementCategory(a.id), colors),
        })),
        onSelect: open,
      };
      Toast.show({ type: ACHIEVEMENT_TOAST_TYPE, props });
    });
    return () => registerAchievementToastListener(null);
  }, [colors, locale]);

  return (
    <AchievementDetailModal
      achievements={pending?.achievements ?? []}
      initialIndex={pending?.initialIndex ?? 0}
      visible={pending != null}
      onClose={() => setPending(null)}
      resolveTag={pending?.resolveTag ?? NO_TAG_LOOKUP}
    />
  );
}

const NO_TAG_LOOKUP: TagLookup = () => undefined;
