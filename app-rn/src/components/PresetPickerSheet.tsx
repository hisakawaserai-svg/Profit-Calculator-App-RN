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
//
// **資材費のある送料プリセットの行だけ、名前の下に 2 択が出る**（採用案 45b。SPEC-V6 §2）──
// 「送料のみ / ＋資材 100円」。どちらを押しても、その場で**選択と資材の有無が同時に決まる**
// （1 タップ）。行そのものを押したときは「＋資材」── 資材費を登録してあるプリセットは、
// その資材を使う前提で登録されているため。
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PresetQuickAddRow } from '@/components/PresetQuickAddRow';
import { PresetRow } from '@/components/PresetRow';
import { SheetModal } from '@/components/SheetModal';
import type { Preset, PresetType } from '@/db/schema';
import { SegmentedControl } from '@/components/SegmentedControl';
import { formatUnitYen } from '@/logic/format';
import {
  closeLabel,
  shippingOnlyLabel,
  withShippingMaterialLabel,
  presetPickerAddLink,
  presetPickerEditLink,
  presetPickerEmptyBody,
  presetPickerEmptyTitle,
  presetPickerTitle,
} from '@/logic/labels';
import { findPresetByValue } from '@/logic/preset';
import {
  hasShippingMaterial,
  shippingAmountFor,
  shippingMaterialChoiceOf,
  type ShippingMaterialChoice,
} from '@/logic/shippingMaterial';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  type: PresetType;
  presets: Preset[];
  /**
   * 今の欄の値。一致する行にチェックを付ける（§4.3-2）。空欄は null。
   * 送料では**どちらの側（送料のみ / ＋資材）が効いているか**もこの値から決まる（45b）──
   * 保存済みの記録を開き直したときの復元もこれで足りる（postage は選んだ側の額そのもの）。
   */
  value: number | null;
  /**
   * 選んだ時点で呼ばれる。シートはこのあと自分で閉じる。
   * `choice` は 45b の 2 択（送料以外・資材費 0 円の行では常に `'with-material'`）。
   */
  onSelect: (preset: Preset, choice: ShippingMaterialChoice) => void;
  /**
   * 設定タブへのリンク（§4.3-3）を出すか（既定 true）。
   *
   * **記録フォームからは false。** フォームは RN の `Modal` で、`router.push` した設定画面は
   * その裏に積まれる ── 押しても画面が変わらないので、リンクが壊れていると読まれる。
   *
   * **0 件のときの空表示はこれで変わらない**（§4.3 の空表示。以前は行き先を文で言っていた）──
   * どこから開いても上端に登録の口があるので、案内する先はそちらで足りる。
   */
  canOpenSettings?: boolean;
  /**
   * 上端の「その場で登録」（PresetQuickAddRow）で登録できたとき。
   *
   * **一覧を持っているのは呼び出し側**（PresetTagButton の usePresetList）なので、
   * 引き直しはあちらの責務 ── ここで作った行をそのまま渡し、選択済みにするところまでを任せる。
   * 単一選択のこのシートは、登録できたら**その場で閉じる**（選んだときと同じ振る舞い。§4.3）。
   */
  onCreated: (preset: Preset) => void;
  onClose: () => void;
};

export function PresetPickerSheet({
  visible,
  type,
  presets,
  value,
  onSelect,
  canOpenSettings = true,
  onCreated,
  onClose,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const checked = findPresetByValue(presets, value);

  // 末尾のリンクの行き先は設定タブの一覧（§4.3-3）。0 件のときは「追加する」に語だけ変わる
  const openSettings = () => router.push(`/settings/presets/${type}`);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        // 上端の登録欄を触ると鍵盤がシートの下半分を覆う。画面いっぱいに広げて下端合わせに
        // するのは TagPickerSheet と同じ理由（maxHeight の % は親の高さに対して解決される）
        <KeyboardAvoidingView
          style={styles.avoider}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {/* ヘッダは中央に見出し・右に「閉じる」（設計案 26b）。左は空のまま同じ幅を取り、
                見出しが画面の中央から動かないようにする */}
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
                {presetPickerTitle(locale, type)}
              </Text>
              <View style={[styles.headerSide, styles.headerSideEnd]}>
                <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.headerButton, { color: colors.blue }]}>{closeLabel(locale)}</Text>
                </Pressable>
              </View>
            </View>

            {/* その場で登録（§4.3 の拡張）。**一覧より上**に置く ── 記録の途中で開いた人は
                「登録したい」で来ているので、探して届かなかった一覧の下に口を置くと、
                一覧を最後まで見てから戻ることになる。0 件のときは空表示がここを指す */}
            <PresetQuickAddRow
              type={type}
              initialValue={value}
              presets={presets}
              onCreated={(preset) => {
                onCreated(preset);
                close();
              }}
            />

            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {presets.length === 0 ? (
                // 登録が 0 件でもボタン自体は出す（§4.1）ので、ここへ来る経路は普通にある
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
                    const isChecked = preset.id === checked?.id;
                    // 効いている側（45b）。選ばれていない行では null ＝ どちらも持ち上げない
                    const choice = isChecked ? shippingMaterialChoiceOf(preset, value) : null;
                    // 資材費のある送料プリセットだけ 2 択を出す（§2）。他は行の形を変えない
                    const withSegment = hasShippingMaterial(preset);
                    const select = (next: ShippingMaterialChoice) => {
                      onSelect(preset, next);
                      close();
                    };

                    return (
                      <View key={preset.id}>
                        {index > 0 && (
                          <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                        )}
                        <Pressable
                          style={({ pressed }) => [
                            styles.row,
                            withSegment && styles.segmentRow,
                            // 選択中の行は薄い青の下地（45b）。✓ だけより、どの行が効いているかが
                            // 行の塊として読める ── 2 択の行では ✓ が名前と離れて見えるため
                            isChecked && { backgroundColor: colors.highlightBackground },
                            { opacity: pressed ? 0.5 : 1 },
                          ]}
                          // 行そのものを押したら「＋資材」で確定する（45b の既定）
                          onPress={() => select('with-material')}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isChecked }}>
                          <PresetRow
                            preset={{
                              ...preset,
                              // 右端の額は**選んだ側の額**（45b）。まだ選ばれていない行は
                              // **既定の側（＋資材）**で描く ── 行を押すと入るのがその額だから。
                              // 送料だけの額を出しておくと、450 円と読んで押した結果 550 円が
                              // 欄に入る（shippingAmountFor が「押す前に見えていた数字と
                              // あとで欄に入る数字を食い違わせない」ためのものなので、その逆になる）
                              value: shippingAmountFor(preset, choice ?? 'with-material'),
                              // 副題（「＋専用資材 …」）は 2 択が言うので出さない（45b）
                              materialCost: 0,
                            }}
                            accessory={
                              isChecked ? (
                                <Ionicons name="checkmark" size={18} color={colors.blue} />
                              ) : (
                                // チェックの有無で名前・値の位置がずれないよう、同じ幅を空けておく
                                <View style={styles.checkPlaceholder} />
                              )
                            }
                            belowName={
                              withSegment ? (
                                <SegmentedControl
                                  options={[
                                    shippingOnlyLabel(locale),
                                    withShippingMaterialLabel(
                                      locale,
                                      formatUnitYen(locale, preset.materialCost),
                                    ),
                                  ]}
                                  selectedIndex={
                                    choice == null ? null : choice === 'shipping-only' ? 0 : 1
                                  }
                                  onChange={(next) =>
                                    select(next === 0 ? 'shipping-only' : 'with-material')
                                  }
                                  containerStyle={styles.segment}
                                  // 見た目は 34pt のまま、親指で押せる高さ（46pt）にする
                                  hitSlopVertical={6}
                                />
                              ) : undefined
                            }
                          />
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
  // 2 択を抱える行は 96pt（45b）。1 行ぶんだけ伸ばし、他の行の高さは変えない
  segmentRow: {
    justifyContent: 'center',
    minHeight: 96,
  },
  // 45b の指定どおり 高さ 34pt・幅 212pt。当たり判定は hitSlop で 46pt ぶん取る
  segment: {
    width: 212,
    height: 34,
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
