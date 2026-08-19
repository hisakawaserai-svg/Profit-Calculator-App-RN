import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { exportPreviewScreenTitle, exportSheetTitle } from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

// 設定タブの中の Stack。設定 → 使いかた のプッシュ遷移を持つ（UI-SPEC §2 / §5-9）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// **書き出し（CSV）だけはモーダル**（SPEC-V3 §5.7）── 押した後にすることが 1 つ（書き出す）で、
// 途中で他の設定へ寄り道する経路がない。閉じる口も「キャンセル」1 つに絞れる。
// presentation は Stack の側で持たせる（画面の中で切り替えられる指定ではない）。
// 全画面プレビュー（§5.9）は書き出しシートの上に **push** で積む（`presentation: 'card'`）──
// 指定しないとモーダルの上に開いた画面がモーダル扱いになり、ヘッダに戻る導線が出ない。
// push なら「‹ 書き出し（CSV）」が自動で付き、下端の「シートに戻る」と行き先が一致する。
//
// **screen を 1 つでも宣言したら、index を先頭に書く。** expo-router の
// getSortedChildren（useScreens.ts）は「宣言した screen → 残りのファイル」の順に並べ、
// React Navigation は**並びの先頭を初期ルートにする**。export を宣言しただけだと
// 設定タブの起点が export に移り、設定の一覧そのものが出ない ── 一覧が出ないので
// タグ・プリセット・使いかたへの入口ごと消える（実機で確認した症状）。
//
// **anchor だけでは直らない。** anchor（＝ node.initialRouteName）は
// sortRoutesWithInitial に渡るだけで、それが効くのは push される「残りのファイル」側だけ。
// 宣言した screen の並びには一切効かないので、先頭を取り戻すには index の宣言が要る。
// anchor は別の役目で残す ── ディープリンクやリロードで export へ直接入ったとき、
// 下に index を積んで戻る導線を作るのは anchor のほう（記録タブ・データタブと同じ）。
export const unstable_settings = {
  anchor: 'index',
};

export default function SettingsLayout() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <Stack>
      {/* 起点。options は渡さない ── 見出しは index.tsx 側の Stack.Screen に任せる */}
      <Stack.Screen name="index" />
      <Stack.Screen name="export" options={{ presentation: 'modal' }} />
      {/* 見出しもここで渡す ── レイアウト側で screen を宣言すると、画面の中の
          `<Stack.Screen options>` より先に効いてルート名（`export-preview`）が出てしまう */}
      <Stack.Screen
        name="export-preview"
        options={{
          /**
           * **iOS だけ `fullScreenModal`。**（Android は `card` のまま）
           *
           * この画面は `modal` の書き出しシートの上に開く。iOS の
           * react-native-screens は**モーダルとして presentation 中の画面の上に
           * `card` を push しても提示しない** ── ルートは state に入る（または入って
           * すぐ巻き戻る）のに画面が出ないので、押しても何も起きないように見える。
           * 実機で確認した症状で、`animation` の指定とは無関係だった。
           *
           * `fullScreenModal` はモーダルの上にモーダルを重ねる形なので iOS で成立する。
           * 見た目は `card` と同じ全画面のまま（下から出る動きになる）。
           *
           * **戻る導線は自前で置く**（下の headerLeft）── モーダルには
           * 「‹ 書き出し（CSV）」が自動で付かないため。下端の「シートに戻る」と
           * 行き先を揃える（どちらも `router.back()`）。
           */
          presentation: Platform.OS === 'ios' ? ('fullScreenModal' as const) : ('card' as const),
          ...(Platform.OS === 'ios'
            ? {
                headerLeft: () => (
                  <Pressable
                    onPress={() => router.back()}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={exportSheetTitle(locale)}
                    style={styles.headerBack}>
                    <Ionicons name="chevron-back" size={22} color={colors.blue} />
                    <Text style={[styles.headerBackLabel, { color: colors.blue }]}>
                      {exportSheetTitle(locale)}
                    </Text>
                  </Pressable>
                ),
              }
            : {}),
          // **Android では遷移を名指しする。** ここは `modal`（書き出しシート）の上に
          // `card` を積むが、react-native-screens はどちらも同じ全画面フラグメントとして
          // 出すので（`ScreenViewManager.setStackPresentation`）、iOS のような
          // 「下から迫り上がる／右から滑り込む」の差が付かない。そのうえ既定の遷移は
          // 10% ぶんの横滑り ＋ 83ms のフェード（`rns_default_enter_in`）しかなく、
          // **表の画面から表の画面へ進むこの経路では開いたことが読めない**
          // （実際の利用者から「押しても開いたと分からない」と報告された）。
          // iOS では既定のまま扱われる ── あちらは元から動きで差が付いている。
          animation: 'slide_from_right',
          title: exportPreviewScreenTitle(locale),
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  /** iOS の自動の戻るに寄せる（シェブロン ＋ 戻り先の名前） */
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    // シェブロンと文字の間は詰める（純正の戻るに合わせる）
    gap: 2,
    marginLeft: -6,
  },
  headerBackLabel: {
    fontSize: 17,
  },
});
