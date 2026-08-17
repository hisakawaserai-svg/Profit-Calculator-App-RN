// 記録保存（RecordFormSheet）→ 実績獲得トースト（AchievementToastHost, app/_layout.tsx に常駐）を
// つなぐだけの、モジュール内 1 対 1 の購読。
//
// RecordFormSheet は記録タブ・計算タブなど複数の入口から開くため、保存直後にどの画面が
// 前面にいるかを問わずトーストを出したい。Toast 自体も同じ理由で Stack の外（全画面の上）に
// 1 つだけ置かれている（app/_layout.tsx）ので、実績獲得の通知もそれと同じ「常駐する 1 つの
// 受け手」に投げる形にする。購読者は AchievementToastHost だけの想定（複数箇所から
// registerAchievementToastListener を呼ばない）。
import type { Ionicons } from '@expo/vector-icons';

import type { Achievement } from '@/logic/achievements';

/** react-native-toast-message の Toast.show({ type }) / <Toast config={{ [type]: ... }}/> 共通のキー */
export const ACHIEVEMENT_TOAST_TYPE = 'achievement';

/**
 * 実績獲得トーストの Toast.show({ props }) に載せる、種類ごとのアイコン。
 * 新規獲得が 1 件のときだけ AchievementToastHost が実績固有のアイコン・色を入れる。
 * 複数件同時獲得（1つのトーストにまとめる仕様）は種類が混在するため付けない ──
 * その場合は app/_layout.tsx の toastConfig 側が既定の trophy にフォールバックする。
 */
export type AchievementToastProps = {
  icon?: { name: keyof typeof Ionicons.glyphMap; color: string };
};

type Listener = (achievements: readonly Achievement[]) => void;

let listener: Listener | null = null;

/** AchievementToastHost がマウント中だけ登録する。アンマウント時は null に戻すこと */
export function registerAchievementToastListener(fn: Listener | null): void {
  listener = fn;
}

/** 保存直後、新規に獲得した実績（0 件なら何もしない）をトースト表示させる */
export function showAchievementToast(newlyCompleted: readonly Achievement[]): void {
  if (newlyCompleted.length === 0) return;
  listener?.(newlyCompleted);
}
