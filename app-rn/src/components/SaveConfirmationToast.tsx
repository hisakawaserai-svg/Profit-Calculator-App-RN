// 保存確認カード（デザイン確定仕様版・3a/3b。https://claude.ai/design/p/a60b1716-101b-4601-a5fb-b38492474c44）。
// 記録保存のたびに必ず出す。実績を新規獲得したときも先にこちらを出し、閉じたら続けて
// AchievementToast を出す（保存の確認が優先。RecordFormSheet.handleSave の onHide 連鎖）。
//
// レイアウトは DataSummaryBar と同じ「見出し(小)→金額(大)」の縦順・「左に主役、右に文脈」の関係
// （3a のメモ「純利益は『純利益』→金額の縦順。右列も同じ順で2行」）。
//
// サムネイルが無いときは枠を消し、空いた幅を商品名に回す（3b）。タグが無いときは下段の
// 罫線・チップ行ごと出さない（3b。出品中・タグ無しの例で確認済み）。純利益がマイナスなら
// 色を red に、符号は「−¥」にする（3b の赤字例）。
//
// **幅を明示する。** react-native-toast-message の AnimatedContainer は
// `alignItems: 'center'` で中身を中央寄せするだけで、幅は決めてくれない
// （中身の幅なりに縮む）。カード側で width を持たせないと、内部の flex: 1（商品名の列）が
// 効かず、テキストが軒並み潰れて省略記号だらけになる（実機で確認済みの不具合）。
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ToastConfigParams } from 'react-native-toast-message';

import type { RecordKind } from '@/db/schema';
import {
  expensesLabel,
  salesPriceLabel,
  savedCardHeader,
  savedCardProfitLabel,
  savedCardStatusLabel,
} from '@/logic/labels';
import { formatYenSymbol } from '@/logic/format';
import { photoStore } from '@/media/expoPhotoFiles';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

import { ToastProgressBar } from './ToastProgressBar';
import { TOAST_VISIBILITY_MS } from './toastVisibility';

export const SAVE_CONFIRMATION_TOAST_TYPE = 'saveConfirmation';

export type SaveConfirmationToastProps = {
  itemName: string;
  photoFileName: string | null;
  kind: RecordKind;
  isSold: boolean;
  salesPrice: number;
  expenses: number;
  netProfit: number;
  tagNames: readonly string[];
};

const THUMBNAIL_SIZE = 48;

/** カード左右の余白（3a の canvas 実測: 402pt 幅で左右 12pt ずつ）*/
const CARD_MARGIN = 12;

export function SaveConfirmationToast({
  props,
  isVisible,
  onPress,
}: ToastConfigParams<SaveConfirmationToastProps>) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  if (props == null) return null;

  const { itemName, photoFileName, kind, isSold, salesPrice, expenses, netProfit, tagNames } = props;
  const photoUri = photoFileName != null ? photoStore.uri(photoFileName) : null;
  const profitColor = netProfit < 0 ? colors.red : colors.green;
  const hasTags = tagNames.length > 0;

  // formatYenSymbol は "¥2,020" / "-¥1,880" を返す（符号は ¥ の前）。
  // ¥ 記号だけ小さく・数字を大きくする 2 段階の文字サイズにするため、¥ の位置で割る
  const formattedProfit = formatYenSymbol(netProfit);
  const yenIndex = formattedProfit.indexOf('¥');
  const profitSign = formattedProfit.slice(0, yenIndex + 1);
  const profitDigits = formattedProfit.slice(yenIndex + 1);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          width: windowWidth - CARD_MARGIN * 2,
          backgroundColor: colors.secondaryBackground,
          borderColor: colors.separator,
        },
      ]}>
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={[styles.checkBadge, { backgroundColor: colors.green }]}>
            <Ionicons name="checkmark" size={10} color={colors.secondaryBackground} />
          </View>
          <Text style={[styles.headerText, { color: profitColor }]} numberOfLines={1}>
            {savedCardHeader(locale)}
          </Text>
        </View>

        <View style={styles.mainRow}>
          {photoUri != null && (
            <Image source={{ uri: photoUri }} style={styles.thumbnail} contentFit="cover" transition={0} />
          )}

          <View style={styles.nameColumn}>
            <View style={styles.nameRow}>
              <Text style={[styles.itemName, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {itemName}
              </Text>
              {!isSold && (
                <View style={[styles.statusBadge, { backgroundColor: colors.highlightBackground }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.blue }]} numberOfLines={1}>
                    {savedCardStatusLabel(locale, isSold)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.profitLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {savedCardProfitLabel(locale, kind, isSold)}
            </Text>
            <View style={styles.profitRow}>
              <Text style={[styles.profitSign, { color: profitColor }]}>{profitSign}</Text>
              <Text style={[styles.profitValue, { color: profitColor }]} numberOfLines={1}>
                {profitDigits}
              </Text>
            </View>
          </View>

          <View style={styles.contextColumn}>
            <View>
              <Text style={[styles.contextLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {salesPriceLabel(locale)}
              </Text>
              <Text style={[styles.contextValue, { color: colors.label }]} numberOfLines={1}>
                {formatYenSymbol(salesPrice)}
              </Text>
            </View>
            <View>
              <Text style={[styles.contextLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
                {expensesLabel(locale)}
              </Text>
              <Text style={[styles.contextValue, { color: colors.red }]} numberOfLines={1}>
                {formatYenSymbol(expenses)}
              </Text>
            </View>
          </View>

          <Text style={[styles.chevron, { color: colors.secondaryLabel }]}>›</Text>
        </View>

        {hasTags && (
          <View style={[styles.tagsRow, { borderTopColor: colors.separator }]}>
            <View style={[styles.statusChip, { backgroundColor: colors.successBackground }]}>
              <View style={[styles.statusDot, { backgroundColor: colors.green }]} />
              <Text style={[styles.statusChipText, { color: colors.green }]} numberOfLines={1}>
                {savedCardStatusLabel(locale, isSold)}
              </Text>
            </View>
            {tagNames.map((name) => (
              <View key={name} style={[styles.tagChip, { backgroundColor: colors.disabledBackground }]}>
                <Text style={[styles.tagChipText, { color: colors.secondaryLabel }]} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <ToastProgressBar
        durationMs={TOAST_VISIBILITY_MS}
        trackColor={colors.separator}
        fillColor={profitColor}
        isVisible={isVisible}
      />
    </Pressable>
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
    paddingVertical: 12,
    gap: 11,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 10,
  },
  nameColumn: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  statusBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  profitLabel: {
    fontSize: 11,
  },
  profitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  profitSign: {
    fontSize: 16,
    fontWeight: '700',
  },
  profitValue: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  contextColumn: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 9,
  },
  contextLabel: {
    fontSize: 10.5,
    textAlign: 'right',
  },
  contextValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  chevron: {
    flexShrink: 0,
    fontSize: 17,
    paddingLeft: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tagChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagChipText: {
    fontSize: 11,
  },
});
