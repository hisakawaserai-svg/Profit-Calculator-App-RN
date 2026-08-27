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
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardToolbar,
  useKeyboardState,
  type KeyboardAwareScrollViewRef,
  type KeyboardToolbarProps,
} from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsibleSection } from '@/components/CollapsibleSection';
import { BreakdownPartList } from '@/components/BreakdownPartList';
import { CostProportionBar } from '@/components/CostProportionBar';
import { RequiredPriceBlock } from '@/components/RequiredPriceBlock';
import { ResultAmountBlock } from '@/components/ResultAmountBlock';
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
  cancelLabel,
  editRecordTitle,
  envelopeAndOthersFieldLabel,
  envelopeCostLabel,
  itemNameCaption,
  itemNameLabel,
  itemNamePlaceholder,
  keyboardToolbarDoneLabel,
  listedDateFieldLabel,
  listedDatePickerNote,
  listingStatusLabel,
  memoLabel,
  newRecordTitle,
  othersCostLabel,
  postageLabel,
  purchasePriceLabel,
  salesPriceLabel,
  saveLabel,
  soldDateFieldLabel,
  soldRecordsLabel,
  tagAddLabel,
  tagFieldEmptyLabel,
  tagLabel,
  tagPickerOpenLabel,
  targetProfitUnsetLabel,
  unsetInputLabel,
  additionLabel,
  applyRequiredPriceLabel,
  breakdownLabel,
  targetProfitLabel,
  targetProfitSummary,
  commissionFieldLabel,
  commissionRateLabel,
  commissionShortLabel,
  dateSectionLabel,
  deductionLabel,
  memoSectionLabel,
  profitLabel,
  requiredPriceHeadline,
  soldDateNotes,
  switchStatusLabel,
  todayDateLabel,
} from '@/logic/labels';
import { daysBetween } from '@/logic/listingDays';
import { orphanPhotoFiles } from '@/logic/photo';
import { presetNameForLookup } from '@/logic/preset';
import {
  costBreakdown,
  requiredPriceResult,
  type CostBreakdown,
  type RequiredPriceResult,
} from '@/logic/calcForm';
import { commissionCost, netProfit } from '@/logic/profit';
import { initialSaleDate, saleDateRange } from '@/logic/saleDate';
import { selectedTags } from '@/logic/tag';
import {
  itemNameRequiredMessage,
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
import { requestReviewAfterSave } from '@/review/requestReview';
import { useModalPresence } from '@/review/modalPresence';
import { getDefaultRecordKind , useLocale } from '@/settings';
import { themes, useThemeColors, type ThemeColors } from '@/theme';

/** 伝票カードの行高（UI-SPEC §1.1-5 の 60px より詰める。1 枚に全部の金額が載るようにするため） */
const RECEIPT_ROW_HEIGHT = 48;

/**
 * 保存できなかったときに商品名の欄まで戻す際、**欄の上に残す余白**（pt）。
 *
 * 0 にすると欄が画面の上端に貼り付いて、上に何が載っているのか（状態の見出し行、
 * ひいては伝票カードそのもの）が読めなくなる。伝票カードの見出し行がだいたい収まる高さ。
 * いまは商品名が中身のほぼ先頭にあるので、実際には先頭まで戻る（Math.max で 0 に落ちる）。
 */
const ITEM_NAME_SCROLL_MARGIN = 64;

/**
 * 鍵盤の上端とフォーカス中の欄の間に残す余白（pt。KeyboardAwareScrollView の bottomOffset）。
 * 金額の行は高さ 60pt で下線を持つので、0 だと下線と鍵盤の境目が重なって欄の切れ目が読めない。
 * 1 行ぶんの半分を残すと、打っている欄が「鍵盤のすぐ上の 1 行」として見える。
 */
const KEYBOARD_BOTTOM_OFFSET = 32;

/** メモ欄（複数行）の最低の高さ（pt）。下の styles.memoInput と揃える */
const MEMO_MIN_HEIGHT = 80;

/**
 * メモ欄を触っている間だけ足す余白（pt）。
 *
 * **複数行の欄だけ、逃がしの基準が「欄の下端」ではなく「カーソルのある行」になる。**
 * KeyboardAwareScrollView は普段 `絶対Y + 欄の高さ` を鍵盤の上へ運ぶが、複数行では
 * その高さをカーソル行の y に差し替える（ライブラリの `updateLayoutFromSelection`）──
 * 何百 pt にもなり得る欄を丸ごと出すのは無理なので、カーソルを追うほうが正しい。
 *
 * その結果、**空のメモ欄では 1 行目のぶんしか運ばれず、箱の下 2/3 が鍵盤の裏に残っていた。**
 * 箱の高さぶんを足して、カーソルが 1 行目にあるときでも下端まで出るようにする。
 * 実際に要るのは「カーソル行から箱の下端まで」なので `MEMO_MIN_HEIGHT` は上限側の見積もりで、
 * 数十 pt 余分に上がることがある（隙間が空くだけで、隠れるよりは読める）。
 *
 * **メモが伸びて箱が高くなったら、足りなくなるのは意図どおり** ── そこから先は
 * 箱を丸ごと出すことに意味が無く、カーソルを追う既定の動きが正しい。
 */
const MEMO_KEYBOARD_EXTRA = MEMO_MIN_HEIGHT;

/**
 * 鍵盤の上に出す決定ツールバーの配色。アプリの ThemeColors（src/theme.ts）に揃える ──
 * ライブラリの既定色だとアプリの青とわずかに違い、鍵盤のすぐ上という目立つ場所で浮く。
 */
const KEYBOARD_TOOLBAR_THEME: NonNullable<KeyboardToolbarProps['theme']> = {
  light: {
    primary: themes.light.blue,
    disabled: themes.light.disabledContent,
    background: themes.light.secondaryBackground,
    ripple: themes.light.highlightBackground,
  },
  dark: {
    primary: themes.dark.blue,
    disabled: themes.dark.disabledContent,
    background: themes.dark.secondaryBackground,
    ripple: themes.dark.highlightBackground,
  },
};

/**
 * 決定ボタンのガラス調の地色。colors.highlightBackground（選択中の行用、かなり薄い）だと
 * 鍵盤の上で存在感が弱すぎたので、同じ青に濃さだけ足した専用の色を持つ。
 */
const KEYBOARD_TOOLBAR_DONE_TINT = {
  light: 'rgba(0, 122, 255, 0.30)',
  dark: 'rgba(10, 132, 255, 0.46)',
};

// ---- 帯（CostProportionBar）のスティッキーバー ----
//
// **鍵盤で下寄りの欄（目標・メモ）まで運ばれると、上の帯グラフが画面の外に出る。**
// 逃がしそのもの（KeyboardAwareScrollView）は直したが、それとは別の問題 ──
// 打っている間、結果の帯が見えなくなる。計算タブの「結果カードが流れたら上端に固定バーを出す」
// （StickyResultBar）と同じ考え方をこの画面にも足す。**鍵盤が押し上げる自動スクロールも
// 中身は scrollTo（実スクロール）なので、同じ onScroll だけで両方（手でスクロール／
// 鍵盤で運ばれる）を区別せず拾える。**
//
// 計算タブと違うのは、しきい値が固定でないこと ── あちらは結果カードが常に先頭なので
// 40pt 決め打ちで足りるが、この画面は商品名・写真・種別など帯より上に可変長の要素が並ぶ。
// 帯の下端を実測して（cardTopRef と同じ「カードからの相対位置」を足す）、
// その位置を通り過ぎたかどうかで出し分ける。
const STICKY_BREAKDOWN_DURATION = 180;
const FALLBACK_STICKY_BREAKDOWN_HEIGHT = 72;

type Props = {
  visible: boolean;
  /** 編集対象のレコード。省略 / null なら新規追加 */
  record?: SaleRecord | null;
  /** 新規追加時の初期値。計算タブの＋から入力中の金額を引き継ぐ（SPEC §3.2 prepareNewRecord 相当） */
  initialAmounts?: InitialAmounts;
  /**
   * 新規追加時の初期値を**まるごと**渡す（「過去の記録から複製」。logic/duplicateRecord.ts）。
   *
   * `initialAmounts` と分けてあるのは持てるものが違うから ── あちらは計算タブが持ち得る
   * 金額だけの `Pick` で、商品名・タグ・資材費の控えを持たない。複製はそれらも写すので、
   * 欄をあちらに足すと「計算タブから渡ってくることは無いのに型にはある」ものが増える。
   *
   * **これが渡されたときは `initialAmounts` を見ない**（同時に渡す呼び出し側は無い）。
   * 編集（`record` あり）が優先されるのも従来どおり。
   */
  initialValues?: RecordFormValues;
  /** キャンセル・保存後に閉じる */
  onClose: () => void;
  /** 保存が成立したときだけ呼ばれる。呼び出し側でリストを再取得する */
  onSaved?: () => void;
};

export function RecordFormSheet({
  visible,
  record,
  initialAmounts,
  initialValues,
  onClose,
  onSaved,
}: Props) {
  /**
   * Android の戻るボタン・iOS のスワイプ払い（`onRequestClose`）が呼ぶのは、
   * 「キャンセル」ボタンと同じ `handleCancel`（写真の後片付けを含む）。
   *
   * `onRequestClose` はこの外側（Modal 本体）にあり、`handleCancel` は
   * `visible` の間だけマウントされる `RecordForm` の中の関数なので、直接は呼べない ──
   * `RecordForm` 側が毎描画でここへ最新の `handleCancel` を書き込む（下の useEffect）。
   * まだ書き込まれていない・アンマウント後は `onClose` にそのまま落ちる
   * （その場合の写真の後片付けはアンマウント時の useEffect が最後の関所として拾う）。
   */
  const handleCancelRef = useRef<(() => void) | null>(null);

  // レビュー依頼をこのシートの上に被せないための申告（src/review/modalPresence.ts）
  useModalPresence(visible);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      // Swift 版の .sheet と同じ見た目（iOS のハーフシート風）。Android では無視される
      presentationStyle="pageSheet"
      onRequestClose={() => (handleCancelRef.current ?? onClose)()}>
      {/* 開いている間だけマウントして、入力欄を初期値で初期化する（Swift 版 onAppear の loadInitialData 相当）。
          **SafeAreaProvider をもう 1 つ置くのは、Modal が別のウィンドウだから**（安全域は
          ウィンドウごとに違う）。ルートの Provider が知っているのは地の画面の安全域で、
          この中で `useSafeAreaInsets()` を呼んでもその値が返る ── iOS の pageSheet は
          ステータスバーより下に出るので上の安全域は 0 なのに 59pt が返り、Android は
          全画面（pageSheet は無視される）で本当に 59pt 要るのに地の画面の値しか無い。
          ここで包み直すと、それぞれのウィンドウを実測した値になる
          （react-native-safe-area-context の「モーダルの中にも置くこと」）。 */}
      {visible && (
        <SafeAreaProvider>
          <RecordForm
            record={record ?? null}
            initialAmounts={initialAmounts}
            initialValues={initialValues}
            onClose={onClose}
            onSaved={onSaved}
            handleCancelRef={handleCancelRef}
          />
        </SafeAreaProvider>
      )}
    </Modal>
  );
}

function RecordForm({
  record,
  initialAmounts,
  initialValues,
  onClose,
  onSaved,
  handleCancelRef,
}: {
  record: SaleRecord | null;
  initialAmounts?: InitialAmounts;
  initialValues?: RecordFormValues;
  onClose: () => void;
  onSaved?: () => void;
  /** 親（RecordFormSheet）の Modal.onRequestClose から `handleCancel` を呼べるようにする */
  handleCancelRef: RefObject<(() => void) | null>;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  // タグの一覧（SPEC-V4 §3.1）。チップを描くのに名前と色が要るので、id だけでは足りない。
  // 選択シートで作られた新しいタグを拾うため、シートには refresh を渡す
  const { tags, refresh: refreshTags } = useTagList();
  // 編集のときだけ、いま付いているタグが初期値になる（新規は空。§3.1）
  const { tagIds: savedTagIds } = useRecordTagIds(record?.id);

  // 新規の種別は設定の既定値。ただし計算タブから開いたときは initialAmounts.kind が優先される
  // （SPEC-V2 §1.4）。開いている間だけマウントされるので、ここで一度読めばよい。
  //
  // 複製（initialValues）は**組み立て済みの値をそのまま採る** ── 種別も既定値ではなく
  // 複製元のものになっているので、ここで getDefaultRecordKind() を混ぜない
  const [values, setValues] = useState<RecordFormValues>(() =>
    record == null
      ? (initialValues ?? newFormValues(getDefaultRecordKind(), initialAmounts))
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
   *
   * **「過去の記録から複製」の写真もここに含めて始める。** `initialValues` は複製でしか
   * 渡らない（編集は `record` を使う。上の Props のコメント）ので、
   * `initialValues.photoFileName` が入っているときは常に「複製元の写真を
   * screens/DuplicateSourceScreen.tsx が既に複製した、まだどの記録にも属さない 1 枚」
   * ── カメラロールから選んだ写真と同じ扱いで、保存されなければ片づく必要がある。
   * `useRef` の初期値としてここに渡すだけなら描画中の ref アクセスにならない
   * （react-hooks/refs は `.current` の読み書きを禁じるもので、初期値の指定は対象外）。
   */
  const createdPhotos = useRef<string[]>(
    initialValues?.photoFileName == null ? [] : [initialValues.photoFileName],
  );
  /** タグ選択シート（§3.2）。開いている間だけマウントする */
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  /** ヘッダの「？」（案 `20c`）。開いている間だけマウントする */
  const [showHelp, setShowHelp] = useState(false);
  /** 保存ボタンを押したか。押すまでは警告を出さない（SPEC §5.2 の isPushedSave） */
  const [isPushedSave, setIsPushedSave] = useState(false);
  const insets = useSafeAreaInsets();
  /** メモ欄にカーソルがあるか（鍵盤の逃がし方が複数行だけ違う。MEMO_KEYBOARD_EXTRA 参照） */
  const [memoFocused, setMemoFocused] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const itemNameInputRef = useRef<TextInput>(null);
  /**
   * 商品名の欄がスクロールの中身のどこから始まるか（pt）。**2 つに分けて控える。**
   *
   * onLayout が返す y は**親から見た位置**なので、伝票カードの中に置いた欄の y だけでは
   * 中身の座標にならない。カードがスクロールの中身の中で始まる y と足して初めて
   * 「スクロール先」になる。位置決めのために測るだけで描画には関係しないので、
   * state ではなく ref（createdPhotos と同じ理由）。
   *
   * **決め打ちの 0 にしない。** いまは商品名が中身のいちばん上にあるので 0 でも当たるが、
   * カードの並びが変わった時点で黙って外れる ── 外れても「スクロールはした」ように
   * 見えるので、気付けない壊れ方をする。
   */
  const cardTopRef = useRef(0);
  const itemNameTopRef = useRef(0);
  /**
   * 帯（CostProportionBar）の下端が、伝票カードの中のどこにあるか（pt）。
   * itemNameTopRef と同じ理由で ref。0 のままなら「まだ測っていない」──
   * スティッキーバーの判定はこの値が入るまで動かさない（handleScroll 参照）。
   */
  const breakdownBottomRef = useRef(0);
  /**
   * 目標の節（NumericField ＋ 決めてあれば RequiredPriceBlock）の下端。**カードそのものが
   * スクロール中身の直接の子**（伝票カードの外。JSX のコメント参照）なので、breakdownBottomRef
   * と違って cardTopRef を足さない ── measure した y がそのまま中身の絶対位置になる。
   */
  const targetSectionBottomRef = useRef(0);
  /** 直近の scroll イベントが持っていた値（鍵盤の高さだけが変わったときの再判定に使う） */
  const scrollOffsetYRef = useRef(0);
  const scrollLayoutHeightRef = useRef(0);
  /** 帯が画面の外（鍵盤の裏を含む）に出ている間だけ true（スティッキーバー用） */
  const [breakdownStickyVisible, setBreakdownStickyVisible] = useState(false);
  /** 目標の節が画面の外に出ている間だけ true。**目標欄にカーソルがあるときしか使わない**
   * （下の targetInputFocused && targetStickyVisible。他の欄を打っている間は伝票の帯を優先する） */
  const [targetStickyVisible, setTargetStickyVisible] = useState(false);
  /** 目標の純利益欄にカーソルがあるか（スティッキーバーをどちらの内容にするかの分岐） */
  const [targetInputFocused, setTargetInputFocused] = useState(false);
  /** 商品名欄にカーソルがあるか。ここを打っている間は伝票のスティッキーバーを出さない
   * （名前を考えている最中に上から帯が降りてくるのが邪魔なため） */
  const [itemNameFocused, setItemNameFocused] = useState(false);
  // 鍵盤の高さ（可視でなければ 0）。KeyboardSaveBar と違い符号は素の正の値
  // （useReanimatedKeyboardAnimation ではなく useKeyboardState を使っているため）
  const keyboardHeight = useKeyboardState((state) => state.height);

  /**
   * ある領域（絶対位置の下端 `bottomY`）が画面に実際に見えているかを判定して、渡された setter
   * を呼ぶ。**帯（伝票）にも目標の節にも同じ 1 本を使う** ── どちらも「欄のすぐ上か下にある
   * 結果を、鍵盤で隠れていないか」という同じ問いだから。
   *
   * 「スクロール量」だけでは足りない理由: 鍵盤に押されて欄まで運ばれても、その欄が結果の
   * すぐ上にあれば、運ぶ量そのものは小さく（スクロールがほぼ動かず）結果は画面上の
   * スクロール範囲内にまだ「乗っている」。それでも鍵盤の高さぶんは下から隠れているので、
   * 画面に実際に見えているかは「結果の下端の画面上の位置」と「鍵盤の上端（＝見える範囲の
   * 下端）」を比べないと分からない。
   */
  const evaluateVisibility = useCallback(
    (bottomY: number, keyboardH: number, setVisible: (hidden: boolean) => void) => {
      // まだ測っていない（0）間は判定しない。測る前の 1 描画で誤って出さないため
      if (bottomY <= 0 || scrollLayoutHeightRef.current <= 0) return;
      const visibleBottomEdge = scrollLayoutHeightRef.current - keyboardH;
      const screenBottom = bottomY - scrollOffsetYRef.current;
      // 見える範囲の下（鍵盤の上端）より下 ＝ 鍵盤の裏。0 未満 ＝ 上へスクロールして通り過ぎた
      const hidden = screenBottom > visibleBottomEdge || screenBottom < 0;
      setVisible(hidden);
    },
    [],
  );

  const evaluateAllVisibility = useCallback(
    (keyboardH: number) => {
      evaluateVisibility(cardTopRef.current + breakdownBottomRef.current, keyboardH, (hidden) =>
        setBreakdownStickyVisible((current) => (current === hidden ? current : hidden)),
      );
      evaluateVisibility(targetSectionBottomRef.current, keyboardH, (hidden) =>
        setTargetStickyVisible((current) => (current === hidden ? current : hidden)),
      );
    },
    [evaluateVisibility],
  );

  /**
   * 手でスクロールしても、鍵盤に押されて自動で運ばれても同じ判定を通る ──
   * KeyboardAwareScrollView の自動スクロールも中身は実際の scrollTo で、
   * native の onScroll がそのまま発火する。
   */
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      scrollLayoutHeightRef.current = event.nativeEvent.layoutMeasurement.height;
      evaluateAllVisibility(keyboardHeight);
    },
    [evaluateAllVisibility, keyboardHeight],
  );

  /**
   * **鍵盤の高さが変わっただけ**（スクロール量そのものは動かない）でも判定をやり直す ──
   * 上のコメントのとおり、結果のすぐ上の欄を打っているときはこれが起きる唯一の道になる。
   */
  useEffect(() => {
    evaluateAllVisibility(keyboardHeight);
  }, [keyboardHeight, evaluateAllVisibility]);
  /** 「今日」はマウント時に 1 回だけ決める（日付欄の「今日（…）」の基準） */
  const [today] = useState(() => new Date());

  const [costsOpen, setCostsOpen] = useState(false);
  /**
   * 伝票の帯の下の「内訳」（計算タブの利益側と同じ初期状態で畳んでおく）。
   * 目標の節の「内訳と計算のしかた」とは別に持つ ── 中身が別ものなので、
   * 片方を開いたらもう片方も開く、という繋がりに意味がない
   */
  const [receiptBreakdownOpen, setReceiptBreakdownOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  /**
   * 目標利益の節（SPEC-V9 §2）。**開いた状態から始めない** ── 目標は任意で、
   * 決めない記録の方が多い。畳んであっても見出しの右に「決めていません」か金額が出る
   */
  const [targetOpen, setTargetOpen] = useState(false);
  /**
   * 逆算の「内訳と計算のしかた」（案 A）。**節が開いても、この中はまだ畳んでおく** ──
   * 知りたいのは必要な販売価格そのもので、根拠まで読みたい人だけが開く
   * （計算タブの逆算モードと同じ初期状態）。
   */
  const [targetBreakdownOpen, setTargetBreakdownOpen] = useState(false);
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
  const title = record == null || record.itemName === '' ? newRecordTitle(locale) : editRecordTitle(locale);

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
   *
   * プリセットの率は PRESET_RATE_MAX（100%）まで登録できるが、この欄の Stepper は
   * MAX_COMMISSION（50%）までしか動かせない。上限が食い違ったまま代入すると、
   * 手数料 100% の記録で `1 - commission/100` が 0 になり、逆算価格が Infinity/NaN に
   * 化けてスライダーのレイアウト値まで壊れる（sliderGeometry.markLeft）。
   * ここで Stepper の範囲に収める。
   */
  const selectSite = (preset: Preset) => {
    const commission = Math.min(Math.max(preset.value, MIN_COMMISSION), MAX_COMMISSION);
    setValues((current) => ({ ...current, commission, siteName: preset.name }));
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
   * 送料タグの「✕」（選択解除）。値だけでなく、選んだプリセットが置いた資材費の控えも
   * 一緒に戻す ── 送料欄だけ空にしても、資材費が残っていると伝票の合計が食い違う。
   */
  const clearShipping = () => {
    setValues((current) => ({
      ...current,
      postage: '',
      shippingMaterialCost: 0,
      excludesShippingMaterial: false,
      // 名前の写しも一緒に外す（0012）。額だけ消して名前が残ると、
      // 空欄の行に薄いバッジ（rate-changed）が出たままになる
      shippingName: '',
    }));
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

  /**
   * 親（RecordFormSheet）の Modal.onRequestClose（Android の戻るボタン・iOS のスワイプ払い）から
   * `handleCancel` を呼べるよう、毎描画で最新の関数を書き込む。キャンセルボタンを押したのと
   * 同じ経路を通す ── 確認ダイアログを増やすものではない（SPEC §5.3 のまま）。
   */
  useEffect(() => {
    handleCancelRef.current = handleCancel;
    return () => {
      handleCancelRef.current = null;
    };
  });

  /**
   * 商品名の欄を画面に入れて、そのまま打てるようにする。
   *
   * 保存ボタンは ScrollView の**外**（固定ヘッダ）にあり、赤枠と警告は**中**にある。
   * 下まで送った状態で保存を押すと、変わったところが画面の外なので
   * 「押しても反応しない」ように見える ── だから欄の方を連れてくる。
   */
  const focusItemName = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, cardTopRef.current + itemNameTopRef.current - ITEM_NAME_SCROLL_MARGIN),
      animated: true,
    });
    // 鍵盤まで出して、戻ってきた指がそのまま打てるようにする
    itemNameInputRef.current?.focus();
  };

  const handleSave = () => {
    setIsPushedSave(true);
    // 商品名が空なら早期 return。シートは閉じず、DB にも書き込まない（SPEC §5.2）。
    // ここで片づけないのは、まだ編集の途中だから（選んだ写真は残す）
    if (!canSave(values)) {
      focusItemName();
      return;
    }

    const newlyCompleted = saveRecord(record?.id ?? null, toSaveInput(values));
    showAchievementToast(newlyCompleted);
    // 保存が成立した「落ち着いた瞬間」にレビューを頼めるか見てもらう（docs/DESIGN-REVIEW-PROMPT.md）。
    // 出すかどうかも、いつ出すかも向こうが決めるので、ここは起きたことを渡すだけ。
    // **純利益は売れた記録のときだけ渡す** ── 出品中はまだ利益という値が無い
    // （0 として渡すと、出品しただけで発火点になってしまう）
    requestReviewAfterSave({
      newlyCompletedCount: newlyCompleted.length,
      netProfit: values.isSold ? netProfit(toCostInput(values)) : null,
    });
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
  /**
   * 逆算の結果ぜんぶ（必要販売価格・帯・説明文・式）。**目標を決めていないときは null。**
   *
   * 逆算は「目標をいくらにするか」を起点にする計算なので、決めていない状態では
   * 出す額がない ── 0 で代用すると「目標 0 円（＝赤字にならなければよい）」を
   * 決めた人と同じ額が、決めていない人の画面にも出てしまう（§1.2 の区別）。
   *
   * **作るのは計算タブと同じ `requiredPriceResult` 1 本**（UI-SPEC §1.1-3b）で、
   * 経費はいま伝票に載っている値をそのまま使う。`RecordFormValues` は
   * `CalcFormValues` の項目を全部持つので、この画面の値をそのまま渡せる。
   */
  const required = targetProfit == null ? null : requiredPriceResult(locale, values);
  /**
   * 「入れる」を押す意味があるか。**既に同じ額が入っているときは無効にする** ──
   * 押しても何も変わらないボタンは、押し方を間違えたのかと読ませてしまう。
   */
  const canApplyRequiredPrice = required != null && required.requiredPrice !== costs.salesPrice;
  /**
   * どちらのスティッキーバーを出すか（同時に 2 段重ねない）。
   * 目標欄にカーソルがあり、かつ目標の節が画面の外に出ていれば目標側を優先し、
   * 伝票の帯はそのときだけ黙らせる（breakdownStickyVisible 自体は動いたままでよい ──
   * 表示するかどうかだけをここで絞る）。
   */
  const showTargetSticky = targetInputFocused && targetStickyVisible && required != null;
  const showProfitSticky = breakdownStickyVisible && !showTargetSticky && !itemNameFocused;
  /**
   * 伝票の帯グラフと内訳の材料（計算タブの利益側と同じ `costBreakdown`）。
   *
   * **レコード詳細のレシートは行の左に色ドットを付けて凡例を省いている**
   * （components/RecordBreakdownBar の冒頭）が、この伝票では採れなかった ──
   * 手数料の行にはタグボタンと ± が並んでいて、ドットのぶん（22pt）行名を字下げすると
   * 額の幅が足りず「300 円」が 2 行に折り返す。詳細のレシートは読むだけの行なので収まる。
   * ここは計算タブと同じく、帯の下に畳んだ内訳を置く形にする。
   */
  const breakdown = costBreakdown(locale, costs, values.kind);
  const hasError = isPushedSave && !canSave(values);

  // 日付欄は「今日」だけ青くして、既定値のまま出していることが分かるようにする（UI-SPEC §1.3-12）
  const dateText = (value: Date) =>
    daysBetween(value, today) === 0
      ? todayDateLabel(locale, formatRecordDate(locale, value))
      : formatRecordDate(locale, value);
  // 畳んだ見出しに出すのは、その状態で意味を持つほうの日付（出品中に販売日はない）
  const primaryDate = values.isSold ? values.saleDate : values.saleStartDate;
  // 出品日をこのフォームで動かせるので、範囲と「選べない理由」は入力中の出品日から引き直す（§8.5）
  const soldDateRange = saleDateRange(values.saleStartDate, today);
  const soldDateNoteText = soldDateNotes(locale, values.saleStartDate, today);

  return (
    /* 鍵盤の逃がしは**この器ではなく下の KeyboardAwareScrollView が持つ**（旧 KeyboardAvoidingView）。
       器に padding を足す形は、伝票を縮めるだけでフォーカス中の欄を運んでこない ──
       縮んだ先より下にあった欄（梱包材・その他・目標）はそのまま鍵盤の裏に残る。

       上端の余白は**この面の安全域**（上の SafeAreaProvider が実測した値）。iOS の pageSheet では
       0 に近い値、Android の全画面ではステータスバーぶんが入る。足していなかったので、
       Android では「キャンセル / 保存」がステータスバーと重なり、当たり判定の上半分を
       システム側に取られていた。 */
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 1. シートハンドル（UI-SPEC §1.3-1）。Modal は掴んで下げられないので、
          「下から出た一時的な面」であることを示す飾りとして置く */}
      <View style={styles.grabberArea}>
        <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
      </View>

      {/* 2. シートヘッダ（UI-SPEC §1.3-2） */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={handleCancel} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.headerButton, { color: colors.blue }]}>{cancelLabel(locale)}</Text>
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
            {saveLabel(locale)}
          </Text>
        </Pressable>
      </View>

      {/* 3. 伝票の本体。**鍵盤の逃がしはここ 1 か所**（KeyboardAwareScrollView）──
          鍵盤ぶんの余白を下に足したうえで、フォーカス中の欄が隠れていればその欄まで
          スクロールする。iOS / Android で同じ 1 本を通る。
          `bottomOffset` は欄の下に残す余白。0 だと欄が鍵盤の上端にぴったり張り付き、
          NumericField の行（高さ 60pt）の下線と鍵盤の境目が重なって読みにくい */}
      {/* 帯のスティッキーバー（下）を絶対配置で重ねる器。ヘッダの下・鍵盤の上に固定される。
          onLayout は見える範囲の高さを測るためだけ（scrollLayoutHeightRef）── 一度も
          スクロールしていない間（onScroll がまだ 1 回も来ていない間）でも、鍵盤の高さの
          変化だけで判定できるようにする（evaluateBreakdownVisibility 参照） */}
      <View
        style={styles.scrollWrapper}
        onLayout={(event) => {
          scrollLayoutHeightRef.current = event.nativeEvent.layout.height;
        }}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        bottomOffset={KEYBOARD_BOTTOM_OFFSET + (memoFocused ? MEMO_KEYBOARD_EXTRA : 0)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={handleScroll}
        scrollEventThrottle={16}>
        {/* 4〜11. 伝票カード。見出し行 → 商品名 → 種別 → 金額の積み上げ → 結果行 */}
        <View
          style={[styles.card, { backgroundColor: colors.secondaryBackground }]}
          onLayout={(event) => {
            cardTopRef.current = event.nativeEvent.layout.y;
          }}>
          <StatusHeaderRow isSold={values.isSold} colors={colors} onToggle={toggleStatus} />

          {/* 4. 商品名（22px のインライン入力）。必須なのはこの欄だけ（SPEC §5.2）。
              **左に写真の正方形**（SPEC-V5 §3.1）── 写真は任意で付けない記録の方が多いので、
              専用の 1 段を取らず商品名の横に畳む。並びは一覧の行・詳細と同じ「写真が左」。
              包んでいる View は**位置を測るためだけ**（保存できなかったときの戻り先）。
              カードの gap から見れば PhotoField 1 つと同じ 1 要素なので、見た目は変わらない */}
          <View
            onLayout={(event) => {
              itemNameTopRef.current = event.nativeEvent.layout.y;
            }}>
            <PhotoField fileName={values.photoFileName} onChange={changePhoto}>
              <TextInput
                ref={itemNameInputRef}
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
                onFocus={() => setItemNameFocused(true)}
                onBlur={() => setItemNameFocused(false)}
                placeholder={itemNamePlaceholder(locale)}
                placeholderTextColor={colors.mutedLabel}
                accessibilityLabel={itemNameLabel(locale)}
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
                {hasError ? itemNameRequiredMessage(locale) : itemNameCaption(locale)}
              </Text>
            </PhotoField>
          </View>

          {/* 5. 種別セレクタ。商品名の直下・金額の積み上げの直前（UI-SPEC §6-6 / 決定 §9-3） */}
          <RecordKindSelector kind={values.kind} onChange={updateKind} />

          {/* 6. 販売価格。伝票の一番上で、ここから下へ引いていく */}
          <NumericField
            label={salesPriceLabel(locale)}
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
              label={deductionLabel(locale, purchasePriceLabel(locale))}
              // 電卓の見出しは「− 仕入価格の計算」ではなく「仕入価格の計算」（UI-SPEC §7.1）
              calculatorLabel={purchasePriceLabel(locale)}
              value={values.purchasePrice}
              onChangeValue={(value) => update('purchasePrice', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
            />
          )}

          {/* 8. 送料 */}
          <NumericField
            label={deductionLabel(locale, postageLabel(locale))}
            calculatorLabel={postageLabel(locale)}
            value={values.postage}
            onChangeValue={(value) => update('postage', value)}
            rowHeight={RECEIPT_ROW_HEIGHT}
            valueStyle={[styles.deductionValue, { color: colors.red }]}
            // 送料はプリセットから選べる（SPEC-V3 §4.2）
            presetType="shipping"
            // **バッジは保存した名前で引く**（0012）── 額の逆引きだと、同じ額の
            // プリセットが 2 件あるときに並び順で先の 1 件が勝ち、選んだものと
            // 違う札が出る。写しを持たない記録（この列より前・手入力）は
            // undefined になり、従来どおり額の逆引きに落ちる
            selectedPresetName={presetNameForLookup(values.shippingName)}
            // **選んだ行そのものを受け取る**（SPEC-V6 §3）── 欄に入るのは送料と専用資材の
            // 合計で、資材費の控えも記録に持つ必要があるため、値の書き戻しだけでは足りない
            onSelectPreset={selectShipping}
            // 「✕」も同じ理由で専用の処理に差し替える（値を空にするだけでは資材費の控えが残る）
            onClearPreset={clearShipping}
            // このフォームは RN の Modal なので、設定タブへ遷移してもその裏に積まれる。
            // 押しても何も起きないように見えるリンクは出さない（PresetPickerSheet 参照）
            canOpenSettings={false}
          />

          {/* 9. 手数料。他の行と違って入れるのは「率」で、伝票に載るのはそこから出た「額」。
              率の ± は行名と額の間に置き、行の形（左が名前・右が金額）を崩さない。
              ラベルは「手数料」の固定長にし、率は ± の中央（決定 §7-13）── 計算タブと同じ理由で、
              率をラベルに混ぜると桁数が変わったとき（100% 等）に折り返す */}
          <View style={[styles.commissionRow, { height: RECEIPT_ROW_HEIGHT }]}>
            <Text style={[styles.rowLabel, { color: colors.label }]} numberOfLines={1}>
              {deductionLabel(locale, commissionShortLabel(locale))}
            </Text>
            {/* タグボタンはラベルの直後（SPEC-V3 §4.4 / 設計案 29b）。± はそのまま残す */}
            <PresetTagButton
              type="site"
              value={values.commission}
              // バッジは率ではなく選んだ名前で決まる（§1.5.1）。手で率を変えても札は残る
              selectedName={values.siteName}
              onSelect={selectSite}
              // SiteNameRow の「✕」と同じ処理。消えるのは名前だけで率は残る
              onClear={() => update('siteName', '')}
              canOpenSettings={false}
            />
            <StepperButtons
              value={values.commission}
              minimumValue={MIN_COMMISSION}
              maximumValue={MAX_COMMISSION}
              onChangeValue={(value) => update('commission', value)}
              // 読み上げは率込みの語のまま（ラベルを縮めても情報量は落とさない。Stepper.tsx と同じ理由）
              accessibilityLabel={commissionFieldLabel(locale, values.commission)}
              centerLabel={commissionRateLabel(locale, values.commission)}
            />
            {/* 額は右寄せ。ラベルとタグボタンの幅が変わっても、他の行と右端が揃う。
                率を ± の中央に持たせた分だけ行の必要幅が伸びたので、狭い端末・高額な記録
                （率50%・数万円）が重なったときの保険として 1 行に固定する。
                ただし省略記号で額そのものが読めなくなるのは避けたいので、ResultAmountBlock
                と同じく adjustsFontSizeToFit で縮めて 1 行に収める（折り返さない・切らない）*/}
            <Text
              style={[styles.commissionValue, styles.deductionValue, { color: colors.orange }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {formatYen(locale, commissionCost(costs))}
            </Text>
          </View>

          {/* 9a. 選んだ販売サイトの名前（SPEC-V3 §1.5.1）。手数料行の直下に 1 行。
              未設定なら行ごと出ないので、通常の伝票の高さは変わらない */}
          <SiteNameRow siteName={values.siteName} onClear={() => update('siteName', '')} />

          {/* 10. 梱包材・その他。畳んだ状態では「未入力」か合計だけを出す（UI-SPEC §1.3-10） */}
          <CollapsibleSection
            label={additionLabel(locale, envelopeAndOthersFieldLabel(locale))}
            tone="link"
            expanded={costsOpen}
            onToggle={() => setCostsOpen((open) => !open)}
            trailing={
              <Text
                style={[
                  styles.packingSummary,
                  { color: packingCost === 0 ? colors.mutedLabel : colors.red },
                ]}>
                {packingCost === 0 ? unsetInputLabel(locale) : formatYen(locale, packingCost)}
              </Text>
            }>
            <NumericField
              label={envelopeCostLabel(locale)}
              value={values.envelopeCost}
              onChangeValue={(value) => update('envelopeCost', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
              // 梱包材プリセットを積める先はこの欄だけ（§4.5。MiniCalculator 参照）
              canPickPackaging
            />
            <NumericField
              label={othersCostLabel(locale)}
              value={values.othersCost}
              onChangeValue={(value) => update('othersCost', value)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.red }]}
              canOpenSettings={false}
            />
          </CollapsibleSection>

          {/* 11. 結果行 ＋ 帯。太い線から下が「引き終わったあと」（UI-SPEC §1.3-11）。
              **この 3 つを 1 つの View で包む**のは、下端の y を測るため（onLayout）──
              帯が鍵盤や画面の外に出たら、上端にスティッキーバーで同じ結果を出す
              （breakdownBottomRef。handleScroll 参照）。カードの gap（10）を失うぶんは
              wrap 側の gap で埋め直す */}
          <View
            style={styles.breakdownGroup}
            onLayout={(event) => {
              breakdownBottomRef.current =
                event.nativeEvent.layout.y + event.nativeEvent.layout.height;
              // 梱包材・その他の折りたたみでこの領域の高さ自体が変わることがあり、
              // スクロールも鍵盤の高さも動かないまま古い下端で判定され続けることがある
              evaluateAllVisibility(keyboardHeight);
            }}>
            <View style={[styles.totalSeparator, { backgroundColor: colors.separator }]} />
            <View style={styles.resultRow}>
              {/* 1 件を指すので種別語（SPEC-V2 §5.3） */}
              <Text style={[styles.resultLabel, { color: colors.label }]}>
                {profitLabel(locale, values.kind)}
              </Text>
              <Text style={[styles.resultAmount, { color: profit >= 0 ? colors.green : colors.red }]}>
                {formatYen(locale, profit)}
              </Text>
            </View>

            {/* 11b. 同じ 1 件を横の割合で見せる帯（計算タブの利益側と同じ CostProportionBar）。
                **結果行の下**に置く ── 伝票は上から下へ引いていって結果に着く流れなので、
                その要約を流れの手前に挟まない。計算タブも「結果 → 帯」の順で並べている。
                各区画の色は、上の行のドットと同じ（partColor が両方の色を決める） */}
            <CostProportionBar
              parts={breakdown.parts}
              kept={breakdown.kept}
              deducted={breakdown.deducted}
            />
          </View>

          {/* 11c. 内訳（計算タブの利益側と同じ BreakdownPartList）。**畳んだ状態から始める** ──
              伝票の行を読めば金額は分かるので、開くのは帯のどの色がどの項目かを
              確かめたいときだけ。売上総額の行は出す（伝票の販売価格は入力中の文字列で、
              こちらは帯の全長にあたる丸めた額）*/}
          <CollapsibleSection
            label={breakdownLabel(locale)}
            tone="link"
            align="center"
            expanded={receiptBreakdownOpen}
            onToggle={() => setReceiptBreakdownOpen((open) => !open)}>
            <BreakdownPartList breakdown={breakdown} showSalesRow />
          </CollapsibleSection>
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

        {/* 11d. 目標利益（SPEC-V9 §2）。**伝票カードの外**に置く ──
            目標は売買で実際に動いた金額ではなく「こうしたい」という値なので、
            引き算の積み上げ（販売価格 → 経費 → 利益）の中に混ぜると、
            伝票の縦の足し算に入る額に見えてしまう。

            **空欄は「¥0」ではなく「決めていません」と出す**（§2）── 0 は
            「赤字にならなければよい」という目標そのもので、決めていない状態とは別のもの。
            金額として書くと、決めた覚えのない目標が記録に出ることになる */}
        <View
          style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}
          // 目標の節の下端（絶対位置）。伝票カードの外の直接の子なので、そのまま使える
          // （targetSectionBottomRef のコメント参照）
          onLayout={(event) => {
            targetSectionBottomRef.current =
              event.nativeEvent.layout.y + event.nativeEvent.layout.height;
            // **ここが要る**: 目標を打つと RequiredPriceBlock が生えてこの節の高さが伸びる。
            // スクロールも鍵盤の高さも動かないので、他の 2 つの再判定（handleScroll・
            // keyboardHeight の effect）だけでは古い下端のまま判定され続けてしまう
            evaluateAllVisibility(keyboardHeight);
          }}>
          <CollapsibleSection
            label={targetProfitLabel(locale, values.kind)}
            tone="link"
            expanded={targetOpen}
            onToggle={() => setTargetOpen((open) => !open)}
            trailing={
              <Text
                style={[
                  styles.packingSummary,
                  { color: targetProfit == null ? colors.mutedLabel : colors.green },
                ]}>
                {targetProfitSummary(locale, targetProfit)}
              </Text>
            }>
            <NumericField
              label={targetProfitLabel(locale, values.kind)}
              value={values.targetProfit}
              onChangeValue={(value) => update('targetProfit', value)}
              // 他の金額欄の placeholder は "0"（未入力＝0 円）だが、この欄の空欄は
              // 0 ではない。placeholder にも 0 を出さない
              placeholder={targetProfitUnsetLabel(locale)}
              rowHeight={RECEIPT_ROW_HEIGHT}
              valueStyle={[styles.deductionValue, { color: colors.green }]}
              canOpenSettings={false}
              onFocus={() => setTargetInputFocused(true)}
              onBlur={() => setTargetInputFocused(false)}
            />

            {/* 11e. 逆算（「その目標なら、いくらで売ればよいか」）。
                **目標を決めたときだけ、この節の中に生える。**

                計算タブへ値を持っていく形は採らなかった ── あちらが「新規の計算」と
                「特定の記録の編集」の 2 つの状態を持つことになり、抜け忘れると
                次に開いたときも前の記録が紐付いたままになる。逆算に要る材料
                （目標・経費・手数料）はこのフォームが全部持っているので、
                **編集の途中で開いた面から出ずに完結する**ほうが道が 1 本で済む。

                **押すまで販売価格は変わらない。** 目標を打っている最中に欄が
                動きはじめると、自分で入れた販売価格が消えたように見える */}
            {required != null && (
              <>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                {/* 計算タブの逆算モードと**同じ部品**（components/RequiredPriceBlock）。
                    結果 → 帯グラフ → 説明文 → 内訳と計算のしかた の 4 段が丸ごと入る ──
                    同じ式の同じ答えなのに、画面によって根拠の読み方が変わっては困る。
                    「この値段で出せばよい」まで来て初めて、下のボタンが何を入れるのか読める */}
                <RequiredPriceBlock
                  result={required}
                  expanded={targetBreakdownOpen}
                  onToggleBreakdown={() => setTargetBreakdownOpen((open) => !open)}
                />
                <Pressable
                  onPress={() => update('salesPrice', String(required.requiredPrice))}
                  disabled={!canApplyRequiredPrice}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canApplyRequiredPrice }}
                  style={({ pressed }) => [
                    styles.applyRequiredPriceButton,
                    {
                      backgroundColor: canApplyRequiredPrice
                        ? colors.blue
                        : colors.disabledBackground,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.applyRequiredPriceLabel,
                      { color: canApplyRequiredPrice ? '#FFFFFF' : colors.disabledContent },
                    ]}>
                    {applyRequiredPriceLabel(locale)}
                  </Text>
                </Pressable>
              </>
            )}
          </CollapsibleSection>
        </View>

        {/* 12. 日付カード（折りたたみ）。畳んだままでも操作対象の日付が読める */}
        <View style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}>
          <CollapsibleSection
            label={dateSectionLabel(locale, values.isSold, dateText(primaryDate))}
            expanded={datesOpen}
            onToggle={() => setDatesOpen((open) => !open)}>
            {/* 販売日は売却済みのときだけ（SPEC.md §3.2）。伝票の主役に近い順で販売日が先。
                選べるのは [出品日, 今日]（§8.5）。範囲外の保存済みの値はそのまま表示し、
                ピッカーを開いたときに範囲へ寄せる */}
            {values.isSold && (
              <DateField
                label={soldDateFieldLabel(locale)}
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
              label={listedDateFieldLabel(locale)}
              value={values.saleStartDate}
              onChangeValue={(value) => update('saleStartDate', value)}
              today={today}
              valueText={dateText(values.saleStartDate)}
              accent={daysBetween(values.saleStartDate, today) === 0}
              maxDate={today}
              note={listedDatePickerNote(locale)}
            />
          </CollapsibleSection>
        </View>

        {/* 13. メモ（折りたたみ） */}
        <View style={[styles.card, styles.foldedCard, { backgroundColor: colors.secondaryBackground }]}>
          <CollapsibleSection
            label={memoSectionLabel(locale, values.memo)}
            expanded={memoOpen}
            onToggle={() => setMemoOpen((open) => !open)}>
            <TextInput
              style={[styles.memoInput, { color: colors.label, borderColor: colors.separator }]}
              value={values.memo}
              onChangeText={(value) => update('memo', value)}
              multiline
              // 複数行だけ逃がし方が違う（MEMO_KEYBOARD_EXTRA）。離れたら元の余白に戻す
              onFocus={() => setMemoFocused(true)}
              onBlur={() => setMemoFocused(false)}
              accessibilityLabel={memoLabel(locale)}
            />
          </CollapsibleSection>
        </View>
      </KeyboardAwareScrollView>

      {/* スティッキーバーは 2 種類のうちどちらか 1 つだけ（同時に 2 段重ねない）。
          **目標欄を打っている間は目標側を優先する** ── 目標は伝票よりさらに下にあるので、
          目標を打っているときは伝票の帯もほぼ必ず画面の外に出ているが、
          いま読みたいのは「その目標なら何円で出せばよいか」の方 */}
      <StickyBreakdownBar
        visible={showProfitSticky}
        label={profitLabel(locale, values.kind)}
        amount={formatYen(locale, profit)}
        amountColor={profit >= 0 ? colors.green : colors.red}
        breakdown={breakdown}
        colors={colors}
      />
      {/* 目標のスティッキーバー（今回の追加）。**目標欄にカーソルがある間だけ**出す ──
          スクロールだけで出すと、伝票の帯と同じ場面（目標より下の欄を打っているだけ）でも
          出てしまい、「いま何を打っているか」と表示が噛み合わなくなる。
          中身は RequiredPriceBlock の上 2 段（結果 → 帯）と同じ部品をそのまま使う ──
          同じ式の同じ答えなのに、畳んだ形で根拠の読み方が変わっては困る */}
      {required != null && (
        <StickyTargetBar visible={showTargetSticky} result={required} colors={colors} />
      )}
      </View>

      {/* 鍵盤の上に固定する決定ボタン（鍵盤を閉じるだけ）。
          「鍵盤を消そうとして違う場所を押し、触りたくない部分に触れてしまう」事故を防ぐため、
          鍵盤の真上に安全な閉じどころを常に置く。前後の欄への移動は出さない ──
          需要が薄いわりに、欄の順序次第で変な移動をする不具合の芽になりやすい */}
      {/* opacity="00" ─ ツールバー本体の地色（鍵盤の幅いっぱいの帯）を消す。
          「決定」ボタン 1 個だけのために横いっぱいの帯を敷く理由が無い ──
          ボタンだけが鍵盤の上に浮くように見せる */}
      <KeyboardToolbar theme={KEYBOARD_TOOLBAR_THEME} opacity="00">
        <KeyboardToolbar.Done button={KeyboardToolbarDoneButton}>
          <Text style={styles.keyboardToolbarDoneButtonText}>
            {keyboardToolbarDoneLabel(locale)}
          </Text>
        </KeyboardToolbar.Done>
      </KeyboardToolbar>

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
    </View>
  );
}

/**
 * 決定ツールバーの「決定」ボタンの見た目（KeyboardToolbar.Done の `button` 差し替え）。
 *
 * 既定は下線もふちも無いただの青文字なので、鍵盤の上という目立つ場所にあっても
 * 「押せるボタン」だと気づきにくい。iOS の角丸ボタンのように、ふちと丸みを付けて
 * 押せることを見た目で示す。
 */
function KeyboardToolbarDoneButton({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: {
  children?: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint: string;
  testID: string;
  style?: object;
}) {
  const colors = useThemeColors();
  const tint =
    useColorScheme() === 'dark' ? KEYBOARD_TOOLBAR_DONE_TINT.dark : KEYBOARD_TOOLBAR_DONE_TINT.light;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.keyboardToolbarDoneButton,
        {
          borderColor: colors.blue,
          backgroundColor: tint,
          opacity: pressed ? 0.5 : 1,
        },
      ]}>
      {children}
    </Pressable>
  );
}

/**
 * 帯（CostProportionBar）のスティッキーバー。結果の帯が画面の外（鍵盤の裏を含む）に
 * 出ている間だけ、上端に同じ結果を出す。計算タブの StickyResultBar と同じ考え方だが、
 * こちらは押しても何も開閉しない（読むだけの帯。CollapsibleSection の状態は伝票側にしか無い）。
 */
function StickyBreakdownBar({
  visible,
  label,
  amount,
  amountColor,
  breakdown,
  colors,
}: {
  visible: boolean;
  label: string;
  amount: string;
  amountColor: string;
  breakdown: CostBreakdown;
  colors: ThemeColors;
}) {
  // Animated.Value はマウント中ずっと同じインスタンスを使う（計算タブの StickyResultBar と同じ理由）
  const [progress] = useState(() => new Animated.Value(0));
  // スライドの距離は実測値を使う（帯の高さは端末幅で変わる）
  const [barHeight, setBarHeight] = useState(FALLBACK_STICKY_BREAKDOWN_HEIGHT);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: STICKY_BREAKDOWN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return (
    <Animated.View
      // 読むだけの帯で押せる要素を持たない。常に 'none' にして、下のスクロールへの
      // タッチをふさがない（フェードで opacity: 0 の間だけ透明の当たり判定が残るのを避ける）
      pointerEvents="none"
      onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
      style={[
        styles.stickyBreakdownBar,
        {
          backgroundColor: colors.barBackground,
          borderBottomColor: colors.separator,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-barHeight, 0],
              }),
            },
          ],
        },
      ]}>
      <View style={styles.stickyBreakdownTopRow}>
        <Text style={[styles.stickyBreakdownLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.stickyBreakdownAmount, { color: amountColor }]} numberOfLines={1}>
          {amount}
        </Text>
      </View>
      <CostProportionBar parts={breakdown.parts} kept={breakdown.kept} deducted={breakdown.deducted} />
    </Animated.View>
  );
}

/**
 * 目標のスティッキーバー（今回の追加）。**RequiredPriceBlock の上 2 段（結果 → 帯）と
 * 同じ部品をそのまま並べる**（式・見た目を 2 か所で別々に持たない）。
 * 内訳の折りたたみ・「入れる」ボタンはここに複製しない ── スティッキーは読むだけの帯で、
 * 操作は元の節（下にある本体）まで戻ってからしてもらう。
 */
function StickyTargetBar({
  visible,
  result,
  colors,
}: {
  visible: boolean;
  result: RequiredPriceResult;
  colors: ThemeColors;
}) {
  const locale = useLocale();
  // Animated.Value はマウント中ずっと同じインスタンスを使う（StickyBreakdownBar と同じ理由）
  const [progress] = useState(() => new Animated.Value(0));
  const [barHeight, setBarHeight] = useState(FALLBACK_STICKY_BREAKDOWN_HEIGHT);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: STICKY_BREAKDOWN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
      style={[
        styles.stickyBreakdownBar,
        {
          backgroundColor: colors.barBackground,
          borderBottomColor: colors.separator,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-barHeight, 0],
              }),
            },
          ],
        },
      ]}>
      <ResultAmountBlock
        caption={requiredPriceHeadline(locale)}
        amount={formatYen(locale, result.requiredPrice)}
        amountColor={colors.blue}
      />
      <CostProportionBar parts={result.parts} kept={result.kept} deducted={result.deducted} />
    </Animated.View>
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
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={styles.tagSection}>
      <View style={styles.tagSectionHeader}>
        <Text style={[styles.tagSectionLabel, { color: colors.label }]}>{tagLabel(locale)}</Text>
        <Pressable
          onPress={onOpenPicker}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tagPickerOpenLabel(locale)}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={[styles.tagAddLabel, { color: colors.blue }]}>{tagAddLabel(locale)}</Text>
        </Pressable>
      </View>

      {tags.length === 0 ? (
        <Text style={[styles.tagEmptyLabel, { color: colors.mutedLabel }]}>
          {tagFieldEmptyLabel(locale)}
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
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const statusColor = isSold ? colors.green : colors.orange;

  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabel}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {isSold ? soldRecordsLabel(locale) : listingStatusLabel(locale)}
        </Text>
      </View>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text style={[styles.statusSwitch, { color: colors.blue }]}>
          {switchStatusLabel(locale, !isSold)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardToolbarDoneButton: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  keyboardToolbarDoneButtonText: {
    fontSize: 17,
  },
  // KeyboardAwareScrollView と StickyBreakdownBar を重ねて置くための器。
  // absolute の子は親の position 指定に関わらずこの View 基準で置かれる（RN の仕様）ので
  // 特別なスタイルは要らないが、他の絶対配置と紛れないよう名前を分けている
  scrollWrapper: {
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
  applyRequiredPriceButton: {
    // 「いくらで売る？」の書き換えボタン（52px）より低い ── あちらは画面の主役の操作、
    // こちらは折りたたみの中の 1 手なので、カードの行の高さに寄せる
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  applyRequiredPriceLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  // 結果行・帯をまとめる器。カードの gap（10）が効かなくなる分をここで肩代わりする
  // （breakdownBottomRef で y を測るために 3 つを 1 つの View に包んだ。JSX 側のコメント参照）
  breakdownGroup: {
    gap: 10,
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
    // 高さを変えたら MEMO_MIN_HEIGHT も直すこと（鍵盤の逃がしの計算に入る）
    minHeight: MEMO_MIN_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  // 帯のスティッキーバー（計算タブの stickyBar と同じ形。§8.6 の外の追加）
  stickyBreakdownBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickyBreakdownTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  stickyBreakdownLabel: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  stickyBreakdownAmount: {
    fontSize: 22,
    fontWeight: '700',
  },
});
