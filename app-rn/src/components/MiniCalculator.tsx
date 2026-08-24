// 電卓（UI-SPEC §7）。MiniCalc.swift（MiniCalculatorView）の後継。
//
// §7 のねらいは「1 回きりの計算しかできない電卓を**計算メモ**にする」こと。
// 「箱 120 ＋ 緩衝材 40 ＋ テープ 15」と積み上げてから、その合計だけを欄へ返す。
//
// 旧版（幅 280px のポップオーバー・`C` と `=`・オレンジの演算子キー）からの変更点は §7.1 の表のとおり:
// - 画面中央のカード → **下から出るシート**（他のシートと同じ形。CalendarPicker / OptionSheet）
// - 見出しは行き先を明示（「梱包材の計算」）。左上「閉じる」
// - 記号は `×` `÷`（`*` `/` は画面に出さない）。演算子キーは青（電卓からオレンジを廃止）
// - `C` → `AC`（全消去）と `⌫`（1 手戻す）の 2 キー。`=` は行の結果が常に出るので廃止
//
// **確定（「決定」）は下端のフッター**（§7.1 の改訂。実機の指摘を受けた 2026-08-24 の差し替え）。
// 一度は右上のテキストリンクに移していたが、**ここから開く梱包材シート
// （PresetMultiPickerSheet）の確定が下端の塗りボタン**で、同じ語なのに往復すると
// 上下に飛んでいた。合計行をそのままフッターにして、あちらと同じ形に揃えてある。
//
// 行の積み上げ・合計・確定の可否はすべて logic/calcMemo.ts の純粋関数が持つ。
// この画面が持つのは並び（4 列 × 4 行）と見た目だけで、式も合計もここでは組み立てない。
// 表示語は labels.ts 経由（§0）。記号 → `*` `/` の変換は logic/calculator.ts に閉じる（§7.6）。
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { PresetBadge } from '@/components/PresetBadge';
import { PresetMultiPickerSheet } from '@/components/PresetMultiPickerSheet';
import { SheetModal } from '@/components/SheetModal';
import {
  appendDigit,
  appendPresetRows,
  appendOperator,
  backspace,
  clearAll,
  commitRow,
  evaluateDraft,
  memoRows,
  memoTotal,
  memoTotalText,
  removeRow,
  rowResultText,
  submitBlockedReason,
  type CalcMemo,
  type CalcMemoRow,
} from '@/logic/calcMemo';
import { formatCalcTotal } from '@/logic/format';
import {
  calcAddRowLabel,
  calcBackspaceA11yLabel,
  calcClearAllA11yLabel,
  CALC_KEY_BACKSPACE,
  CALC_KEY_CLEAR_ALL,
  CALC_KEY_DIVIDE,
  CALC_KEY_EQUALS,
  CALC_KEY_MINUS,
  CALC_KEY_MULTIPLY,
  CALC_KEY_PLUS,
  calcPickPackagingLabel,
  calcSubmitLabel,
  calcTotalLabel,
  closeLabel,
  deleteLabel,
  additionLabel,
  calcRowSignLabel,
  calculatorBlockedNote,
  calculatorTitle,
  deleteAccessibilityLabel,
} from '@/logic/labels';
import { useThemeColors, type ThemeColors } from '@/theme';
import { useLocale } from '@/settings';

/**
 * キーパッド（§7.1）。4 列 × 4 行と数字の位置は変えない。
 *
 * `=` を足すとキーが 17 個になり 16 枠に収まらないため、`AC` をキーパッドから出して
 * 「＋ 行を足す」の行の右端へ移した（採用案 A）。`=` は `＋` の隣に置き、
 * 「この行を計算する（`=`）」と「行を積む（`＋`）」の違いが並びで読めるようにする。
 * 小数点キーは従来どおり置かない（金額は整数で入れる）。
 */
const KEYPAD_ROWS = [
  ['7', '8', '9', CALC_KEY_DIVIDE],
  ['4', '5', '6', CALC_KEY_MULTIPLY],
  ['1', '2', '3', CALC_KEY_MINUS],
  ['0', CALC_KEY_BACKSPACE, CALC_KEY_EQUALS, CALC_KEY_PLUS],
];

/** 青地・白文字にするキー（§7.1）。行内の計算と積み上げの記号 */
const OPERATOR_KEYS: string[] = [
  CALC_KEY_DIVIDE,
  CALC_KEY_MULTIPLY,
  CALC_KEY_MINUS,
  CALC_KEY_PLUS,
  CALC_KEY_EQUALS,
];

/** カード地・**グレー文字**にするキー（§7.1）。数字と地続きに見せない */
const MUTED_KEYS: string[] = [CALC_KEY_BACKSPACE];

type Props = {
  /**
   * 行き先の欄の名前（「梱包材」「送料」）。見出し「{行き先}の計算」に使う（§7.1）。
   * 欄ごとの出し分けはこの語だけで、シートの中身はどの欄から開いても同じ。
   */
  fieldLabel: string;
  /**
   * 開いたときの積み上げ（§7.2「開いたときの状態」）。マウント時の初期表示にのみ使う
   * （開いている間の親側の変化は反映しない）。
   *
   * **前回「決定」で確定した積み上げを、呼び出し側（NumericField）が欄の今の値と
   * 突き合わせて渡す** ── 欄の値が前回の確定値のままなら内訳ごと復元し、そうでなければ
   * （手で打ち直された・プリセットで上書きされた等）今の値 1 行だけの状態を渡す。
   * ここでは判定しない（NumericField 参照）。
   */
  initialMemo: CalcMemo;
  /**
   * 「決定」で親の入力欄へ書き戻す。書き戻す値は**合計だけ**（§7.4）だが、
   * 次に開いたときに内訳を復元できるよう、確定した積み上げ（memo）も一緒に返す。
   */
  onSubmit: (value: string, memo: CalcMemo) => void;
  /**
   * 梱包材シート末尾の「設定で編集する ▸」を出すか（既定 true）。
   * 記録フォームからは false（PresetPickerSheet と同じ理由。モーダルの裏に遷移するため）。
   */
  canOpenSettings?: boolean;
  /**
   * 「🏷 梱包材から選ぶ」を出すか（**既定 false**。SPEC-V3 §4.5）。
   *
   * 出すのは**梱包材の欄から開いた電卓だけ**。シートの中身は元々どの欄から開いても同じだが、
   * 梱包材プリセットを積める先は梱包材の欄しかないので、販売価格や送料の電卓に置くと
   * 「この欄でも使うのか」と読ませてしまう。ヘルプ（helpContent の「よく使う値」）も
   * 梱包材の欄からの導線としてだけ説明している。
   *
   * 梱包材のプリセットを**登録する**画面（PresetFormScreen / PackBuyFields）でも出ない。
   * 「封筒」を登録するのに「封筒」を選べる経路は作らない（§4.2）。ただし電卓そのものは残す
   * ──「1000 ÷ 30」の単価計算に使うため（§3.3）。
   */
  canPickPackaging?: boolean;
  onClose: () => void;
};

/** 開いている間だけマウントする前提のコンポーネント（初期表示を state の初期値で決めるため）。 */
export function MiniCalculator({
  fieldLabel,
  initialMemo,
  onSubmit,
  canOpenSettings = true,
  canPickPackaging = false,
  onClose,
}: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  // 「決定」を押さずに閉じた分の積み上げは残らない（§7.4）。state はこの 1 つだけ
  const [memo, setMemo] = useState(() => initialMemo);
  const [showPacking, setShowPacking] = useState(false);
  const rowsRef = useRef<ScrollView>(null);

  const total = memoTotal(memo);
  const blocked = submitBlockedReason(memo);

  const handleKey = (key: string) => {
    setMemo((current) => {
      switch (key) {
        case CALC_KEY_CLEAR_ALL:
          return clearAll();
        case CALC_KEY_BACKSPACE:
          return backspace(current);
        case CALC_KEY_EQUALS:
          return evaluateDraft(current);
        case CALC_KEY_PLUS:
          return commitRow(current, '+');
        case CALC_KEY_MINUS:
          return commitRow(current, '-');
        case CALC_KEY_MULTIPLY:
        case CALC_KEY_DIVIDE:
          return appendOperator(current, key);
        default:
          return appendDigit(current, key);
      }
    });
  };

  /** 書き戻し（§7.4）。シートが下がり切ってから親へ返す（close 経由） */
  const handleSubmit = (close: () => void) => {
    if (blocked != null) return;
    onSubmit(memoTotalText(memo), memo);
    close();
  };

  const rows = memoRows(memo);
  // 編集中の行は必ず最後（memoRows の並び）。スワイプの対象にしない（§7.3 派生決定）
  const draftIndex = rows.length - 1;

  return (
    <SheetModal onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* 1. シートハンドル（§7.1）。記録フォームと同じ幅 40px のグラバー */}
          <View style={styles.grabberArea}>
            <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          </View>

          {/* 2. ヘッダ。左「閉じる」／中央「{行き先}の計算」／**右は空**（確定は下端の 5）。
              梱包材シート（PresetMultiPickerSheet）のヘッダと同じ形 ── 左と同じ幅の器を
              右にも置いて、見出しを画面の中央から動かさない */}
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <View style={styles.headerSide}>
              <Pressable
                onPress={close}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.closeButton}>
                <Text style={[styles.headerButton, { color: colors.blue }]}>
                  {closeLabel(locale)}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.headerTitle, { color: colors.label }]} numberOfLines={1}>
              {calculatorTitle(locale, fieldLabel)}
            </Text>
            <View style={styles.headerSide} />
          </View>

          {/* 3. 行の積み上げ。**ここだけがスクロールする**（§7.1）。
              Modal の中は別のビュー階層になるため、行のスワイプ削除には自前の
              GestureHandlerRootView が要る（app/_layout.tsx のものは届かない） */}
          <GestureHandlerRootView style={styles.rows}>
            <ScrollView
              ref={rowsRef}
              contentContainerStyle={styles.rowsContent}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              // 行が増えたら末尾（編集中の行）が見えるところまで送る
              onContentSizeChange={() => rowsRef.current?.scrollToEnd({ animated: true })}>
              {rows.map((row, index) =>
                index === draftIndex ? (
                  <MemoRow key={row.id} row={row} colors={colors} editing />
                ) : (
                  <SwipeToDeleteMemoRow
                    key={row.id}
                    row={row}
                    colors={colors}
                    onDelete={() => setMemo((current) => removeRow(current, index))}
                  />
                ),
              )}

              {/* 4. 積み上げに効く 3 つの操作（SPEC-V3 §4.5 / 設計案 26c）。
                  左が「＋ 行を足す」（`＋` キーと同じ。積み上げの側からも行を足せることを示す）、
                  中央が「🏷 梱包材から選ぶ」、右が `AC`（§7.3）。
                  どれも行の並び全体に効くので、キーパッドではなくここに並べる */}
              <View style={styles.stackActions}>
                <Pressable
                  onPress={() => handleKey(CALC_KEY_PLUS)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.addRowLabel, { color: colors.blue }]}>
                    {additionLabel(locale, calcAddRowLabel(locale))}
                  </Text>
                </Pressable>
                {/* 出さないときは詰め物も置かない。左「＋ 行を足す」と右「AC」の
                    2 つ構成に戻るだけで、どちらの位置も変わらない（space-between） */}
                {canPickPackaging && (
                  <Pressable
                    onPress={() => setShowPacking(true)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.addRow,
                      styles.pickPacking,
                      { opacity: pressed ? 0.5 : 1 },
                    ]}>
                    {/* タグ印はプリセットの入口の合図（行のタグボタンと同じ pricetag-outline） */}
                    <Ionicons name="pricetag-outline" size={16} color={colors.blue} />
                    <Text style={[styles.addRowLabel, { color: colors.blue }]}>
                      {calcPickPackagingLabel(locale)}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleKey(CALC_KEY_CLEAR_ALL)}
                  accessibilityRole="button"
                  accessibilityLabel={calcClearAllA11yLabel(locale)}
                  style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.clearAllLabel, { color: colors.gray }]}>
                    {CALC_KEY_CLEAR_ALL}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </GestureHandlerRootView>

          {/* 5. 合計 ＋ 確定のフッター（§7.1。実機の指摘を受けた改訂）。
              **左に「合計」と合計額（負は赤・§7.4）、右に確定ボタン（青の塗り）。**
              確定を右上のテキストリンクから下端へ移したのは、ここから開く梱包材シートの
              確定が下端の塗りボタンで、同じ語なのに往復すると場所が飛んでいたため。
              **並びも字の大きさも PresetMultiPickerSheet のフッターに揃えてある。**

              「合計」を額の上に積むのは、額とボタンが 1 行に並ぶと ¥1,234,567 で詰まるため
              （あちらと同じく額は flexShrink ＋ 1 行に丸める）。無効の理由はその下に残す ──
              ボタンがグレーなだけでは理由が分からない（§7.4） */}
          <View style={[styles.footer, { borderTopColor: colors.separator }]}>
            <View style={styles.footerText}>
              <Text style={[styles.totalLabel, { color: colors.secondaryLabel }]}>
                {calcTotalLabel(locale)}
              </Text>
              <Text
                style={[styles.totalAmount, { color: total < 0 ? colors.red : colors.label }]}
                numberOfLines={1}>
                {formatCalcTotal(locale, total)}
              </Text>
              {blocked != null && (
                <Text style={[styles.blockedNote, { color: colors.secondaryLabel }]}>
                  {calculatorBlockedNote(locale, blocked)}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => handleSubmit(close)}
              disabled={blocked != null}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked != null }}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: blocked != null ? colors.disabledBackground : colors.blue,
                  opacity: pressed && blocked == null ? 0.7 : 1,
                },
              ]}>
              <Text
                style={[styles.submitLabel, { color: blocked != null ? colors.gray : '#FFFFFF' }]}>
                {calcSubmitLabel(locale)}
              </Text>
            </Pressable>
          </View>

          {/* 5a. 梱包材の複数選択（§4.5）。電卓の上に重ねて出し、「決定」で行として積む。
              電卓はこの下で開いたまま ── 戻ったときに積み上げが残っていることが要件 */}
          {showPacking && (
            <PresetMultiPickerSheet
              canOpenSettings={canOpenSettings}
              onSubmit={(presets) =>
                setMemo((current) =>
                  appendPresetRows(
                    current,
                    presets.map((preset) => ({
                      name: preset.name,
                      value: preset.value,
                      colorKey: preset.colorKey,
                    })),
                  ),
                )
              }
              onClose={() => setShowPacking(false)}
            />
          )}

          {/* 6. キーパッド。下端に固定 */}
          <View style={styles.keypad}>
            {KEYPAD_ROWS.map((keyRow) => (
              <View key={keyRow.join('')} style={styles.keyRow}>
                {keyRow.map((key) => (
                  <CalcKey key={key} label={key} colors={colors} onPress={() => handleKey(key)} />
                ))}
              </View>
            ))}
          </View>
        </View>
      )}
    </SheetModal>
  );
}

/**
 * 積んだ 1 行（§7.3）。左スワイプ →「削除」で 1 行ずつ消す。確認は挟まない。
 * 記録タブの SwipeToDeleteRow と同じ形（赤地・白文字・rightThreshold={40}）にする。
 */
function SwipeToDeleteMemoRow({
  row,
  colors,
  onDelete,
}: {
  row: CalcMemoRow;
  colors: ThemeColors;
  onDelete: () => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      containerStyle={styles.swipeContainer}
      renderRightActions={() => (
        <Pressable
          style={[styles.deleteAction, { backgroundColor: colors.red }]}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={deleteAccessibilityLabel(locale, rowAccessibilityLabel(row))}>
          <Text style={styles.deleteLabel}>{deleteLabel(locale)}</Text>
        </Pressable>
      )}>
      <View style={[styles.rowSurface, { backgroundColor: colors.secondaryBackground }]}>
        <MemoRow row={row} colors={colors} />
      </View>
    </ReanimatedSwipeable>
  );
}

/**
 * 1 行の中身（§7.2）: 記号・品名・式・結果の 4 列。
 * 品名は手で作った行では空で、そのときは列を出さない（幅 0）ので式が左端から始まる（§7.5）。
 * 梱包材プリセットから積んだ行にはバッジ ＋ 名前が入る（SPEC-V3 §4.5 / 設計案 26c）。
 */
function MemoRow({
  row,
  colors,
  editing = false,
}: {
  row: CalcMemoRow;
  colors: ThemeColors;
  editing?: boolean;
}) {
  const result = rowResultText(row.expression);

  return (
    <View
      style={[
        styles.memoRow,
        // 編集中の行は青の下線。次のキーがどこに入るかを示す（商品名欄と同じ合図）
        editing && { borderBottomWidth: 1.5, borderBottomColor: colors.blue },
      ]}
      accessible
      accessibilityLabel={rowAccessibilityLabel(row)}>
      <Text style={[styles.rowSign, { color: colors.secondaryLabel }]}>
        {calcRowSignLabel(row.sign)}
      </Text>
      {row.name !== '' && (
        <View style={styles.rowNameGroup}>
          {/* 行の高さ（44px）を変えないところまで小さくする。バッジは色だけが要る印 */}
          <PresetBadge
            preset={{ name: row.name, initial: '', colorKey: row.colorKey }}
            size={18}
          />
          <Text style={[styles.rowName, { color: colors.label }]} numberOfLines={1}>
            {row.name}
          </Text>
        </View>
      )}
      <Text
        style={[styles.rowExpression, { color: row.expression === '' ? colors.mutedLabel : colors.label }]}
        numberOfLines={1}>
        {row.expression === '' ? '0' : row.expression}
      </Text>
      <Text style={[styles.rowResult, { color: colors.label }]} numberOfLines={1}>
        {result}
      </Text>
    </View>
  );
}

/** 読み上げ用の 1 行（「＋ 1500 ÷ 100 は 15」）。記号・式・結果を続けて読む */
function rowAccessibilityLabel(row: CalcMemoRow): string {
  return `${calcRowSignLabel(row.sign)} ${row.name} ${row.expression} ${rowResultText(row.expression)}`.trim();
}

/** キーパッドの 1 キー（§7.1）。角丸長方形・高さ 60px（58〜64px の範囲） */
function CalcKey({
  label,
  colors,
  onPress,
}: {
  label: string;
  colors: ThemeColors;
  onPress: () => void;
}) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const isOperator = OPERATOR_KEYS.includes(label);
  const isMuted = MUTED_KEYS.includes(label);

  // 記号のままでは読み上げにならないキーだけ語を当てる（`AC` は積み上げの側へ移した）
  const accessibilityLabel = label === CALC_KEY_BACKSPACE ? calcBackspaceA11yLabel(locale) : label;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: isOperator ? colors.blue : colors.secondaryBackground,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text
        style={[
          styles.keyLabel,
          { color: isOperator ? '#FFFFFF' : isMuted ? colors.gray : colors.label },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // 行が増えても伸びるのは積み上げの領域だけ（rows が縮む）。上端は画面の 9 割で止める
    maxHeight: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 左右で同じ幅を取り、見出しを画面の中央から動かさない（PresetMultiPickerSheet と同じ）
  headerSide: {
    flex: 1,
  },
  // 器いっぱいに広がると「閉じる」の当たり判定が右へ伸びるので、文字の幅で止める
  closeButton: {
    alignSelf: 'flex-start',
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  headerButton: {
    fontSize: 16,
  },
  rows: {
    // 中身が少ないうちはその高さ、増えたらここだけがスクロールする（§7.1）
    flexGrow: 0,
    flexShrink: 1,
  },
  rowsContent: {
    padding: 16,
    gap: 8,
  },
  swipeContainer: {
    borderRadius: 12,
  },
  rowSurface: {
    borderRadius: 12,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  memoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
  },
  rowSign: {
    fontSize: 17,
    // 記号の列は固定幅。1 行目にも `＋` を出すので、後から `−` 行が積まれても式の左端が動かない
    width: 18,
    textAlign: 'center',
  },
  rowNameGroup: {
    // 品名の列は名前が入った行にだけ出る（§7.5）。バッジ ＋ 名前で 1 かたまり
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 120,
  },
  rowName: {
    flexShrink: 1,
    fontSize: 15,
  },
  rowExpression: {
    flex: 1,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  rowResult: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  stackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickPacking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 3 つの押し所が等間隔に見えるよう、中央だけは左右の余白を詰める
    paddingHorizontal: 8,
  },
  addRowLabel: {
    fontSize: 15,
  },
  clearAllLabel: {
    // キーパッドの数字と同じ字面にならないよう、リンクではなく小さめの太字にする
    fontSize: 15,
    fontWeight: '600',
  },
  // 合計 ＋ 確定の帯。PresetMultiPickerSheet の footer と同じ形（左が文字・右がボタン）
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
  totalLabel: {
    fontSize: 13,
  },
  totalAmount: {
    // 24px から落としたのは、右にボタンが並ぶため（¥1,234,567 で詰まらない大きさ）
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  blockedNote: {
    fontSize: 12,
  },
  submit: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  keypad: {
    paddingHorizontal: 12,
    // **上だけ広い。** すぐ上が確定ボタン、真下が `7 8 9 ÷` の段になるので、
    // 数字を打つ手が確定に触れないよう 12 → 20pt に離す（誤爆すると
    // シートが閉じて積み上げが消える。§7.4 で行は保存しないため戻せない）
    paddingTop: 20,
    paddingBottom: 12,
    gap: 8,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 22,
    fontWeight: '600',
  },
});
