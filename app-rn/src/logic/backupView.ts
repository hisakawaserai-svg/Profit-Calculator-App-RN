// バックアップ画面が出す「数字の並べ方」だけを持つ純粋関数（設計案 53 系）。
//
// logic/backup.ts が「ファイルとして正しいか」を見るのに対し、ここは
// **読めたファイルを人にどう見せるか**だけを引き受ける ── 端末にも DB にも触らない。
// 分けてあるのは、この判断（どの行が赤くなるか・どの警告が出るか）が
// 画面を動かさずに確かめられる形であってほしいから。
//
// **画面の分岐はここで決めて、画面は結果を描くだけにする。**
// 「減っているか」「大きく減っているか」「写真が消えるか」は、
// 押した後に取り返しがつかない操作（全置換）の唯一の手がかりなので、
// 条件が JSX の中に散ると、後から誰も全体を確かめられなくなる。

import type { BackupRow } from './backup';
import {
  BACKUP_PREVIEW_PHOTOS_LABEL,
  BACKUP_PREVIEW_PRESETS_LABEL,
  BACKUP_PREVIEW_RECORDS_LABEL,
  BACKUP_PREVIEW_TAGS_LABEL,
} from './labels';

/** 差の表の片側 1 列ぶん（今の端末 / ファイル）。**写真も同じ表に並べる**（案 53f） */
export type BackupSideCounts = {
  records: number;
  tags: number;
  presets: number;
  photos: number;
};

/**
 * 差の表の 1 行（案 53f）。
 *
 * `decreasing` は**値そのものから決める**（画面では色にしか使わない）──
 * 「増える」も「減る」も同じ黒で出すと、間違ったファイルを選んだことに
 * 気付ける唯一の手がかりが消える。
 */
export type BackupDiffRow = {
  label: string;
  current: number;
  next: number;
  /** 件（記録・タグ・プリセット）か枚（写真）か。単位が混ざると読み違える */
  unit: 'count' | 'photo';
  /** 今より減る行。**画面はここだけを赤くする** */
  decreasing: boolean;
};

/**
 * 「今の端末 → ファイル」の 4 行（案 53f）。
 *
 * **並びは固定**（記録・タグ・プリセット・写真）── 大事な順に上から並べる。
 * **写真の行は 0 枚でも出す**（プレビューの旧実装は 0 枚の行を隠していた）。
 * 差の表では 0 に意味がある ── 「写真なしのバックアップを選んだ」ことは
 * 行が消えることではなく `31枚 → 0枚` と赤で出ることでしか伝わらない。
 */
export function backupDiffRows(
  current: BackupSideCounts,
  next: BackupSideCounts,
): BackupDiffRow[] {
  const row = (
    label: string,
    unit: 'count' | 'photo',
    from: number,
    to: number,
  ): BackupDiffRow => ({ label, current: from, next: to, unit, decreasing: to < from });

  return [
    row(BACKUP_PREVIEW_RECORDS_LABEL, 'count', current.records, next.records),
    row(BACKUP_PREVIEW_TAGS_LABEL, 'count', current.tags, next.tags),
    row(BACKUP_PREVIEW_PRESETS_LABEL, 'count', current.presets, next.presets),
    row(BACKUP_PREVIEW_PHOTOS_LABEL, 'photo', current.photos, next.photos),
  ];
}

/**
 * 「大きく減る」の閾値（案 53f の注意帯）。**記録の行だけを見る。**
 *
 * - 半分未満になること … 割合で見るのは、10 件の人と 500 件の人で
 *   「大きい」の意味が違うため
 * - かつ 5 件以上減ること … 3 件が 1 件になるのは、試しに入れた記録を
 *   消しただけのことが多い。全部に帯を出すと、帯そのものが読まれなくなる
 *
 * 写真は別に赤枠のカードで言う（案 53g）ので、ここには入れない。
 */
const LARGE_DECREASE_MIN = 5;

export function isLargeDecrease(current: number, next: number): boolean {
  return current - next >= LARGE_DECREASE_MIN && next < current / 2;
}

/**
 * ファイルの中で**一番新しい記録**（案 53f の 1 文）。
 *
 * 見るのは「売れた日、無ければ出品した日」── 売れた記録は出品日より後に
 * 販売日が付くので、出品日だけで並べると「最近さわった記録」から外れる。
 * 日付は保存形式（"YYYY-MM-DDTHH:mm:ss.SSS"）のまま返す。文言は labels 側で作る。
 *
 * 空のファイル（記録 0 件）では null ── 出す文が無いことは画面の側で分岐する。
 */
export function newestBackupRecord(
  records: readonly BackupRow[],
): { date: string; itemName: string } | null {
  let newest: { date: string; itemName: string } | null = null;
  for (const record of records) {
    const date = record.sale_date === '' ? record.sale_start_date : record.sale_date;
    // 文字列のまま比べられる（ISO 8601 の固定長。logic/backup.ts が形を保証している）
    if (newest == null || date > newest.date) newest = { date, itemName: record.item_name };
  }
  return newest;
}

/**
 * 写真の合計が上限を超えているか（§4.4）。**押した後に初めて呼ぶ。**
 *
 * 「含める」を選んでいるときだけ効く ── 含めないバックアップは写真を
 * 1 枚もメモリに載せないので、何枚あっても上限には関係しない。
 */
export function exceedsPhotoLimit(bytes: number, limit: number): boolean {
  return bytes > limit;
}

/**
 * 上限の棒グラフ（案 53e）で、**上限の目盛りを左から何割の位置に置くか**。
 *
 * 棒の全長は「今の写真の量」で、その中に上限の線を引く ── 逆（全長 = 上限）に
 * すると超過分が棒からはみ出して描けず、「大幅に超えている」のか
 * 「あと少しなのか」が同じ見た目になる。
 */
export function photoLimitMarkerRatio(bytes: number, limit: number): number {
  if (bytes <= 0) return 1;
  return Math.min(1, limit / bytes);
}
