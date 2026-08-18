// 入力時の複数選択シート（SPEC-V3 §4.5 / 設計案 26c）。**電卓の中からだけ**開く。
//
// 単一選択（PresetPickerSheet）と分けてあるのは、確定の仕方が逆だから ──
// 単一選択は「選んだ時点で入れて閉じる」（§4.3）、こちらは選び終わってから
// まとめて積むので、下端に確定ボタンと選択中の数が要る。1 つの部品に mode を持たせると、
// ヘッダも末尾も分岐だらけになる。
//
// 梱包材の行にタグボタンを置かない（§4.5）ので、この入口は電卓の中の 1 か所だけ。
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PresetRow } from '@/components/PresetRow';
import { SheetModal } from '@/components/SheetModal';
import type { Preset } from '@/db/schema';
import { usePresetList } from '@/db/usePresets';
import { formatCalcTotal } from '@/logic/format';
import {
  calcPickerBackLabel,
  calcSubmitLabel,
  presetPickerAddLink,
  presetPickerEditLink,
  presetPickerEmptyTitle,
  presetEmptyBody,
  presetPickedCountLabel,
  presetPickerEmptyBodyWithoutLink,
  presetPickerTitle,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** この部品が扱うのは梱包材だけ（§4.5）。他の 2 種は単一選択で入る */
const TYPE = 'packaging';

type Props = {
  /** 「入れる」で呼ばれる。渡すのは**選んだ順のプリセット**で、行の組み立ては呼び出し側（§4.5） */
  onSubmit: (presets: Preset[]) => void;
  /** 設定タブへのリンクを出すか。記録フォームからは false（PresetPickerSheet と同じ理由） */
  canOpenSettings?: boolean;
  /** 「‹ 電卓」・幕のタップで閉じる。電卓はこの下に開いたまま残っている */
  onClose: () => void;
};

/** 開いている間だけマウントする前提（選択は閉じれば消える。電卓の積み上げと同じ扱い） */
export function PresetMultiPickerSheet({ onSubmit, canOpenSettings = true, onClose }: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const { presets } = usePresetList(TYPE);

  // 選んだ順を保つ（積まれる行の並びがタップした順になる）。id の配列で持つのは、
  // 一覧が引き直されても選択が保てるようにするため
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const picked = pickedIds
    .map((id) => presets.find((preset) => preset.id === id))
    .filter((preset): preset is Preset => preset != null);
  const total = picked.reduce((sum, preset) => sum + preset.value, 0);
  const blocked = picked.length === 0;

  const toggle = (preset: Preset) =>
    setPickedIds((current) =>
      current.includes(preset.id)
        ? current.filter((id) => id !== preset.id)
        : [...current, preset.id],
    );

  const openSettings = () => router.push(`/settings/presets/${TYPE}`);

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* ヘッダ。左「‹ 電卓」／中央「梱包材を選ぶ」／右は空（確定は下端の「入れる」） */}
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <Pressable
                onPress={close}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.5 : 1 }]}>
                <Ionicons name="chevron-back" size={20} color={colors.blue} />
                <Text style={[styles.headerButton, { color: colors.blue }]}>
                  {calcPickerBackLabel(locale)}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
              {presetPickerTitle(locale, TYPE)}
            </Text>
            {/* 左と同じ幅を取り、見出しを画面の中央から動かさない（PresetPickerSheet と同じ） */}
            <View style={styles.headerSide} />
          </View>

          <ScrollView bounces={false} contentContainerStyle={styles.listContent}>
            {presets.length === 0 ? (
              <EmptyState
                title={presetPickerEmptyTitle(locale)}
                body={
                  canOpenSettings
                    ? presetEmptyBody(locale, TYPE)
                    : presetPickerEmptyBodyWithoutLink(locale, TYPE)
                }
                actionLabel={canOpenSettings ? presetPickerAddLink(locale) : undefined}
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
                {presets.map((preset, index) => {
                  const checked = pickedIds.includes(preset.id);
                  return (
                    <View key={preset.id}>
                      {index > 0 && (
                        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                      )}
                      <Pressable
                        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.5 : 1 }]}
                        onPress={() => toggle(preset)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}>
                        <View style={styles.rowInner}>
                          {/* チェックボックスは行の左端（単一選択のチェックは右端）。
                              押すたびに入れ替わるものなので、目で追う先を 1 か所に固定する */}
                          <Ionicons
                            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={checked ? colors.blue : colors.separator}
                          />
                          <View style={styles.rowBody}>
                            <PresetRow preset={preset} />
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
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
                  {presetPickerEditLink(locale)}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* 下端の合計行 ＋「入れる」（§4.5-3）。電卓の合計行と同じ形にしてある ──
              同じ「今いくらぶん選んでいるか」を、シートが変わるたびに違う形で出さない */}
          {presets.length > 0 && (
            <View style={[styles.footer, { borderTopColor: colors.separator }]}>
              <View style={styles.footerText}>
                <Text style={[styles.pickedCount, { color: colors.secondaryLabel }]}>
                  {presetPickedCountLabel(locale, picked.length)}
                </Text>
                <Text style={[styles.total, { color: colors.label }]} numberOfLines={1}>
                  {formatCalcTotal(locale, total)}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (blocked) return;
                  onSubmit(picked);
                  close();
                }}
                disabled={blocked}
                accessibilityRole="button"
                accessibilityState={{ disabled: blocked }}
                style={({ pressed }) => [
                  styles.submit,
                  {
                    backgroundColor: blocked ? colors.disabledBackground : colors.blue,
                    opacity: pressed && !blocked ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.submitLabel, { color: blocked ? colors.gray : '#FFFFFF' }]}>
                  {calcSubmitLabel(locale)}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '80%',
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
    paddingHorizontal: 16,
  },
  headerSide: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    // アイコンと語の間は詰める（「‹ 電卓」で 1 つの押し所に見えるように）
    gap: 2,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  group: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    flexShrink: 1,
    gap: 2,
  },
  pickedCount: {
    fontSize: 13,
  },
  total: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  submit: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
});
