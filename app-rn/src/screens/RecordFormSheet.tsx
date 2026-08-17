// 記録フォーム（UI-SPEC §1.3 / 採用案 3c）。RecordFormView.swift の後継。
// 一覧の「＋ 記録」・レコード詳細の「編集する」・計算タブの「この内容で記録する」から開く。
//
// 3c のねらいは「伝票（レシート）1 枚」。販売価格から各経費を縦に引いていき、
// 下の行ほど結果に近づく。欄を種類ごとにセクション分けする形（旧構成）をやめ、
// 金額はすべて 1 枚のカードに積む。保存前でも「引き算の結果」がその場で読める。
//
// - 状態（売れた記録 / 出品中）は伝票カードの見出し行で切り替える（§1.3「挙動」）。
//   上端に 2 択ボタンを置かないのは、金額の流れの前に無関係な操作が挟まるため。
//   切り替えると日付カードの中で売れた日の行がその場で開く／閉じ、開いた行には数秒だけ
//   薄い青の下地が付く（§8.7）。**確認ダイアログと undo バーは出さない**（§8.6 派生決定）──
//   フォームは「保存」を押すまで何も書き込まないので、取り消す対象がまだない。
// - 写真の欄は商品名の**上**（SPEC-V5 §3.1）。金額の積み上げの中には入れない。
//   **選んだ瞬間にファイルが増え、DB の列に載るのは「保存」を押した瞬間**（SPEC-V5 §1.5）。
//   その間にできる「どこからも指されないファイル」は、このフォームが閉じるときに自分で片づける。
// - 種別セレクタは商品名の直下・金額の積み上げの直前（§6-6）。仕入価格行と同じカードなので、
//   切替で行が消えるのがその場で見える（SPEC-V2 §1.5 の目視要件）。
// - タグは伝票カードの中の 1 行をやめ、**伝票の直後の独立したカード**にした
//   （SPEC-V4 §3.1 の改訂）。金額でないものを金額の面に置かないのと、チップが
//   折り返しても伝票の形が変わらないようにするため。
// - 日付とメモは折りたたむ。畳んだままでも中身が分かるよう、見出しに日付・入力有無を出す。
// - 表示語はすべて labels.ts 経由（SPEC-V2 §5.3。画面で文字列を組み立てない）。
//
// 保存まわりは従来どおり:
// - 決定 §7-7:「保存時にのみレコードを作成する」。開いた時点では DB に一切書き込まない。
//   計算タブから渡された入力値も、メモリ上の初期値として持つだけ。
// - §5.3: 一時レコードの insert をやめたので、キャンセルは閉じるだけ（削除処理は不要）。
// - §5.2: 必須は商品名のみ。保存ボタン押下時に空なら赤枠＋警告を商品名欄だけに出し、
//   シートは閉じない（DB 書き込みもしない）。
// - 保存時の saleDate 正規化（isSold=false → null）は repository の責務なのでここでは行わない。
// - 値の組み立て・変換・バリデーションは src/logic/recordForm.ts の純粋関数に寄せている。
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CollapsibleSection } from '@/components/CollapsibleSection';
import { DateField } from '@/components/DateField';
import { NumericField } from '@/components/NumericField';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { PhotoField } from '@/components/PhotoField';
import { PresetTagButton } from '@/components/PresetTagButton';
import { RecordKindSelector } from '@/components/RecordKindSelector';
import { SiteNameRow } from '@/components/SiteNameRow';
import { StepperButtons } from '@/components/Stepper';
import { TagChip } from '@/components/TagChip';
import { TagPickerSheet } from '@/components/TagPickerSheet';
import { TRANSIENT_FEEDBACK_MS } from '@/components/UndoBar';
import { showAchievementToast } from '@/components/achievementToastBus';
import type { Preset, SaleRecord, Tag } from '@/db/schema';
import {
  selectShippingPreset,
  type ShippingMaterialChoice,
} from '@/logic/shippingMaterial';
import { saveRecord } from '@/db/useRecords';
import { useRecordTagIds, useTagList } from '@/db/useTags';
import { formatRecordDate, formatYen } from '@/logic/format';
import {
  CANCEL_LABEL,
  EDIT_RECORD_TITLE,
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  ENVELOPE_COST_LABEL,
  ITEM_NAME_CAPTION,
  ITEM_NAME_LABEL,
  ITEM_NAME_PLACEHOLDER,
  LISTED_DATE_FIELD_LABEL,
  LISTED_DATE_PICKER_NOTE,
  LISTING_STATUS_LABEL,
  MEMO_LABEL,
  NEW_RECORD_TITLE,
  OTHERS_COST_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  SALES_PRICE_LABEL,
  SAVE_LABEL,
  SOLD_DATE_FIELD_LABEL,
  SOLD_RECORDS_LABEL,
  TAG_ADD_LABEL,
  TAG_FIELD_EMPTY_LABEL,
  TAG_LABEL,
  TAG_PICKER_OPEN_LABEL,
  TARGET_PROFIT_UNSET_LABEL,
  UNSET_INPUT_LABEL,
  additionLabel,
  targetProfitLabel,
  targetProfitSummary,
  commissionFieldLabel,
  dateSectionLabel,
  deductionLabel,
  memoSectionLabel,
  profitLabel,
  soldDateNotes,
  switchStatusLabel,
  todayDateLabel,
} from '@/logic/labels';
import { daysBetween } from '@/logic/listingDays';
import { orphanPhotoFiles } from '@/logic/photo';
import { commissionCost, netProfit } from '@/logic/profit';
import { initialSaleDate, saleDateRange } from '@/logic/saleDate';
import { selectedTags } from '@/logic/tag';
import {
  ITEM_NAME_REQUIRED_MESSAGE,
  MAX_COMMISSION,
  MIN_COMMISSION,
  canSave,
  changeKind,
  newFormValues,
  parseTargetProfitInput,
  recordToFormValues,
  toCostInput,
  toSaveInput,
  type InitialAmounts,
  type RecordFormValues,
} from '@/logic/recordForm';
import { photoStore } from '@/media/expoPhotoFiles';
import { getDefaultRecordKind } from '@/settings';
import { useThemeColors, type ThemeColors } from '@/theme';

/** 伝票カードの行高（UI-SPEC §1.1-5 の 60px より詰める。1 枚に全部の金額が載るようにするため） */
const RECEIPT_ROW_HEIGHT = 48;

type Props = {
  visible: boolean;
  /** 編集対象のレコード。省略 / null なら新規追加 */
  record?: SaleRecord | null;
  /** 新規追加時の初期値。計算タブの＋から入力中の金額を引き継ぐ（SPEC §3.2 prepareNewRecord 相当） */
  initialAmounts?: InitialAmounts;
  /** キャンセル・保存後に閉じる */
  onClose: () => void;
  /** 保存が成立したときだけ呼ばれる。呼び出し側でリストを再取得する */
  onSaved?: () => void;
};

export function RecordFormSheet({ visible, record, initialAmounts, onClose, onSaved }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      // Swift 版の .sheet と同じ見た目（iOS のハーフシート風）。Android では無視される
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      {/* 開いている間だけマウントして、入力欄を初期値で初期化する（Swift 版 onAppear の loadInitialData 相当） */}
      {visible && (
        <RecordForm
          record={record ?? null}
          initialAmounts={initialAmounts}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function RecordForm({
  record,
  initialAmounts,
  onClose,
  onSaved,
}: {
  record: SaleRecord | null;
  initialAmounts?: InitialAmounts;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const colors = useThemeColors();

  // タグの一覧（SPEC-V4 §3.1）。チップを描くのに名前と色が要るので、id だけでは足りない。
  // 選択シートで作られた新しいタグを拾うため、シートには refresh を渡す
  const { tags, refresh: refreshTags } = useTagList();
  // 編集のときだけ、いま付いているタグが初期値になる（新規は空。§3.1）
  const { tagIds: savedTagIds } = useRecordTagIds(record?.id);

  // 新規の種別は設定の既定値。ただし計算タブから開いたときは initialAmounts.kind が優先される
  // （SPEC-V2 §1.4）。開いている間だけマウントされるので、ここで一度読めばよい
  const [values, setValues] = useState<RecordFormValues>(() =>
    record == null
      ? newFormValues(getDefaultRecordKind(), initialAmounts)
      : recordToFormValues(record, undefined, savedTagIds),
  );
  /**
   * このフォームを開いている間に**新しく書かれた写真ファイル**（SPEC-V5 §1.5）。
   *
   * 実体はカメラロールから選んだ瞬間に置かれるが、DB の列に載るのは保存の瞬間なので、
   * 選び直し・取り消しのたびにどこからも指されないファイルが残る。閉じるときに
   * 「最後まで残った 1 枚」以外をここから消す（判定は logic/photo.orphanPhotoFiles）。
   *
   * state ではなく ref にしてあるのは、片づけが描画に関係しないため
   * （増えても減っても画面に出るものは変わらない）。
   */
  const createdPhotos = useRef<string[]>([]);
  /** タグ選択シート（§3.2）。開いている間だけマウントする */
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  /** ヘッダの「？」（案 `20c`）。開いている間だけマウントする */
  const [showHelp, setShowHelp] = useState(false);
  /** 保存ボタンを押したか。押すまでは警告を出さない（SPEC §5.2 の isPushedSave） */
  const [isPushedSave, setIsPushedSave] = useState(false);
  /** 「今日」はマウント時に 1 回だけ決める（日付欄の「今日（…）」の基準） */
  const [today] = useState(() => new Date());

  const [costsOpen, setCostsOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  /**
   * 目標利益の節（SPEC-V9 §2）。**開いた状態から始めない** ── 目標は任意で、
   * 決めない記録の方が多い。畳んであっても見出しの右に「決めていません」か金額が出る
   */
  const [targetOpen, setTargetOpen] = useState(false);
  /** 状態を切り替えた直後だけ売れた日の行に薄い青の下地を敷く（UI-SPEC §8.3 / §8.7） */
  const [highlightSoldDate, setHighlightSoldDate] = useState(false);

  /**
   * 閉じ方を問わない片づけ（SPEC-V5 §1.5）。シートを下へ払って閉じたときは
   * 「キャンセル」を通らないので、**アンマウントを最後の関所**にしておく。
   *
   * 保存・キャンセルの経路は自分で片づけて `createdPhotos` を空にしてから閉じるので、
   * ここが実際に消すのはその 2 つを通らなかったときだけ。
   */
  useEffect(
    () => () => {
      for (const fileName of orphanPhotoFiles(createdPhotos.current, null)) {
        photoStore.remove(fileName);
      }
      createdPhotos.current = [];
    },
    [],
  );

  // 表示時間は詳細画面の undo バーと同じ 1 つの定数（§8.3）
  useEffect(() => {
    if (!highlightSoldDate) return;
    const timer = setTimeout(() => setHighlightSoldDate(false), TRANSIENT_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [highlightSoldDate]);

  // SPEC §3.2: editingRecord の itemName が空なら「新規追加」、それ以外は「編集」
  const title = record == null || record.itemName === '' ? NEW_RECORD_TITLE : EDIT_RECORD_TITLE;

  const update = <K extends keyof RecordFormValues>(key: K, value: RecordFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  // 種別だけは他の欄と連動する（仕入品 → 不用品 で仕入価格をクリア。SPEC-V2 §1.5）
  const updateKind = (kind: RecordFormValues['kind']) => {
    setValues((current) => changeKind(current, kind));
  };

  /**
   * 販売サイトのプリセットを選んだとき（SPEC-V3 §4.3 / §1.5.1）。
   * **率と名前を同時に入れる**。名前は「そのとき何と書いてあったか」の写しで、
   * このあと手で率を変えても消えない（消せるのは下の行の「✕」だけ）。
   */
  const selectSite = (preset: Preset) => {
    setValues((current) => ({ ...current, commission: preset.value, siteName: preset.name }));
  };

  /**
   * 見出し行のリンクによる状態の切り替え（UI-SPEC §8.7）。
   *
   * 売れた記録にすると日付カードを開いて売れた日の行をその場で出し、初期値は今日
   * （出品日が未来なら出品日。§8.5）。出品中に戻すと行は消える ── 値は保持せず、
   * 次に売れた記録にしたときはまた今日から始まる。保存時の null 化は repository の責務。
   */
  const toggleStatus = () => {
    const toSold = !values.isSold;
    setValues((current) => ({
      ...current,
      isSold: toSold,
      saleDate: toSold ? initialSaleDate(current.saleStartDate, today) : current.saleDate,
    }));
    if (toSold) setDatesOpen(true);
    setHighlightSoldDate(toSold);
  };

  /**
   * 送料プリセットを選んだとき（採用案 45b）。**シートで選んだ側がそのまま入る**
   * （既定は「＋資材」）。資材費の控えも一緒に置き換える ── 選び直したときに
   * 前のプリセットの控えが残っていると、記録が別の資材費を覚えたままになる。
   */
  const selectShipping = (preset: Preset, choice: ShippingMaterialChoice) => {
    setValues((current) => ({ ...current, ...selectShippingPreset(preset, choice) }));
  };

  /**
   * 写真が決まったとき（SPEC-V5 §3.1）。**選んだ時点で実体は既に置かれている**ので、
   * 名前を控えて片づけの対象に加える。削除（null）ではファイルを消さない ──
   * 保存を押すまでは元の写真に戻せなければならない。
   */
  const changePhoto = (fileName: string | null) => {
    if (fileName != null) createdPhotos.current.push(fileName);
    update('photoFileName', fileName);
  };

  /**
   * 使われなかった写真を消す（SPEC-V5 §1.5）。**保存でも取り消しでも通る。**
   *
   * 保存なら「列に載った 1 枚」以外、取り消しなら「開いている間に作った全部」が対象。
   * 保存済みの写真（この一覧に無い）は触らない ── そちらを消すのは repository の責務で、
   * 記録の列が実際に書き換わったときだけ消える。
   */
  const cleanUpPhotos = (keep: string | null) => {
    for (const fileName of orphanPhotoFiles(createdPhotos.current, keep)) {
      photoStore.remove(fileName);
    }
    createdPhotos.current = [];
  };

  /** キャンセル（SPEC §5.3）。DB には何も書いていないので、片づけるのは写真だけ */
  const handleCancel = () => {
    cleanUpPhotos(null);
    onClose();
  };

  const handleSave = () => {
    setIsPushedSave(true);
    // 商品名が空なら早期 return。シートは閉じず、DB にも書き込まない（SPEC §5.2）。
    // ここで片づけないのは、まだ編集の途中だから（選んだ写真は残す）
    if (!canSave(values)) return;

    const newlyCompleted = saveRecord(record?.id ?? null, toSaveInput(values));
    showAchievementToast(newlyCompleted);
    cleanUpPhotos(values.photoFileName);
    onSaved?.();
    onClose();
  };

  // 伝票の各行と結果行が使う金額。式は logic/profit.ts のものだけを通す（画面で再実装しない）
  const costs = toCostInput(values);
  const profit = netProfit(costs);
  const packingCost = costs.envelopeCost + costs.othersCost;
  // 目標は保存する値そのもので見出しを出す（SPEC-V9 §2）。**null と 0 を見分ける必要がある**ので
  // parseNumericInput ではなく専用の変換を通す
  const targetProfit = parseTargetProfitInput(values.targetProfit);
  const hasError = isPushedSave && !canSave(values);

  // 日付欄は「今日」だけ青くして、既定値のまま出していることが分かるようにする（UI-SPEC §1.3-12）
  const dateText = (value: Date) =>
    daysBetween(value, today) === 0
      ? todayDateLabel(formatRecordDate(value))
      : formatRecordDate(value);
  // 畳んだ見出しに出すのは、その状態で意味を持つほうの日付（出品中に販売日はない）
  const primaryDate = values.isSold ? values.saleDate : values.saleStartDate;
  // 出品日をこのフォームで動かせるので、範囲と「選べない理由」は入力中の出品日から引き直す（§8.5）
  const soldDateRange = saleDateRange(values.saleStartDate, today);
  const soldDateNoteText = soldDateNotes(values.saleStartDate, today);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 1. シートハンドル（UI-SPEC §1.3-1）。Modal は掴んで下げられないので、
          「下から出た一時的な面」であることを示す飾りとして置く */}
      <View style={styles.grabberArea}>
        <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
      </View>

      {/* 2. シートヘッダ（UI-SPEC §1.3-2） */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={handleCancel} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.headerButton, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
          </Pressable>
          {/* 案 `20c`: このフォームにも「？」を置く。販売日を選べなかった直後に開くのが
              いちばん役に立つので、シートは「日付のきまり」を先頭に出す */}
          <HelpButton onPress={() => setShowHelp(true)} />
        </View>
        {/* 見出しは**画面の中央**に置く。行の中に並べると自然幅で挟まれ、左右のボタンの
            幅の差の半分だけ寄る（「キャンセル」と「保存」で 22pt ずれていた）。
            重ねてもボタンを塞がないよう、当たり判定は持たせない */}
        <View style={styles.headerTitleSlot} pointerEvents="none">
          <Text style={[styles.headerTitle, { color: colors.label }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Pressable onPress={handleSave} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.headerButton, styles.saveButton, { color: colors.blue }]}>
            {SAVE_LABEL}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {/* 4〜11. 伝票カード。見出し行 → 商品名 → 種別 → 金額の積み上げ → 結果行 */}
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
          <StatusHeaderRow isSold={values.isSold} colors={colors} onToggle={toggleStatus} />

          {/* 4. 商品名（22px のインライン入力）。必須なのはこの欄だけ（SPEC §5.2）。
              **左に写真の正方形**（SPEC-V5 §3.1）── 写真は任意で付けない記録の方が多いので、
              専用の 1 段を取らず商品名の横に畳む。並びは一覧の行・詳細と同じ「写真が左」 */}
          <PhotoField fileName={values.photoFileName} onChange={changePhoto}>
            <TextInput
              style={[
                styles.itemNameInput,
                { color: colors.label },
                // 通常は青の下線 1.5px。警告時だけ赤枠にする（SPEC §5.2「赤枠＋警告」）
                hasError
                  ? { borderWidth: 1, borderRadius: 8, borderColor: colors.red, paddingHorizontal: 8 }
                  : { borderBottomWidth: 1.5, borderBottomColor: colors.blue },
              ]}
              value={values.itemName}
              onChangeText={(value) => update('itemName', value)}
              placeholder={ITEM_NAME_PLACEHOLDER}
              placeholderTextColor={colors.mutedLabel}
              accessibilityLabel={ITEM_NAME_LABEL}
              // 左の正方形のぶん、この欄は 1 行あたり 10 字ほどしか入らない。1 行のままだと
              // 長い商品名は**左へ流れて先頭が見えなくなる**ので、折り返して 2 行目に伸ばす
              // （欄の幅ではなく「打った字が全部見えるか」の方を取る）。
              // 改行そのものは入れさせない ── 商品名は一覧では 1 行で出るものなので、
              // return はキーボードを閉じる側に割り当てる
              multiline
              submitBehavior="blurAndSubmit"
            />
            <Text
              style={[styles.itemNameCaption, { color: hasError ? colors.red : colors.secondaryLabel }]}
              accessibilityRole={hasError ? 'alert' : undefined}>
              {hasError ? ITEM_NAME_REQUIRED_MESSAGE : ITEM_NAME_CAPTION}
            </Text>
          </PhotoField>

          {/* 5. 種別セレクタ。商品名の直下・金額の積み上げの直前（UI-SPEC §6-6 / 決定 §9-3） */}
          <RecordKindSelector kind={values.kind} onChange={updateKind} />

          {/* 6. 販売価格。伝票の一番上で、ここから下へ引いていく */}
          <NumericField
            label={SALES_PRICE_LABEL}
            value={values.salesPrice}
            onChangeValue={(value) => update('salesPrice', value)}
            rowHeight={RECEIPT_ROW_HEIGHT}
            valueStyle={styles.salesPriceValue}
            // このフォームは RN の Modal なので、どの欄の電卓から開いた梱包材シートでも
            // 設定タブへは遷移できない（裏に積まれる）。行に選択ボタンのない欄でも渡す
            canOpenSettings={false}
          />

          <View style={[styles.separator, { backgroundColor: colors.separator }]} />

          {/* 7. 仕入価格は仕入品のときだけ（UI-SPEC §5-11。値は changeKind でクリア済み） */}
          {values.kind === 'sourced' && (
            <NumericField
              label={deductionLabel(PURCHASE_PRICE_LABEL)}
              // 電卓の見出しは「− 仕入価格の計算」ではなく「仕入価格の計算」（UI-SPEC §7.1）
              calculatorLabel={PURCHASE_PRICE_LABEL}
              value={values.purchasePrice}
              onChangeValue={(value) => update('purchasePrice', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
            />
          )}

          {/* 8. 送料 */}
          <NumericField
            label={deductionLabel(POSTAGE_LABEL)}
            calculatorLabel={POSTAGE_LABEL}
            value={values.postage}
            onChangeValue={(value) => update('postage', value)}
            rowHeight={RECEIPT_ROW_HEIGHT}
            valueStyle={[styles.deductionValue, { color: colors.red }]}
            // 送料はプリセットから選べる（SPEC-V3 §4.2）
            presetType="shipping"
            // **選んだ行そのものを受け取る**（SPEC-V6 §3）── 欄に入るのは送料と専用資材の
            // 合計で、資材費の控えも記録に持つ必要があるため、値の書き戻しだけでは足りない
            onSelectPreset={selectShipping}
            // このフォームは RN の Modal なので、設定タブへ遷移してもその裏に積まれる。
            // 押しても何も起きないように見えるリンクは出さない（PresetPickerSheet 参照）
            canOpenSettings={false}
          />

          {/* 9. 手数料。他の行と違って入れるのは「率」で、伝票に載るのはそこから出た「額」。
              率の ± は行名と額の間に置き、行の形（左が名前・右が金額）を崩さない */}
          <View style={[styles.commissionRow, { height: RECEIPT_ROW_HEIGHT }]}>
            <Text style={[styles.rowLabel, { color: colors.label }]} numberOfLines={1}>
              {deductionLabel(commissionFieldLabel(values.commission))}
            </Text>
            {/* タグボタンはラベルの直後（SPEC-V3 §4.4 / 設計案 29b）。± はそのまま残す */}
            <PresetTagButton
              type="site"
              value={values.commission}
              // バッジは率ではなく選んだ名前で決まる（§1.5.1）。手で率を変えても札は残る
              selectedName={values.siteName}
              onSelect={selectSite}
              canOpenSettings={false}
            />
            <StepperButtons
              value={values.commission}
              minimumValue={MIN_COMMISSION}
              maximumValue={MAX_COMMISSION}
              onChangeValue={(value) => update('commission', value)}
              accessibilityLabel={commissionFieldLabel(values.commission)}
            />
            {/* 額は右寄せ。ラベルとタグボタンの幅が変わっても、他の行と右端が揃う */}
            <Text style={[styles.commissionValue, styles.deductionValue, { color: colors.orange }]}>
              {formatYen(commissionCost(costs))}
            </Text>
          </View>

          {/* 9a. 選んだ販売サイトの名前（SPEC-V3 §1.5.1）。手数料行の直下に 1 行。
              未設定なら行ごと出ないので、通常の伝票の高さは変わらない */}
          <SiteNameRow siteName={values.siteName} onClear={() => update('siteName', '')} />

          {/* 10. 梱包材・その他。畳んだ状態では「未入力」か合計だけを出す（UI-SPEC §1.3-10） */}
          <CollapsibleSection
            label={additionLabel(ENVELOPE_AND_OTHERS_FIELD_LABEL)}
            tone="link"
            expanded={costsOpen}
            onToggle={() => setCostsOpen((open) => !open)}
            trailing={
              <Text
                style={[
                  styles.packingSummary,
                  { color: packingCost === 0 ? colors.mutedLabel : colors.red },
                ]}>
                {packingCost === 0 ? UNSET_INPUT_LABEL : formatYen(packingCost)}
              </Text>
            }>
            <NumericField
              label={ENVELOPE_COST_LABEL}
              value={values.envelopeCost}
              onChangeValue={(value) => update('envelopeCost', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
            />
            <NumericField
              label={OTHERS_COST_LABEL}
              value={values.othersCost}
              onChangeValue={(value) => update('othersCost', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
            />
          </CollapsibleSection>

          {/* 11. 結果行。太い線から下が「引き終わったあと」（UI-SPEC §1.3-11） */}
          <View style={[styles.totalSeparator, { backgroundColor: colors.separator }]} />
          <View style={styles.resultRow}>
            {/* 1 件を指すので種別語（SPEC-V2 §5.3） */}
            <Text style={[styles.resultLabel, { color: colors.label }]}>
              {profitLabel(values.kind)}
            </Text>
            <Text style={[styles.resultAmount, { color: profit >= 0 ? colors.green : colors.red }]}>
              {formatYen(profit)}
            </Text>
          </View>
        </View>

        {/* 11a. タグカード（SPEC-V4 §3.1 の改訂）。伝票カードの中の 1 行から、
            **カードを分けて見出し「タグ」＋その下に並べる**形に改めた ──
            タグは「何を売ったか」の情報で金額ではないので、そもそも金額の面に置かない
            （レコード詳細でタグをレシートカードの外に出しているのと同じ理由。§3.4）。
            行だったころはチップが折り返すたびに伝票の商品名と種別の間が開いていたが、
            カードなら何段に伸びても金額の流れは動かない。
            伝票カードの**直後**に置くのは、日付・メモ（畳んである補足）より前に
            「何を売ったか」が来る並びを保つため */}
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
          <TagSection
            tags={selectedTags(tags, values.tagIds)}
            onOpenPicker={() => setTagPickerOpen(true)}
            onRemove={(id) =>
              update(
                'tagIds',
                values.tagIds.filter((tagId) => tagId !== id),
              )
            }
          />
        </View>

        {/* 11c. 目標利益（SPEC-V9 §2）。**伝票カードの外**に置く ──
            目標は売買で実際に動いた金額ではなく「こうしたい」という値なので、
            引き算の積み上げ（販売価格 → 経費 → 利益）の中に混ぜると、
            伝票の縦の足し算に入る額に見えてしまう。

            **空欄は「¥0」ではなく「決めていません」と出す**（§2）── 0 は
            「赤字にならなければよい」という目標そのもので、決めていない状態とは別のもの。
            金額として書くと、決めた覚えのない目標が記録に出ることになる */}
        <View style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}>
          <CollapsibleSection
            label={targetProfitLabel(values.kind)}
            tone="link"
            expanded={targetOpen}
            onToggle={() => setTargetOpen((open) => !open)}
            trailing={
              <Text
                style={[
                  styles.packingSummary,
                  { color: targetProfit == null ? colors.mutedLabel : colors.green },
                ]}>
                {targetProfitSummary(targetProfit)}
              </Text>
            }>
            <NumericField
              label={targetProfitLabel(values.kind)}
              value={values.targetProfit}
              onChangeValue={(value) => update('targetProfit', value)}
              // 他の金額欄の placeholder は "0"（未入力＝0 円）だが、この欄の空欄は
              // 0 ではない。placeholder にも 0 を出さない
              placeholder={TARGET_PROFIT_UNSET_LABEL}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.green }]}
              canOpenSettings={false}
            />
          </CollapsibleSection>
        </View>

        {/* 12. 日付カード（折りたたみ）。畳んだままでも操作対象の日付が読める */}
        <View style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}>
          <CollapsibleSection
            label={dateSectionLabel(values.isSold, dateText(primaryDate))}
            expanded={datesOpen}
            onToggle={() => setDatesOpen((open) => !open)}>
            {/* 販売日は売却済みのときだけ（SPEC.md §3.2）。伝票の主役に近い順で販売日が先。
                選べるのは [出品日, 今日]（§8.5）。範囲外の保存済みの値はそのまま表示し、
                ピッカーを開いたときに範囲へ寄せる */}
            {values.isSold && (
              <DateField
                label={SOLD_DATE_FIELD_LABEL}
                value={values.saleDate}
                onChangeValue={(value) => update('saleDate', value)}
                today={today}
                valueText={dateText(values.saleDate)}
                accent={daysBetween(values.saleDate, today) === 0}
                highlighted={highlightSoldDate}
                minDate={soldDateRange.min}
                maxDate={soldDateRange.max}
                // 詳細画面と同じカレンダーを開く（§8.10）。同じ日付を入れる欄が
                // 画面ごとに違うピッカーだと、選べない理由の説明も画面ごとに変わってしまう
                flagDate={values.saleStartDate}
                note={soldDateNoteText.calendar}
                // 当日出品なら「昨日」「一昨日」が落ちる（§8.10.1）。淡くするだけでは
                // 不具合と読まれるので、理由の一行を行の中にも出す（§8.10.5）
                chipsNote={soldDateNoteText.chips}
              />
            )}
            {/* 出品日は過去に下限がなく、落ちるのは未来だけ（§8.10.4）。
                チップが淡色になることは実際には起きない（今日より後のチップがないため） */}
            <DateField
              label={LISTED_DATE_FIELD_LABEL}
              value={values.saleStartDate}
              onChangeValue={(value) => update('saleStartDate', value)}
              today={today}
              valueText={dateText(values.saleStartDate)}
              accent={daysBetween(values.saleStartDate, today) === 0}
              maxDate={today}
              note={LISTED_DATE_PICKER_NOTE}
            />
          </CollapsibleSection>
        </View>

        {/* 13. メモ（折りたたみ） */}
        <View style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}>
          <CollapsibleSection
            label={memoSectionLabel(values.memo)}
            expanded={memoOpen}
            onToggle={() => setMemoOpen((open) => !open)}>
            <TextInput
              style={[styles.memoInput, { color: colors.label, borderColor: colors.separator }]}
              value={values.memo}
              onChangeText={(value) => update('memo', value)}
              multiline
              accessibilityLabel={MEMO_LABEL}
            />
          </CollapsibleSection>
        </View>
      </ScrollView>

      {/* タグ選択シート（§3.2）。**選んだ瞬間にフォームの state に入る**が、
          記録との紐付けが DB に入るのは「保存」を押したときだけ（UI-SPEC §8.6）。
          設定タブへのリンクは出さない ── このフォームは RN の Modal なので、
          遷移してもその裏に積まれてしまう（プリセットの選択シートと同じ判断） */}
      {tagPickerOpen && (
        <TagPickerSheet
          selectedIds={values.tagIds}
          onChange={(tagIds) => update('tagIds', tagIds)}
          onTagsChanged={refreshTags}
          canOpenSettings={false}
          onClose={() => setTagPickerOpen(false)}
        />
      )}

      {/* ヘッダの「？」（案 `20c`）。このフォームはモーダルの上なので「最初から読む」は出さない
          ── 設定タブへ push しても、このモーダルの下に隠れて見えない */}
      {showHelp && <HelpSheet entry="recordForm" onClose={() => setShowHelp(false)} />}
    </KeyboardAvoidingView>
  );
}

/**
 * タグの節（SPEC-V4 §3.1 の改訂）。**見出し「タグ」＋ 右に「＋ 追加」、その下にチップ。**
 *
 *     タグ                          ＋ 追加
 *     [● 洋服 ✕] [● 中古 ✕]
 *
 * 伝票カードの中の 1 行（ラベルの右にチップを流す形）から改めた ──
 * 行だと**チップの置き場が横の残り幅しかなく**、2〜3 個で折り返して伝票が押し広げられる。
 * 見出しの下を全幅で使えば、同じ数でも 1 段に収まる。
 *
 * - **0 件でも節ごと消さない** ── 出したり消したりすると機能に気付けない
 *   （SPEC-V3 §4.1 と同じ判断）。代わりに「まだ付いていません」を薄く出す
 * - 「＋ 追加」は**見出しの右**。チップの列の最後尾に置くと、数が増えるたびに
 *   足す口の位置が動く（0 件のときは薄い語の隣にぽつんと残る）
 * - 「✕」を押すとその場で 1 つ外れる（シートを開き直さずに済む）
 * - 並びは tags.sortOrder 昇順（§1.5）。呼び出し側が selectedTags で解決して渡す
 */
function TagSection({
  tags,
  onOpenPicker,
  onRemove,
}: {
  tags: Tag[];
  onOpenPicker: () => void;
  onRemove: (id: string) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.tagSection}>
      <View style={styles.tagSectionHeader}>
        <Text style={[styles.tagSectionLabel, { color: colors.label }]}>{TAG_LABEL}</Text>
        <Pressable
          onPress={onOpenPicker}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={TAG_PICKER_OPEN_LABEL}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={[styles.tagAddLabel, { color: colors.blue }]}>{TAG_ADD_LABEL}</Text>
        </Pressable>
      </View>

      {tags.length === 0 ? (
        <Text style={[styles.tagEmptyLabel, { color: colors.mutedLabel }]}>
          {TAG_FIELD_EMPTY_LABEL}
        </Text>
      ) : (
        <View style={styles.tagSectionChips}>
          {tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} variant="selected" onRemove={() => onRemove(tag.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * 伝票カードの見出し行（UI-SPEC §1.3-3 / 設計案 4b）。
 * 左が今の状態（ドット＋語）、右が切替リンク。上端に 2 択ボタンを置かないのは、
 * 金額の流れの前に無関係な操作が挟まるため（設計案ターン 4 の結論）。
 */
function StatusHeaderRow({
  isSold,
  colors,
  onToggle,
}: {
  isSold: boolean;
  colors: ThemeColors;
  onToggle: () => void;
}) {
  const statusColor = isSold ? colors.green : colors.orange;

  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabel}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {isSold ? SOLD_RECORDS_LABEL : LISTING_STATUS_LABEL}
        </Text>
      </View>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text style={[styles.statusSwitch, { color: colors.blue }]}>
          {switchStatusLabel(!isSold)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grabberArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 行の左右いっぱいに敷いて、その中で中央寄せ ── 端は header の padding より外側の
  // border box なので、ここでの中央が画面の中央と一致する
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  headerButton: {
    fontSize: 16,
  },
  saveButton: {
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  foldedCard: {
    // 折りたたみは見出し行に自前の余白を持つので、カード側は上下を詰める
    paddingVertical: 8,
    gap: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusSwitch: {
    fontSize: 14,
  },
  itemNameInput: {
    fontSize: 22,
    paddingVertical: 6,
  },
  itemNameCaption: {
    fontSize: 12,
  },
  tagSection: {
    gap: 10,
  },
  tagSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tagSectionLabel: {
    // 見出しの重さは日付・メモの折りたたみの見出しと揃える（同じ「節の名前」なので）
    fontSize: 16,
    fontWeight: '600',
  },
  tagAddLabel: {
    fontSize: 15,
  },
  tagSectionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  tagEmptyLabel: {
    fontSize: 15,
  },
  salesPriceValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  deductionValue: {
    fontSize: 20,
  },
  commissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    // タグボタンはラベルの直後に付く（設計案 29b）ので、余りはラベルではなく額（commissionValue）が吸う
    flexShrink: 1,
    fontSize: 16,
  },
  commissionValue: {
    flex: 1,
    textAlign: 'right',
  },
  packingSummary: {
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  totalSeparator: {
    // 結果行の手前だけ太い線（UI-SPEC §1.3-11）
    height: 1.5,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  resultAmount: {
    fontSize: 30,
    fontWeight: '700',
  },
  memoInput: {
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
