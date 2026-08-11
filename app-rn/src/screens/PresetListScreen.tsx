// プリセットの一覧（SPEC-V3 §3.2 / 設計案 25a）。3 種を **1 画面**で賄う。
// 入口は設定タブのカード（PresetSummaryCard）で、type はルートパラメータから来る。
//
// 設計案 25a と実装で 2 点だけ違う。どちらも仕様書の決定を優先した:
//
// - **並べ替えハンドルは出さない。** §3.4 が「並び順は sortOrder の昇順で固定。
//   手動並べ替えは実装しない」と決めているため。ハンドルだけ置いて動かないのが最悪なので、
//   編集モードに出るのは削除ボタンだけにした。
// - **使用回数は出さない。** 記録がプリセットの id を持たない設計（§1.5）で、
//   名前の写しがあるのは販売サイトだけ（§1.5.1）── 送料・梱包材は数えようがない。
//   3 種のうち 1 種だけ数字が出ると「他の 2 種は 0 回」と読めてしまうので、どこにも出さない。
//   数えられる販売サイトの件数は、消える直前の確認（§設計案 25c）だけで使う。
//
// 削除は §3.2 の方針どおり **UndoBar で取り消せる**（確認は 25c の条件を満たすときだけ）。
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PresetRow } from '@/components/PresetRow';
import { UndoBar } from '@/components/UndoBar';
import type { Preset, PresetType } from '@/db/schema';
import {
  countPresetUsage,
  removePreset,
  restorePreset,
  usePresetList,
} from '@/db/usePresets';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  PRESET_EDIT_MODE_DONE_LABEL,
  PRESET_EDIT_MODE_LABEL,
  PRESET_EMPTY_TITLE,
  presetAddLabel,
  presetDeleteConfirmMessage,
  presetDeletedMessage,
  presetEmptyBody,
  presetListNote,
  presetTypeLabel,
  UNDO_LABEL,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  type: PresetType;
};

export function PresetListScreen({ type }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const { presets, refresh } = usePresetList(type);
  const [editing, setEditing] = useState(false);
  /** 削除した行そのもの。UndoBar が出ている間だけ持ち、取り消しでそのまま書き戻す（§3.2） */
  const [deleted, setDeleted] = useState<Preset | null>(null);

  const openForm = useCallback(
    (preset: Preset | null) => {
      router.push({
        pathname: '/settings/presets/edit',
        params: preset == null ? { type } : { type, id: preset.id },
      });
    },
    [router, type],
  );

  const deleteNow = useCallback(
    (preset: Preset) => {
      removePreset(preset.id);
      setDeleted(preset);
      refresh();
    },
    [refresh],
  );

  /**
   * 削除（設計案 25c）。**使った記録の件数が分かって 1 件以上のときだけ確認する。**
   * countPresetUsage が null を返す種類（送料・梱包材。数えられない）は確認を挟まない ──
   * 消えるのは今後の入力候補だけで記録は残るうえ、取り消しは UndoBar で効くため。
   */
  const requestDelete = useCallback(
    (preset: Preset) => {
      const usage = countPresetUsage(preset);
      if (usage == null || usage === 0) {
        deleteNow(preset);
        return;
      }

      Alert.alert(DELETE_CONFIRM_TITLE, presetDeleteConfirmMessage(type, usage), [
        { text: CANCEL_LABEL, style: 'cancel' },
        { text: DELETE_LABEL, style: 'destructive', onPress: () => deleteNow(preset) },
      ]);
    },
    [deleteNow, type],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: presetTypeLabel(type),
          // 1 件も無いうちは編集するものが無いので出さない
          headerRight: () =>
            presets.length === 0 ? null : (
              <Pressable
                onPress={() => setEditing((current) => !current)}
                hitSlop={8}
                accessibilityRole="button">
                <Text style={[styles.headerButton, { color: colors.blue }]}>
                  {editing ? PRESET_EDIT_MODE_DONE_LABEL : PRESET_EDIT_MODE_LABEL}
                </Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        {presets.length === 0 ? (
          <EmptyState
            title={PRESET_EMPTY_TITLE}
            body={presetEmptyBody(type)}
            actionLabel={presetAddLabel(type)}
            onPressAction={() => openForm(null)}
          />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            {presets.map((preset, index) => (
              <View key={preset.id}>
                {index > 0 && (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                )}
                <View style={styles.rowLine}>
                  {editing && (
                    <Pressable
                      onPress={() => requestDelete(preset)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${preset.name}を${DELETE_LABEL}`}
                      style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}>
                      <Ionicons name="remove-circle" size={22} color={colors.red} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => openForm(preset)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rowPressable, { opacity: pressed ? 0.5 : 1 }]}>
                    <PresetRow
                      preset={preset}
                      accessory={
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={colors.secondaryLabel}
                        />
                      }
                    />
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            {/* §3.2-3: カード末尾の「＋ 追加」。記録フォームの「＋ 梱包材・その他」と同じ見た目 */}
            <Pressable
              onPress={() => openForm(null)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.5 : 1 }]}>
              <Text style={[styles.addLabel, { color: colors.blue }]}>
                {presetAddLabel(type)}
              </Text>
            </Pressable>
          </View>
        )}

        {/* §3.5: 種類ごとの注記 1 行 */}
        <Text style={[styles.note, { color: colors.secondaryLabel }]}>{presetListNote(type)}</Text>
      </ScrollView>

      {deleted != null && (
        <UndoBar
          message={presetDeletedMessage(type)}
          actionLabel={UNDO_LABEL}
          onAction={() => {
            restorePreset(deleted);
            setDeleted(null);
            refresh();
          }}
          onHide={() => setDeleted(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  card: {
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowPressable: {
    flex: 1,
  },
  deleteButton: {
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  addRow: {
    height: 48,
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 16,
  },
  headerButton: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
});
