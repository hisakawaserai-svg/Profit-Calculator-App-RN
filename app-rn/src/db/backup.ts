// バックアップと復元（SPEC-V8 §2 / §3.4）のデータアクセス。
//
// **repository.ts / presets.ts / tags.ts のどれとも別の入口にする**（§0.2）。
// 理由は 2 つ:
//
// 1. **既存の入口はどれも自分でトランザクションを張る。**
//    `repository.create()` / `tagRepository.create()` などは 1 件ごとに
//    `db.transaction()` を開く。drizzle の expo-sqlite 実装は `begin` を素で流すだけで、
//    better-sqlite3 のように savepoint へ切り替えてはくれない（SPEC-V4 §9-15 の調査）。
//    つまり**外側でトランザクションを張ってその中でループすると必ず失敗する。**
//    「1 件でもエラーがあれば一切読み込まない」（§3）を満たすには、
//    `db.transaction((tx) => ...)` の中で `tx.delete` / `tx.insert` を**直接**呼ぶ
//    経路がここに要る。
//
// 2. **既存の入口は値を正規化してしまう。** `repository.toRow()` は不用品の仕入価格を
//    0 に落とし（SPEC-V2 §2.4）、売却済みの saleDate を現在時刻で埋める（SPEC §5.2）。
//    それは「人が入力したものを整える」ための規則で、復元には害になる ──
//    バックアップに入っているのは既に正規化された値なので、もう一度かけると
//    **書き出したものと違うものが入る**（往復で値が変わる）。ここは素通しで書く。
//
// id も採番しない（`generateId` を受け取らない）── 復元は「同じ id を書き戻す」ことで、
// 新しい id を振ったら record_tags の参照先が全部ずれる。

import { inArray, sql } from 'drizzle-orm';

import type { BackupRow, BackupTables } from '@/logic/backup';
import { normalizePresetCalcMethod } from '@/logic/preset';

import type { Database } from './repository';
import { presets, recordTags, saleRecords, tags } from './schema';

/**
 * 1 回の INSERT にまとめる行数（§3.4）。
 *
 * SQLite の変数上限（SQLITE_MAX_VARIABLE_NUMBER）を超えると
 * `too many SQL variables` になる。drizzle は列ごとに変数を 1 つ使うので、
 * いちばん列の多い records（19 列）で「上限 / 19」行が一度に入る上限になる。
 *
 * **上限は 999 ではなく 32,766。** SQLite 3.32 で既定値が上がっており、
 * expo-sqlite 57 が同梱する 3.50.3 でも 32,766（podspec で上書きしていないことと、
 * ソースの `# define SQLITE_MAX_VARIABLE_NUMBER 32766` を確認済み）。
 * 19 列なら 1,724 行まで一度に入る。
 *
 * 1,000 にしてあるのは、その 1,724 に余裕を持たせつつ文の数を減らすため。
 *
 * **ただし復元の速さはこの値では決まらない。** 50,000 件で測ると、文の数を
 * 1,000 → 30 まで減らしても 1.2 秒前後から動かなかった（50 行 = 1,233ms /
 * 1,000 行 = 1,186ms / 1,700 行 = 1,256ms）。同じ行を素の better-sqlite3 で入れると
 * 0.2 秒なので、差の約 1 秒は **drizzle が値を 1 行ずつ組み立てる分**
 * ── 文ごとではなく行ごとに掛かるコストで、まとめても減らない。
 * ここを縮めたいなら chunk ではなく drizzle を通さない経路が要る（未着手）。
 *
 * **この値は 32,766 に依存する**（tags.ts の `ID_CHUNK_SIZE` は 999 でも
 * 収まる大きさを選んでいて、そこだけ方針が違う）。上限の小さい SQLite に
 * 載せ替えるときは、ここも一緒に下げること。
 */
const INSERT_CHUNK_SIZE = 1_000;

function chunked<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

// ---- 書き出し（DB の行 → CSV の 1 セル） ----

/**
 * 数値を CSV の 1 セルにする（§2.2）。**桁区切りも通貨記号も付けない。**
 *
 * `String(1500)` は `"1500"`、`String(0.5)` は `"0.5"` になる ──
 * `toLocaleString()` を使うと端末の地域設定で `1,500` になり、読み戻せなくなる。
 */
function numberField(value: number): string {
  return String(value);
}

/** boolean を "0" / "1" に（DB の integer(boolean) をそのまま写す。§2.1） */
function boolField(value: boolean): string {
  return value ? '1' : '0';
}

/** null の日付は空欄（§2.3）。読み込み側は is_sold で判定する */
function dateField(value: string | null): string {
  return value ?? '';
}

/**
 * null 許容の数値（SPEC-V9 §3）。**null は空欄で、0 とは書き分ける。**
 * 目標利益の null は「目標を決めていない」で、0（＝目標は 0 円）とは別のもの。
 */
function nullableNumberField(value: number | null): string {
  return value == null ? '' : String(value);
}

export function createBackupRepository(db: Database) {
  return {
    /**
     * 4 テーブルを全件読んで CSV の行にする（§2）。**期間の指定は無い**（§1.3）──
     * バックアップは「全部を戻せること」が目的なので、一部だけ入ったファイルを
     * 作れる口をそもそも持たない。
     *
     * 並びは id 昇順で固定 ── 同じデータから同じファイルが出るようにしておくと、
     * 2 つのバックアップを diff で比べられる。
     */
    dump(): BackupTables {
      const recordRows = db.select().from(saleRecords).orderBy(saleRecords.id).all();
      const presetRows = db.select().from(presets).orderBy(presets.id).all();
      const tagRows = db.select().from(tags).orderBy(tags.id).all();
      const recordTagRows = db
        .select()
        .from(recordTags)
        .orderBy(recordTags.recordId, recordTags.tagId)
        .all();

      return {
        records: recordRows.map((row) => ({
          id: row.id,
          item_name: row.itemName,
          sales_price: numberField(row.salesPrice),
          purchase_price: numberField(row.purchasePrice),
          postage: numberField(row.postage),
          envelope_cost: numberField(row.envelopeCost),
          others_cost: numberField(row.othersCost),
          commission: numberField(row.commission),
          is_sold: boolField(row.isSold),
          sale_start_date: row.saleStartDate,
          sale_date: dateField(row.saleDate),
          memo: row.memo,
          kind: row.kind,
          site_name: row.siteName,
          // **写真のファイル名をそのまま出す**（§4.1）。実体は ZIP の `photos/` に入る。
          // 写真を含めないバックアップでも列は書く ── 読み込み側は
          // 「指しているのに photos/ に無い」を欠落として扱い、null に落として続ける（§4.3）ので、
          // 空にしてしまうと「写真があったこと」自体が消えて区別が付かなくなる
          photo_file_name: row.photoFileName ?? '',
          shipping_material_cost: numberField(row.shippingMaterialCost),
          excludes_shipping_material: boolField(row.excludesShippingMaterial),
          // 目標利益と将来の出品日（SPEC-V9 §3）。どちらも null は空欄
          target_profit: nullableNumberField(row.targetProfit),
          listed_at: dateField(row.listedAt),
        })),
        presets: presetRows.map((row) => ({
          id: row.id,
          type: row.type,
          name: row.name,
          color_key: row.colorKey,
          initial: row.initial,
          value: numberField(row.value),
          pack_quantity: numberField(row.packQuantity),
          pack_price: numberField(row.packPrice),
          material_cost: numberField(row.materialCost),
          sort_order: numberField(row.sortOrder),
          // 単価の計算方式と面積方式のサイズ（SPEC-V10 §1.6）。保存値をそのまま出す ──
          // 既存方式の行は 'individual' と 0 が並ぶだけで、読み戻しても同じ行になる
          calc_method: row.calcMethod,
          pack_height: numberField(row.packHeight),
          pack_width: numberField(row.packWidth),
          use_height: numberField(row.useHeight),
          use_width: numberField(row.useWidth),
        })),
        tags: tagRows.map((row) => ({
          id: row.id,
          name: row.name,
          color_key: row.colorKey,
          sort_order: numberField(row.sortOrder),
        })),
        recordTags: recordTagRows.map((row) => ({
          record_id: row.recordId,
          tag_id: row.tagId,
        })),
      };
    },

    /**
     * **全置換**（§3.4）。4 テーブルを空にしてから、読んだ行をそのまま入れる。
     *
     * **すべてが 1 つのトランザクションの中で起きる。** 途中で失敗すれば
     * SQLite が丸ごと巻き戻すので、「半分だけ復元された」状態にはならない ──
     * これが「1 件でもエラーがあれば一切読み込まない」（§3）の後半を担保する部分。
     * 前半（検証）は logic/backup.ts が、DB へ来る前に済ませてある。
     *
     * **この中で他の repository の関数を呼んではいけない**（冒頭のコメント）。
     * 呼ぶと二重に `begin` することになり、そこで落ちる。
     *
     * 消す順は中間テーブルから ── FK は効いていない（SPEC-V4 §1.4）ので
     * 順序で失敗はしないが、「関係を先に切ってから実体を消す」形にしておくと
     * 途中の状態を読んだときに孤児行が見えない。
     */
    restore(
      tables: BackupTables,
      /**
       * **実際に書き戻せる写真の名前**（§4.3）。ここに無い名前を指している記録は
       * `photo_file_name` が null になる ── 実体の無い名前を残すと、
       * PhotoThumbnail が「写真なし」の枠ではなく壊れた画像を出す（§4.2）。
       * 省略 = 写真を 1 枚も戻さない（写真なしのバックアップ）。
       */
      availablePhotos: ReadonlySet<string> = new Set(),
    ): void {
      db.transaction((tx) => {
        tx.delete(recordTags).run();
        tx.delete(saleRecords).run();
        tx.delete(presets).run();
        tx.delete(tags).run();

        for (const chunk of chunked(tables.records, INSERT_CHUNK_SIZE)) {
          tx.insert(saleRecords).values(chunk.map((row) => toRecordRow(row, availablePhotos))).run();
        }
        for (const chunk of chunked(tables.presets, INSERT_CHUNK_SIZE)) {
          tx.insert(presets).values(chunk.map(toPresetRow)).run();
        }
        for (const chunk of chunked(tables.tags, INSERT_CHUNK_SIZE)) {
          tx.insert(tags).values(chunk.map(toTagRow)).run();
        }
        for (const chunk of chunked(tables.recordTags, INSERT_CHUNK_SIZE)) {
          tx.insert(recordTags).values(chunk.map(toRecordTagRow)).run();
        }
      });
    },

    /**
     * 指定した写真の名前を指している記録の `photo_file_name` を null にする（§4.5 の手順 5）。
     *
     * **写真の書き出しに失敗したときだけ呼ぶ。** 手順 4（ファイルの書き出し）は
     * トランザクションに入れられない（ファイルシステムに巻き戻しが無い）ので、
     * 失敗したぶんの整合は事後にここで取る ── 実体の無い名前を残すと
     * PhotoThumbnail が壊れた画像を出す（§4.2）。
     */
    clearPhotos(fileNames: readonly string[]): void {
      if (fileNames.length === 0) return;
      db.update(saleRecords)
        .set({ photoFileName: null })
        .where(inArray(saleRecords.photoFileName, [...fileNames]))
        .run();
    },

    /** 復元の直後に画面へ出す件数（§5.6）。入ったことを DB 側から数え直す */
    counts(): { records: number; presets: number; tags: number; recordTags: number } {
      const count = (table: typeof saleRecords | typeof presets | typeof tags | typeof recordTags) =>
        db.select({ count: sql<number>`count(*)` }).from(table).get()?.count ?? 0;

      return {
        records: count(saleRecords),
        presets: count(presets),
        tags: count(tags),
        recordTags: count(recordTags),
      };
    },
  };
}

// ---- 読み込み（CSV の 1 セル → DB の行） ----
//
// **検証は済んでいる前提**（logic/backup.ts の parseBackupFile を通っている）。
// ここは型を合わせるだけで、値の妥当性はもう見ない ── 2 か所で見ると、
// 片方だけ直したときに「検証は通るのに INSERT で落ちる」が起きる。

function toRecordRow(row: BackupRow, availablePhotos: ReadonlySet<string>) {
  return {
    id: row.id,
    itemName: row.item_name,
    salesPrice: Number(row.sales_price),
    purchasePrice: Number(row.purchase_price),
    postage: Number(row.postage),
    envelopeCost: Number(row.envelope_cost),
    othersCost: Number(row.others_cost),
    commission: Number(row.commission),
    isSold: row.is_sold === '1',
    saleStartDate: row.sale_start_date,
    // 空欄は null（§2.3）。出品中の記録の販売日
    saleDate: row.sale_date === '' ? null : row.sale_date,
    memo: row.memo,
    kind: row.kind as 'used' | 'sourced',
    siteName: row.site_name,
    /**
     * **書き戻せる写真だけ名前を残し、それ以外は null**（§4.2 / §4.3）。
     *
     * 実体の無い名前を残すと、PhotoThumbnail が「写真なし」の薄い枠ではなく
     * **壊れた expo-image** を出す（`photoStore.uri()` が null を返さなくなるため）。
     * ここが「DB とファイルの整合を保つ」の実体で、写真の書き出しに失敗した場合も
     * 同じ経路で null に落ちる（画面が失敗した名前を除いた集合を渡す）。
     */
    photoFileName: availablePhotos.has(row.photo_file_name) ? row.photo_file_name : null,
    shippingMaterialCost: Number(row.shipping_material_cost),
    excludesShippingMaterial: row.excludes_shipping_material === '1',
    /**
     * 目標利益と将来の出品日（SPEC-V9 §3）。**空欄は null。**
     *
     * `Number('')` は 0 になるので、他の数値列のように素で通せない ──
     * 通すと「目標を決めていない」記録が全部「目標 0 円」で戻ることになる。
     *
     * **列そのものが無い古いバックアップでも undefined ではなく空文字が来る**
     * （logic/backup.ts の withMissingColumns が埋める）が、
     * ここは受け取った値だけで判断できる形にしておく。
     */
    targetProfit: nullableNumber(row.target_profit),
    listedAt: emptyToNull(row.listed_at),
  };
}

/** 空欄・列そのものが無い場合は null（SPEC-V9 §3） */
function emptyToNull(value: string | undefined): string | null {
  return value == null || value === '' ? null : value;
}

/** 同上の数値版。**`Number('')` の 0 に落とさない** */
function nullableNumber(value: string | undefined): number | null {
  const text = emptyToNull(value);
  return text == null ? null : Number(text);
}

function toPresetRow(row: BackupRow) {
  return {
    id: row.id,
    type: row.type as 'site' | 'shipping' | 'packaging',
    name: row.name,
    colorKey: row.color_key,
    initial: row.initial,
    value: Number(row.value),
    packQuantity: Number(row.pack_quantity),
    packPrice: Number(row.pack_price),
    materialCost: Number(row.material_cost),
    sortOrder: Number(row.sort_order),
    // SPEC-V10 §1.6。**古いバックアップではこの 5 列が空文字**（logic/backup.ts の
    // PRESET_COLUMNS_LEGACY が埋める）ので、既定の計算方式とサイズ 0 に倒す ──
    // 空文字を Number() に通すと 0 になるが、方式だけは文字列なので正規化を通す
    calcMethod: normalizePresetCalcMethod(row.calc_method),
    packHeight: emptyToZero(row.pack_height),
    packWidth: emptyToZero(row.pack_width),
    useHeight: emptyToZero(row.use_height),
    useWidth: emptyToZero(row.use_width),
  };
}

/** 空欄（古いバックアップに無かった列）は 0（SPEC-V10 §1.6） */
function emptyToZero(value: string | undefined): number {
  const text = emptyToNull(value);
  return text == null ? 0 : Number(text);
}

function toTagRow(row: BackupRow) {
  return {
    id: row.id,
    name: row.name,
    colorKey: row.color_key,
    sortOrder: Number(row.sort_order),
  };
}

function toRecordTagRow(row: BackupRow) {
  return { recordId: row.record_id, tagId: row.tag_id };
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
