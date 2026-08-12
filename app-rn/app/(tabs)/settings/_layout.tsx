import { Stack } from 'expo-router';

import { EXPORT_PREVIEW_SCREEN_TITLE } from '@/logic/labels';

// 設定タブの中の Stack。設定 → 使いかた のプッシュ遷移を持つ（UI-SPEC §2 / §5-9）。
// タブ側のヘッダーは (tabs)/_layout.tsx で切ってあるので、ヘッダーはこの Stack が出す。
//
// **書き出し（CSV）だけはモーダル**（SPEC-V3 §5.7）── 押した後にすることが 1 つ（書き出す）で、
// 途中で他の設定へ寄り道する経路がない。閉じる口も「キャンセル」1 つに絞れる。
// presentation は Stack の側で持たせる（画面の中で切り替えられる指定ではない）。
// 全画面プレビュー（§5.9）は書き出しシートの上に **push** で積む（`presentation: 'card'`）──
// 指定しないとモーダルの上に開いた画面がモーダル扱いになり、ヘッダに戻る導線が出ない。
// push なら「‹ 書き出し（CSV）」が自動で付き、下端の「シートに戻る」と行き先が一致する。
export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="export" options={{ presentation: 'modal' }} />
      {/* 見出しもここで渡す ── レイアウト側で screen を宣言すると、画面の中の
          `<Stack.Screen options>` より先に効いてルート名（`export-preview`）が出てしまう */}
      <Stack.Screen
        name="export-preview"
        options={{ presentation: 'card', title: EXPORT_PREVIEW_SCREEN_TITLE }}
      />
    </Stack>
  );
}
