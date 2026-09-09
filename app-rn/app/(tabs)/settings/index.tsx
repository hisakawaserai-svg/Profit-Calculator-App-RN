// 設定タブ（UI-SPEC §1.6 案 5b ＋ SPEC-V3 §3.1 / 設計案 24a）。
//
// モーダル（app/settings.tsx）からタブへ昇格した（UI-SPEC §6-8）。入口が常設になったので
// 計算タブのヘッダから歯車を外してある（§6-7）。
// 「使いかた」は設定タブ配下への push（§5-9）。他の画面の「？」からのシート表示は
// ステップ 6 で足すので、ここではまだ push だけ。
//
// 群の並びは UI-SPEC §1.6 のまま:
//   使いかた / 表示言語 / 記録の既定値 / よく使う値 / データ / バージョン表記。
// 「表示言語」は多言語化のステップ 1 で足した群（§1.6 未採番）。位置の理由は当該箇所を参照。
//
// **この画面の表示語だけが辞書（src/i18n/）に移してある**（多言語化ステップ 1）。
// labels.ts から取るものが定数ではなく関数になっているのはそのため。
// 「よく使う値」（旧「（今後）」・非活性）を SPEC-V3 Step 2 で活性化し、
// 3 行を**カード**にした（設計案 24a。理由は PresetSummaryCard の冒頭）。
// 「データ」群の書き出し（CSV）は Step 6（SPEC-V3 §5.7）で活性化した。押すとモーダルで
// 書き出しシートが開く（presentation は同じ階層の _layout.tsx が持つ）。
//
// 手数料の既定値（defaultCommission。UI-SPEC §1.6-2）はまだ無いので、
// 「記録の既定値」群は種別だけ。
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { Link, Stack } from 'expo-router';
import { useCallback, type ComponentType } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { ReactNativeLegal } from 'react-native-legal';

import { LanguageSelector } from '@/components/LanguageSelector';
import { NotificationBell } from '@/components/NotificationBell';
import { refreshBell } from '@/notifications/bellStore';
import { PresetSummaryCard } from '@/components/PresetSummaryCard';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { Stepper } from '@/components/Stepper';
import { TagDot } from '@/components/TagChip';
import { requestOnboarding } from '@/components/onboardingBus';
import { usePresetList } from '@/db/usePresets';
import { useRecordCount } from '@/db/useRecords';
import { useTagList } from '@/db/useTags';
import {
  backupLabel,
  browserOpenFailedMessage,
  csvExportLabel,
  dataSectionTitle,
  defaultRecordKindLabel,
  defaultRecordKindNote,
  helpLinkLabel,
  helpLinkNote,
  languageSectionNote,
  languageSectionTitle,
  licenseLinkLabel,
  notificationDevSeedLabel,
  notificationDevTestLabel,
  notificationDevTestMonthlyReviewLabel,
  notificationEnabledLabel,
  notificationEnabledNote,
  notificationSectionTitle,
  notificationThresholdDaysValue,
  notificationThresholdLabel,
  notificationThresholdNote,
  presetCountLabel,
  presetSectionNote,
  presetSectionTitle,
  privacyLinkLabel,
  recordCountLabel,
  recordSettingsSectionTitle,
  replayTutorialLabel,
  reviewLinkLabel,
  reviewLinkNote,
  settingsTabLabel,
  supportLinkLabel,
  supportSectionNote,
  tagCardEmptyLabel,
  tagLabel,
  tagSectionNote,
  tagSectionTitle,
  versionLabel,
} from '@/logic/labels';
import { PRESET_TYPES } from '@/logic/preset';
import {
  rescheduleNotification,
  requestNotificationPermission,
  sendTestMonthlyReviewNotification,
  sendTestNotification,
} from '@/notifications/scheduler';
import { storeReviewUrl } from '@/review/storeUrl';
import { useSettings } from '@/settings';
import {
  MAX_LISTING_ALERT_THRESHOLD_DAYS,
  MIN_LISTING_ALERT_THRESHOLD_DAYS,
} from '@/settings/listingAlertThresholdDays';
import { useThemeColors, type ThemeColors } from '@/theme';

/**
 * 表示するバージョン。**いま動いているバイナリに焼かれた値**を読む
 * （iOS は Info.plist の `CFBundleShortVersionString`、Android は `versionName`）。
 *
 * **`Constants.expoConfig?.version` は使わない。** あれが返すのは
 * 「ビルド時点の app.json の値」で、ネイティブに焼かれた値ではない ──
 * expo-constants はビルドのたびに app.json から `app.config` を作り直して埋め込むだけで、
 * Info.plist も build.gradle も読まない。両者が一致するのは
 * **prebuild が app.json の最後の変更のあとに走ったときだけ**で、ビルドはそれを保証しない
 * （`expo run:*` は ios/ android/ があると prebuild を飛ばす）。
 * その状態で app.json の version だけ上げると、**表示は新しい値・バイナリは古い値**になり、
 * しかも表示が正しく見えるので気付けない。
 *
 * `Constants.nativeAppVersion` は SDK 57 で型定義から削除済みなので使えない
 * （deprecation 先がこの expo-application）。
 *
 * 取れなければ行ごと出さない、という扱いは変えない ── 返り値は `string | null` で、
 * 出せない値の代わりに「バージョン ???」と出しても読む人にできることが無い。
 */
const APP_VERSION = Application.nativeApplicationVersion;

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

/** 開発用: 「すべて」タブ確認用の通知履歴ダミーデータ投入（理由・仕組みは DevSeedCard と同じ） */
const insertNotificationHistorySeed: (() => number) | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- import では本番ビルドから落とせない（上記）
    (require('@/dev/notificationHistorySeed') as typeof import('@/dev/notificationHistorySeed'))
      .insertNotificationHistorySeed
  : null;

/**
 * 開発用: 出品滞留アラートの境界値（今日・明日・しきい値ちょうど等）をまとめて投入・削除する
 * （理由・仕組みは DevSeedCard と同じ）
 */
const notificationTestCasesSeed: typeof import('@/dev/notificationTestCasesSeed') | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- import では本番ビルドから落とせない（上記）
    (require('@/dev/notificationTestCasesSeed') as typeof import('@/dev/notificationTestCasesSeed'))
  : null;

/**
 * サポートとプライバシーポリシーの公開先（GitHub Pages。`docs/` をそのまま配信している）。
 *
 * **アプリの中に埋め込まず、外のページに置く。** どちらも文面を直す頻度が
 * アプリの更新より高く、審査を待たずに直せる場所に無いと意味がない ──
 * 特にプライバシーポリシーは、ストアの掲載情報からも同じ URL を指す。
 */
const SUPPORT_URL = 'https://hisakawaserai-svg.github.io/Profit-Calculator-App-RN/support.html';
const PRIVACY_URL = 'https://hisakawaserai-svg.github.io/Profit-Calculator-App-RN/privacy.html';

/**
 * 「レビューを書く」の行き先（src/review/storeUrl.ts）。ストアの無い経路（web）では null で、
 * その場合は行ごと出さない ── 押しても何も起きない行を残さない。
 *
 * **ここで expo-store-review を呼ばないことが要点。** 理由は storeUrl.ts の冒頭にある。
 */
const REVIEW_URL = storeReviewUrl(Platform.OS);

/**
 * 設定タブのカードに並べる色の点（SPEC-V4 §2.1）。一覧のチップの点（6px）より大きくするのは、
 * ここでは名前が付かず、点だけで「何色ぶん登録があるか」を読ませるため。
 */
const TAG_DOT_PREVIEW_SIZE = 10;

export default function SettingsScreen() {
  const colors = useThemeColors();
  // useSettings() はストア全体を購読するので、言語を変えるとこの画面も再描画される。
  // **表示語の関数には locale を渡すこと** ── 渡さないと React Compiler が
  // 「依存なし」と見なして初回の文字列で固定してしまう（src/i18n/index.ts の冒頭）
  const {
    defaultRecordKind,
    setDefaultRecordKind,
    language,
    setLanguage,
    locale,
    notificationsEnabled,
    setNotificationsEnabled,
    listingAlertThresholdDays,
    setListingAlertThresholdDays,
  } = useSettings();
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
  /**
   * 外部のページを**端末の既定のブラウザ**で開く。
   *
   * アプリ内ブラウザ（expo-web-browser）にはしない ── サポートのページからは
   * メールや他のサイトへ辿ることになるので、戻る先が「アプリの中の閲覧画面」だと
   * 行き止まりになる。`Linking.openURL` は OS に渡すだけなので、
   * 利用者がいつも使っているブラウザで開く。
   *
   * **失敗しても画面は変えない。** 開けない理由は端末側（既定のブラウザが無効、
   * URL を扱えるアプリが無い）で、こちらから直せるものではないので、
   * 言えるのは「開けなかった」までにする。
   */
  const openExternal = useCallback(
    (url: string) => {
      void Linking.openURL(url).catch(() => {
        Alert.alert(browserOpenFailedMessage(locale));
      });
    },
    [locale],
  );

  /**
   * 通知の全体トグル。オンにするときだけ OS の許可を求める ── オフにする操作に
   * 許可ダイアログを挟む理由が無い。許可が下りなくても設定側はオンのまま持つ
   * （scheduler.rescheduleNotification が許可の有無を見て、無ければ何も予約しない
   * だけなので、ここで別途エラー扱いにする必要が無い）。
   *
   * どちらの向きでも rescheduleNotification を呼び直す ── オフにした直後に
   * 予約済みの通知が残ったままにならないよう、呼び出し内で cancelAllScheduledNotificationsAsync
   * を先に行ってから判定し直す作りになっている（scheduler.ts 冒頭）。
   */
  const handleToggleNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      setNotificationsEnabled(enabled);
      if (enabled) {
        void requestNotificationPermission().then(() => rescheduleNotification());
      } else {
        void rescheduleNotification();
      }
    },
    [setNotificationsEnabled],
  );

  const handleThresholdChange = useCallback(
    (days: number) => {
      setListingAlertThresholdDays(days);
      void rescheduleNotification();
    },
    [setListingAlertThresholdDays],
  );

  const refreshData = useCallback(() => {
    sitePresets.refresh();
    shippingPresets.refresh();
    packagingPresets.refresh();
    tagList.refresh();
    recordCount.refresh();
    // 開発用データ投入/削除（DevSeedCard）は repository を直接 SQL で触るだけで、
    // useRecords.ts の saveRecord/deleteRecord を通らない ── そちらに乗せてある
    // refreshBell() 呼び出しも一緒には走らないので、ここで明示的に呼ぶ。呼ばないと、
    // 開発用に全データを消してもベル（記録タブ・お知らせ画面）が消える前の内容のまま残る
    refreshBell();
  }, [sitePresets, shippingPresets, packagingPresets, tagList, recordCount]);

  return (
    <>
      {/* ベルは全タブ共通（calc/data タブと同じ理由。NotificationBell のコメント参照） */}
      <Stack.Screen
        options={{ title: settingsTabLabel(locale), headerLeft: () => <NotificationBell /> }}
      />
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
              <RowIcon name="help-circle-outline" colors={colors} />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {helpLinkLabel(locale)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </Link>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{helpLinkNote(locale)}</Text>
        </View>

        {/* 「使いかた」と同じ見出しなしの 1 行カード。押すと初回起動チュートリアルを
            もう一度開く（app/_layout.tsx の OnboardingOverlay へ、achievementToastBus と
            同じ配線の onboardingBus 経由で伝える）。この行を押しても既読の記録（tutorialSeen）
            は戻さない ── 次回起動でまた自動的に出てしまうのは「もう一度見る」の意図とは違う */}
        <View style={styles.section}>
          <Pressable
            onPress={requestOnboarding}
            style={StyleSheet.flatten([
              styles.linkRow,
              { backgroundColor: colors.secondaryBackground },
            ])}
            accessibilityRole="button">
            <RowIcon name="play-circle-outline" colors={colors} />
            <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
              {replayTutorialLabel(locale)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
          </Pressable>
        </View>

        {/* 表示言語（3 択）。**「記録の既定値」より上に置く** ── 下の群の見出しごと
            切り替わるものなので、切り替えた結果が下に見える並びにする。
            カードの作りは「記録の既定値」と同じ（見出し・セグメント・注記）*/}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="language-outline" size={15} color={colors.secondaryLabel} />
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
              {languageSectionTitle(locale)}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <LanguageSelector language={language} locale={locale} onChange={setLanguage} />
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {languageSectionNote(locale)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="create-outline" size={15} color={colors.secondaryLabel} />
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
              {recordSettingsSectionTitle(locale)}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.label, { color: colors.label }]}>{defaultRecordKindLabel(locale)}</Text>
            <RecordKindSelector kind={defaultRecordKind} onChange={setDefaultRecordKind} />
            {/* SPEC-V2 §3.4: 設定が効くのはこれから作るレコードだけ。既存の種別は変わらない */}
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {defaultRecordKindNote(locale)}
            </Text>
          </View>
        </View>

        {/* 出品滞留アラート／月次振り返り（feature/listing-alert-monthly-review）。
            全体トグル・閾値日数の 2 行を 1 枚のカードに。__DEV__ ビルドだけ、確認用の
            テスト通知ボタンを 3 行目として足す（本番ビルドには出ない） */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
            {notificationSectionTitle(locale)}
          </Text>
          <View
            style={[styles.card, styles.rowCard, { backgroundColor: colors.secondaryBackground }]}>
            <View style={[styles.row, styles.switchRow]}>
              {/* ベルアイコン部分だけ押せる（notifications.tsx を開く）。ラベル本体はトグルの
                  状態を示すだけで押せない ── 行全体を押せるようにすると、Switch のすぐ隣を
                  押したときに「開く」と「切り替える」のどちらが反応するか曖昧になるため */}
              <NotificationBell />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {notificationEnabledLabel(locale)}
              </Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotificationsEnabled}
                trackColor={{ true: colors.blue }}
                accessibilityLabel={notificationEnabledLabel(locale)}
                style={styles.switchControl}
              />
            </View>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <View style={styles.stepperRow}>
              <Stepper
                label={notificationThresholdLabel(locale)}
                value={listingAlertThresholdDays}
                minimumValue={MIN_LISTING_ALERT_THRESHOLD_DAYS}
                maximumValue={MAX_LISTING_ALERT_THRESHOLD_DAYS}
                centerLabel={notificationThresholdDaysValue(locale, listingAlertThresholdDays)}
                onChangeValue={handleThresholdChange}
              />
            </View>
            {__DEV__ && (
              <>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                <Pressable
                  onPress={() => void sendTestNotification()}
                  style={styles.row}
                  accessibilityRole="button">
                  <Text style={[styles.label, { color: colors.blue }]}>
                    {notificationDevTestLabel(locale)}
                  </Text>
                </Pressable>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                <Pressable
                  onPress={() => void sendTestMonthlyReviewNotification()}
                  style={styles.row}
                  accessibilityRole="button">
                  <Text style={[styles.label, { color: colors.blue }]}>
                    {notificationDevTestMonthlyReviewLabel(locale)}
                  </Text>
                </Pressable>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                <Pressable
                  onPress={() => {
                    const count = insertNotificationHistorySeed?.() ?? 0;
                    Alert.alert(
                      count > 0 ? `履歴に${count}件追加しました` : '出品中の記録が無いため追加できませんでした',
                    );
                  }}
                  style={styles.row}
                  accessibilityRole="button">
                  <Text style={[styles.label, { color: colors.blue }]}>
                    {notificationDevSeedLabel(locale)}
                  </Text>
                </Pressable>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                <Pressable
                  onPress={() => {
                    const count = notificationTestCasesSeed?.insertNotificationTestCases() ?? 0;
                    refreshBell();
                    Alert.alert(`境界値テスト記録を${count}件投入しました`);
                  }}
                  style={styles.row}
                  accessibilityRole="button">
                  <Text style={[styles.label, { color: colors.blue }]}>
                    通知テスト用の記録を投入（開発用）
                  </Text>
                </Pressable>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                <Pressable
                  onPress={() => {
                    const summary = notificationTestCasesSeed?.removeNotificationTestCases();
                    refreshBell();
                    Alert.alert(`テスト記録を${summary?.records ?? 0}件削除しました`);
                  }}
                  style={styles.row}
                  accessibilityRole="button">
                  <Text style={[styles.label, { color: colors.red }]}>
                    通知テスト用の記録を削除（開発用）
                  </Text>
                </Pressable>
              </>
            )}
          </View>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {notificationEnabledNote(locale)}
          </Text>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {notificationThresholdNote(locale)}
          </Text>
        </View>

        {/* SPEC-V3 §3.1 / 設計案 24a: 3 種を 3 枚のカードで。追加の口はここに置かない */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="pricetags-outline" size={15} color={colors.secondaryLabel} />
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
              {presetSectionTitle(locale)}
            </Text>
          </View>
          {PRESET_TYPES.map((type) => (
            <PresetSummaryCard key={type} type={type} presets={presetsByType[type]} />
          ))}
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {presetSectionNote(locale)}
          </Text>
        </View>

        {/* SPEC-V4 §2.1: 「よく使う値」とは**別の群**にする。あちらの 3 つは選ぶと欄に値が
            入るもので、タグは記録に残って後から効くもの（§0.1）。4 枚目として並べると、
            上の注記（「よく使う値を登録しておくと…」）がタグには当てはまらなくなる。
            群 3 と群 5 の間なのは、設定を「入力 → 記録 → 出力」の順に読ませるため */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="pricetag-outline" size={15} color={colors.secondaryLabel} />
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
              {tagSectionTitle(locale)}
            </Text>
          </View>
          <Link href="/settings/tags" asChild>
            <Pressable
              // asChild の子に渡す style は平坦化した 1 枚にする（「使いかた」行と同じ制約）
              style={StyleSheet.flatten([
                styles.card,
                styles.tagCard,
                { backgroundColor: colors.secondaryBackground },
              ])}
              accessibilityRole="link"
              accessibilityLabel={`${tagLabel(locale)} ${presetCountLabel(locale, tags.length)}`}>
              <View style={styles.tagHeader}>
                <Text style={[styles.label, styles.tagTitle, { color: colors.label }]}>
                  {tagLabel(locale)}
                </Text>
                <Text style={[styles.rowValue, { color: colors.secondaryLabel }]}>
                  {presetCountLabel(locale, tags.length)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
              </View>
              {/* §2.1: 件数と**色の点のプレビュー**。名前まで並べないのは、プリセットのカードと
                  違ってタグは数が増えやすく（上限なし。§1.2）、3 件だけ出すと
                  「その 3 件が特別」と読めるため。点だけなら全部を 1 行に収められる */}
              {tags.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedLabel }]}>
                  {tagCardEmptyLabel(locale)}
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
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>{tagSectionNote(locale)}</Text>
        </View>

        {/* UI-SPEC §1.6-4: データ群。書き出しは SPEC-V3 §5.7 で実装済み（活性） */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="folder-outline" size={15} color={colors.secondaryLabel} />
            <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
              {dataSectionTitle(locale)}
            </Text>
          </View>
          <View style={[styles.card, styles.rowCard, { backgroundColor: colors.secondaryBackground }]}>
            {/* SPEC-V3 §5.7 で活性化した（「準備中」が外れた）。押すとモーダルの
                書き出しシートが開く（presentation は設定タブの _layout.tsx が持つ） */}
            <Link href="/settings/export" asChild>
              <Pressable
                // asChild の子に渡す style は平坦化した 1 枚にする（「使いかた」行と同じ制約）
                style={StyleSheet.flatten([styles.row])}
                accessibilityRole="link">
                <RowIcon name="document-text-outline" colors={colors} />
                <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                  {csvExportLabel(locale)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
              </Pressable>
            </Link>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            {/* SPEC-V8 §5.1: バックアップと復元。**書き出し（CSV）とは別の行にする** ──
                あちらは期間を選んで表計算で読む形を出すもので、こちらは全件を戻すためのもの。
                1 つにまとめると「どちらを押せば機種変更で困らないか」が読めなくなる */}
            <Link href="/settings/backup" asChild>
              <Pressable
                // asChild の子に渡す style は平坦化した 1 枚にする（「使いかた」行と同じ制約）
                style={StyleSheet.flatten([styles.row])}
                accessibilityRole="link">
                <RowIcon name="cloud-upload-outline" colors={colors} />
                <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                  {backupLabel(locale)}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
              </Pressable>
            </Link>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <RowIcon name="albums-outline" colors={colors} />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {recordCountLabel(locale)}
              </Text>
              <Text style={[styles.rowValue, { color: colors.secondaryLabel }]}>
                {presetCountLabel(locale, recordCount.count)}
              </Text>
            </View>
          </View>
        </View>

        {/* 「レビューを書く」。サポート・プライバシーポリシーとは**別のカードにする** ──
            あちらは「困ったときに読むもの」で、こちらは書きに行くもの。同じカードに
            3 行目として並べると、下の注記（「どちらも端末のブラウザで開きます」）が
            開く先の違う行にも掛かってしまう（こちらはストアアプリが受け取りうる）。
            押しても OS のレビュー画面は出ない ── 出すのは自動の依頼だけで、
            その理由は src/review/storeUrl.ts の冒頭にある */}
        {REVIEW_URL != null && (
          <View style={styles.section}>
            <Pressable
              onPress={() => openExternal(REVIEW_URL)}
              style={StyleSheet.flatten([
                styles.linkRow,
                { backgroundColor: colors.secondaryBackground },
              ])}
              accessibilityRole="link">
              <RowIcon name="star-outline" colors={colors} />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {reviewLinkLabel(locale)}
              </Text>
              <Ionicons name="open-outline" size={18} color={colors.secondaryLabel} />
            </Pressable>
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              {reviewLinkNote(locale)}
            </Text>
          </View>
        )}

        {/* 外部のページ 2 行。**設定の一番下（データ群の下）に置く** ── どちらも
            「困ったときに読むもの」で、上の各群（表示言語・記録の既定値・データなど）を
            ひととおり終えたあとに見る導線でよいため。行の作りは「データ」群と同じ 2 行の
            カードだが、**右の印だけが違う**（`chevron-forward` ではなく `open-outline`）──
            押した先が画面の遷移ではなくアプリの外だ、と押す前に分かるようにする。
            アイコンは読み上げでは拾えないので、同じことを下の注記でも言う */}
        <View style={styles.section}>
          <View style={[styles.card, styles.rowCard, { backgroundColor: colors.secondaryBackground }]}>
            <Pressable
              onPress={() => openExternal(SUPPORT_URL)}
              style={styles.row}
              accessibilityRole="link">
              <RowIcon name="help-buoy-outline" colors={colors} />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {supportLinkLabel(locale)}
              </Text>
              <Ionicons name="open-outline" size={18} color={colors.secondaryLabel} />
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <Pressable
              onPress={() => openExternal(PRIVACY_URL)}
              style={styles.row}
              accessibilityRole="link">
              <RowIcon name="shield-checkmark-outline" colors={colors} />
              <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
                {privacyLinkLabel(locale)}
              </Text>
              <Ionicons name="open-outline" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </View>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {supportSectionNote(locale)}
          </Text>
        </View>

        {/* OSS ライセンス一覧。サポート・PP のすぐ下に置く（同じ「困ったとき／確認したいときに
            開く」群）。react-native-legal のネイティブ画面をそのまま開くだけで、独自の UI は
            持たない ── ライセンス全文を出す法的要件のための画面で、読ませる場所ではないため */}
        <View style={styles.section}>
          <Pressable
            onPress={() => ReactNativeLegal.launchLicenseListScreen(licenseLinkLabel(locale))}
            style={StyleSheet.flatten([
              styles.linkRow,
              { backgroundColor: colors.secondaryBackground },
            ])}
            accessibilityRole="button">
            <RowIcon name="document-outline" colors={colors} />
            <Text style={[styles.label, styles.labelFlex, { color: colors.label }]} numberOfLines={2}>
              {licenseLinkLabel(locale)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
          </Pressable>
        </View>

        {/* 開発ビルドだけに出る。production では DevSeedCard が null になり、
            require ごとバンドルから落ちる（宣言のコメント参照） */}
        {DevSeedCard != null && <DevSeedCard onChanged={refreshData} />}

        {/* UI-SPEC §1.6-5: フッタ。中央・上に余白 */}
        {APP_VERSION != null && (
          <Text style={[styles.version, { color: colors.secondaryLabel }]}>
            {versionLabel(locale, APP_VERSION)}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

/**
 * 各行の先頭アイコン（1.2.0.md「設定の各項目にアイコンをつける」）。
 *
 * 色は既存の右端アイコン（chevron-forward 等）と同じ secondaryLabel に揃え、彩色した
 * 丸背景などは付けない ── お知らせ画面のカード（色付き丸背景）とは違い、設定タブは
 * 元からテキスト主体の一覧型 UI で、行数ぶん色を並べると賑やかになりすぎるため。
 */
function RowIcon({
  name,
  colors,
}: {
  name: keyof typeof Ionicons.glyphMap;
  colors: ThemeColors;
}) {
  return <Ionicons name={name} size={20} color={colors.secondaryLabel} style={rowIconStyle} />;
}

const rowIconStyle = { width: 24 };

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
  },
  // 見出しの左にアイコンを置く群（1.2.0.md「設定の各項目にアイコンをつける」）。
  // アイコンを持たない見出し（marginLeft: 4 だった元の sectionTitle）はこの行に含めない
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    minHeight: 48,
    gap: 8,
  },
  rowValue: {
    fontSize: 15,
  },
  // Stepper 自体は高さを持たない（ボタンの実寸に沿うだけ）ので、他の行（48px）と
  // 高さを揃えるための箱。calc タブの手数料行（60px）と同じ考え方。
  // switchRow と必ず同じ値にする ── 同じカードの中で行ごとに高さが違って見える不具合が
  // 実機で出た（カード側にだけ paddingTop を足していたのが原因。行の側で高さを揃える形に直した）
  stepperRow: {
    height: 60,
    justifyContent: 'center',
  },
  // Switch（実測 31pt）は他の行の文字（16px）より背が高く、48px の行だと詰まって見える
  // （実際にそう見えると指摘があった）。stepperRow と同じ 60px に揃えて余白を持たせる
  switchRow: {
    height: 60,
  },
  // Switch は `row` の alignItems: 'center' が効かず、行の上端に張り付いていた
  // （実機の React Native Inspector で実測して確認 ── Switch の絶対 Y 座標が行の絶対 Y 座標と
  // 完全一致していた＝中央寄せされず上端基準になっていた）。alignSelf で個別に上書きする
  switchControl: {
    alignSelf: 'center',
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
    gap: 8,
  },
  label: {
    fontSize: 16,
  },
  // アイコン・チェブロンと並ぶラベル（1.2.0.md「設定の各項目にアイコンをつける」）。
  // 英語など長い語で潰れないよう、伸び縮みではなく 2 行までの折り返しに逃がす
  // （numberOfLines={2} と対で使う。失敗パターンの対処: 「詰めて省略」ではなく「2 行に許す」）
  labelFlex: {
    flex: 1,
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
