// 設定タブ「よく使う値」の 1 種類ぶんのカード（SPEC-V3 §3.1 / 設計案 24a）。
//
// §3.1 は「1 行 ＋ 右に N 件」だったが、設計案 24a はカードの中に**登録済みのプリセットを
// 数件そのまま見せる**形にした。件数だけでは「何を登録したか」が思い出せず、
// 結局 3 画面を開いて確かめることになるため。出しきれないぶんは「ほかN件」で数に戻す。
//
// **カード全体が詳細画面への入口で、ここから直接は追加しない**（設計案 24a）。
// 設定タブに追加の口を置くと、追加と一覧で 2 か所に同じ操作が並び、
// どちらから入っても同じ画面に着くことが読み取れなくなる。
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Preset, PresetType } from '@/db/schema';
import {
  presetCardEmptyLabel,
  presetCountLabel,
  presetOverflowLabel,
  presetTypeLabel,
  presetValueText,
} from '@/logic/labels';
import { presetRowAmount } from '@/logic/shippingMaterial';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

import { PresetBadge } from './PresetBadge';

/**
 * カードの中に出す最大件数（設計案 24a の「2〜3 件」）。
 * 3 種のカードが縦に並ぶので、1 枚が高くなるほど下の群（データ・バージョン）が画面から出る。
 */
const PREVIEW_LIMIT = 3;

/** プレビュー行のバッジ。一覧（28px）より一回り小さくして、カードの中の副次的な情報にする */
const PREVIEW_BADGE_SIZE = 22;

type Props = {
  type: PresetType;
  presets: Preset[];
};

export function PresetSummaryCard({ type, presets }: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const preview = presets.slice(0, PREVIEW_LIMIT);
  const overflow = presets.length - preview.length;

  return (
    // asChild の子に渡す style は**平坦化した 1 枚**にする（settings/index.tsx の「使いかた」行と
    // 同じ制約）。配列も、押下状態を受け取る関数も expo-router の Slot が素通しできず、
    // 地色ごと落ちてカードが消える ── 押したときの反応は android_ripple ではなく
    // 素の Link に任せる（他の設定行と同じ）
    <Link href={`/settings/presets/${type}`} asChild>
      <Pressable
        style={StyleSheet.flatten([
          styles.card,
          { backgroundColor: colors.secondaryBackground },
        ])}
        accessibilityRole="link"
        accessibilityLabel={`${presetTypeLabel(locale, type)} ${presetCountLabel(locale, presets.length)}`}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.label }]}>{presetTypeLabel(locale, type)}</Text>
          {/* この部品はまだ多言語化していない（ステップ 2）。カードの他の語（種類名・
              「まだ登録がありません」）が日本語のままなので、件数だけ訳すと
              1 枚の中で言語が混ざる。移すときに locale を props で受け取る形へ変える */}
          <Text style={[styles.count, { color: colors.secondaryLabel }]}>
            {presetCountLabel(locale, presets.length)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
        </View>

        {presets.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedLabel }]}>
            {presetCardEmptyLabel(locale)}
          </Text>
        ) : (
          <View style={styles.preview}>
            {preview.map((preset) => (
              <View key={preset.id} style={styles.previewRow}>
                <PresetBadge preset={preset} size={PREVIEW_BADGE_SIZE} />
                <Text style={[styles.name, { color: colors.label }]} numberOfLines={1}>
                  {preset.name}
                </Text>
                {/* 資材費のある送料プリセットは合計（SPEC-V6 §1）。一覧の行（PresetRow）と
                    同じ 1 本から取る ── 同じプリセットがカードと一覧で違う額に見えないように */}
                <Text style={[styles.value, { color: colors.secondaryLabel }]}>
                  {presetValueText(locale, preset.type, presetRowAmount(preset))}
                </Text>
              </View>
            ))}
            {overflow > 0 && (
              <Text style={[styles.overflow, { color: colors.secondaryLabel }]}>
                {presetOverflowLabel(locale, overflow)}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  count: {
    fontSize: 15,
  },
  preview: {
    gap: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
  value: {
    fontSize: 14,
  },
  // バッジの幅 ＋ 行の間隔ぶん字下げして、上のプレビュー行の名前と左端をそろえる
  overflow: {
    fontSize: 14,
    marginLeft: PREVIEW_BADGE_SIZE + 10,
  },
  empty: {
    fontSize: 14,
  },
});
