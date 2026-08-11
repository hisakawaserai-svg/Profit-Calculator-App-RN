// 販売サイト名の写しを出す 1 行（SPEC-V3 §1.5.1）。記録フォームの伝票カードと計算タブで使う。
//
//     − 手数料 10%        − 100円
//     {バッジ} メルカリ  ✕
//
// **手数料行の直下に独立した 1 行**にしてあるのは §1.5.1 の決定 ── 手数料行（ラベル・率・
// タグボタン・ステッパー・額）が既に詰まっていて、同じ行に名前を足すと収まらない。
// 未設定（空文字）のときは行ごと出ないので、通常の高さは変わらない。
//
// バッジはプリセットを名前で引けたときだけ出す（§1.5.1）。記録が持っているのは名前の写しだけで、
// プリセットを消したり改名したりすれば引けなくなる ── そのとき消えるのは色だけで、
// 「そのとき何と書いてあったか」は名前として残る。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PresetBadge } from '@/components/PresetBadge';
import { usePresetList } from '@/db/usePresets';
import { siteNameClearLabel } from '@/logic/labels';
import { findPresetByName } from '@/logic/preset';
import { useThemeColors } from '@/theme';

/** タグボタン（PresetTagButton）と同じ大きさ。同じ札を指しているので大きさも揃える */
const BADGE_SIZE = 24;

type Props = {
  /** 空文字なら行を出さない（§1.5.1） */
  siteName: string;
  /** 「✕」で消す（§1.5.1）。消えるのは名前だけで、率はそのまま残る */
  onClear: () => void;
};

export function SiteNameRow({ siteName, onClear }: Props) {
  const colors = useThemeColors();
  const { presets } = usePresetList('site');

  if (siteName === '') return null;

  const preset = findPresetByName(presets, siteName);

  return (
    <View style={styles.row}>
      {preset != null && <PresetBadge preset={preset} size={BADGE_SIZE} />}
      <Text style={[styles.name, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {siteName}
      </Text>
      <Pressable
        onPress={onClear}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={siteNameClearLabel(siteName)}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Ionicons name="close" size={16} color={colors.secondaryLabel} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // 金額の行とは別の情報なので固定の行高は持たせず、上下に少しだけ間を取る。
    // 伝票カード（gap を持つ）でも入力カード（gap 0）でも詰まりすぎない値
    paddingVertical: 4,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
});
