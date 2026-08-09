// RecordFormView.swift の移植。新規追加 / 編集フォーム（SPEC §3.2 / §5.2 / §5.3）。
// 各画面の＋ボタン（一覧・月別詳細・計算タブ）からシートで開く。
//
// - 決定 §7-7:「保存時にのみレコードを作成する」。開いた時点では DB に一切書き込まない。
//   計算タブから渡された入力値も、メモリ上の初期値として持つだけ。
// - §5.3: 一時レコードの insert をやめたので、キャンセルは閉じるだけ（削除処理は不要）。
// - §5.2: 必須は商品名のみ。保存ボタン押下時に空なら赤枠＋警告を商品名欄だけに出し、
//   シートは閉じない（DB 書き込みもしない）。
// - 保存時の saleDate 正規化（isSold=false → null）は repository の責務なのでここでは行わない。
// - 値の組み立て・変換・バリデーションは src/logic/recordForm.ts の純粋関数に寄せている。
import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { DateField } from '@/components/DateField';
import { NumericField } from '@/components/NumericField';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import type { SaleRecord } from '@/db/schema';
import { saveRecord } from '@/db/useRecords';
import {
  ITEM_NAME_REQUIRED_MESSAGE,
  MAX_COMMISSION,
  MIN_COMMISSION,
  canSave,
  newFormValues,
  recordToFormValues,
  toSaveInput,
  type InitialAmounts,
  type RecordFormValues,
} from '@/logic/recordForm';
import { useThemeColors } from '@/theme';

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

  const [values, setValues] = useState<RecordFormValues>(() =>
    record == null ? newFormValues(initialAmounts) : recordToFormValues(record),
  );
  /** 保存ボタンを押したか。押すまでは警告を出さない（SPEC §5.2 の isPushedSave） */
  const [isPushedSave, setIsPushedSave] = useState(false);

  // SPEC §3.2: editingRecord の itemName が空なら「新規追加」、それ以外は「編集」
  const title = record == null || record.itemName === '' ? '新規追加' : '編集';

  const update = <K extends keyof RecordFormValues>(key: K, value: RecordFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    setIsPushedSave(true);
    // 商品名が空なら早期 return。シートは閉じず、DB にも書き込まない（SPEC §5.2）
    if (!canSave(values)) return;

    saveRecord(record?.id ?? null, toSaveInput(values));
    onSaved?.();
    onClose();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Swift 版 NavigationStack のツールバー（キャンセル / タイトル / 保存） */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.headerButton, { color: colors.blue }]}>キャンセル</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.label }]}>{title}</Text>
        <Pressable onPress={handleSave} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.headerButton, styles.saveButton, { color: colors.blue }]}>保存</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <FormSection title="商品情報">
          <TextField
            label="商品名"
            placeholder="例：えんぴつ"
            value={values.itemName}
            onChangeValue={(value) => update('itemName', value)}
            // 警告は商品名欄にだけ出す（SPEC §5.2）
            errorMessage={isPushedSave && !canSave(values) ? ITEM_NAME_REQUIRED_MESSAGE : null}
          />
          <NumericField
            label="販売価格"
            value={values.salesPrice}
            onChangeValue={(value) => update('salesPrice', value)}
          />
          <NumericField
            label="仕入価格"
            value={values.purchasePrice}
            onChangeValue={(value) => update('purchasePrice', value)}
          />
          <NumericField
            label="送料"
            value={values.postage}
            onChangeValue={(value) => update('postage', value)}
          />
          <NumericField
            label="梱包材"
            value={values.envelopeCost}
            onChangeValue={(value) => update('envelopeCost', value)}
          />
          <NumericField
            label="その他"
            value={values.othersCost}
            onChangeValue={(value) => update('othersCost', value)}
          />
          <Stepper
            label={`手数料 (${values.commission}%)`}
            value={values.commission}
            minimumValue={MIN_COMMISSION}
            maximumValue={MAX_COMMISSION}
            onChangeValue={(value) => update('commission', value)}
          />
        </FormSection>

        <FormSection title="日付設定">
          <DateField
            label="出品日"
            value={values.saleStartDate}
            onChangeValue={(value) => update('saleStartDate', value)}
          />
          {/* 販売日は売却済みのときだけ表示する（Swift 版 if isSold） */}
          {values.isSold && (
            <DateField
              label="販売日"
              value={values.saleDate}
              onChangeValue={(value) => update('saleDate', value)}
            />
          )}
          <SoldToggle isSold={values.isSold} onChange={(value) => update('isSold', value)} />
        </FormSection>

        {/* Swift 版ではメモだけ Section に入っていないので、見出しなしのカードにする */}
        <FormSection>
          <TextField
            label="メモ"
            value={values.memo}
            onChangeValue={(value) => update('memo', value)}
            multiline
          />
        </FormSection>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Swift 版 Form の Section 相当。title を省くと見出しなしのカードになる */
function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      {title != null && (
        <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>{title}</Text>
      )}
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>{children}</View>
    </View>
  );
}

/**
 * 販売済みトグル（Swift 版 Toggle(isSold ? "販売済み" : "出品中")）。
 * ここでは値を切り替えるだけで、saleDate の正規化は保存時に repository が行う（SPEC §5.2）。
 * RN の Switch はプラットフォーム標準のトグルなのでそのまま使う。
 */
function SoldToggle({ isSold, onChange }: { isSold: boolean; onChange: (value: boolean) => void }) {
  const colors = useThemeColors();
  const label = isSold ? '販売済み' : '出品中';

  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.label }]}>{label}</Text>
      <Switch
        value={isSold}
        onValueChange={onChange}
        accessibilityLabel="販売済み"
        trackColor={{ true: colors.green, false: colors.disabledBackground }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 16,
  },
});
