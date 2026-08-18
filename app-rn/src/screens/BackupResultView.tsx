// 画面 5: 復元できたとき（SPEC-V8 §5.6・設計案 53k）。
//
// **ダイアログで終わらせない。** 旧実装は `Alert.alert(backupRestoredMessage(...))` で
// 件数を 3 行出していたが、押した瞬間に消えるので**確かめ直せない** ── 全置換の直後に
// 一番したいのは「本当に入ったか」を数で見ることで、それは一覧に戻ってから
// 数え直せるものではない。
//
// **写真が欠けても警告色は使わない**（案 53k）。復元そのものは成功していて、
// 金額も日付も入っている（§4.3）── 赤にするのは欠けた行の数字だけで、
// 理由と対処は事実として下に置く。
//
// 画面 4（エラー）と同じ「アイコン ＋ 見出し ＋ カード ＋ 下端ボタン」の型に見えるが、
// **部品としては 1 つにまとめていない**（判断の理由は BackupScreen.tsx 冒頭）。
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomActionBar } from '@/components/BottomActionBar';
import {
  backupCountPhotosLabel,
  backupCountPresetsLabel,
  backupCountRecordsLabel,
  backupCountTagsLabel,
  backupMissingPhotoListTitle,
  backupRestoredTitle,
  backupResultOpenRecordsLabel,
  backupDayLabel,
  backupMissingPhotoNote,
  backupMissingPhotoRecordsLabel,
  backupRestoredPhotoValue,
  presetCountLabel,
  untitledLabel,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** 写真が戻らなかった記録 1 件（一覧に出すぶんだけ） */
export type MissingPhotoRecord = {
  id: string;
  itemName: string;
  /** 出品日か販売日（新しい方）。どの記録かを見分けるための添え物 */
  date: string;
};

type Props = {
  counts: { records: number; tags: number; presets: number };
  /** 戻せた写真の枚数 */
  photos: number;
  /** 戻せなかった写真の枚数（0 なら赤い行も注記も出ない） */
  missingPhotos: number;
  /** そのぶんの記録（「写真がなかった3件を見る」で開く） */
  missingRecords: readonly MissingPhotoRecord[];
  onOpenRecords: () => void;
};

export function BackupResultView({
  counts,
  photos,
  missingPhotos,
  missingRecords,
  onOpenRecords,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  /** 欠けた記録の一覧を開いているか。**画面は増やさない**（ここで開いて閉じられる） */
  const [listOpen, setListOpen] = useState(false);
  const missing = missingPhotos > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.badge, { backgroundColor: colors.successBackground }]}>
          <Ionicons name="checkmark" size={34} color={colors.green} />
        </View>
        <Text style={[styles.title, { color: colors.label }]}>{backupRestoredTitle(locale)}</Text>

        {/* 件数は**DB から数え直したもの**（§5.6）。入ったことを数で確かめられるようにする */}
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
          {[
            { label: backupCountRecordsLabel(locale), value: presetCountLabel(locale, counts.records) },
            { label: backupCountTagsLabel(locale), value: presetCountLabel(locale, counts.tags) },
            { label: backupCountPresetsLabel(locale), value: presetCountLabel(locale, counts.presets) },
            {
              label: backupCountPhotosLabel(locale),
              value: backupRestoredPhotoValue(locale, photos, missingPhotos),
              alert: missing,
            },
          ].map((row, index) => (
            <ResultRow
              key={row.label}
              label={row.label}
              value={row.value}
              tone={row.alert === true ? 'alert' : 'normal'}
              separated={index > 0}
            />
          ))}
        </View>

        {missing && (
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {backupMissingPhotoNote(locale, missingPhotos)}
          </Text>
        )}

        {/* 「見る」で開くのはこの場の一覧（案 53k）。どの記録が写真なしで入ったかは
            商品名で分かる ── 一覧へ飛ばして探させる方が遠回りになる */}
        {missing && listOpen && (
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.listTitle, { color: colors.secondaryLabel }]}>
              {backupMissingPhotoListTitle(locale)}
            </Text>
            {missingRecords.map((record) => (
              <View key={record.id} style={[styles.listRow, { borderTopColor: colors.separator }]}>
                <Text style={[styles.listName, { color: colors.label }]} numberOfLines={1}>
                  {record.itemName.trim() === '' ? untitledLabel(locale) : record.itemName}
                </Text>
                <Text style={[styles.listDate, { color: colors.secondaryLabel }]}>
                  {backupDayLabel(locale, record.date)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomActionBar
        label={backupResultOpenRecordsLabel(locale)}
        onPress={onOpenRecords}
        secondary={
          missing && !listOpen
            ? {
                label: backupMissingPhotoRecordsLabel(locale, missingPhotos),
                onPress: () => setListOpen(true),
              }
            : undefined
        }
      />
    </View>
  );
}

/** 件数の 1 行。`alert` は欠けた写真の行だけ（赤くするのは数字の側） */
function ResultRow({
  label,
  value,
  tone = 'normal',
  separated = false,
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'alert';
  /** 2 行目以降だけ区切り線を持つ（カードの上端に線が出ないように） */
  separated?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.row,
        separated && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
      ]}>
      <Text style={[styles.rowLabel, { color: colors.label }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: tone === 'alert' ? colors.red : colors.label }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  // 緑の丸は見出しの上に 1 つだけ。**大きくしすぎない**（読むのは下の件数）
  badge: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 13,
  },
  rowLabel: {
    fontSize: 15,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 4,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingTop: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  listName: {
    flex: 1,
    fontSize: 15,
  },
  listDate: {
    fontSize: 13,
  },
});
