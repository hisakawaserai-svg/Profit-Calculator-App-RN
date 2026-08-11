// 入力時の単一選択シート（SPEC-V3 §4.3 / 設計案 26b）。販売サイト・送料の行から開く。
//
// チップの横並びではなくシートにしたのは §4.1 の決定 ── チップ列は行ごとに 1 段増え、
// 伝票カード（最大 11 行）では縦に伸びすぎる。
//
// この部品が持たない判断:
// - **確定ボタンを置かない。** 選んだ時点で欄に入れて閉じる（期間シートと同じ。UI-SPEC §1.2）
// - **上書きの確認を挟まない。** 欄に値が入っていても黙って置き換える（§4.3）
// - 値の正規化はしない。書き戻しは呼び出し側が電卓と同じ経路
//   （NumericField の onSubmit → sanitizeNumericInput）へ通す（§4.3）
//
// 複数選択（梱包材。§4.5）は電卓の中に置くので、この部品には入れていない（Step 4）。
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PresetRow } from '@/components/PresetRow';
import { SheetModal } from '@/components/SheetModal';
import type { Preset, PresetType } from '@/db/schema';
import {
  CLOSE_LABEL,
  PRESET_PICKER_ADD_LINK,
  PRESET_PICKER_EDIT_LINK,
  PRESET_PICKER_EMPTY_TITLE,
  presetEmptyBody,
  presetPickerEmptyBodyWithoutLink,
  presetPickerTitle,
} from '@/logic/labels';
import { findPresetByValue } from '@/logic/preset';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  type: PresetType;
  presets: Preset[];
  /** 今の欄の値。一致する行にチェックを付ける（§4.3-2）。空欄は null */
  value: number | null;
  /** 選んだ時点で呼ばれる。シートはこのあと自分で閉じる */
  onSelect: (preset: Preset) => void;
  /**
   * 設定タブへのリンク（§4.3-3）を出すか（既定 true）。
   *
   * **記録フォームからは false。** フォームは RN の `Modal` で、`router.push` した設定画面は
   * その裏に積まれる ── 押しても画面が変わらないので、リンクが壊れていると読まれる。
   * 0 件のときも同じで、「設定で追加する ▸」の代わりに行き先を文で言う（§4.3 の空表示）。
   */
  canOpenSettings?: boolean;
  onClose: () => void;
};

export function PresetPickerSheet({
  visible,
  type,
  presets,
  value,
  onSelect,
  canOpenSettings = true,
  onClose,
}: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const checked = findPresetByValue(presets, value);

  // 末尾のリンクの行き先は設定タブの一覧（§4.3-3）。0 件のときは「追加する」に語だけ変わる
  const openSettings = () => router.push(`/settings/presets/${type}`);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* ヘッダは中央に見出し・右に「閉じる」（設計案 26b）。左は空のまま同じ幅を取り、
              見出しが画面の中央から動かないようにする */}
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
              {presetPickerTitle(type)}
            </Text>
            <View style={[styles.headerSide, styles.headerSideEnd]}>
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.headerButton, { color: colors.blue }]}>{CLOSE_LABEL}</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView bounces={false}>
            {presets.length === 0 ? (
              // 登録が 0 件でもボタン自体は出す（§4.1）ので、ここへ来る経路は普通にある
              <EmptyState
                title={PRESET_PICKER_EMPTY_TITLE}
                body={canOpenSettings ? presetEmptyBody(type) : presetPickerEmptyBodyWithoutLink(type)}
                actionLabel={canOpenSettings ? PRESET_PICKER_ADD_LINK : undefined}
                onPressAction={
                  canOpenSettings
                    ? () => {
                        close();
                        openSettings();
                      }
                    : undefined
                }
              />
            ) : (
              <View style={[styles.group, { backgroundColor: colors.secondaryBackground }]}>
                {presets.map((preset, index) => (
                  <View key={preset.id}>
                    {index > 0 && (
                      <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                    )}
                    <Pressable
                      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}
                      onPress={() => {
                        onSelect(preset);
                        close();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: preset.id === checked?.id }}>
                      <PresetRow
                        preset={preset}
                        accessory={
                          preset.id === checked?.id ? (
                            <Ionicons name="checkmark" size={18} color={colors.blue} />
                          ) : (
                            // チェックの有無で名前・値の位置がずれないよう、同じ幅を空けておく
                            <View style={styles.checkPlaceholder} />
                          )
                        }
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {presets.length > 0 && canOpenSettings && (
              <Pressable
                style={({ pressed }) => [styles.editLink, { opacity: pressed ? 0.5 : 1 }]}
                onPress={() => {
                  close();
                  openSettings();
                }}
                accessibilityRole="button">
                <Text style={[styles.editLinkLabel, { color: colors.blue }]}>
                  {PRESET_PICKER_EDIT_LINK}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '70%',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSide: {
    flex: 1,
  },
  headerSideEnd: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  group: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
  },
  checkPlaceholder: {
    width: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  editLink: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  editLinkLabel: {
    fontSize: 15,
  },
});
