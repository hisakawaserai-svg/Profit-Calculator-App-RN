// 画面 3（読み込む中身・設計案 53f / 53g）と 画面 4（読み込めなかった・案 53h）。
//
// **同じファイルに置いてある。** 案 53h は「プレビュー画面のまま、上に赤枠のカードを
// 差し込む」形なので、2 つは別の画面ではなく**同じ画面の 2 つの状態**にあたる ──
// ヘッダ（「読み込む中身」）も、下端の「別のファイルを選ぶ」も共通で、
// 変わるのは「差の表が出るか、止まった理由が出るか」だけ。
//
// この 2 つが持つ判断:
//
// - **確認ダイアログを持たない**（旧実装の `Alert.alert('今あるデータをすべて置き換えます')`）。
//   ダイアログでは「今あるものがどうなるか」を数字で並べられず、閉じると理由が残らない。
//   **この 1 枚が確認そのもの**で、赤い数字・赤い文・赤いボタンの 3 つが同じ画面に並ぶ。
// - **差を出す**（案 53f）。「ファイルに 53 件入っている」だけでは、それが
//   増えるのか減るのかが分からない ── 間違ったファイルに気付く一番強い手がかりは
//   「今の端末 → ファイル」の並びで、**減る行だけが赤くなる**こと。
// - **エラーはダイアログで出さない**（案 53h）。3 行が同じ大きさの塊になって
//   「現在のデータは変更されていません」が埋もれるうえ、閉じると行番号が消える。
//   赤枠のカードの中で、**その 1 行だけを緑の帯に分ける**。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomActionBar } from '@/components/BottomActionBar';
import { NoticeCard } from '@/components/NoticeCard';
import { isLargeDecrease, type BackupDiffRow, type BackupSideCounts } from '@/logic/backupView';
import {
  backupDiffCurrentHeader,
  backupDiffFileHeader,
  backupErrorCopyLabel,
  backupErrorHint,
  backupErrorTitle,
  backupErrorUnchangedNote,
  backupNoPhotoInFileTitle,
  backupPickAnotherFileLabel,
  backupReplaceAllLabel,
  backupReplaceWithoutPhotosLabel,
  backupLargeDecreaseNote,
  backupNewestRecordNote,
  backupNoPhotoInFileBody,
  backupPreviewCreatedLine,
  backupReplaceWarning,
  photoCountLabel,
  presetCountLabel,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

import type { BottomBarProgress } from '@/components/BottomActionBar';

/** ファイルそのものの見出し（名前と作成日）。プレビューでもエラーでも同じ形で出す */
function FileCard({
  fileName,
  createdAt,
  hasPhotos,
  today,
  dimmed = false,
}: {
  fileName: string;
  createdAt: string | null;
  hasPhotos: boolean;
  today: Date;
  dimmed?: boolean;
}) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  // 止まった画面では、読めなかったファイルのカードを**不活性のまま残す**（案 53h）──
  // 消すと「何を選んだのか」まで画面から消える
  const title = dimmed ? colors.secondaryLabel : colors.label;
  const sub = dimmed ? colors.mutedLabel : colors.secondaryLabel;

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.fileName, { color: title }]} numberOfLines={2}>
        {fileName}
      </Text>
      {createdAt != null && (
        <Text style={[styles.fileMeta, { color: sub }]}>
          {backupPreviewCreatedLine(locale, createdAt, today, hasPhotos)}
        </Text>
      )}
    </View>
  );
}

// ---- 画面 3: プレビュー（案 53f / 53g） ----

type PreviewProps = {
  fileName: string;
  createdAt: string;
  /** 今この端末にあるもの */
  current: BackupSideCounts;
  /** ファイルに入っているもの */
  file: BackupSideCounts;
  rows: readonly BackupDiffRow[];
  /** ファイルの中で一番新しい記録（無ければ出さない） */
  newest: { date: string; itemName: string } | null;
  today: Date;
  onReplace: () => void;
  onPickAnother: () => void;
  progress: BottomBarProgress | null;
};

export function BackupPreviewView({
  fileName,
  createdAt,
  current,
  file,
  rows,
  newest,
  today,
  onReplace,
  onPickAnother,
  progress,
}: PreviewProps) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const busy = progress != null;

  // **写真が 1 枚も入っていないファイル**（案 53g）。今ある写真も一緒に消えるので、
  // 表の赤い「0枚」だけでは足りず、失うものを 2 文で言う
  const losesPhotos = file.photos === 0 && current.photos > 0;
  const shrinks = isLargeDecrease(current.records, file.records);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.content} pointerEvents={busy ? 'none' : 'auto'}>
        <FileCard
          fileName={fileName}
          createdAt={createdAt}
          hasPhotos={file.photos > 0}
          today={today}
        />

        {/* 差の表。列見出しは右 2 列だけに付く（行の名前の列には要らない） */}
        <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
          <View style={styles.diffHead}>
            <View style={styles.diffLabel} />
            <Text style={[styles.diffHeadText, { color: colors.secondaryLabel }]}>
              {backupDiffCurrentHeader(locale)}
            </Text>
            <View style={styles.arrowSpace} />
            <Text style={[styles.diffHeadText, styles.diffNext, { color: colors.secondaryLabel }]}>
              {backupDiffFileHeader(locale)}
            </Text>
          </View>

          {rows.map((row) => (
            <DiffRow key={row.label} row={row} />
          ))}
        </View>

        {shrinks && <NoticeCard tone="warning" body={backupLargeDecreaseNote(locale, current.records, file.records)} />}

        {losesPhotos && (
          <NoticeCard
            tone="danger"
            title={backupNoPhotoInFileTitle(locale)}
            body={backupNoPhotoInFileBody(locale, current.photos)}
          />
        )}

        {newest != null && (
          <Text style={[styles.newest, { color: colors.secondaryLabel }]}>
            {backupNewestRecordNote(locale, newest.date, newest.itemName)}
          </Text>
        )}
      </View>

      <BottomActionBar
        label={file.photos === 0 ? backupReplaceWithoutPhotosLabel(locale) : backupReplaceAllLabel(locale)}
        tone="destructive"
        onPress={onReplace}
        warning={backupReplaceWarning(locale, current.records)}
        secondary={{ label: backupPickAnotherFileLabel(locale), onPress: onPickAnother }}
        progress={progress}
      />
    </View>
  );
}

/** 差の 1 行（「記録　8件 → 53件」）。**減る行だけを赤くする** */
function DiffRow({ row }: { row: BackupDiffRow }) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const value = (count: number) =>
    row.unit === 'photo' ? photoCountLabel(locale, count) : presetCountLabel(locale, count);

  return (
    <View style={[styles.diffRow, { borderTopColor: colors.separator }]}>
      <Text style={[styles.diffLabel, styles.diffLabelText, { color: colors.label }]}>
        {row.label}
      </Text>
      <Text style={[styles.diffValue, { color: colors.secondaryLabel }]}>{value(row.current)}</Text>
      <Text style={[styles.arrow, styles.arrowSpace, { color: colors.secondaryLabel }]}>→</Text>
      <Text
        style={[
          styles.diffValue,
          styles.diffNext,
          { color: row.decreasing ? colors.red : colors.label },
        ]}>
        {value(row.next)}
      </Text>
    </View>
  );
}

// ---- 画面 4: 読み込めなかったとき（案 53h） ----

type ErrorProps = {
  fileName: string;
  createdAt: string | null;
  /** logic/backup.ts が出した 1 文（どのファイルの何行目の何が悪いか） */
  reason: string;
  today: Date;
  onPickAnother: () => void;
  onCopy: () => void;
};

export function BackupErrorView({
  fileName,
  createdAt,
  reason,
  today,
  onPickAnother,
  onCopy,
}: ErrorProps) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <NoticeCard tone="danger" title={backupErrorTitle(locale)} icon={false}>
          <Text style={[styles.reason, { color: colors.label }]}>{reason}</Text>
          <Text style={[styles.hint, { color: colors.secondaryLabel }]}>{backupErrorHint(locale)}</Text>

          {/* **3 行目だけは緑にする。** 赤の中に同じ色で埋めると読み飛ばされるが、
              失敗したときに一番知りたいのは「壊れていないか」 */}
          <NoticeCard tone="success" body={backupErrorUnchangedNote(locale)} />
        </NoticeCard>

        {/* 選んだファイルは不活性のまま残す（何を選んだのかを画面から消さない）。
            **件数は出さない** ── ファイルが自分で名乗っている数は検証を通っておらず、
            それを並べると「読めたところまでは正しい」と読まれる（決定 §8-4） */}
        <FileCard
          fileName={fileName}
          createdAt={createdAt}
          hasPhotos
          today={today}
          dimmed
        />
      </View>

      <BottomActionBar
        label={backupPickAnotherFileLabel(locale)}
        onPress={onPickAnother}
        secondary={{ label: backupErrorCopyLabel(locale), onPress: onCopy }}
      />
    </View>
  );
}

/**
 * ヘッダの左に置く「‹ 戻る」（案 53f）。
 *
 * **標準の戻るボタンは使えない。** 標準のそれはルートを 1 枚 pop するが、
 * ここで戻りたいのは**同じルートの中の 1 つ前の状態**（作る画面）── ファイルを
 * 選び直せる場所であって、設定画面ではない。
 */
export function BackupHeaderBack({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.headerBack, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="chevron-back" size={22} color={colors.blue} />
      <Text style={[styles.headerBackLabel, { color: colors.blue }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  fileName: {
    fontSize: 17,
    fontWeight: '700',
  },
  fileMeta: {
    fontSize: 13,
  },
  diffHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // 行の名前の列。値の 2 列は右寄せで揃えたいので、ここが余りを吸う
  diffLabel: {
    flex: 1,
  },
  diffLabelText: {
    fontSize: 15,
  },
  diffHeadText: {
    fontSize: 12,
    textAlign: 'right',
    minWidth: 64,
  },
  diffValue: {
    fontSize: 15,
    textAlign: 'right',
    minWidth: 64,
  },
  // 右の列は太字（読み込んだ後の姿なので、こちらが結論）
  diffNext: {
    fontWeight: '700',
  },
  arrow: {
    fontSize: 13,
  },
  arrowSpace: {
    width: 24,
    textAlign: 'center',
  },
  newest: {
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 4,
  },
  reason: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    // アイコンと語の間は詰める（iOS 標準の戻るボタンと同じ見え方）
    marginLeft: -6,
    paddingVertical: 4,
    paddingRight: 12,
  },
  headerBackLabel: {
    fontSize: 17,
  },
});
