// 実績獲得トースト（デザイン確定仕様版・3c）。
//
// 単体: 円形バッジ(50pt) + 「実績を獲得」(小) + 実績名(大) + ›
// 複数: 円形バッジを最大 3 枚重ね(+ 4 件以上は「+N」の丸を追加) + 「実績を{{count}}件獲得」(小)
//       + 「先頭の実績名 ほかN件」(大) + › + 下段にチップで個別の実績名を並べる
//
// カード全体のタップ、またはチップの個別タップで実績詳細を開く（onSelect(index)）。
// バッジのアイコン・色は AchievementsSection の achievementIcon / categoryColor をそのまま使う
// （実績一覧・詳細モーダルと同じ見分け方に揃える。トーストだけ別の意匠にしない）。
//
// **幅を明示する。** react-native-toast-message の AnimatedContainer は中身を中央寄せする
// だけで幅は決めてくれない ── SaveConfirmationToast と同じ理由・同じ実測不具合の対処
// （width を持たせないと内部の flex: 1 が効かず、実績名が軒並み省略記号になる）。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ToastConfigParams } from 'react-native-toast-message';

import { useThemeColors } from '@/theme';

import type { AchievementToastBadge, AchievementToastProps } from './achievementToastBus';
import { ToastProgressBar } from './ToastProgressBar';
import { TOAST_VISIBILITY_MS } from './toastVisibility';

const BADGE_SIZE_SINGLE = 50;
const BADGE_SIZE_STACK = 44;
const STACK_OVERLAP = 13;
const MAX_STACK_BADGES = 3;
/** カード左右の余白（SaveConfirmationToast と同じ実測値） */
const CARD_MARGIN = 12;

export function AchievementToast({ props, isVisible }: ToastConfigParams<AchievementToastProps>) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  if (props == null) return null;

  const { eyebrow, title, badges, onSelect } = props;
  const isSingle = badges.length === 1;
  // 進行バーの色は先頭バッジの色を代表にする（複数件でも 1 色に絞らないと目立つ色が定まらない）
  const accentColor = badges[0]?.color ?? colors.blue;
  const extraCount = badges.length - MAX_STACK_BADGES;

  return (
    <Pressable
      onPress={() => onSelect(0)}
      style={[
        styles.card,
        {
          width: windowWidth - CARD_MARGIN * 2,
          backgroundColor: colors.secondaryBackground,
          borderColor: colors.separator,
        },
      ]}>
      <View style={styles.body}>
        <View style={styles.mainRow}>
          {isSingle ? (
            <BadgeCircle badge={badges[0]} size={BADGE_SIZE_SINGLE} borderColor={colors.secondaryBackground} />
          ) : (
            <View style={styles.stack}>
              {badges.slice(0, MAX_STACK_BADGES).map((badge, index) => (
                <View key={badge.name} style={index > 0 && styles.stackOverlap}>
                  <BadgeCircle badge={badge} size={BADGE_SIZE_STACK} borderColor={colors.secondaryBackground} />
                </View>
              ))}
              {extraCount > 0 && (
                <View style={styles.stackOverlap}>
                  <View
                    style={[
                      styles.extraCircle,
                      { backgroundColor: colors.disabledBackground, borderColor: colors.secondaryBackground },
                    ]}>
                    <Text style={[styles.extraText, { color: colors.secondaryLabel }]}>+{extraCount}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.textColumn}>
            <Text style={[styles.eyebrow, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {eyebrow}
            </Text>
            <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
              {title}
            </Text>
          </View>

          <Text style={[styles.chevron, { color: colors.secondaryLabel }]}>›</Text>
        </View>

        {!isSingle && (
          <View style={[styles.chipsRow, { borderTopColor: colors.separator }]}>
            {badges.map((badge, index) => (
              <Pressable
                key={badge.name}
                onPress={() => onSelect(index)}
                style={[styles.chip, { backgroundColor: colors.disabledBackground }]}>
                <Text style={[styles.chipText, { color: colors.secondaryLabel }]} numberOfLines={1}>
                  {badge.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ToastProgressBar
        durationMs={TOAST_VISIBILITY_MS}
        trackColor={colors.separator}
        fillColor={accentColor}
        isVisible={isVisible}
      />
    </Pressable>
  );
}

function BadgeCircle({
  badge,
  size,
  borderColor,
}: {
  badge: AchievementToastBadge;
  size: number;
  borderColor: string;
}) {
  return (
    <View
      style={[
        styles.badgeCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: badge.color, borderColor },
      ]}>
      <Ionicons name={badge.icon} size={size * 0.32} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: 12,
    paddingLeft: 14,
    paddingVertical: 13,
    gap: 11,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  stack: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  stackOverlap: {
    marginLeft: -STACK_OVERLAP,
  },
  badgeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  extraCircle: {
    width: BADGE_SIZE_STACK,
    height: BADGE_SIZE_STACK,
    borderRadius: BADGE_SIZE_STACK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  extraText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  eyebrow: {
    fontSize: 11,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  chevron: {
    flexShrink: 0,
    fontSize: 17,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
