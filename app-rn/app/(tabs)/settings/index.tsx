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
// 「データ」群の書き出し（CSV）は Step 6（SPEC-V3 §5.7）で活性化した。押すとモーダルで
// 書き出しシートが開く（presentation は同じ階層の _layout.tsx が持つ）。
//
// 手数料の既定値（defaultCommission。UI-SPEC §1.6-2）はまだ無いので、
// 「記録の既定値」群は種別だけ。
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Link, Stack } from 'expo-router';
import { useCallback, type ComponentType } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PresetSummaryCard } from '@/components/PresetSummaryCard';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { TagDot } from '@/components/TagChip';
import { usePresetList } from '@/db/usePresets';
import { useRecordCount } from '@/db/useRecords';
import { useTagList } from '@/db/useTags';
import {
  CSV_EXPORT_LABEL,
  DATA_SECTION_TITLE,
  DEFAULT_RECORD_KIND_LABEL,
  DEFAULT_RECORD_KIND_NOTE,
  HELP_LINK_LABEL,
  HELP_LINK_NOTE,
  PRESET_SECTION_NOTE,
  PRESET_SECTION_TITLE,
  presetCountLabel,
  RECORD_COUNT_LABEL,
  RECORD_SETTINGS_SECTION_TITLE,
  SETTINGS_TAB_LABEL,
  TAG_CARD_EMPTY_LABEL,
  TAG_LABEL,
  TAG_SECTION_NOTE,
  TAG_SECTION_TITLE,
  versionLabel,
} from '@/logic/labels';
import { PRESET_TYPES } from '@/logic/preset';
import { useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

/** app.json の version。取れない経路（開発ビルドの一部）では行ごと出さない */
const APP_VERSION = Constants.expoConfig?.version ?? null;

/**
 * 開発用のテストデータ投入（src/dev/）。**import 文ではなく require で読む。**
 *
 * import にすると `__DEV__` が false でもモジュールがバンドルに入る（import は条件を持てない）。
 * require なら production ビルドで丸ごと落ちる ── Metro は本番の変換で
 * `__DEV__` を false に畳んでから（inlinePlugin）定数畳み込み（constantFoldingPlugin）を掛け、
 * **そのあとで**依存を収集する（collectDependencies）。この三項演算子は依存収集の前に
 * `null` になるので、src/dev/ 配下（画面・生成・削除）はどれもバンドルに含まれない。
 *
 * 型は `typeof import(...)` で付ける（型の位置なので実行時の読み込みは起きない）。
 */
const DevSeedCard: ComponentType<{ onChanged: () => void }> | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- import では本番ビルドから落とせない（上記）
    (require('@/dev/DevSeedCard') as typeof import('@/dev/DevSeedCard')).DevSeedCard
  : null;

/**
 * 設定タブのカードに並べる色の点（SPEC-V4 §2.1）。一覧のチップの点（6px）より大きくするのは、
 * ここでは名前が付かず、点だけで「何色ぶん登録があるか」を読ませるため。
 */
const TAG_DOT_PREVIEW_SIZE = 10;

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { defaultRecordKind, setDefaultRecordKind } = useSettings();
  // 3 種ぶん個別に引く。フックの数は固定なので、配列を回して呼んでいるわけではない
  const sitePresets = usePresetList('site');
  const shippingPresets = usePresetList('shipping');
  const packagingPresets = usePresetList('packaging');
  const recordCount = useRecordCount();
  // 件数と色の点だけを使う（§2.1）。使用件数（counts）はここでは出さない ──
  // 設定タブに出すのは「何件登録してあるか」で、どのタグがよく使われているかは一覧の役目
  const tagList = useTagList();
  const tags = tagList.tags;

  const presetsByType = {
    site: sitePresets.presets,
    shipping: shippingPresets.presets,
    packaging: packagingPresets.presets,
  };

  /**
   * 開発用のテストデータを投入・削除したあとに、この画面の数字を引き直す。
   *
   * 各フックは**画面復帰（useFocusEffect）でしか引き直さない** ── 設定タブは記録も
   * タグも書き換えない、という前提で組まれているため（useRecordCount のコメント）。
   * その前提を破るのは開発用のカードだけなので、そこからだけ明示的に呼ぶ。
   */
  const refreshData = useCallback(() => {
    sitePresets.refresh();
    shippingPresets.refresh();
    packagingPresets.refresh();
    tagList.refresh();
    recordCount.refresh();
  }, [sitePresets, shippingPresets, packagingPresets, tagList, recordCount]);

  return (
    <>
      <Stack.Screen options={{ title: SETTINGS_TAB_LABEL }} />
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
              <Text style={[styles.label, { color: colors.label }]}>{HELP_LINK_LABEL}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </Link>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{HELP_LINK_NOTE}</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {RECORD_SETTINGS_SECTION_TITLE}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.label, { color: colors.label }]}>{DEFAULT_RECORD_KIND_LABEL}</Text>
            <RecordKindSelector kind={defaultRecordKind} onChange={setDefaultRecordKind} />
            {/* SPEC-V2 §3.4: 設定が効くのはこれから作るレコードだけ。既存の種別は変わらない */}
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {DEFAULT_RECORD_KIND_NOTE}
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

        {/* SPEC-V4 §2.1: 「入力を減らす」とは**別の群**にする。あちらの 3 つは選ぶと欄に値が
            入るもので、タグは記録に残って後から効くもの（§0.1）。4 枚目として並べると、
            上の注記（「よく使う値を登録しておくと…」）がタグには当てはまらなくなる。
            群 3 と群 5 の間なのは、設定を「入力 → 記録 → 出力」の順に読ませるため */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {TAG_SECTION_TITLE}
          </Text>
          <Link href="/settings/tags" asChild>
            <Pressable
              // asChild の子に渡す style は平坦化した 1 枚にする（「使いかた」行と同じ制約）
              style={StyleSheet.flatten([
                styles.card,
                styles.tagCard,
                { backgroundColor: colors.secondaryBackground },
              ])}
              accessibilityRole="link"
              accessibilityLabel={`${TAG_LABEL} ${presetCountLabel(tags.length)}`}>
              <View style={styles.tagHeader}>
                <Text style={[styles.label, styles.tagTitle, { color: colors.label }]}>
                  {TAG_LABEL}
                </Text>
                <Text style={[styles.rowValue, { color: colors.secondaryLabel }]}>
                  {presetCountLabel(tags.length)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
              </View>
              {/* §2.1: 件数と**色の点のプレビュー**。名前まで並べないのは、プリセットのカードと
                  違ってタグは数が増えやすく（上限なし。§1.2）、3 件だけ出すと
                  「その 3 件が特別」と読めるため。点だけなら全部を 1 行に収められる */}
              {tags.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedLabel }]}>
                  {TAG_CARD_EMPTY_LABEL}
                </Text>
              ) : (
                <View style={styles.tagDots}>
                  {tags.map((tag) => (
                    <TagDot key={tag.id} colorKey={tag.colorKey} size={TAG_DOT_PREVIEW_SIZE} />
                  ))}
                </View>
              )}
            </Pressable>
          </Link>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{TAG_SECTION_NOTE}</Text>
        </View>

        {/* UI-SPEC §1.6-4: データ群。書き出しは SPEC-V3 §5.7 で実装済み（活性） */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {DATA_SECTION_TITLE}
          </Text>
          <View style={[styles.card, styles.rowCard, { backgroundColor: colors.secondaryBackground }]}>
            {/* SPEC-V3 §5.7 で活性化した（「準備中」が外れた）。押すとモーダルの
                書き出しシートが開く（presentation は設定タブの _layout.tsx が持つ） */}
            <Link href="/settings/export" asChild>
              <Pressable
                // asChild の子に渡す style は平坦化した 1 枚にする（「使いかた」行と同じ制約）
                style={StyleSheet.flatten([styles.row])}
                accessibilityRole="link">
                <Text style={[styles.label, { color: colors.label }]}>{CSV_EXPORT_LABEL}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
              </Pressable>
            </Link>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.label }]}>{RECORD_COUNT_LABEL}</Text>
              <Text style={[styles.rowValue, { color: colors.secondaryLabel }]}>
                {presetCountLabel(recordCount.count)}
              </Text>
            </View>
          </View>
        </View>

        {/* 開発ビルドだけに出る。production では DevSeedCard が null になり、
            require ごとバンドルから落ちる（宣言のコメント参照） */}
        {DevSeedCard != null && <DevSeedCard onChanged={refreshData} />}

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
  // カードの中は「見出しの行」と「点の行」の 2 段。gap は card のものをそのまま使う
  tagCard: {
    gap: 12,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagTitle: {
    flex: 1,
  },
  // 登録が増えても 1 枚のカードに収まるよう折り返す（件数に上限がない。§1.2）
  tagDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  empty: {
    fontSize: 14,
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
