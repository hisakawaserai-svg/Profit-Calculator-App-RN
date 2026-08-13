// 電卓（UI-SPEC §7）。MiniCalc.swift（MiniCalculatorView）の後継。
//
// §7 のねらいは「1 回きりの計算しかできない電卓を**計算メモ**にする」こと。
// 「箱 120 ＋ 緩衝材 40 ＋ テープ 15」と積み上げてから、その合計だけを欄へ返す。
//
// 旧版（幅 280px のポップオーバー・`C` と `=`・オレンジの演算子キー）からの変更点は §7.1 の表のとおり:
// - 画面中央のカード → **下から出るシート**（他のシートと同じ形。CalendarPicker / OptionSheet）
// - 見出しは行き先を明示（「梱包材の計算」）。左上「閉じる」・右上「入れる」
// - 記号は `×` `÷`（`*` `/` は画面に出さない）。演算子キーは青（電卓からオレンジを廃止）
// - `C` → `AC`（全消去）と `⌫`（1 手戻す）の 2 キー。`=` は行の結果が常に出るので廃止
//
// 行の積み上げ・合計・「入れる」の可否はすべて logic/calcMemo.ts の純粋関数が持つ。
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
  createMemo,
  evaluateDraft,
  memoRows,
  memoTotal,
  memoTotalText,
  removeRow,
  rowResultText,
  submitBlockedReason,
  type CalcMemoRow,
} from '@/logic/calcMemo';
import { formatCalcTotal } from '@/logic/format';
import {
  CALC_ADD_ROW_LABEL,
  CALC_BACKSPACE_A11Y_LABEL,
  CALC_CLEAR_ALL_A11Y_LABEL,
  CALC_KEY_BACKSPACE,
  CALC_KEY_CLEAR_ALL,
  CALC_KEY_DIVIDE,
  CALC_KEY_EQUALS,
  CALC_KEY_MINUS,
  CALC_KEY_MULTIPLY,
  CALC_KEY_PLUS,
  CALC_PICK_PACKAGING_LABEL,
  CALC_SUBMIT_LABEL,
  CALC_TOTAL_LABEL,
  CLOSE_LABEL,
  DELETE_LABEL,
  additionLabel,
  calcRowSignLabel,
  calculatorBlockedNote,
  calculatorTitle,
  deleteAccessibilityLabel,
} from '@/logic/labels';
import { useThemeColors, type ThemeColors } from '@/theme';

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
   * 親の入力欄の値。マウント時の初期表示にのみ使う（開いている間の親側の変化は反映しない）。
   * 空 or `0` なら行なしで始まる（§7.2「開いたときの状態」）。
   */
  targetText: string;
  /** 「入れる」で親の入力欄へ書き戻す。渡すのは**合計だけ**（§7.4） */
  onSubmit: (value: string) => void;
  /**
   * 梱包材シート末尾の「設定で編集する ▸」を出すか（既定 true）。
   * 記録フォームからは false（PresetPickerSheet と同じ理由。モーダルの裏に遷移するため）。
   */
  canOpenSettings?: boolean;
  /**
   * 「🏷 梱包材から選ぶ」を出すか（既定 true。SPEC-V3 §4.5）。
   *
   * **プリセット編集画面の値の欄からは false**（§4.2 の「プリセットからプリセットを選ぶ経路は
   * 作らない」）。梱包材を登録する画面で既存の梱包材を呼べると、「封筒」を登録するのに
   * 「封筒」を選べてしまう。電卓そのものは残す ──「1000 ÷ 30」の単価計算に使うため（§3.3）。
   */
  canPickPackaging?: boolean;
  onClose: () => void;
};

/** 開いている間だけマウントする前提のコンポーネント（初期表示を state の初期値で決めるため）。 */
export function MiniCalculator({
  fieldLabel,
  targetText,
  onSubmit,
  canOpenSettings = true,
  canPickPackaging = true,
  onClose,
}: Props) {
  const colors = useThemeColors();
  // 積み上げは保存しない。シートを閉じれば消える（§7.4）ので、state はこの 1 つだけ
  const [memo, setMemo] = useState(() => createMemo(targetText));
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
    onSubmit(memoTotalText(memo));
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

          {/* 2. ヘッダ。左「閉じる」／中央「{行き先}の計算」／右「入れる」 */}
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: colors.blue }]}>{CLOSE_LABEL}</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.label }]} numberOfLines={1}>
              {calculatorTitle(fieldLabel)}
            </Text>
            <Pressable
              onPress={() => handleSubmit(close)}
              hitSlop={8}
              disabled={blocked != null}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked != null }}>
              <Text
                style={[
                  styles.headerButton,
                  styles.submitButton,
                  { color: blocked != null ? colors.gray : colors.blue },
                ]}>
                {CALC_SUBMIT_LABEL}
              </Text>
            </Pressable>
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
                    {additionLabel(CALC_ADD_ROW_LABEL)}
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
                      {CALC_PICK_PACKAGING_LABEL}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleKey(CALC_KEY_CLEAR_ALL)}
                  accessibilityRole="button"
                  accessibilityLabel={CALC_CLEAR_ALL_A11Y_LABEL}
                  style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.clearAllLabel, { color: colors.gray }]}>
                    {CALC_KEY_CLEAR_ALL}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </GestureHandlerRootView>

          {/* 5. 合計行。負は赤（§7.4）。無効の理由はその下に 1 行で出す */}
          <View style={[styles.totalBlock, { borderTopColor: colors.separator }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.label }]}>{CALC_TOTAL_LABEL}</Text>
              <Text
                style={[styles.totalAmount, { color: total < 0 ? colors.red : colors.label }]}
                numberOfLines={1}>
                {formatCalcTotal(total)}
              </Text>
            </View>
            {blocked != null && (
              <Text style={[styles.blockedNote, { color: colors.secondaryLabel }]}>
                {calculatorBlockedNote(blocked)}
              </Text>
            )}
          </View>

          {/* 5a. 梱包材の複数選択（§4.5）。電卓の上に重ねて出し、「入れる」で行として積む。
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
          accessibilityLabel={deleteAccessibilityLabel(rowAccessibilityLabel(row))}>
          <Text style={styles.deleteLabel}>{DELETE_LABEL}</Text>
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
  const isOperator = OPERATOR_KEYS.includes(label);
  const isMuted = MUTED_KEYS.includes(label);

  // 記号のままでは読み上げにならないキーだけ語を当てる（`AC` は積み上げの側へ移した）
  const accessibilityLabel = label === CALC_KEY_BACKSPACE ? CALC_BACKSPACE_A11Y_LABEL : label;

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
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  headerButton: {
    fontSize: 16,
  },
  submitButton: {
    fontWeight: '700',
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
  totalBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  blockedNote: {
    fontSize: 12,
  },
  keypad: {
    padding: 12,
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
