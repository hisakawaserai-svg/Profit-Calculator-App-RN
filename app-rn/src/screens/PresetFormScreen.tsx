// プリセットの追加・編集（SPEC-V3 §3.3 / 設計案 25b）。追加と編集で**同じ画面**を使い、
// 違うのは見出しと初期値、それに下端の「削除」と注記の有無だけ。
//
// §3.3 は下から出るシート（SheetModal）で書いていたが、設計案 25b は一覧からの push にした。
// 一覧じたいが設定タブからの push で、そこからさらにシートを重ねると、
// 「戻る」と「キャンセル」が同じ画面に 2 つ並ぶため。キャンセルはヘッダの戻るが担う。
//
// - **保存を押すまで書き込まない**（§3.3。記録フォームと同じ。UI-SPEC §8.6）
// - 保存ボタンの活性は validatePreset（§1.4）が決め、無効の理由は値の欄の下に 1 行出す（§3.3）
// - 表示語はすべて labels.ts 経由（画面で文字列を組み立てない）
import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ColorSwatchGrid } from '@/components/ColorSwatchGrid';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { KeyboardSaveBar } from '@/components/KeyboardSaveBar';
import { NumericField } from '@/components/NumericField';
import { PackBuyFields, packBuyCardStyle } from '@/components/PackBuyFields';
import { PresetBadgeInput } from '@/components/PresetBadge';
import { PresetRow } from '@/components/PresetRow';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import type { Preset, PresetType } from '@/db/schema';
import {
  countPresetUsage,
  createPreset,
  removePreset,
  updatePreset,
  usePresetList,
} from '@/db/usePresets';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_TITLE,
  DELETE_LABEL,
  presetTypeLabel,
  PRESET_INITIAL_EDITING_HINT,
  PRESET_INITIAL_FIELD_LABEL,
  PRESET_INITIAL_HINT,
  PRESET_CALC_METHOD_LABEL,
  PRESET_CALC_METHOD_OPTIONS,
  PRESET_NAME_FIELD_LABEL,
  PRESET_PRICE_MODE_LABEL,
  PRESET_PRICE_MODE_OPTIONS,
  presetBlockedNote,
  presetDeleteConfirmMessage,
  presetDeleteLabel,
  presetEditValueNote,
  presetFormTitle,
  presetValueFieldLabel,
  SAVE_LABEL,
  SHIPPING_MATERIAL_FIELD_LABEL,
  SHIPPING_MATERIAL_LABEL,
  SHIPPING_TOTAL_LABEL,
  SHIPPING_TOTAL_NOTE,
} from '@/logic/labels';
import { formatYen } from '@/logic/format';
import {
  clampPresetInitial,
  DEFAULT_PRESET_CALC_METHOD,
  isPackBuy,
  packBuyTarget,
  presetCalcMethod,
  presetColorValue,
  presetDraftAreaUnitPrice,
  presetDraftUnitPrice,
  presetDraftUsePrice,
  PRESET_CALC_METHODS,
  validatePreset,
  type PresetCalcMethod,
} from '@/logic/preset';
import { shippingPresetTotal } from '@/logic/shippingMaterial';
import { useThemeColors } from '@/theme';

type Props = {
  type: PresetType;
  /** 編集する行。追加のときは null */
  preset: Preset | null;
};

export function PresetFormScreen({ type, preset }: Props) {
  const colors = useThemeColors();
  const router = useRouter();
  const isNew = preset == null;

  /**
   * 同じ種類の他のプリセット。**色を 2 群に分けるためだけに引く**（設計案 50c）。
   *
   * **種類ごとに数える**（`usePresetList` は type で絞っている）── 送料で赤が使われていても、
   * 梱包材の編集画面では赤はまだ使っていない色。3 種は別々の一覧として選ばれるので、
   * 色が重なって困るのも同じ種類の中だけ。
   *
   * 自分自身は外す ── 編集で開いた行の色は「使用中」ではなく、上の群の先頭に残す（`ownColor`）。
   */
  const { presets } = usePresetList(type);
  const usedBy = presets
    .filter((other) => other.id !== preset?.id)
    .map((other) => ({ colorKey: other.colorKey, name: other.name }));

  const [name, setName] = useState(preset?.name ?? '');
  // 数値は文字列で持つ（NumericField / validatePreset がどちらも文字列で扱う）。
  // 0 を「0」と出すのは、既定値 0 のプリセットを開いたときに欄が空に見えないようにするため
  const [value, setValue] = useState(preset == null ? '' : String(preset.value));
  const [initial, setInitial] = useState(preset?.initial ?? '');
  /** バッジにカーソルが立っているか（設計案 49c。下の 1 行の文言だけが変わる） */
  const [editingInitial, setEditingInitial] = useState(false);
  /** ヘッダの「？」（UI-SPEC §5-9）。バッジをタップで直せること（49c）を開いた状態で出す */
  const [showHelp, setShowHelp] = useState(false);
  // 「金額の入れ方」（§2.6.2）。列は持たず、開くときは materials（入数・購入サイズ）から復元する（§2.6.4）
  const [packBuy, setPackBuy] = useState(preset != null && isPackBuy(preset));
  /**
   * 単価の計算方式（SPEC-V10 §1.1）。**こちらは列がある**（材料の列だけでは
   * 「個数から」と「使用回数から」を見分けられないため）。既存の行は 'individual' で開く。
   */
  const [calcMethod, setCalcMethod] = useState<PresetCalcMethod>(() =>
    preset == null ? DEFAULT_PRESET_CALC_METHOD : presetCalcMethod(preset),
  );
  // 空 = 未入力。0 を「0」と出さないのは、入数の 0 が「1 個ずつ」の意味を兼ねているため
  const [packQuantity, setPackQuantity] = useState(
    preset != null && isPackBuy(preset) ? sizeToInput(preset.packQuantity) : '',
  );
  const [packPrice, setPackPrice] = useState(
    preset != null && isPackBuy(preset) ? String(preset.packPrice) : '',
  );
  // 面積方式の 4 つ（SPEC-V10 §1.2）。0 = 未設定なので空欄で開く（入数と同じ扱い）
  const [packHeight, setPackHeight] = useState(() => sizeToInput(preset?.packHeight));
  const [packWidth, setPackWidth] = useState(() => sizeToInput(preset?.packWidth));
  const [useHeight, setUseHeight] = useState(() => sizeToInput(preset?.useHeight));
  const [useWidth, setUseWidth] = useState(() => sizeToInput(preset?.useWidth));
  /**
   * バッジの色（SPEC-V7 §2.1）。**保存値は hex**（固定色も自由色も同じ形）。
   * 旧形式の色キーが残っていても resolvePresetTone が読めるが、state は hex に寄せる
   */
  const [color, setColor] = useState<string>(() => presetColorValue(preset?.colorKey ?? ''));
  /**
   * 専用資材の代金（SPEC-V6 §2）。**送料でしか出さない欄。**
   *
   * 0 円は**空欄で出す**（金額欄と違って「0」と書かない）── 資材費のない配送方法の方が
   * 多く、0 が入っていると打ち始めたときに「070」になる。空欄 = 0 円は検証の側と揃っている。
   * まとめ買いで登録された行でも空から始める（値は入数・購入価格の側が持つ）。
   */
  const [materialCost, setMaterialCost] = useState(
    preset != null && preset.type === 'shipping' && !isPackBuy(preset) && preset.materialCost > 0
      ? String(preset.materialCost)
      : '',
  );

  const draft = {
    type,
    name,
    initial,
    value,
    packBuy,
    calcMethod,
    packQuantity,
    packPrice,
    packHeight,
    packWidth,
    useHeight,
    useWidth,
    materialCost,
  };
  const validation = validatePreset(draft);
  /**
   * 入力に追従する計算結果（§2.6.2 / SPEC-V10 §1.3）。材料が揃わないあいだは null ＝「—」。
   *
   * - `usePrice`      … 帯に出る「1 個（1 回）あたり」
   * - `areaUnitPrice` … 面積方式の 1 枚目の帯（¥/㎡）
   * - `unitPrice`     … **登録額**（面積方式で平均使用サイズが未入力なら ¥/㎡）
   */
  const usePrice = presetDraftUsePrice(draft);
  const areaUnitPrice = presetDraftAreaUnitPrice(draft);
  const unitPrice = presetDraftUnitPrice(draft);

  /**
   * 2 択の切り替え（§2.6.2）。**「1 個ずつ」に戻すときだけ金額欄を書き換える** ──
   * そのときの 1 個あたりが金額欄に残る（値は変わらない。§2.6.6）。
   * 入数・購入価格は保存時に 0 に戻る（決定 §2.6.8-3）ので、ここでは消さない
   * （押し間違えて戻ってきたときに打ち直しにならないようにする）。
   */
  const changePriceMode = useCallback(
    (index: number) => {
      const next = index === 1;
      // 単価が入る先は種類で違う（梱包材 = 金額欄 / 送料 = 専用資材の欄。§2.6.2 / SPEC-V6 §2）
      if (!next && unitPrice != null) {
        if (packBuyTarget(type) === 'value') setValue(String(unitPrice));
        else setMaterialCost(String(unitPrice));
      }
      setPackBuy(next);
    },
    [type, unitPrice],
  );

  /**
   * 計算方式の 3 択（SPEC-V10 §1.1）。**打った値は消さない** ── 2 択の切り替え（§2.6.8-3）と
   * 同じ考え方で、押し間違えて戻ってきたときに打ち直しにならないようにする。
   * 方式ごとに使わない列は保存時に 0 へ落ちる（validatePreset）ので、行には残らない。
   */
  const changeCalcMethod = useCallback((index: number) => {
    setCalcMethod(PRESET_CALC_METHODS[index] ?? DEFAULT_PRESET_CALC_METHOD);
  }, []);

  /** 梱包材のまとめ買い（＝単価を計算して登録する状態。§2.6.2 / SPEC-V10 §1.1） */
  const isPackagingPackBuy = packBuy && packBuyTarget(type) === 'value';

  // プレビュー（§3.3-2）は入力に追従する。不正な値でも「今の指定」をそのまま映す ──
  // 保存できない理由は下の 1 行が言うので、プレビューまで止めると何を直したのか分からなくなる
  const previewValue = Number.parseFloat(value);
  const preview = {
    type,
    name,
    initial,
    colorKey: color,
    // まとめ買いのときは 1 個あたりを映す（保存されるのもこの値。§2.6.4）。
    // 送料はまとめ買いでも金額欄が送料そのものなので、単価に差し替えない（SPEC-V6 §2）
    value: isPackagingPackBuy
      ? (unitPrice ?? 0)
      : Number.isNaN(previewValue)
        ? 0
        : previewValue,
    // 資材費のある送料プリセットは、行にも「＋専用資材」の 1 行が出る（SPEC-V6 §1）
    materialCost: validation.valid ? validation.materialCost : 0,
    // 計算方式の控え（SPEC-V10 §1.5）。行に「1㎡あたり」などの 1 行が出るかどうかが、
    // 保存する前に一覧と同じ形で見える。1 個ずつのときは既定（＝ 1 行を出さない）に倒す
    ...(isPackagingPackBuy
      ? {
          calcMethod,
          packQuantity: inputToNumber(packQuantity),
          packHeight: inputToNumber(packHeight),
          packWidth: inputToNumber(packWidth),
          useHeight: inputToNumber(useHeight),
          useWidth: inputToNumber(useWidth),
        }
      : { packQuantity: 0 }),
  };

  const save = useCallback(() => {
    if (!validation.valid) return;
    const input = {
      type,
      name: validation.name,
      colorKey: color,
      initial: validation.initial,
      value: validation.value,
      packQuantity: validation.packQuantity,
      packPrice: validation.packPrice,
      materialCost: validation.materialCost,
      // 計算方式の列（SPEC-V10 §1.2）。既存方式では validation に入っていない ──
      // 省略された列を既定へ倒すのは repository の責務（db/presets.ts の calcColumns）
      calcMethod: validation.calcMethod,
      packHeight: validation.packHeight,
      packWidth: validation.packWidth,
      useHeight: validation.useHeight,
      useWidth: validation.useWidth,
    };
    if (preset == null) createPreset(input);
    else updatePreset(preset.id, input);
    // 一覧は useFocusEffect で引き直すので、ここでは戻るだけでよい
    router.back();
  }, [color, preset, router, type, validation]);

  /** まとめ買いの欄を出すか（§2.6.2 / SPEC-V6 §2。2 択を出すのは梱包材と送料） */
  const isPackBuyMode = packBuyTarget(type) != null && packBuy;
  /** 送料だけが持つ「送料 ＋ 専用資材 = 合計」の内訳（SPEC-V6 §2） */
  const isShipping = type === 'shipping';
  const shippingTotal = shippingPresetTotal({
    value: Number.isNaN(previewValue) ? 0 : previewValue,
    materialCost: packBuy
      ? (unitPrice ?? 0)
      : (() => {
          const parsed = Number.parseFloat(materialCost);
          return Number.isNaN(parsed) ? 0 : parsed;
        })(),
  });

  /**
   * 値の欄の下の 1 行。**同時に 2 行出さない**（設計案 28c への指摘）──
   * 直すべきことがあるときは、それだけを読ませる。
   * 保存が無効な理由（§3.3）は赤、そうでなければ編集のときの注記（§1.5 の帰結）。
   */
  const note = !validation.valid ? (
    <Text style={[styles.blockedNote, { color: colors.red }]} accessibilityRole="alert">
      {/* 方式まで渡すのは、割る数の欄の名前が方式で変わるため（SPEC-V10 §1.4） */}
      {presetBlockedNote(validation.reason, type, calcMethod)}
    </Text>
  ) : !isNew ? (
    <Text style={[styles.note, { color: colors.secondaryLabel }]}>{presetEditValueNote(type)}</Text>
  ) : null;

  /** 下端の削除（設計案 25b）。確認の条件は一覧の削除（25c）と同じ */
  const requestDelete = useCallback(() => {
    if (preset == null) return;
    const remove = () => {
      removePreset(preset.id);
      router.back();
    };

    const usage = countPresetUsage(preset);
    if (usage == null || usage === 0) {
      remove();
      return;
    }
    Alert.alert(DELETE_CONFIRM_TITLE, presetDeleteConfirmMessage(type, usage), [
      { text: CANCEL_LABEL, style: 'cancel' },
      { text: DELETE_LABEL, style: 'destructive', onPress: remove },
    ]);
  }, [preset, router, type]);

  return (
    <>
      {/* 保存は画面下端に移した（設計案 49c）ので、ヘッダに**操作の口は**足さない ──
          同じ操作の口を上下 2 か所に出さない。
          右上に置くのは「？」だけ（UI-SPEC §5-9）── 読み物への入口は操作ではないので、
          下端の保存と役割がぶつからない */}
      <Stack.Screen
        options={{
          title: presetFormTitle(type, isNew),
          headerRight: () => <HelpButton onPress={() => setShowHelp(true)} />,
        }}
      />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // 鍵盤が出たぶんだけ中身を上へ逃がす（iOS）。KeyboardAvoidingView をやめたのは、
          // 下端の保存ボタンが器の中にあると、器ごと押し上げられて帯が浮いてしまうため
          automaticallyAdjustKeyboardInsets>
          {/* §3.3-2 / 設計案 49c: プレビューの帯。**バッジそのものが入力欄**で、
              専用の「バッジの文字」カードは廃した ── 文字と色が同じ場所で決まる。
              下に続く 1 行（PresetRow）は選択シートに出るのと同じ形で、
              打った文字がその大きさでどう出るかを同じカードの中で見せる */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <View style={styles.badgeRow}>
              <PresetBadgeInput
                preset={{ name, initial, colorKey: color }}
                onChangeText={setInitial}
                onFocus={() => setEditingInitial(true)}
                // 切るのは**欄を離れたときだけ**（§1.2）。打っている最中は数えない
                onBlur={() => {
                  setEditingInitial(false);
                  setInitial(clampPresetInitial);
                }}
              />
              <View style={styles.badgeCaption}>
                <Text style={[styles.badgeLabel, { color: colors.label }]}>
                  {PRESET_INITIAL_FIELD_LABEL}
                </Text>
                <Text style={[styles.note, { color: colors.secondaryLabel }]}>
                  {editingInitial ? PRESET_INITIAL_EDITING_HINT : PRESET_INITIAL_HINT}
                </Text>
              </View>
            </View>
            <View style={[styles.previewSeparator, { backgroundColor: colors.separator }]} />
            <PresetRow preset={preview} namePlaceholder={PRESET_NAME_FIELD_LABEL} />
          </View>

          <View style={[styles.card, styles.fieldCard, { backgroundColor: colors.secondaryBackground }]}>
            <TextField
              label={PRESET_NAME_FIELD_LABEL}
              value={name}
              onChangeValue={setName}
            />
            {/* §2.6.2 / SPEC-V6 §2: 2 択は対象の欄の**上**。下に置くと、欄の形が変わる原因が
                欄の後ろに来る。出すのは梱包材（1 個あたりが登録額）と送料（専用資材の代金）で、
                販売サイトには出さない ── 率（%）に個数の単位がないため。
                **送料では 2 択が資材費のカードの中に入る**（送料そのものは常に「1 回いくら」） */}
            {packBuyTarget(type) === 'value' && (
              <View style={styles.modeRow}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
                  {PRESET_PRICE_MODE_LABEL}
                </Text>
                <SegmentedControl
                  options={PRESET_PRICE_MODE_OPTIONS}
                  selectedIndex={packBuy ? 1 : 0}
                  onChange={changePriceMode}
                />
              </View>
            )}
            {/* 送料の金額欄は常に出す（まとめ買いは資材費の側の話なので、送料の欄は消えない） */}
            {(isShipping || !isPackBuyMode) && (
              <>
                {/* 電卓は残す（「1000 ÷ 30」の単価計算に使う。§3.3）が、その中の
                    「梱包材から選ぶ」は出さない ── プリセットからプリセットを選ぶ経路は作らない（§4.2）。
                    梱包材を登録する画面で既存の梱包材を呼べると、「封筒」を登録するのに「封筒」を選べてしまう。
                    canPickPackaging は既定 false なので、ここでは渡さないことがそのまま「出さない」になる */}
                <NumericField
                  label={presetValueFieldLabel(type)}
                  value={value}
                  onChangeValue={setValue}
                />
                {!isShipping && note}
              </>
            )}
          </View>

          {/* 専用資材の代金（SPEC-V6 §2）。**送料だけの別カード** ── 送料そのものとは
              別の支払いなので、同じカードに 2 つの金額を並べない。
              資材を使わない配送方法では 0 円のまま置いておける（空欄 = 0 円） */}
          {isShipping && (
            <View
              style={[
                styles.card,
                isPackBuyMode && packBuyCardStyle,
                { backgroundColor: colors.secondaryBackground },
              ]}>
              <View style={[styles.modeRow, isPackBuyMode && styles.modeRowInset]}>
                <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
                  {SHIPPING_MATERIAL_LABEL}
                </Text>
                <SegmentedControl
                  options={PRESET_PRICE_MODE_OPTIONS}
                  selectedIndex={packBuy ? 1 : 0}
                  onChange={changePriceMode}
                />
              </View>
              {isPackBuyMode ? (
                <PackBuyFields
                  packQuantity={packQuantity}
                  packPrice={packPrice}
                  onChangePackQuantity={setPackQuantity}
                  onChangePackPrice={setPackPrice}
                  // 送料は常に既存方式（3 択を出さないので usePrice と登録額は同じ値）
                  unitPrice={usePrice}
                />
              ) : (
                <NumericField
                  label={SHIPPING_MATERIAL_FIELD_LABEL}
                  value={materialCost}
                  onChangeValue={setMaterialCost}
                />
              )}
            </View>
          )}

          {/* 内訳（SPEC-V6 §2）。**送料と資材費を足した額が記録に入る**ので、
              打ち込んだ 2 つの数字と、その結果を 1 枚に並べて見せる ──
              合計だけを出すと「何と何を足した額なのか」が画面から読めない */}
          {isShipping && (
            <>
              <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.label }]}>
                    {presetValueFieldLabel(type)}
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.label }]}>
                    {formatYen(Number.isNaN(previewValue) ? 0 : previewValue)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.label }]}>
                    {SHIPPING_MATERIAL_LABEL}
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.label }]}>
                    {formatYen(shippingTotal - (Number.isNaN(previewValue) ? 0 : previewValue))}
                  </Text>
                </View>
                <View style={[styles.breakdownSeparator, { backgroundColor: colors.separator }]} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownTotalLabel, { color: colors.label }]}>
                    {SHIPPING_TOTAL_LABEL}
                  </Text>
                  <Text style={[styles.breakdownTotalValue, { color: colors.blue }]}>
                    {formatYen(shippingTotal)}
                  </Text>
                </View>
                <Text style={[styles.note, { color: colors.secondaryLabel }]}>
                  {SHIPPING_TOTAL_NOTE}
                </Text>
              </View>
              {note}
            </>
          )}

          {/* まとめ買いの欄は**別のカード**にする（設計案 28c）── 2 択で欄の形が変わったことが、
              カードが 1 枚増えることで見て取れる。名前と同じカードに続けると、どこから先が
              「金額の入れ方」で変わった部分なのか読めない。
              送料では資材費のカードの中に入る（上の分岐）ので、ここは梱包材だけ。
              **計算方式の 3 択（SPEC-V10 §1.1）もこのカードの中**で、方式で入れ替わるのは
              下に続く欄だけ ── カードが増えたり減ったりはしない */}
          {isPackagingPackBuy && (
            <>
              <View
                style={[
                  styles.card,
                  packBuyCardStyle,
                  { backgroundColor: colors.secondaryBackground },
                ]}>
                {/* 計算方式の 3 択（SPEC-V10 §1.1）。**まとめ買いのカードの中の先頭**に置く ──
                    この 3 択が変えるのは下に続く欄だけなので、「金額の入れ方」の 2 択と違って
                    カードをまたがない。2 択（何で登録するか）→ 3 択（何で割るか）の順に読める */}
                <View style={[styles.modeRow, styles.modeRowInset]}>
                  <Text style={[styles.fieldLabel, { color: colors.secondaryLabel }]}>
                    {PRESET_CALC_METHOD_LABEL}
                  </Text>
                  <SegmentedControl
                    options={PRESET_CALC_METHOD_OPTIONS}
                    selectedIndex={PRESET_CALC_METHODS.indexOf(calcMethod)}
                    onChange={changeCalcMethod}
                  />
                </View>
                <PackBuyFields
                  method={calcMethod}
                  packQuantity={packQuantity}
                  packPrice={packPrice}
                  onChangePackQuantity={setPackQuantity}
                  onChangePackPrice={setPackPrice}
                  packHeight={packHeight}
                  packWidth={packWidth}
                  onChangePackHeight={setPackHeight}
                  onChangePackWidth={setPackWidth}
                  useHeight={useHeight}
                  useWidth={useWidth}
                  onChangeUseHeight={setUseHeight}
                  onChangeUseWidth={setUseWidth}
                  unitPrice={usePrice}
                  areaUnitPrice={areaUnitPrice}
                />
              </View>
              {note}
            </>
          )}

          {/* SPEC-V7 §3 / 設計案 50c: 色を「まだ使っていない色」と「使用中」の 2 群に分ける。
              見出しは部品の側が持つので、ここでカードのラベルを重ねない
              （「バッジの色」と「まだ使っていない色」が 2 段になる） */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <ColorSwatchGrid
              value={color}
              onChange={setColor}
              usedBy={usedBy}
              // 保存値を渡す（いま選んでいる色ではない）── 使用中の色を押した瞬間に
              // その色が上の群へ移ってしまわないように
              ownColor={preset?.colorKey}
              entityLabel={presetTypeLabel(type)}
            />
          </View>

          {!isNew && (
            <Pressable
              onPress={requestDelete}
              accessibilityRole="button"
              style={({ pressed }) =>
                StyleSheet.flatten([
                  styles.card,
                  styles.deleteRow,
                  { backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.6 : 1 },
                ])
              }>
              <Text style={[styles.deleteLabel, { color: colors.red }]}>
                {presetDeleteLabel(type)}
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* 設計案 49c: 保存は画面下端（タブバーの直上）。鍵盤が出ている間はその上に貼り付く */}
        <KeyboardSaveBar label={SAVE_LABEL} onPress={save} enabled={validation.valid} />
      </View>

      {/* この画面は設定タブの中なので、「最初から読む」で使いかた全体へ push できる */}
      {showHelp && (
        <HelpSheet
          entry="presetForm"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
    </>
  );
}

/**
 * 保存値を欄の文字列にする（SPEC-V10 §1.2）。**0 は空欄**で開く ──
 * 入数と同じ扱いで、0 は「未設定」を兼ねているので「0」と書くと打ち始めが「030」になる。
 * 末尾の `.0` も出さない（保存は real なので 30 が 30 のまま出る）。
 */
function sizeToInput(size: number | undefined): string {
  if (size == null || size <= 0) return '';
  return String(Number(size.toFixed(1)));
}

/** 欄の文字列を数値に戻す（プレビュー用。空・"." は 0） */
function inputToNumber(text: string): number {
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    // 下端の保存の帯（約 74pt）に最後のカードが潜らないだけの余白
    paddingBottom: 24,
    gap: 16,
  },
  // プレビュー帯の 1 段目（設計案 49c）。大きなバッジ ＋ その説明
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  badgeCaption: {
    flexShrink: 1,
    gap: 2,
  },
  badgeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  // 帯（打つところ）と、実物と同じ形の 1 行を仕切る
  previewSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  // 入力行（NumericField）は自前で行高を持つので、上下の余白を詰める
  fieldCard: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
  },
  // 2 択（§2.6.2）。行の左右の余白は NumericField の行に合わせる
  modeRow: {
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  // まとめ買いの 3 行のカード。左右の余白は行ごとに持たせる（1 個あたりの帯を端まで敷くため）
  // 余白 0 のカード（PackBuyFields）の中に 2 択の行を置くときだけ、行の側で余白を持つ
  modeRowInset: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  // 内訳（SPEC-V6 §2）。レコード詳細のレシート（RecordDetailSections）と同じ組み方 ──
  // 同じ「引き算・足し算の結果を読む面」なので、行の形を画面ごとに変えない
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakdownLabel: {
    flexShrink: 1,
    fontSize: 15,
  },
  breakdownValue: {
    fontSize: 17,
  },
  breakdownSeparator: {
    height: 1.5,
    marginVertical: 2,
  },
  breakdownTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  breakdownTotalValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  blockedNote: {
    fontSize: 12,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
  deleteRow: {
    alignItems: 'center',
  },
  deleteLabel: {
    fontSize: 16,
  },
});
