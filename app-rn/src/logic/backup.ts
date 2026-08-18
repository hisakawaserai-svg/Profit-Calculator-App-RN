// バックアップと復元（SPEC-V8）の純粋関数。**端末にも DB にも触らない。**
//
// ここにあるのは「どんな CSV を書くか」「読んだ CSV をどう検証するか」だけで、
// ZIP の組み立ては media/backupArchive.ts、DB の入れ替えは db/backup.ts が持つ。
// logic/csv.ts（既存の書き出し）と同じ分け方だが、**あちらとは一切共有しない**（§0.2）──
// 既存の 19 列 / 11 列は人が表計算で読むための形で、こちらは機械が読み戻すための形。
// 片方の都合でもう片方の列が動くと、復元できないバックアップが静かに生まれる。
//
// **引用の規則だけは logic/csv.ts のものを借りる**（`escapeCsvField`）── RFC 4180 の
// 書き方が 2 通りあると、書いた側と読む側で食い違ったときに原因が追えなくなる。
//
// ---
//
// **写真を含めない前提でこの設計が成り立っている**（§4）。
//
// バックアップは records / presets / tags / record_tags の 4 つの CSV だけなので、
// 1000 件でも数百 KB に収まり、**ZIP の組み立ても展開もメモリ上で一度に**行える
// （fflate の同期 API。media/backupArchive.ts）。
//
// **将来、写真を ZIP に含めるなら、ここの前提から見直しが要る** ── 写真は 1 枚
// 100〜300KB（SPEC-V5 §1.4）で 500 件なら 50〜150MB になり、その規模では
// メモリ上に全体を載せる作りが破綻する。パスを渡してストリームで処理する
// ネイティブの ZIP 実装（react-native-zip-archive など）へ乗り換える判断になる。
// **「写真を含めない」という決定が、fflate 1 つで足りている根拠そのもの。**

import { escapeCsvField } from './csv';
import {
  BACKUP_INFO_FILE,
  backupColumnErrorMessage,
  backupColumnMismatchMessage,
  backupEmptyColumnMessage,
  backupFieldCountMessage,
  backupMissingFileMessage,
  BACKUP_EMPTY_FILE_MESSAGE,
  backupNoCsvMessage,
  backupUnsupportedVersionMessage,
  backupUnknownRecordRefMessage,
  backupUnknownTagRefMessage,
  backupDateError,
  backupNumberError,
  backupBooleanError,
  BACKUP_ENUM_ERROR,
} from './labels';

// ---- 形式のバージョン（§1.2） ----

/**
 * バックアップの形式のバージョン。**ZIP 全体で 1 つ**（ファイルごとに分けない。§1.2）。
 *
 * 上げるのは**列の増減・意味の変更**があったときだけ ── 中身の件数や並びは版に関係しない。
 * DB のマイグレーション番号（drizzle の 0008…）とは**別の数**にしてある:
 * マイグレーションは「内部の都合で何度でも増える」もので、そのたびに
 * 古いバックアップを読めなくする理由がない。
 *
 * **2 は写真を含められるようにした版**（§4）── `backup-info.csv` に `photo_count` が増え、
 * `photos/` が入り得る。1 との差はそれだけなので、1 も読める（下の MIN）。
 *
 * **3 は records.csv に目標利益（`target_profit`）と出品日（`listed_at`）を足した版**
 * （SPEC-V9 §3）。列が増えたので版を上げるが、**2 以前のファイルもそのまま読める** ──
 * 足りない 2 列は null として読み込む（`parseBackupFile` の互換の節）。
 */
export const BACKUP_FORMAT_VERSION = 3;

/**
 * 読み込みを受け付ける版の下限（§1.2）。
 *
 * **1 を読めるままにしてある** ── 版が上がったからといって、利用者が既に持っている
 * バックアップを読めなくする理由がない。1 と 2 の違いは「写真が入り得るか」だけで、
 * 記録・プリセット・タグの列は同じ。
 *
 * 未来の版（`BACKUP_FORMAT_VERSION` より大きい）は弾く ── 知らない列を
 * 黙って捨てると、復元できたつもりでデータが減る。
 */
export const BACKUP_MIN_SUPPORTED_VERSION = 1;

// ---- 列の定義（§2） ----

/**
 * 列の型。**検証の仕方がこれで決まる**（§3.2）。
 *
 * - `text`     … そのまま。空文字も通る
 * - `number`   … 桁区切りなしの数値。空・非数値はエラー（§2.2）
 * - `numberOrEmpty` … 上に加えて空欄を許す（target_profit の null。SPEC-V9 §3）
 * - `boolean`  … "0" / "1"。DB の integer(boolean) をそのまま写す
 * - `date`     … "YYYY-MM-DDTHH:mm:ss.SSS"（§2.3）
 * - `dateOrEmpty` … 上に加えて空欄を許す（sale_date の null。§2.3）
 * - `enum`     … 決まった語のどれか
 */
type ColumnType =
  | 'text'
  | 'number'
  | 'numberOrEmpty'
  | 'boolean'
  | 'date'
  | 'dateOrEmpty'
  | 'enum';

type ColumnSpec = {
  /** CSV のヘッダに出る列名。**DB のカラム名そのまま**（§2.1） */
  name: string;
  type: ColumnType;
  /** `enum` のときの候補 */
  values?: readonly string[];
  /**
   * 空を許さない列（§3.2 の「必須列が空でないか」）。
   * `number` / `boolean` / `date` は型の側で空を弾くので、この印が要るのは `text` だけ。
   */
  required?: boolean;
  /** エラー文に出す日本語の名前（§3.3）。無ければ列名をそのまま出す */
  label?: string;
};

/**
 * records.csv の 19 列（§2.1 ＋ SPEC-V9 §3）。**DB の全カラムをカラム名のまま・定義順に出す。**
 *
 * 計算値（販売手数料額・経費合計・収支）は入れない ── 保存されているのは率で、
 * 額は計算で出る（SPEC §2.2）。書いても読み戻さないので、読み手に嘘の選択肢を見せるだけになる。
 * 既存の 19 列 CSV との違いはここと、日付が時刻まで入ること（§2.3）。
 *
 * **新しい列は必ず末尾に足す**（`backup-info.csv` の `photo_count` と同じ理由。§4.1）──
 * 途中に挿すと、古いファイルを「先頭 n 列が一致するか」で読む道が塞がる。
 */
const RECORD_COLUMNS: readonly ColumnSpec[] = [
  { name: 'id', type: 'text', required: true, label: '記録ID' },
  { name: 'item_name', type: 'text', label: '商品名' },
  { name: 'sales_price', type: 'number', label: '販売価格' },
  { name: 'purchase_price', type: 'number', label: '仕入価格' },
  { name: 'postage', type: 'number', label: '送料' },
  { name: 'envelope_cost', type: 'number', label: '梱包材' },
  { name: 'others_cost', type: 'number', label: 'その他' },
  { name: 'commission', type: 'number', label: '手数料率' },
  { name: 'is_sold', type: 'boolean', label: '状態' },
  { name: 'sale_start_date', type: 'date', label: '出品日' },
  // 出品中は空欄。読み込み時は is_sold で判定する（§2.3）
  { name: 'sale_date', type: 'dateOrEmpty', label: '販売日' },
  { name: 'memo', type: 'text', label: 'メモ' },
  { name: 'kind', type: 'enum', values: ['used', 'sourced'], label: '種別' },
  { name: 'site_name', type: 'text', label: '販売サイト' },
  // 写真は復元しない（§4）ので、書き出しでは常に空欄になる。列そのものは残す ──
  // 列を落とすと「19 列 = DB の全カラム」という読みやすい対応が崩れる
  { name: 'photo_file_name', type: 'text', label: '写真' },
  { name: 'shipping_material_cost', type: 'number', label: '資材費' },
  { name: 'excludes_shipping_material', type: 'boolean', label: '専用資材を使わない' },
  // 目標利益（SPEC-V9 §3）。**空欄 = 目標を決めていない**（0 とは別）。
  // 他の金額列と違って空を許すのはそのため ── ここを number にすると、
  // 目標を決めていない記録が 1 件でもあるバックアップを自分で書いて自分で弾く
  { name: 'target_profit', type: 'numberOrEmpty', label: '目標利益' },
  // 将来の出品日（SPEC-V9 §1）。アプリはまだ書き込まないので、当面は常に空欄。
  // それでも列を出すのは「records.csv = DB の全カラム」の対応を保つため
  { name: 'listed_at', type: 'dateOrEmpty', label: '出品日（予備）' },
];

/**
 * SPEC-V9 §3 より前の records.csv（17 列）。**復元の互換のためだけに残す。**
 *
 * 末尾の 2 列（`target_profit` / `listed_at`）が無いバックアップを、
 * **エラーにせず null として読み込む**ための表（§3 の「1 件でもエラーなら一切読み込まない」の例外）。
 * 例外にする理由は写真の欠落（§4.3）と同じ考え方 ── 列が 2 つ増えたというアプリ側の都合で、
 * 利用者が既に持っているバックアップを読めなくする理由がない。
 * 目標利益は後から足した任意項目なので、無くても記録の意味は変わらない。
 *
 * **末尾を削るだけで作る**（列名を書き写さない）── 書き写すと、
 * 先頭 17 列を直したときにこちらだけが古くなる。
 */
const RECORD_COLUMNS_LEGACY: readonly ColumnSpec[] = RECORD_COLUMNS.slice(
  0,
  RECORD_COLUMNS.length - 2,
);

/**
 * presets.csv の 15 列（§2.1 ＋ SPEC-V10 §1.6）。
 *
 * **新しい列は必ず末尾に足す**（records.csv と同じ理由）── 途中に挿すと、
 * 古いファイルを「先頭 n 列が一致するか」で読む道が塞がる。
 *
 * `calc_method` を `enum` にしないのは、古いファイルに**この列そのものが無い**ため ──
 * 足りない列は空文字で埋まる（withMissingColumns）ので、enum の候補には入らない。
 * 知らない値を既定（'individual'）へ倒すのは読み出し側（logic/preset.presetCalcMethod）で、
 * これは DB の color_key と同じ扱い。
 */
const PRESET_COLUMNS: readonly ColumnSpec[] = [
  { name: 'id', type: 'text', required: true, label: 'プリセットID' },
  { name: 'type', type: 'enum', values: ['site', 'shipping', 'packaging'], label: '種類' },
  { name: 'name', type: 'text', required: true, label: '名前' },
  { name: 'color_key', type: 'text', required: true, label: '色' },
  { name: 'initial', type: 'text', label: '頭文字' },
  { name: 'value', type: 'number', label: '値' },
  { name: 'pack_quantity', type: 'number', label: '入数' },
  { name: 'pack_price', type: 'number', label: '購入価格' },
  { name: 'material_cost', type: 'number', label: '専用資材の代金' },
  { name: 'sort_order', type: 'number', label: '並び順' },
  // SPEC-V10 §1.6: 梱包材の単価計算方式と、面積方式の 4 つのサイズ（cm）
  { name: 'calc_method', type: 'text', label: '計算方式' },
  { name: 'pack_height', type: 'numberOrEmpty', label: '購入サイズ（縦）' },
  { name: 'pack_width', type: 'numberOrEmpty', label: '購入サイズ（横）' },
  { name: 'use_height', type: 'numberOrEmpty', label: '平均使用サイズ（縦）' },
  { name: 'use_width', type: 'numberOrEmpty', label: '平均使用サイズ（横）' },
];

/**
 * SPEC-V10 §1.6 より前の presets.csv（10 列）。**復元の互換のためだけに残す。**
 * 理由も作り方も RECORD_COLUMNS_LEGACY と同じ（末尾を削るだけで作る）。
 *
 * 足りない 5 列は空文字で埋まり、読み込み側（db/backup.ts）が
 * 既定の計算方式（個数から）とサイズ 0 に倒す ── **既存のバックアップから戻した梱包材は、
 * 保存したときと同じ「個数から」の行になる。**
 */
const PRESET_COLUMNS_LEGACY: readonly ColumnSpec[] = PRESET_COLUMNS.slice(
  0,
  PRESET_COLUMNS.length - 5,
);

/** tags.csv の 4 列（§2.1） */
const TAG_COLUMNS: readonly ColumnSpec[] = [
  { name: 'id', type: 'text', required: true, label: 'タグID' },
  { name: 'name', type: 'text', required: true, label: '名前' },
  { name: 'color_key', type: 'text', required: true, label: '色' },
  { name: 'sort_order', type: 'number', label: '並び順' },
];

/** record_tags.csv の 2 列（§2.1）。複合 PK の 2 列そのもの */
const RECORD_TAG_COLUMNS: readonly ColumnSpec[] = [
  { name: 'record_id', type: 'text', required: true, label: '記録ID' },
  { name: 'tag_id', type: 'text', required: true, label: 'タグID' },
];

/**
 * backup-info.csv（§1.2）。**1 行だけ**入る。
 *
 * **版 1 は先頭 6 列、版 2 はそれに `photo_count` を足した 7 列**（§4.1）。
 * 末尾に足したのは、古いファイルを「先頭 6 列が一致するか」で読めるようにするため ──
 * 途中に挿すと、同じ列名でも位置がずれて版ごとに別の表を持つことになる。
 */
const INFO_COLUMNS_V1: readonly ColumnSpec[] = [
  { name: 'format_version', type: 'number', label: '形式のバージョン' },
  { name: 'created_at', type: 'date', label: '作成日時' },
  { name: 'record_count', type: 'number', label: '記録の件数' },
  { name: 'preset_count', type: 'number', label: 'プリセットの件数' },
  { name: 'tag_count', type: 'number', label: 'タグの件数' },
  { name: 'record_tag_count', type: 'number', label: 'タグ付けの件数' },
];

const PHOTO_COUNT_COLUMN: ColumnSpec = {
  name: 'photo_count',
  type: 'number',
  label: '写真の枚数',
};

/** 書き出しに使う列（＝現在の版）。読み込みは版 1 の 6 列も受ける（parseBackupInfo） */
const INFO_COLUMNS: readonly ColumnSpec[] = [...INFO_COLUMNS_V1, PHOTO_COUNT_COLUMN];

/** ZIP に入る 4 つのデータファイル（§1.1）。名前は DB のテーブル名に合わせる */
export const BACKUP_RECORDS_FILE = 'records.csv';
export const BACKUP_PRESETS_FILE = 'presets.csv';
export const BACKUP_TAGS_FILE = 'tags.csv';
export const BACKUP_RECORD_TAGS_FILE = 'record_tags.csv';

/** ファイル名 → 列定義。検証はこの表を引くだけで済む */
const COLUMNS_BY_FILE: Record<string, readonly ColumnSpec[]> = {
  [BACKUP_INFO_FILE]: INFO_COLUMNS,
  [BACKUP_RECORDS_FILE]: RECORD_COLUMNS,
  [BACKUP_PRESETS_FILE]: PRESET_COLUMNS,
  [BACKUP_TAGS_FILE]: TAG_COLUMNS,
  [BACKUP_RECORD_TAGS_FILE]: RECORD_TAG_COLUMNS,
};

/**
 * ファイル名 → **1 つ前の版の列定義**（SPEC-V9 §3）。載っていないファイルは互換を持たない。
 *
 * ここに載っているファイルだけ、古い列の並びで書かれていてもエラーにせずに読む
 * （足りない列は空文字 ＝ null）。`backup-info.csv` は版そのものを持つファイルなので
 * ここには載せず、`readBackupInfo` が自分で切り替える（§1.2.1）。
 */
const LEGACY_COLUMNS_BY_FILE: Record<string, readonly ColumnSpec[] | undefined> = {
  [BACKUP_RECORDS_FILE]: RECORD_COLUMNS_LEGACY,
  [BACKUP_PRESETS_FILE]: PRESET_COLUMNS_LEGACY,
};

/** ZIP に必ず入っている 5 ファイル（§1.1）。1 つでも欠けたら読まない */
export const BACKUP_FILES: readonly string[] = [
  BACKUP_INFO_FILE,
  BACKUP_RECORDS_FILE,
  BACKUP_PRESETS_FILE,
  BACKUP_TAGS_FILE,
  BACKUP_RECORD_TAGS_FILE,
];

/** 写真を入れるフォルダ（§4.1）。ZIP の中の `<folder>/photos/<uuid>.jpg` */
export const BACKUP_PHOTOS_DIR = 'photos';

/**
 * 写真の合計サイズの上限（§4.4）。**50MB。**
 *
 * 根拠は実測（§6.2）── fflate は同期 API で全体をメモリに載せるので、
 * **ピークのメモリ使用量がアーカイブのおよそ 5 倍**になる（187MB のアーカイブで
 * RSS が +939MB）。50MB なら +250MB 程度に収まり、メモリの少ない端末でも
 * jetsam（OS によるアプリの強制終了）に届かない。
 *
 * **「バックアップを作ろうとした瞬間に落ちる」のが最も重い失敗**なので、
 * 落ちる前に止める側に倒す。
 */
export const BACKUP_PHOTO_SIZE_LIMIT = 50 * 1024 * 1024;

// ---- CSV の組み立て（§2.2） ----

/** 改行は CRLF（logic/csv.ts と同じ。RFC 4180） */
const CRLF = '\r\n';

/**
 * 1 テーブルぶんの CSV（ヘッダ行 ＋ データ行）。
 *
 * **値は既に文字列にしてある前提**（数値の書式は呼び出し側の責務）── 桁区切りを
 * 入れないこと（§2.2）を型で強制はできないので、db/backup.ts の `toField` に寄せてある。
 */
export function buildBackupCsv(
  columns: readonly ColumnSpec[],
  rows: readonly Record<string, string>[],
): string {
  const header = columns.map((column) => column.name);
  const lines = [header, ...rows.map((row) => header.map((name) => row[name] ?? ''))];
  return lines.map((cells) => cells.map(escapeCsvField).join(',')).join(CRLF) + CRLF;
}

/** ファイル名から列定義を引いて組み立てる（呼び出し側が列の並びを持たなくて済む） */
export function buildBackupFile(
  fileName: string,
  rows: readonly Record<string, string>[],
): string {
  return buildBackupCsv(COLUMNS_BY_FILE[fileName], rows);
}

/** backup-info.csv の 1 行（§1.2）。`photoCount` は版 2 で足した列（§4.1） */
export function buildBackupInfo(
  counts: BackupCounts,
  createdAt: string,
  photoCount: number,
): string {
  return buildBackupFile(BACKUP_INFO_FILE, [
    {
      format_version: String(BACKUP_FORMAT_VERSION),
      created_at: createdAt,
      record_count: String(counts.records),
      preset_count: String(counts.presets),
      tag_count: String(counts.tags),
      record_tag_count: String(counts.recordTags),
      photo_count: String(photoCount),
    },
  ]);
}

// ---- CSV の解析（§3.1） ----

/**
 * RFC 4180 の解析。**1 文字ずつ読む**（正規表現でも `split(',')` でもない）──
 * 引用の中のカンマ・改行・二重の `"` を正しく扱うには状態が要る。
 * 商品名とメモにはどれも入り得る（logic/csv.ts の `escapeCsvField` が囲む理由そのもの）。
 *
 * 改行は CRLF / LF のどちらも受ける ── 書き出すのは CRLF だが、
 * 表計算やテキストエディタを経由すると LF に変わっていることがある。
 * 末尾の空行は落とす（最終行の改行は書式上あってよい）。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  // BOM は書かないが、経由したツールが付けていることがあるので落とす
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        // 連続する "" は 1 つの " を表す。そうでなければ引用の終わり
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      endRow();
      // CRLF は 2 文字で 1 つの改行
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // 最後の行に改行が無ければ閉じる。あった場合は空の行が 1 つ増えるので落とす
  if (field !== '' || row.length > 0 || quoted) endRow();

  return rows;
}

// ---- 検証（§3.2） ----

/**
 * 読み込みを止める理由（§3.3）。**画面はこの 1 文をそのまま出す。**
 *
 * 何行目かまで言うのは、手で直せる可能性を残すため ── 「読めませんでした」だけでは、
 * 500 行のファイルのどこが悪いのか調べようがない。
 */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** 数値として読めるか（§3.2）。**桁区切りは受け付けない**（書き出し側が入れない。§2.2） */
function parseNumberField(value: string): number | null {
  if (value.trim() === '') return null;
  // Number('') は 0、Number(' 1 ') は 1 になるので、形の側で先に縛る。
  // 指数表記も受けない（金額にも並び順にも現れない）
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** DB の保存形式 "YYYY-MM-DDTHH:mm:ss.SSS"（§2.3）。**時刻まで必須** */
const DB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/;

/** 形が合っていて、かつ実在する日付か（2026-02-31 のような値を弾く） */
function isValidDbDate(value: string): boolean {
  if (!DB_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  // Date は 2 月 31 日を 3 月 3 日に繰り上げるので、書き戻して一致を見る
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const rebuilt =
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}` +
    `.${pad(parsed.getMilliseconds(), 3)}`;
  return rebuilt === value;
}

/** 検証済みの 1 行。値は**文字列のまま**返す（DB へ入れる直前に db/backup.ts が変換する） */
export type BackupRow = Record<string, string>;

/**
 * 1 ファイルぶんを解析して検証する（§3.2）。
 *
 * 見るのは 4 つ:
 *   1. 列数と列名がぴったり一致するか（並べ替え・改名・過不足はすべてエラー）
 *   2. 各行の項目数がヘッダと一致するか
 *   3. 各値が列の型として読めるか
 *   4. 必須の列が空でないか
 *
 * **行番号は 1 始まりで、ヘッダ行を 1 行目として数える**（§3.3）── 利用者が
 * テキストエディタで開いたときの行番号と一致させるため。ただし引用の中に改行が
 * 入っている行があると実ファイルの行番号とはずれる（そこまでは追わない）。
 */
export function parseBackupFile(fileName: string, text: string): BackupRow[] {
  const columns = COLUMNS_BY_FILE[fileName];
  const rows = parseCsv(text);
  const legacy = LEGACY_COLUMNS_BY_FILE[fileName];

  // 古い版の列で書かれたファイル（§3 の例外。RECORD_COLUMNS_LEGACY 参照）。
  // **見るのはヘッダの形であって backup-info.csv の版ではない** ── 版の数字は
  // 手で書き換えられるし、書き換えられていても中身が読めるならそれで足りる
  if (legacy != null && hasHeader(rows, legacy)) {
    return parseTable(fileName, legacy, rows).map((row) => withMissingColumns(row, columns));
  }

  return parseTable(fileName, columns, rows);
}

/** 解析済みの行の 1 行目が、この列の表そのものか */
function hasHeader(rows: readonly string[][], columns: readonly ColumnSpec[]): boolean {
  const header = rows[0];
  if (header == null || header.length !== columns.length) return false;
  return header.every((name, index) => name === columns[index].name);
}

/**
 * 古い版のファイルに無かった列を**空文字で埋める**（SPEC-V9 §3）。
 *
 * 空文字は書き出し側が null に対して書く値そのもの（`dateField` / `toTargetProfitField`）なので、
 * 読み込み側（db/backup.ts）は新しいファイルと同じ 1 本の経路で null に落とせる ──
 * 「列が無い場合」の分岐を DB へ入れる直前まで持ち込まずに済む。
 */
function withMissingColumns(row: BackupRow, columns: readonly ColumnSpec[]): BackupRow {
  const filled: BackupRow = { ...row };
  for (const column of columns) filled[column.name] ??= '';
  return filled;
}

/**
 * 列の表を明示して解析する。`backup-info.csv` だけは版によって列が変わる（§1.2.1）ので、
 * ファイル名から表を引く `parseBackupFile` とは別に、表を渡せる口を持つ。
 *
 * 受け取るのは**解析済みの行**（文字列ではない）── 呼び出し側が版を見分けるために
 * ヘッダを先に読むので、同じファイルを 2 回 parseCsv しないため。
 */
function parseTable(
  fileName: string,
  columns: readonly ColumnSpec[],
  rows: readonly string[][],
): BackupRow[] {
  if (rows.length === 0) throw new BackupError(BACKUP_EMPTY_FILE_MESSAGE(fileName));

  const header = rows[0];
  const expected = columns.map((column) => column.name);
  if (header.length !== expected.length || header.some((name, i) => name !== expected[i])) {
    throw new BackupError(backupColumnMismatchMessage('ja', fileName, expected, header));
  }

  return rows.slice(1).map((cells, index) => {
    // ヘッダが 1 行目なので、データの 1 件目は 2 行目
    const lineNumber = index + 2;
    if (cells.length !== expected.length) {
      throw new BackupError(
        backupFieldCountMessage('ja', fileName, lineNumber, expected.length, cells.length),
      );
    }

    const row: BackupRow = {};
    columns.forEach((column, columnIndex) => {
      const value = cells[columnIndex];
      validateField(fileName, lineNumber, column, value);
      row[column.name] = value;
    });
    return row;
  });
}

/** 1 つの値を列の型に照らす。合わなければその場で投げる（§3.2） */
function validateField(
  fileName: string,
  lineNumber: number,
  column: ColumnSpec,
  value: string,
): void {
  const fail = (reason: string) => {
    throw new BackupError(
      backupColumnErrorMessage('ja', fileName, lineNumber, column.label ?? column.name, reason),
    );
  };

  switch (column.type) {
    case 'number':
      if (parseNumberField(value) == null) fail(backupNumberError('ja'));
      return;
    case 'numberOrEmpty':
      // 空欄は「値が無い」（SPEC-V9 §3）。0 と書いてあれば 0 として通る
      if (value !== '' && parseNumberField(value) == null) fail(backupNumberError('ja'));
      return;
    case 'boolean':
      if (value !== '0' && value !== '1') fail(backupBooleanError('ja'));
      return;
    case 'date':
      if (!isValidDbDate(value)) fail(backupDateError('ja'));
      return;
    case 'dateOrEmpty':
      if (value !== '' && !isValidDbDate(value)) fail(backupDateError('ja'));
      return;
    case 'enum':
      if (!column.values?.includes(value)) fail(BACKUP_ENUM_ERROR(column.values ?? []));
      return;
    case 'text':
      if (column.required === true && value.trim() === '') {
        throw new BackupError(
          backupEmptyColumnMessage('ja', fileName, lineNumber, column.label ?? column.name),
        );
      }
      return;
  }
}

// ---- ZIP / フォルダの中身をまとめて読む（§3.1） ----

/** 読み込んだバックアップの中身。値は検証済みの行 */
export type BackupTables = {
  records: BackupRow[];
  presets: BackupRow[];
  tags: BackupRow[];
  recordTags: BackupRow[];
};

export type BackupCounts = {
  records: number;
  presets: number;
  tags: number;
  recordTags: number;
};

/** プレビュー（§5.4）に出す中身。件数と作成日 */
export type BackupPreview = {
  counts: BackupCounts;
  /** backup-info.csv の作成日時（DB と同じ形式の文字列） */
  createdAt: string;
  formatVersion: number;
  /**
   * **実際に ZIP へ入っていた写真の枚数**（§4.1）。`backup-info.csv` の
   * `photo_count` は読まない ── 件数と同じ理由で、書いてある数ではなく実物を数える。
   */
  photoCount: number;
};

export type BackupContents = {
  preview: BackupPreview;
  tables: BackupTables;
  /**
   * `records.csv` が指しているのに `photos/` に無かった写真の名前（§4.3）。
   * **エラーではない。** 復元側はこの名前を持つ記録の `photo_file_name` を null に落とし、
   * 件数だけ利用者に伝える。
   */
  missingPhotos: Set<string>;
};

/**
 * ZIP の中のエントリ名を、**ファイル名だけの形に正規化する**（§3.1）。
 *
 * 受け付ける形が 2 通りあるので（決定 §8-2）:
 *   - `backup_2026-08-13/records.csv`（自分で作った ZIP。フォルダが 1 つ）
 *   - `records.csv`（他のツールが直下に置いた場合）
 * 先頭のディレクトリ部分を落として基底名で引けるようにする。
 *
 * **落とすもの**（決定 §8-3）:
 *   - `__MACOSX/` 配下 … macOS の Finder で再圧縮すると必ず入る
 *   - `.DS_Store`     … 同上
 *   - `._` 始まり     … リソースフォーク（`__MACOSX/` の外にも出る）
 *   - ディレクトリ自身のエントリ（末尾が `/`）
 * これらを残すと「知らないファイルがある」で弾くことになり、
 * **中身を確認しようと解凍しただけの人が復元できなくなる。**
 */
export function backupEntryName(path: string): string | null {
  // ZIP のパス区切りは常に "/"（規格）。Windows 由来の "\" も一応受ける
  const normalized = path.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return null;
  if (normalized.startsWith('__MACOSX/') || normalized.includes('/__MACOSX/')) return null;

  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (base === '' || base === '.DS_Store' || base.startsWith('._')) return null;
  return base;
}

/**
 * エントリが何なのかを判定する（§3.1 / §4.1）。
 *
 * **写真と CSV を基底名だけで見分けない。** `photos/` の下にあるかどうかで決める ──
 * 基底名だけで判断すると、`photos/records.csv` のような入れ子を CSV と取り違える。
 * 逆に `photos/` の外にある `.jpg` は写真として扱わない（バックアップの一部ではない）。
 */
export function classifyBackupEntry(path: string): { kind: 'csv' | 'photo'; name: string } | null {
  const name = backupEntryName(path);
  if (name == null) return null;

  const normalized = path.replace(/\\/g, '/');
  const inPhotos = normalized.includes(`/${BACKUP_PHOTOS_DIR}/`) ||
    normalized.startsWith(`${BACKUP_PHOTOS_DIR}/`);

  if (inPhotos) return { kind: 'photo', name };
  if (BACKUP_FILES.includes(name)) return { kind: 'csv', name };
  return null;
}

/**
 * エントリの集まり（名前 → 中身）から、要る 5 ファイルだけを取り出す（§3.1）。
 * 余計なファイルは**黙って無視する**（上のコメントの理由）。
 */
export function selectBackupFiles(entries: Iterable<[string, string]>): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, text] of entries) {
    const entry = classifyBackupEntry(path);
    if (entry == null || entry.kind !== 'csv') continue;
    // 同じ名前が 2 つある ZIP は考えない（先に見つけた方を採る）
    if (!files.has(entry.name)) files.set(entry.name, text);
  }
  return files;
}

/** ZIP / フォルダに入っていた写真のファイル名（§4.1）。中身は持たない（照合にしか使わない） */
export function selectPhotoNames(paths: Iterable<string>): Set<string> {
  const names = new Set<string>();
  for (const path of paths) {
    const entry = classifyBackupEntry(path);
    if (entry?.kind === 'photo') names.add(entry.name);
  }
  return names;
}

/**
 * 5 ファイルぶんの中身 → 検証済みのバックアップ（§3）。
 *
 * **順序が意味を持つ**:
 *   1. ファイルが揃っているか
 *   2. backup-info.csv の版が読める範囲か ← **列の検証より先**。
 *      知らない版のファイルに対して「列が違う」と言っても、利用者には直しようがない
 *   3. 各ファイルの列と値
 *   4. record_tags の参照先が実在するか ← 全ファイルを読み終わってからでないと確かめられない
 */
export function readBackupContents(
  files: ReadonlyMap<string, string>,
  /** ZIP / フォルダに入っていた写真のファイル名（§4.3）。省略 = 写真なしのバックアップ */
  photoNames: ReadonlySet<string> = new Set(),
): BackupContents {
  for (const name of BACKUP_FILES) {
    if (!files.has(name)) throw new BackupError(backupMissingFileMessage('ja', name));
  }

  const preview = readBackupInfo(files.get(BACKUP_INFO_FILE)!);

  const tables: BackupTables = {
    records: parseBackupFile(BACKUP_RECORDS_FILE, files.get(BACKUP_RECORDS_FILE)!),
    presets: parseBackupFile(BACKUP_PRESETS_FILE, files.get(BACKUP_PRESETS_FILE)!),
    tags: parseBackupFile(BACKUP_TAGS_FILE, files.get(BACKUP_TAGS_FILE)!),
    recordTags: parseBackupFile(BACKUP_RECORD_TAGS_FILE, files.get(BACKUP_RECORD_TAGS_FILE)!),
  };

  validateReferences(tables);

  // **写真の照合は投げない**（§4.3）。足りないぶんを持ち帰るだけ
  const missingPhotos = missingPhotoNames(tables.records, photoNames);

  return {
    preview: {
      ...preview,
      counts: {
        records: tables.records.length,
        presets: tables.presets.length,
        tags: tables.tags.length,
        recordTags: tables.recordTags.length,
      },
      photoCount: photoNames.size,
    },
    tables,
    missingPhotos,
  };
}

/**
 * **検証が止まった後でも、せめて作成日だけを拾う**（設計案 53h の不活性カード）。
 *
 * 読めなかった画面には「何を選んだのか」を残しておきたいが、そこに出せるのは
 * **検証を通ったものだけ**にする ── `backup-info.csv` が名乗る件数
 * （record_count など）は決定 §8-4 のとおり信用しないので、ここでも返さない
 * （`counts` は 0 のまま）。読めなければ null で、画面はファイル名だけを出す。
 */
export function tryReadBackupInfo(files: ReadonlyMap<string, string>): BackupPreview | null {
  const text = files.get(BACKUP_INFO_FILE);
  if (text == null) return null;
  try {
    return readBackupInfo(text);
  } catch {
    return null;
  }
}

/**
 * backup-info.csv（1 行）を読み、版が範囲内かを見る（§1.2）。
 *
 * **版 1（6 列）と版 2（7 列）の両方を受ける。** 列の表を版ごとに切り替えるのは
 * ここだけで、他の 4 ファイルは版が変わっても同じ（§1.2.1）。
 */
function readBackupInfo(text: string): BackupPreview {
  const parsed = parseCsv(text);
  const header = parsed[0] ?? [];
  // 末尾に photo_count があるかで版を見分ける。無ければ版 1 の 6 列として読む
  const columns = header.length === INFO_COLUMNS.length ? INFO_COLUMNS : INFO_COLUMNS_V1;

  const rows = parseTable(BACKUP_INFO_FILE, columns, parsed);
  if (rows.length !== 1) throw new BackupError(BACKUP_INFO_ROW_COUNT_MESSAGE);

  const info = rows[0];
  const version = Number(info.format_version);
  if (version < BACKUP_MIN_SUPPORTED_VERSION || version > BACKUP_FORMAT_VERSION) {
    throw new BackupError(backupUnsupportedVersionMessage('ja', version));
  }

  return {
    formatVersion: version,
    createdAt: info.created_at,
    // 件数は実データから数え直すので、ここでは 0 を置く（readBackupContents が埋める）。
    // **info の件数は信じない** ── 信じると、手で削られた行があっても気付けない
    counts: { records: 0, presets: 0, tags: 0, recordTags: 0 },
    photoCount: 0,
  };
}

/**
 * `records.csv` が指す写真が `photos/` に入っているかを照合する（§4.3）。
 *
 * **見つからなくてもエラーにしない。返すだけ。** ここが記録・プリセット・タグの
 * 検証（§3.2）と決定的に違うところで、理由は「写真 1 枚のために記録 1000 件が
 * 戻せなくなるのは本末転倒」だから（§4.3）。呼び出し側は返ってきた名前の
 * `photo_file_name` を null に落として復元を続け、件数だけ利用者に伝える。
 *
 * **逆方向（ZIP にあるが CSV が指していない写真）は見ない。** 孤児のファイルは
 * 容量を食うだけで、DB との整合を壊さない ── 復元時に書き出さなければそれで終わる。
 */
export function missingPhotoNames(
  records: readonly BackupRow[],
  available: ReadonlySet<string>,
): Set<string> {
  const missing = new Set<string>();
  for (const record of records) {
    const name = record.photo_file_name;
    if (name === '' || available.has(name)) continue;
    missing.add(name);
  }
  return missing;
}

/** backup-info.csv が 1 行でないときの文言（§1.2） */
const BACKUP_INFO_ROW_COUNT_MESSAGE = `${BACKUP_INFO_FILE}は1行だけのファイルです。行数が違います。`;

/**
 * record_tags の参照先が実在するかを確かめる（§3.2）。
 *
 * **DB は弾いてくれない** ── `references()` は宣言してあるが
 * `PRAGMA foreign_keys` の既定は OFF（SPEC-V4 §1.4）。孤児行が入ると、
 * 絞り込みの件数が静かに狂う。復元は既存データを全部消してから入れるので、
 * ここで見逃すと元に戻す先も無い。
 */
function validateReferences(tables: BackupTables): void {
  const recordIds = new Set(tables.records.map((row) => row.id));
  const tagIds = new Set(tables.tags.map((row) => row.id));

  tables.recordTags.forEach((row, index) => {
    const lineNumber = index + 2;
    if (!recordIds.has(row.record_id)) {
      throw new BackupError(backupUnknownRecordRefMessage('ja', lineNumber, row.record_id));
    }
    if (!tagIds.has(row.tag_id)) {
      throw new BackupError(backupUnknownTagRefMessage('ja', lineNumber, row.tag_id));
    }
  });
}

/** ZIP にも解凍フォルダにも CSV が 1 つも無かったとき（§3.1）。画面が使う */
export const BACKUP_NO_CSV_ERROR = backupNoCsvMessage('ja');

// ---- ファイル名（§1.1） ----

/**
 * ファイル名の頭に付くアプリの名前（§1.1）。
 *
 * **付ける理由**: 保存先（ファイルアプリ・クラウド・PC）には他のアプリの
 * バックアップも並ぶ。`backup_2026-08-14.zip` だけでは何のバックアップか分からず、
 * 機種変更のときに正しいファイルを選べない。
 *
 * **ASCII のみ**（下の backupBaseName の理由と同じ）。アプリの表示名は日本語だが、
 * ここはバンドル ID と同じ綴りを使う。
 */
const BACKUP_NAME_PREFIX = 'profit-calculator-backup';

/**
 * バックアップのファイル名と、中のフォルダ名（§1.1）。
 *
 * **ASCII だけで組む**（決定 §8-1）── 書き出しの CSV は日本語の名前にしてある
 * （logic/exportPeriod.ts）が、こちらは ZIP の中に入るので事情が違う。
 * ZIP のエントリ名の文字コードは規格上あいまいで、日本語だと解凍ツールによって
 * 化ける。**化けた名前は復元時に引けなくなる**ので、名前は ASCII に限る。
 *
 * **読み込み側はこの名前に一切依存しない**（§3.1）── 中身の基底名（`records.csv` など）で
 * 引くので、利用者がリネームしても、フォルダ名が違っても読める。
 * 名前は「保存先で見分けるため」だけのもの。
 */
export function backupBaseName(createdAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())}`;
  return `${BACKUP_NAME_PREFIX}_${day}`;
}

export function backupFileName(createdAt: Date): string {
  return `${backupBaseName(createdAt)}.zip`;
}
