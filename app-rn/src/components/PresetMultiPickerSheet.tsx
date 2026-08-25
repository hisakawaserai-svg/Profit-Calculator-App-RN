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
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { EmptyState } from '@/components/EmptyState';
import { PresetQuickAddRow } from '@/components/PresetQuickAddRow';
import { PresetRow } from '@/components/PresetRow';
import { SheetModal } from '@/components/SheetModal';
import type { Preset } from '@/db/schema';
import { usePresetList } from '@/db/usePresets';
import { formatCalcTotal } from '@/logic/format';
import {
  calcContinueLabel,
  cancelLabel,
  calcSubmitLabel,
  presetPickerAddLink,
  presetPickerEditLink,
  presetPickerEmptyBody,
  presetPickerEmptyTitle,
  presetPickedCountLabel,
  presetPickerTitle,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

/** この部品が扱うのは梱包材だけ（§4.5）。他の 2 種は単一選択で入る */
const TYPE = 'packaging';

/**
 * 確定したあとどこへ行くか（案 c の追補）。**どちらも「選んだぶんを積む」ところまでは同じ**で、
 * 違うのは積んだ結果を見せる場所だけ:
 *
 * - `field`      … 欄へ合計を書いて閉じる（**既定の道**。個数を掛けないならここで終わり）
 * - `calculator` … 同じことをしたうえで、続けて電卓を開く（`× 2` を打つための道。決定 §8-11）
 *
 * 行き先を 2 つの callback に分けないのは、**やることが同じで最後の 1 手だけが違う**ため ──
 * 分けると「積む処理」が 2 か所に書かれる。送料の 2 択（45b の `ShippingMaterialChoice`）と同じ形。
 */
export type PackagingPickDestination = 'field' | 'calculator';

type Props = {
  /**
   * **開いたときにチェックが付いている id**（案 c）。呼び出し側が「いま欄に入っているもの」を渡す
   * （NumericField の presetRowIds）。
   *
   * 空で開くと、選び直しのつもりの人が同じものをもう一度選ぶことになり、
   * 確定した瞬間に二重に積まれる ── **この初期値と、確定が置き換えであること
   * （pickPresetsResult）は対で成り立っている。**片方だけでは選び直しにならない。
   */
  pickedIds: readonly string[];
  /**
   * 「入れる」「電卓で続ける」のどちらかで呼ばれる。渡すのは**選んだ順のプリセット**で、
   * 行の組み立ては呼び出し側（§4.5）。`destination` は上の 2 つ（案 c の追補）。
   */
  onSubmit: (presets: Preset[], destination: PackagingPickDestination) => void;
  /** 設定タブへのリンクを出すか。記録フォームからは false（PresetPickerSheet と同じ理由） */
  canOpenSettings?: boolean;
  /** 「‹ 電卓」・幕のタップで閉じる。電卓はこの下に開いたまま残っている */
  onClose: () => void;
};

/** 開いている間だけマウントする前提（選択は閉じれば消える。電卓の積み上げと同じ扱い） */
export function PresetMultiPickerSheet({
  pickedIds: initialPickedIds,
  onSubmit,
  canOpenSettings = true,
  onClose,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  // refresh はシートの中で登録されたときに引き直すため（下の PresetQuickAddRow）
  const { presets, refresh } = usePresetList(TYPE);

  // 選んだ順を保つ（積まれる行の並びがタップした順になる）。id の配列で持つのは、
  // 一覧が引き直されても選択が保てるようにするため。
  // **初期値は「いま欄に入っているもの」**（案 c）── 開いている間だけマウントされるので、
  // 開くたびに呼び出し側の今の状態から入り直す
  const [pickedIds, setPickedIds] = useState<string[]>(() => [...initialPickedIds]);

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
        // 登録欄を触ると鍵盤がシートの下半分を覆う（TagPickerSheet と同じ理由で
        // 画面いっぱいに広げて下端合わせにする）
        // **KeyboardAvoidingView は react-native-keyboard-controller のもの**（RN 標準ではない）。
        // 標準版は Android では何もできず（edgeToEdge でウィンドウが縮まないため behavior を
        // 渡しても重なり量が 0 と出る）、iOS でも自分の位置を親からの相対で測るのでモーダルの
        // 中では足りない。ライブラリ版は両 OS とも鍵盤の高さを直接受け取る
        <KeyboardAvoidingView
          style={styles.avoider}
          pointerEvents="box-none"
          behavior="padding">
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* ヘッダ。左「キャンセル」／中央「梱包材を選ぶ」／右は空（確定は下端の「入れる」）。
                **「‹ 電卓」ではない**（案 c）── 入口が金額行の「🏷」に移り、閉じたときの戻り先が
                電卓ではなくなった。単一選択のシート（右上「閉じる」）とも作法が揃う */}
            <View style={styles.header}>
              <View style={styles.headerSide}>
                <Pressable
                  onPress={close}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                  <Text style={[styles.headerButton, { color: colors.blue }]}>
                    {cancelLabel(locale)}
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
                {presetPickerTitle(locale, TYPE)}
              </Text>
              {/* 左と同じ幅を取り、見出しを画面の中央から動かさない（PresetPickerSheet と同じ） */}
              <View style={styles.headerSide} />
            </View>

            {/* その場で登録（§4.3 の拡張）。**金額は空から始める** ── 単一選択のシートと違って
                この入口には「今の欄の値」に当たるものが無い（電卓の積み上げの合計は、
                これから登録する 1 つの梱包材の値段ではない）ので、prefill すると別の額が入る。

                登録しても**シートは閉じない** ── ここは選び終えてから「入れる」でまとめて積む
                場所（§4.5）で、単一選択のような「選んだ瞬間に確定」ではないため。
                代わりに作った行をその場で選択に足す */}
            <View style={styles.quickAdd}>
              <PresetQuickAddRow
                type={TYPE}
                initialValue={null}
                presets={presets}
                onCreated={(preset) => {
                  refresh();
                  setPickedIds((current) => [...current, preset.id]);
                }}
              />
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled">
              {presets.length === 0 ? (
                <EmptyState
                  title={presetPickerEmptyTitle(locale)}
                  body={presetPickerEmptyBody(locale)}
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
                {/* 決定（「入れる」）と、その続き（「電卓で続ける」）。**縦に並べる。**
                    横に並べないのは、右端に 2 つ置くと日本語では収まっても英語
                    （"Continue in calculator"）で合計額（22px 太字）と押し合うため ──
                    合計が省略記号で切れると、選んだ額が読めなくなる。
                    縦なら語の長さに関わらず崩れず、**決定のすぐ隣**という関係も保てる。

                    主従は形で示す（塗り ＞ リンク）:
                    - 「入れる」   … 青の塗りボタン。**決定はこれ 1 つ**
                    - 「電卓で続ける」… 青リンク ＋ 電卓アイコン。決定を**やり直す**のではなく、
                      積んだものに `× 2` を足しに行く続きの道（決定 §8-11）。
                    塗りを 2 つ並べると同格に見え、どちらが決定なのか読めなくなる */}
                <View style={styles.footerActions}>
                  <Pressable
                    onPress={() => {
                      if (blocked) return;
                      onSubmit(picked, 'calculator');
                      close();
                    }}
                    disabled={blocked}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: blocked }}
                    style={({ pressed }) => [
                      styles.continueLink,
                      { opacity: pressed && !blocked ? 0.5 : 1 },
                    ]}>
                    {/* 行の右端の電卓ボタン（NumericField）と同じ印。この先が電卓だと形で分かる */}
                    <Ionicons
                      name="calculator-outline"
                      size={16}
                      color={blocked ? colors.gray : colors.blue}
                    />
                    <Text
                      style={[styles.continueLabel, { color: blocked ? colors.gray : colors.blue }]}
                      numberOfLines={1}>
                      {calcContinueLabel(locale)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (blocked) return;
                      onSubmit(picked, 'field');
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
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // シートの左右の余白は行ごとに持つ（listContent と同じ 16pt）
  quickAdd: {
    paddingHorizontal: 16,
  },
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
  // 決定とその続きの 2 つ。右端で縦に積む（上がリンク・下が塗りボタン）
  footerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  continueLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueLabel: {
    fontSize: 14,
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
