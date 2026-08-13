// 各画面の「？」から出す使いかたのシート（UI-SPEC §5-9 / 採用案 `20c`）。
//
// **なぜシートなのか。** 記録タブ・データタブは設定タブとは別のスタックなので、
// タブをまたぐ push は素直に書けない（§5-9）。`SheetModal` は RN の `Modal` なので
// ルートを 1 本も足さずにどの画面からでも出せる ── 4 画面ぶんのルートを作らずに済む。
//
// 中身は設定タブから push で開くものと**同じ `HelpScreen`**。違うのは 3 点だけ（案 `20c`）:
//   - 見出しがその場に合った語になる（記録フォームなら「記録の書きかた」）
//   - 困りそうな項目が先頭に持ち上がる
//   - 下端に「使いかたを最初から読む ›」が出る
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HELP_ENTRIES, type HelpEntryId } from '@/logic/helpContent';
import { CLOSE_LABEL } from '@/logic/labels';
import { HelpScreen } from '@/screens/HelpScreen';
import { useThemeColors } from '@/theme';

import { SheetModal } from './SheetModal';

type Props = {
  /** どの画面の「？」か。見出しと先頭に出す項目が決まる */
  entry: HelpEntryId;
  onClose: () => void;
  /** 「最初から読む」を押したとき。省略時はその行を出さない */
  onReadAll?: () => void;
};

export function HelpSheet({ entry, onClose, onReadAll }: Props) {
  const colors = useThemeColors();
  const { page, leadItemId, sheetTitle } = HELP_ENTRIES[entry];

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* 見出し行。左は空・中央に見出し・右に「閉じる」（案 `20c`）。
              見出しは行いっぱいの絶対配置で画面の中央に置く ── 行の中に並べると
              右の「閉じる」のぶんだけ左に寄る（RecordFormSheet と同じ作り） */}
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <View style={styles.headerTitleSlot} pointerEvents="none">
              <Text style={[styles.headerTitle, { color: colors.label }]} numberOfLines={1}>
                {sheetTitle}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: colors.blue }]}>{CLOSE_LABEL}</Text>
            </Pressable>
          </View>

          <HelpScreen
            initialPage={page}
            leadItemId={leadItemId}
            showPageTitle={false}
            onReadAll={
              onReadAll == null
                ? undefined
                : // 先にシートを下ろしてから全体を開く（重なったまま遷移させない）
                  () => {
                    close();
                    onReadAll();
                  }
            }
          />
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // 画面いっぱいにはしない。下から出た一時的な面であることを残す
    height: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    flex: 1,
  },
  headerButton: {
    fontSize: 16,
  },
});
