// バックアップと復元（SPEC-V8 §5・設計案 53 系）。設定タブ「データ」群の 3 行目から push で開く。
//
// **1 つのルートの中に 4 つの状態を持つ**（案 53a / 53f / 53h / 53k）:
//
//   create  … 作る（＋ 復元するものを選ぶ）      見出し「バックアップと復元」
//   preview … 読み込む中身（差の表）              見出し「読み込む中身」
//   error   … 読み込めなかった                    見出し「読み込む中身」（プレビューのまま）
//   result  … 復元しました                        見出し「読み込みの結果」
//
// **ルートを分けない。** 分けると、読み込んだ中身（写真のバイト列を含む Map）を
// ルートの引数で渡せず、モジュールの外に置き場を作ることになる ──
// 「選んだファイルは画面が閉じたら消える」という今の性質（DB にも端末にも
// 書かないまま持っている）を、置き場の寿命の話に変えたくない。
//
// ---
//
// **画面 4（エラー）と画面 5（完了）を 1 つの部品にまとめなかった。**
//
// 見た目は似ているが（アイコン ＋ 見出し ＋ カード ＋ 下端ボタン）、
// **採用した案ではこの 2 つは別の型**になっている:
//
// - 画面 4（案 53h）は**プレビュー画面のまま**上に赤枠のカードを差し込む形で、
//   アイコンも中央の見出しも持たない。下に選んだファイルのカードが不活性で残る
//   （比較用の案 53j は「結果の 1 画面」で完了と同じ型だったが、採らなかった）
// - 画面 5（案 53k）は中央にアイコンと見出しを置く結果の画面
//
// **共通なのは「型」ではなく部品 2 つ**なので、そちらを切り出した:
//   - `components/BottomActionBar` … 下端の 1 つの口（4 画面すべて）
//   - `components/NoticeCard`      … 色付きの紙（警告・危険・無事）
// これを 1 つの `ResultScreen` にまとめようとすると、`icon?` `dimmedCard?`
// `table?` `noticeChildren?` と**片方でしか使わない props が並ぶ器**になり、
// 中身を読まないとどちらの画面が出るのか分からなくなる。
//
// ---
//
// この画面が持つ他の判断:
//
// - **確認ダイアログを持たない**（旧実装の `Alert.alert('今あるデータをすべて置き換えます')`）。
//   プレビューの 1 枚が確認そのもの（BackupPreviewView.tsx 冒頭）
// - **上限は押した後に、下からのシートで受け止める**（案 53e）。押す前には出さない（§4.4）
// - **実行中は画面全体を触れなくする**（案 53a 右）。fflate の同期 API が JS スレッドを
//   止めるので見た目には止まって見えるが、**タップは溜まる** ── 連打で 2 回走らせない
import { Directory, File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { BottomActionBar, type BottomBarProgress } from '@/components/BottomActionBar';
import { ChoiceCardPair } from '@/components/ChoiceCardPair';
import { HelpButton } from '@/components/HelpButton';
import { HelpSheet } from '@/components/HelpSheet';
import { NoticeCard } from '@/components/NoticeCard';
import { backupRepository } from '@/db/client';
import { toDbDate } from '@/db/dates';
import {
  archivePhotoNames,
  BACKUP_MIME_TYPE,
  BACKUP_UTI,
  readBackupDirectory,
  readBackupZip,
  writeBackupZip,
  type BackupArchive,
  type BackupPhoto,
} from '@/media/backupArchive';
import { photoStore } from '@/media/expoPhotoFiles';
import {
  BACKUP_PHOTO_SIZE_LIMIT,
  BACKUP_PRESETS_FILE,
  BACKUP_RECORDS_FILE,
  BACKUP_RECORD_TAGS_FILE,
  BACKUP_TAGS_FILE,
  BackupError,
  buildBackupFile,
  buildBackupInfo,
  readBackupContents,
  tryReadBackupInfo,
  type BackupContents,
} from '@/logic/backup';
import { backupDiffRows, exceedsPhotoLimit, newestBackupRecord } from '@/logic/backupView';
import {
  backupCountPresetsLabel,
  backupCountRecordsLabel,
  backupCountTagsLabel,
  backupCreateButtonLabel,
  backupCreateFailedMessage,
  backupCreateNote,
  backupCreateSectionTitle,
  backupCreateWithoutPhotosLabel,
  backupCreatingLabel,
  backupCsvInsideNote,
  backupErrorCopyToastLabel,
  backupFolderPickUnavailable,
  BACKUP_INFO_FILE,
  backupNoPhotoWarning,
  backupPhotoExcludeDetail,
  backupPhotoExcludeLabel,
  backupPhotoIncludeLabel,
  backupPhotoSectionTitle,
  backupPickFileLabel,
  backupPickFolderLabel,
  backupPreviewBackLabel,
  backupPreviewScreenTitle,
  backupProgressWaitNote,
  backupRestoreNote,
  backupRestoreSectionTitle,
  backupRestoringLabel,
  backupResultScreenTitle,
  backupScreenTitle,
  backupShareDialogTitle,
  backupSharingUnavailable,
  backupCountChipLabel,
  backupErrorCopyText,
  backupLastCreatedNote,
  backupPhotoIncludeDetail,
  backupPhotoProgressLabel,
  closeLabel,
  copiedMessage,
  copyFailedMessage,
} from '@/logic/labels';
import { useSettings , useLocale, type Locale } from '@/settings';
import { useThemeColors } from '@/theme';

import { BackupPhotoLimitSheet } from './BackupPhotoLimitSheet';
import { BackupErrorView, BackupHeaderBack, BackupPreviewView } from './BackupPreviewView';
import { BackupResultView, type MissingPhotoRecord } from './BackupResultView';

/** 記録タブの入口（案 53k の「記録を見る」） */
const RECORDS_TAB_PATHNAME = '/records' as const;

/**
 * 「利用者が選択シートを閉じた」か（§5.4）。
 *
 * expo-file-system のフォルダ選択は取り消しを**例外**で返す
 * （`FilePickingCancelledException` → code `ERR_FILE_PICKING_CANCELLED`）。
 * 型が付いた判別の口が無いので、code と message の両方を見る ──
 * どちらかが将来変わっても、取り消しを「失敗」として出さない側に倒れるようにする。
 */
function isCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  return /cancel/i.test(text);
}

/**
 * 選んで検証まで済んだバックアップ 1 つぶん。
 *
 * `photos` は**書き戻せるものだけ**に絞ってある ── `records.csv` が指しているのに
 * `photos/` に無かったぶん（`contents.missingPhotos`）は最初から除いてあるので、
 * 復元の側は「入っているものを全部書く」だけでよい。
 */
type PickedBackup = {
  contents: BackupContents;
  photos: Map<string, Uint8Array>;
  /** 選んだファイル（フォルダ）の名前。**中身の判断には一切使わない**（§3.1） */
  fileName: string;
};

/** 画面の 4 つの状態（冒頭の表） */
type Stage =
  | { kind: 'create' }
  | { kind: 'preview'; picked: PickedBackup }
  | { kind: 'error'; fileName: string; reason: string; createdAt: string | null }
  | {
      kind: 'result';
      counts: { records: number; tags: number; presets: number };
      photos: number;
      missingPhotos: number;
      missingRecords: MissingPhotoRecord[];
    };

/**
 * 読み込んだアーカイブを画面が扱う形にする（§4.3）。
 *
 * **写真の照合はここで済ませる。** 欠けていてもエラーにはせず、
 * `missingPhotos` として持ち回って完了時に件数で伝える。
 */
function toPickedBackup(locale: Locale, archive: BackupArchive, fileName: string): PickedBackup {
  const contents = readBackupContents(locale, archive.files, archivePhotoNames(archive));
  // 指されていない写真（孤児）は書き戻さない ── 逆方向は検証しない（§4.3）ので、
  // ここで落としておけば復元は「入っているものを全部書く」で済む
  const referenced = new Set(
    contents.tables.records.map((row) => row.photo_file_name).filter((name) => name !== ''),
  );
  const photos = new Map<string, Uint8Array>();
  for (const [name, bytes] of archive.photos) {
    if (referenced.has(name)) photos.set(name, bytes);
  }
  return { contents, photos, fileName };
}

/**
 * 次の描画に 1 回だけ譲る（案 53a 右の進捗）。
 *
 * 写真の読み書きは 1 枚ずつなので、**その合間に描画を挟めば進捗が動く。**
 * 挟まないと、ループが終わるまで JS スレッドが空かず、最後の 1 枚まで
 * 「0 枚目」のまま止まって見える（fflate の同期 API そのものは分割できないので、
 * 帯が最後に一度止まるのは受け入れる）。
 */
function yieldToRender(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function BackupScreen() {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const router = useRouter();
  const { lastBackupAt, setLastBackupAt } = useSettings();

  const [stage, setStage] = useState<Stage>({ kind: 'create' });
  /** 写真を含めるか（§4.4 / 案 53a）。**既定は「含める」** */
  const [includePhotos, setIncludePhotos] = useState(true);
  /** 上限を超えたときのシート（案 53e）。**押した後にしか開かない** */
  const [limitSheet, setLimitSheet] = useState(false);
  /**
   * ヘッダの「？」（UI-SPEC §5-9）。**作る画面（stage.kind === 'create'）にだけ置く** ──
   * プレビュー・結果・エラーの 3 状態はどれも「いま何が起きるか」を画面自身が
   * 数字で言っている面で、そこに読み物への口を足すと読む先が 2 つになる。
   */
  const [showHelp, setShowHelp] = useState(false);
  /**
   * 実行中の進捗（案 53a 右）。null = 動いていない。
   * **これが画面全体の触れなさも兼ねる** ── 状態を 2 つ持つと必ずずれる。
   */
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );

  /**
   * いま端末にあるもの（件数・写真の枚数と合計サイズ）。
   * **写真の実体は読まない**（`list()` は File.size だけを見る）。画面復帰のたびに数え直す。
   */
  const [current, setCurrent] = useState({ records: 0, tags: 0, presets: 0, photos: 0, bytes: 0 });

  const refreshCurrent = useCallback(() => {
    const counts = backupRepository.counts();
    const photos = photoStore.list();
    setCurrent({
      records: counts.records,
      tags: counts.tags,
      presets: counts.presets,
      photos: photos.length,
      bytes: photos.reduce((sum, photo) => sum + photo.size, 0),
    });
  }, []);

  useFocusEffect(refreshCurrent);

  /** 「きょう」「きのう」の基準（案 53f）。描画のたびに `new Date()` を作らない */
  const today = useMemo(() => new Date(), []);
  const busy = progress != null;

  const bottomProgress: BottomBarProgress | null =
    progress == null
      ? null
      : {
          ratio: progress.total === 0 ? 0 : progress.done / progress.total,
          label: progress.label,
          note:
            progress.total === 0
              ? backupProgressWaitNote(locale)
              : `${backupPhotoProgressLabel(locale, progress.done, progress.total)}　${backupProgressWaitNote(locale)}`,
        };

  // ---- バックアップを作る（§5.3 / 案 53a） ----

  /**
   * 写真を**1 枚ずつ**読んでバイト列にする（§4.4）。
   *
   * ここで初めて実体をメモリに載せる ── それまで（枚数・合計サイズの表示、上限の判定）は
   * `photoStore.list()` が返すメタデータだけで済ませてある。
   * **1 枚読むごとに描画へ譲る**ので、下端の帯が動く。
   */
  const readPhotos = useCallback(async (label: string): Promise<BackupPhoto[]> => {
    const list = photoStore.list();
    const photos: BackupPhoto[] = [];
    for (const [index, photo] of list.entries()) {
      setProgress({ done: index + 1, total: list.length, label });
      await yieldToRender();
      photos.push({ name: photo.name, bytes: photoStore.read(photo.name) });
    }
    return photos;
  }, []);

  /** 実際に ZIP を作って共有シートへ渡す。写真を含めるかは呼び出し側が決める（§4.4） */
  const buildAndShare = useCallback(
    async (withPhotos: boolean) => {
      setProgress({ done: 0, total: 0, label: backupCreatingLabel(locale) });
      try {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert(backupSharingUnavailable(locale));
          return;
        }

        const createdAt = new Date();
        const tables = backupRepository.dump();
        const photos = withPhotos ? await readPhotos(backupCreatingLabel(locale)) : [];
        const files = new Map<string, string>([
          [
            BACKUP_INFO_FILE,
            buildBackupInfo(
              {
                records: tables.records.length,
                presets: tables.presets.length,
                tags: tables.tags.length,
                recordTags: tables.recordTags.length,
              },
              toDbDate(createdAt),
              photos.length,
            ),
          ],
          [BACKUP_RECORDS_FILE, buildBackupFile(BACKUP_RECORDS_FILE, tables.records)],
          [BACKUP_PRESETS_FILE, buildBackupFile(BACKUP_PRESETS_FILE, tables.presets)],
          [BACKUP_TAGS_FILE, buildBackupFile(BACKUP_TAGS_FILE, tables.tags)],
          [BACKUP_RECORD_TAGS_FILE, buildBackupFile(BACKUP_RECORD_TAGS_FILE, tables.recordTags)],
        ]);

        const uri = writeBackupZip(files, photos, createdAt);
        // **ファイルができた時点で「作った」とみなす**（案 53a の「前回作ったのは …」）──
        // この後の共有シートは保存先を選ぶだけで、閉じても ZIP は残っている
        setLastBackupAt(toDbDate(createdAt));

        await Sharing.shareAsync(uri, {
          mimeType: BACKUP_MIME_TYPE,
          UTI: BACKUP_UTI,
          dialogTitle: backupShareDialogTitle(locale),
        });
      } catch {
        // 原因は端末側（容量・共有先の失敗）なので、言えるのは「できなかった」まで
        Alert.alert(backupCreateFailedMessage(locale));
      } finally {
        setProgress(null);
      }
    },
    [readPhotos, setLastBackupAt, locale],
  );

  /**
   * 「バックアップを作る」を押したとき（§4.4 / 案 53e）。
   *
   * **上限は押した後に初めて出る。** 押す前に「50MB まで」と書いても、
   * 大半の利用者には無関係な数字で、「何枚までか」を考えさせるだけになる。
   * 超えている人にだけ、具体的な数字と逃げ道を出す。
   */
  const createBackup = useCallback(() => {
    if (includePhotos && exceedsPhotoLimit(current.bytes, BACKUP_PHOTO_SIZE_LIMIT)) {
      setLimitSheet(true);
      return;
    }
    void buildAndShare(includePhotos);
  }, [includePhotos, current.bytes, buildAndShare]);

  // ---- 復元するものを選ぶ（§5.4） ----
  //
  // **選んだ時点では読んで検証するだけ。** DB は触らない ── 壊れたファイルなら
  // ここで止まるので、プレビューまで進む時点で「入ることは確かめ済み」になる。

  /**
   * 読めたらプレビューへ、読めなければエラーの画面へ（案 53f / 53h）。
   *
   * **アーカイブとして開けた後の失敗**（列が違う・値が読めない）は、
   * ファイル名と作成日を添えて出せる ── そこまでは読めているので、
   * 「何を選んだのか」を画面に残せる（`tryReadBackupInfo`）。
   */
  const showArchive = useCallback((archive: BackupArchive, fileName: string) => {
    try {
      setStage({ kind: 'preview', picked: toPickedBackup(locale, archive, fileName) });
    } catch (error) {
      if (!(error instanceof BackupError)) throw error;
      setStage({
        kind: 'error',
        fileName,
        reason: error.message,
        createdAt: tryReadBackupInfo(locale, archive.files)?.createdAt ?? null,
      });
    }
  }, [locale]);

  const pickFile = useCallback(async () => {
    try {
      // ZIP の MIME を指定しない ── 端末やクラウドの提供元によっては
      // application/octet-stream として出てくるので、絞ると選べないファイルができる
      const result = await File.pickFileAsync();
      if (result.canceled || result.result == null) return;

      const file = result.result;
      showArchive(readBackupZip(locale, file), file.name);
    } catch (error) {
      // ZIP として開けなかった（壊れている・そもそも ZIP ではない）。
      // ここではファイルの中身が何も読めていないので、名前も作成日も出せない
      if (error instanceof BackupError) {
        setStage({ kind: 'error', fileName: '', reason: error.message, createdAt: null });
        return;
      }
      throw error;
    }
  }, [showArchive, locale]);

  const pickFolder = useCallback(async () => {
    try {
      const directory = await Directory.pickDirectoryAsync();
      if (directory == null) return;

      showArchive(readBackupDirectory(locale, directory), directory.name);
    } catch (error) {
      // 3 通りを分ける:
      //   - 中身が読めない        … 画面で理由を出す（案 53h）
      //   - 利用者が閉じた        … **何も出さない**
      //   - フォルダ選択が使えない … ZIP を選ぶよう案内する
      if (error instanceof BackupError) {
        setStage({ kind: 'error', fileName: '', reason: error.message, createdAt: null });
        return;
      }
      // **ファイル選択（pickFileAsync）と違い、フォルダ選択は取り消しが例外で返る**
      // （iOS の FilePickingCancelledException / Android も同様）。返り値で
      // 区別できないので、ここだけは文字列で判定する ── 取り消しのたびに
      // 「使えません」と出す方が害が大きい
      if (isCancellation(error)) return;

      Alert.alert(backupFolderPickUnavailable(locale));
    }
  }, [showArchive, locale]);

  // ---- 置き換える（§4.5 / 案 53f → 53k） ----

  const runRestore = useCallback(
    async (picked: PickedBackup) => {
      setProgress({ done: 0, total: picked.photos.size, label: backupRestoringLabel(locale) });
      try {
        // **DB が先、写真が後**（§4.5）── 逆にすると、DB の書き込みが巻き戻ったときに
        // 「記録は残っているのに写真だけ消えた」状態になる。repository.remove が
        // 実体の削除をトランザクションの外でやるのと同じ理由（SPEC-V5 §1.5）。
        //
        // **手順 2**: DB を全置換する。**「全か無か」の約束はここまで**（§4.5）。
        // 書き戻せる写真の名前を渡すので、欠けている写真を指す記録は
        // この時点で photo_file_name が null になる（壊れた画像を出さない）
        const available = new Set(picked.photos.keys());
        backupRepository.restore(picked.contents.tables, available);

        // **手順 3**: いまある写真を消す（記録が全置換され、参照元がもう無い）
        photoStore.removeAll();

        // **手順 4**: 1 枚ずつ書き出す。**ここの失敗は復元の失敗ではない**（§4.5）──
        // ファイルシステムに巻き戻しが無いので、トランザクションには入れられない
        const failed: string[] = [];
        let done = 0;
        for (const [name, bytes] of picked.photos) {
          done += 1;
          setProgress({ done, total: picked.photos.size, label: backupRestoringLabel(locale) });
          await yieldToRender();
          try {
            photoStore.write(name, bytes);
          } catch {
            failed.push(name);
          }
        }

        // **手順 5**: 書き出せなかったぶんを null に落として整合を取る（§4.5）。
        // ここを飛ばすと、実体の無い名前が残って壊れた画像が出る
        if (failed.length > 0) backupRepository.clearPhotos(failed);

        // 案 53k: 欠けた写真を持っていた記録を、商品名で言えるようにしておく ──
        // 「3枚は復元できず」だけでは、どの記録を撮り直せばいいのか分からない
        const lost = new Set([...picked.contents.missingPhotos, ...failed]);
        const missingRecords: MissingPhotoRecord[] = picked.contents.tables.records
          .filter((row) => lost.has(row.photo_file_name))
          .map((row) => ({
            id: row.id,
            itemName: row.item_name,
            date: row.sale_date === '' ? row.sale_start_date : row.sale_date,
          }));

        const counts = backupRepository.counts();
        setStage({
          kind: 'result',
          counts: { records: counts.records, tags: counts.tags, presets: counts.presets },
          photos: available.size - failed.length,
          missingPhotos: lost.size,
          missingRecords,
        });
        refreshCurrent();
      } catch (error) {
        // ここまで来る失敗は DB 側だけ。トランザクションが巻き戻しているので
        // 「変更されていません」はそのまま正しい（案 53h の緑の帯）
        setStage({
          kind: 'error',
          fileName: picked.fileName,
          reason: error instanceof BackupError ? error.message : String(error),
          createdAt: picked.contents.preview.createdAt,
        });
      } finally {
        setProgress(null);
      }
    },
    [refreshCurrent, locale],
  );

  // ---- エラーの内容をコピーする（案 53h） ----

  const copyError = useCallback(async (reason: string) => {
    try {
      await Clipboard.setStringAsync(backupErrorCopyText(locale, reason));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: copiedMessage(locale, backupErrorCopyToastLabel(locale)) });
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: 'error', text1: copyFailedMessage(locale, backupErrorCopyToastLabel(locale)) });
    }
  }, [locale]);

  const backToCreate = useCallback(() => setStage({ kind: 'create' }), []);

  // ---- 描画 ----

  if (stage.kind === 'preview' || stage.kind === 'error') {
    const previewHeader = (
      <Stack.Screen
        options={{
          title: backupPreviewScreenTitle(locale),
          // 標準の戻るは設定画面まで戻ってしまう。ここで戻りたいのは作る画面
          headerBackVisible: false,
          headerLeft: () =>
            busy ? null : (
              <BackupHeaderBack label={backupPreviewBackLabel(locale)} onPress={backToCreate} />
            ),
          // **前の状態が置いた右上のボタンを必ず消す。** react-navigation の options は
          // 積み重なるので、書かない項目は前の画面のまま残る（完了画面の「閉じる」が
          // プレビューに出たままになる）
          headerRight: undefined,
          // 置き換えている最中は横に払っても抜けられない（連打防止と同じ理由）
          gestureEnabled: !busy,
        }}
      />
    );

    if (stage.kind === 'error') {
      return (
        <>
          {previewHeader}
          <BackupErrorView
            fileName={stage.fileName}
            createdAt={stage.createdAt}
            reason={stage.reason}
            today={today}
            onPickAnother={() => void pickFile()}
            onCopy={() => void copyError(stage.reason)}
          />
        </>
      );
    }

    const file = {
      records: stage.picked.contents.preview.counts.records,
      tags: stage.picked.contents.preview.counts.tags,
      presets: stage.picked.contents.preview.counts.presets,
      photos: stage.picked.contents.preview.photoCount,
    };
    const currentSide = {
      records: current.records,
      tags: current.tags,
      presets: current.presets,
      photos: current.photos,
    };

    return (
      <>
        {previewHeader}
        <BackupPreviewView
          fileName={stage.picked.fileName}
          createdAt={stage.picked.contents.preview.createdAt}
          current={currentSide}
          file={file}
          rows={backupDiffRows(currentSide, file)}
          newest={newestBackupRecord(stage.picked.contents.tables.records)}
          today={today}
          onReplace={() => void runRestore(stage.picked)}
          onPickAnother={() => void pickFile()}
          progress={bottomProgress}
        />
      </>
    );
  }

  if (stage.kind === 'result') {
    return (
      <>
        <Stack.Screen
          options={{
            title: backupResultScreenTitle(locale),
            headerBackVisible: false,
            headerLeft: undefined,
            // 読み込みは終わっているので、閉じる先は作る画面（もう一度作れる場所）
            headerRight: () => (
              <Pressable onPress={backToCreate} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.headerAction, { color: colors.blue }]}>{closeLabel(locale)}</Text>
              </Pressable>
            ),
          }}
        />
        <BackupResultView
          counts={stage.counts}
          photos={stage.photos}
          missingPhotos={stage.missingPhotos}
          missingRecords={stage.missingRecords}
          onOpenRecords={() => router.navigate(RECORDS_TAB_PATHNAME)}
        />
      </>
    );
  }

  // 画面 1: 作る（案 53a / 53b）
  const hasPhotos = current.photos > 0;
  const excluded = hasPhotos && !includePhotos;

  return (
    <>
      {/* 見出しと左右のボタンを毎回すべて書く（上の headerRight の注記と同じ理由）。
          ここは標準の「‹ 設定」に戻す */}
      <Stack.Screen
        options={{
          title: backupScreenTitle(locale),
          headerBackVisible: true,
          headerLeft: undefined,
          // 実行中は押せる口を下端の帯だけに絞る（画面全体を触れなくするのと同じ理由）
          headerRight: busy
            ? undefined
            : () => <HelpButton onPress={() => setShowHelp(true)} />,
          gestureEnabled: !busy,
        }}
      />
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* **実行中は画面全体を触れなくする**（案 53a 右）。薄くするのは
            「いま押せない」ことを色でも言うため ── 下端の帯だけは外に置いて残す */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          pointerEvents={busy ? 'none' : 'auto'}>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, opacity: busy ? 0.4 : 1 }]}>
            <Text style={[styles.cardTitle, { color: colors.label }]}>
              {backupCreateSectionTitle(locale)}
            </Text>
            <Text style={[styles.body14, { color: colors.secondaryLabel }]}>
              {backupCreateNote(locale)}
            </Text>

            {/* 件数の帯（案 53a）。**何が入るのか**を数で見せる */}
            <View style={[styles.counts, { borderTopColor: colors.separator }]}>
              {[
                [backupCountRecordsLabel(locale), current.records],
                [backupCountTagsLabel(locale), current.tags],
                [backupCountPresetsLabel(locale), current.presets],
              ].map(([label, count]) => (
                <Text
                  key={label}
                  numberOfLines={1}
                  style={[styles.countChip, { color: colors.label }]}>
                  {backupCountChipLabel(locale, String(label), Number(count))}
                </Text>
              ))}
            </View>
          </View>

          {/* 写真が 1 枚も無ければカードごと出さない ── 選ばせるものが無く、
              「含めない」の警告（新しい端末で写真が出ない）も嘘になる */}
          {hasPhotos && (
            <View style={[styles.card, { backgroundColor: colors.secondaryBackground, opacity: busy ? 0.4 : 1 }]}>
              <Text style={[styles.cardTitle, { color: colors.label }]}>
                {backupPhotoSectionTitle(locale)}
              </Text>
              <ChoiceCardPair
                options={[
                  {
                    label: backupPhotoIncludeLabel(locale),
                    detail: backupPhotoIncludeDetail(locale, current.photos, current.bytes),
                  },
                  { label: backupPhotoExcludeLabel(locale), detail: backupPhotoExcludeDetail(locale) },
                ]}
                selectedIndex={includePhotos ? 0 : 1}
                onChange={(index) => setIncludePhotos(index === 0)}
                disabled={busy}
              />
              {/* **選んだ場所のすぐ下**に出す（案 53b）。カードの外に置くと、
                  選んだ瞬間の視線から外れる */}
              {excluded && <NoticeCard tone="warning" body={backupNoPhotoWarning(locale)} />}
            </View>
          )}

          <Text style={[styles.outerNote, { color: colors.secondaryLabel, opacity: busy ? 0.4 : 1 }]}>
            {backupCsvInsideNote(locale)}
          </Text>

          {/* 復元の入口。**作る側と同じ画面に置く**（§5.2）── 機種変更では
              「作って、渡して、戻す」が 1 続きなので、口が別の画面にあると
              渡された側が探すことになる */}
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, opacity: busy ? 0.4 : 1 }]}>
            <Text style={[styles.cardTitle, { color: colors.label }]}>
              {backupRestoreSectionTitle(locale)}
            </Text>
            <Text style={[styles.body14, { color: colors.secondaryLabel }]}>
              {backupRestoreNote(locale)}
            </Text>
            <PickButton label={backupPickFileLabel(locale)} onPress={() => void pickFile()} disabled={busy} />
            <PickButton label={backupPickFolderLabel(locale)} onPress={() => void pickFolder()} disabled={busy} />
          </View>
        </ScrollView>

        <BottomActionBar
          label={excluded ? backupCreateWithoutPhotosLabel(locale) : backupCreateButtonLabel(locale)}
          onPress={createBackup}
          progress={bottomProgress}
          note={backupLastCreatedNote(locale, lastBackupAt)}
        />
      </View>

      <BackupPhotoLimitSheet
        visible={limitSheet}
        photos={{ count: current.photos, bytes: current.bytes }}
        limit={BACKUP_PHOTO_SIZE_LIMIT}
        counts={{ records: current.records, tags: current.tags, presets: current.presets }}
        onCreateWithoutPhotos={() => {
          setLimitSheet(false);
          setIncludePhotos(false);
          void buildAndShare(false);
        }}
        onCancel={() => {
          setLimitSheet(false);
          // **閉じた先を行き止まりにしない**（案 53e）── 「含めない」に倒しておけば、
          // そのまま作ることも、写真を減らしてから戻ってくることもできる
          setIncludePhotos(false);
        }}
      />

      {/* ヘッダの「？」。設定タブの中なので「最初から読む」で使いかた全体へ push できる */}
      {showHelp && (
        <HelpSheet
          entry="backup"
          onClose={() => setShowHelp(false)}
          onReadAll={() => router.push('/settings/help')}
        />
      )}
    </>
  );
}

/** 復元するものを選ぶ 2 つのボタン。地色のまま（押しても消えるものは無い） */
function PickButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pick,
        { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.pickLabel, { color: disabled ? colors.disabledContent : colors.blue }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  body14: {
    fontSize: 14,
    lineHeight: 20,
  },
  // 件数の帯。3 つを等分に置く（数の大小で位置が動くと読み比べにくい）
  counts: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  countChip: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  // カードの外に置く補足（案 53a）。設定画面の群の下の注記と同じ寸法
  outerNote: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
  pick: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerAction: {
    fontSize: 17,
    fontWeight: '600',
  },
});
