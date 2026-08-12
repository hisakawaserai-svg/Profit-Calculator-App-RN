// 書き出しシート（SPEC-V3 §5.6 / §5.7）。設定タブ「データ」群の「書き出し（CSV）」から開く。
//
// 構成（上から）:
//   種類 [ データ保存用 | 確定申告用 ]  ← 確定申告用のときだけ注意書き（§5.8）
//   期間 （**既存の期間シートと同じ盤面**。PeriodPicker）
//   まとめ方 [ 1件ずつ | 日ごとにまとめる ]  ← 確定申告用のときだけ
//   対象 [ 売れた記録のみ | 出品中も含める ]
//   ────────────────────────────────
//   2026年8月・売れた記録            12件
//   [ 書き出す ]
//
// この画面が持つ判断:
//
// - **期間の盤面は作り直さない**（§5.5 の改訂）。記録タブ・データタブと同じ `PeriodPicker` を
//   埋める ── 作り直すと同じ見た目の月グリッドが 2 種類に分かれ、片方だけ直される事故が起きる。
// - **「書き出す」を置く**（§5.7）。期間シートは「選んだ瞬間に効く」ので確定ボタンを持たないが、
//   書き出しは取り消せない操作なので押す瞬間が要る。
// - **絞り込みは効かせない**（§5.5 / 決定 §9-9）。記録タブ・データタブの絞り込みは
//   別タブの画面ローカルな状態で、効かせると「なぜ一部しか出ないのか」が分からないまま
//   一部だけ書き出す事故になる。この画面が持つ条件は 種類・期間・まとめ方・対象 の 4 つだけ。
// - **下端に「何件を書き出すか」を出す**（§5.7）。4 つのどれを触ってもその場で変わる。
// - **0 件では押せない**（§5.7）。切り替えれば書き出せることを 1 行で示す。
//
// 書き出しの経路（§5.6）: キャッシュ領域に一時ファイルを作り、OS の共有シートを出す。
// 共有シートから先（メール・ファイル・他アプリ）は OS の担当で、アプリ側では作らない。
// 一時ファイルは消さない（OS 任せ）── 共有シートが閉じる時機を待って消す仕組みは、
// 失敗時に消し忘れる方が厄介。キャッシュ領域なのでバックアップ対象にも入らない（決定 §8-14）。
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PeriodPicker } from '@/components/PeriodPicker';
import { SegmentedControl } from '@/components/SegmentedControl';
import { toMonthKey } from '@/db/dates';
import { loadExportCsv, useExportPreview } from '@/db/useExport';
import { useMonthsWithRecords } from '@/db/useRecords';
import { toCsvFileContent, type CsvExportKind, type CsvGrouping } from '@/logic/csv';
import { exportFileName } from '@/logic/exportPeriod';
import {
  EXPORT_CANCEL_LABEL,
  EXPORT_FAILED_MESSAGE,
  EXPORT_GROUPING_OPTIONS,
  EXPORT_GROUPING_NOTES,
  EXPORT_GROUPING_SECTION_LABEL,
  EXPORT_KIND_NOTES,
  EXPORT_KIND_OPTIONS,
  EXPORT_KIND_SECTION_LABEL,
  EXPORT_PERIOD_SECTION_LABEL,
  EXPORT_SHARE_DIALOG_TITLE,
  EXPORT_SHARING_UNAVAILABLE,
  EXPORT_SHEET_TITLE,
  EXPORT_SUBMIT_LABEL,
  EXPORT_TARGET_OPTIONS,
  EXPORT_TARGET_SECTION_LABEL,
  EXPORT_TAX_NOTICE,
  exportCountLabel,
  exportEmptyNote,
  exportSummaryLabel,
} from '@/logic/labels';
import type { Period } from '@/logic/period';
import { useThemeColors } from '@/theme';

/** CSV の MIME / UTI。共有先（メール・ファイル）が種類を判断するのに使う */
const CSV_MIME_TYPE = 'text/csv';
const CSV_UTI = 'public.comma-separated-values-text';

export function ExportSheet() {
  const colors = useThemeColors();
  const router = useRouter();

  const currentMonthKey = useMemo(() => toMonthKey(new Date()), []);
  const monthsWithRecords = useMonthsWithRecords();

  // 4 つの条件。**既定は「データ保存用・今月・1件ずつ・売れた記録のみ」**
  // （対象の既定は決定 §8-9。期間は他の画面と同じく今月から始める）
  const [kind, setKind] = useState<CsvExportKind>('backup');
  const [grouping, setGrouping] = useState<CsvGrouping>('record');
  const [period, setPeriod] = useState<Period>(currentMonthKey);
  const [includeListing, setIncludeListing] = useState(false);
  /** 共有シートを出している間だけ true。連打で 2 回書き出すのを止める（§5.6「進捗表示は出さない」） */
  const [busy, setBusy] = useState(false);

  /**
   * **まとめ方はデータ保存用では効かせない**（§5.2.2）── メモやタグは合算できない。
   * state を消さずに畳むのは、種類を戻したときに選び直させないため
   * （絞り込みページで「出品中のときは販売サイトの節が消える」のと同じ扱い）。
   */
  const effectiveGrouping: CsvGrouping = kind === 'tax' ? grouping : 'record';

  const filter = useMemo(() => ({ period, includeListing }), [period, includeListing]);
  const preview = useExportPreview(filter, kind, effectiveGrouping);
  const empty = preview.recordCount === 0;

  const share = async () => {
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(EXPORT_SHARING_UNAVAILABLE);
        return;
      }
      // 本文を組み立てるのは押した瞬間の 1 回だけ（useExport.ts の loadExportCsv 参照）
      const content = toCsvFileContent(loadExportCsv(filter, kind, effectiveGrouping));
      const file = new File(Paths.cache, exportFileName(kind, period));
      // 同じ期間を続けて書き出したときに前回のファイルが残っているので上書きする
      file.create({ overwrite: true });
      file.write(content);

      await Sharing.shareAsync(file.uri, {
        mimeType: CSV_MIME_TYPE,
        UTI: CSV_UTI,
        dialogTitle: EXPORT_SHARE_DIALOG_TITLE,
      });
    } catch {
      // 原因は端末側（容量・共有先の失敗）なので、言えるのは「できなかった」まで
      Alert.alert(EXPORT_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const screenOptions = useMemo(
    () => ({
      title: EXPORT_SHEET_TITLE,
      // モーダルで出すので戻る導線が自動では付かない。**「キャンセル」は書き出さずに閉じるだけ**
      headerLeft: () => (
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.headerButton, { color: colors.blue }]}>{EXPORT_CANCEL_LABEL}</Text>
        </Pressable>
      ),
    }),
    [router, colors.blue],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* §5.2 の改訂: 2 種類のどちらを書き出すか。列もファイル名もここで決まる */}
          <Section label={EXPORT_KIND_SECTION_LABEL} note={EXPORT_KIND_NOTES[kind]}>
            <SegmentedControl
              options={EXPORT_KIND_OPTIONS.map((option) => option.label)}
              selectedIndex={EXPORT_KIND_OPTIONS.findIndex((option) => option.value === kind)}
              onChange={(index) => setKind(EXPORT_KIND_OPTIONS[index].value)}
            />
          </Section>

          {/* §5.8: 確定申告用のときだけ出す固定の注意書き。**押せない**（ヘルプが未実装。§5.8） */}
          {kind === 'tax' && (
            <View
              style={[styles.notice, { backgroundColor: colors.secondaryBackground }]}
              accessibilityRole="text">
              <Ionicons name="alert-circle-outline" size={18} color={colors.orange} />
              <Text style={[styles.noticeText, { color: colors.label }]}>{EXPORT_TAX_NOTICE}</Text>
            </View>
          )}

          {/* §5.5 の改訂: 記録タブ・データタブと**同じ盤面**。ここで作り直さない */}
          <Section label={EXPORT_PERIOD_SECTION_LABEL}>
            <View style={styles.period}>
              <PeriodPicker
                period={period}
                monthsWithRecords={monthsWithRecords}
                currentMonthKey={currentMonthKey}
                // 期間シートと違い、選んでも閉じない・まだ何も起きない（§5.7）
                onSelect={setPeriod}
              />
            </View>
          </Section>

          {/* §5.2.2: 確定申告用のときだけ。データ保存用では節ごと出さない */}
          {kind === 'tax' && (
            <Section
              label={EXPORT_GROUPING_SECTION_LABEL}
              note={EXPORT_GROUPING_NOTES[grouping]}>
              <SegmentedControl
                options={EXPORT_GROUPING_OPTIONS.map((option) => option.label)}
                selectedIndex={EXPORT_GROUPING_OPTIONS.findIndex(
                  (option) => option.value === grouping,
                )}
                onChange={(index) => setGrouping(EXPORT_GROUPING_OPTIONS[index].value)}
              />
            </Section>
          )}

          {/* §5.5-3: 既定は「売れた記録のみ」（決定 §8-9） */}
          <Section label={EXPORT_TARGET_SECTION_LABEL}>
            <SegmentedControl
              options={EXPORT_TARGET_OPTIONS.map((option) => option.label)}
              selectedIndex={EXPORT_TARGET_OPTIONS.findIndex(
                (option) => option.value === includeListing,
              )}
              onChange={(index) => setIncludeListing(EXPORT_TARGET_OPTIONS[index].value)}
            />
          </Section>
        </ScrollView>

        {/* §5.7: 下端。4 つのどれを触ってもその場で変わる */}
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.secondaryBackground, borderTopColor: colors.separator },
          ]}>
          <View style={styles.footerLine}>
            <Text style={[styles.footerLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {exportSummaryLabel(period, includeListing)}
            </Text>
            <Text style={[styles.footerCount, { color: colors.label }]}>
              {exportCountLabel(preview.recordCount, preview.rowCount)}
            </Text>
          </View>

          {/* 0 件のときだけ。**切り替えれば書き出せる**ことを示す（数字だけでは原因が読めない） */}
          {empty && (
            <Text style={[styles.footerNote, { color: colors.secondaryLabel }]}>
              {exportEmptyNote(preview.listingCount)}
            </Text>
          )}

          <Pressable
            onPress={share}
            disabled={empty || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: empty || busy }}
            style={({ pressed }) => [
              styles.submit,
              {
                backgroundColor: empty || busy ? colors.disabledBackground : colors.blue,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Text
              style={[
                styles.submitLabel,
                { color: empty || busy ? colors.disabledContent : '#FFFFFF' },
              ]}>
              {EXPORT_SUBMIT_LABEL}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** 節（見出し ＋ 中身 ＋ 下の注記 1 行）。4 つの節が同じ間隔で並ぶようにする */
function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {label}
      </Text>
      {children}
      {note != null && <Text style={[styles.note, { color: colors.secondaryLabel }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  // PeriodPicker の中身（クイック選択・カード・凡例）を縦に積む間隔。期間シートと揃える
  period: {
    gap: 12,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLabel: {
    flex: 1,
    fontSize: 13,
  },
  footerCount: {
    fontSize: 15,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 18,
  },
  submit: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 17,
  },
});
