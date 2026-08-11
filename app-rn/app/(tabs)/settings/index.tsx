// 設定タブ（UI-SPEC §1.6 案 5b ＋ SPEC-V3 §3.1 / 設計案 24a）。
//
// モーダル（app/settings.tsx）からタブへ昇格した（UI-SPEC §6-8）。入口が常設になったので
// 計算タブのヘッダから歯車を外してある（§6-7）。
// 「使いかた」は設定タブ配下への push（§5-9）。他の画面の「？」からのシート表示は
// ステップ 6 で足すので、ここではまだ push だけ。
//
// 群の並びは UI-SPEC §1.6 のまま:
//   使いかた / 記録の既定値 / 入力を減らす / データ / バージョン表記。
// 「入力を減らす」（旧「（今後）」・非活性）を SPEC-V3 Step 2 で活性化し、
// 3 行を**カード**にした（設計案 24a。理由は PresetSummaryCard の冒頭）。
// 「データ」群の書き出し（CSV）は Step 6 まで「準備中」のまま置く（SPEC-V3 §6.2）。
//
// 手数料の既定値（defaultCommission。UI-SPEC §1.6-2）はまだ無いので、
// 「記録の既定値」群は種別だけ。
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PresetSummaryCard } from '@/components/PresetSummaryCard';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { usePresetList } from '@/db/usePresets';
import { useRecordCount } from '@/db/useRecords';
import {
  CSV_EXPORT_LABEL,
  DATA_SECTION_TITLE,
  PREPARING_LABEL,
  PRESET_SECTION_NOTE,
  PRESET_SECTION_TITLE,
  presetCountLabel,
  RECORD_COUNT_LABEL,
  versionLabel,
} from '@/logic/labels';
import { PRESET_TYPES } from '@/logic/preset';
import { useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

/** app.json の version。取れない経路（開発ビルドの一部）では行ごと出さない */
const APP_VERSION = Constants.expoConfig?.version ?? null;

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { defaultRecordKind, setDefaultRecordKind } = useSettings();
  // 3 種ぶん個別に引く。フックの数は固定なので、配列を回して呼んでいるわけではない
  const sitePresets = usePresetList('site');
  const shippingPresets = usePresetList('shipping');
  const packagingPresets = usePresetList('packaging');
  const recordCount = useRecordCount();

  const presetsByType = {
    site: sitePresets.presets,
    shipping: shippingPresets.presets,
    packaging: packagingPresets.presets,
  };

  return (
    <>
      <Stack.Screen options={{ title: '設定' }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        {/* UI-SPEC §1.6-1: 見出しなしの 1 行カード。設定の先頭に置いて探させない */}
        <View style={styles.section}>
          {/* asChild の子は <Slot> がクローンする。style が配列のままだと expo-router が
              弾く（expo-router/build/ui/Slot.js の開発時チェック）ので、渡す前に平坦化する */}
          <Link href="/settings/help" asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.linkRow,
                { backgroundColor: colors.secondaryBackground },
              ])}
              accessibilityRole="link">
              <Text style={[styles.label, { color: colors.label }]}>使いかた</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </Link>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            各画面の右上の「？」からも、その画面の説明だけを開けます。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>記録</Text>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.label, { color: colors.label }]}>新規作成時の種別</Text>
            <RecordKindSelector kind={defaultRecordKind} onChange={setDefaultRecordKind} />
            {/* SPEC-V2 §3.4: 設定が効くのはこれから作るレコードだけ。既存の種別は変わらない */}
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              新しく記録を追加するときに最初に選ばれている種別です。保存済みの記録の種別は変わりません。
            </Text>
          </View>
        </View>

        {/* SPEC-V3 §3.1 / 設計案 24a: 3 種を 3 枚のカードで。追加の口はここに置かない */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {PRESET_SECTION_TITLE}
          </Text>
          {PRESET_TYPES.map((type) => (
            <PresetSummaryCard key={type} type={type} presets={presetsByType[type]} />
          ))}
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {PRESET_SECTION_NOTE}
          </Text>
        </View>

        {/* UI-SPEC §1.6-4: データ群。書き出しは Step 6 まで非活性（SPEC-V3 §6.2） */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {DATA_SECTION_TITLE}
          </Text>
          <View style={[styles.card, styles.rowCard, { backgroundColor: colors.secondaryBackground }]}>
            <View style={styles.row} accessibilityRole="text">
              <Text style={[styles.label, { color: colors.disabledContent }]}>
                {CSV_EXPORT_LABEL}
              </Text>
              <Text style={[styles.rowValue, { color: colors.disabledContent }]}>
                {PREPARING_LABEL}
              </Text>
            </View>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.label }]}>{RECORD_COUNT_LABEL}</Text>
              <Text style={[styles.rowValue, { color: colors.secondaryLabel }]}>
                {presetCountLabel(recordCount)}
              </Text>
            </View>
          </View>
        </View>

        {/* UI-SPEC §1.6-5: フッタ。中央・上に余白 */}
        {APP_VERSION != null && (
          <Text style={[styles.version, { color: colors.secondaryLabel }]}>
            {versionLabel(APP_VERSION)}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
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
  // 行を積むカードは行の側に余白を持たせる（区切り線をカードの端まで引くため）
  rowCard: {
    paddingVertical: 0,
    paddingHorizontal: 16,
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  rowValue: {
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
  version: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});
