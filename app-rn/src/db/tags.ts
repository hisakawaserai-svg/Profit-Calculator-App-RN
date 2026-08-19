// タグ（SPEC-V4 §1）のデータアクセス。presets.ts / repository.ts と同じ作法で、
// UI からは必ずここを経由し、直接クエリを書かない。
//
// **中間テーブル（record_tags）の操作も同じファイルに置く**（§7.1 は別ファイルも可としている）。
// 分けなかったのは、3 経路（タグ削除 / 記録削除 / 付け替え）がすべて
// 「tags の行と record_tags の行を 1 つのトランザクションで同時に動かす」もので、
// ファイルを分けても片方だけを読めば済む場面がないため。関係を持つ 2 テーブルの
// 不変条件（孤児行を作らない。§1.4）を 1 ファイルで読み切れる方を採る。
//
// **外部キー（references）には頼らない**（§1.4）。SQLite の FK は接続ごとに
// PRAGMA foreign_keys = ON が要り、既定は OFF。削除の保証はここが明示的に持つ。

import { asc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from './repository';
import { recordTags, saleRecords, tags, type Tag } from './schema';

/**
 * 追加・更新で受け取る入力（§2.3 の編集シート）。
 * 値の検証は logic/tag.ts（純粋関数）が済ませている前提で、ここは書き込むだけ。
 * sortOrder は採番の規則（§1.5）が repository の責務なので受け取らない。
 */
export type TagInput = {
  /** 前後の空白を落とした 1〜12 文字。「・」を含まない（§1.3） */
  name: string;
  /** PresetColorKey。不正値の防御は読み出し側の normalizePresetColor（§1.3） */
  colorKey: string;
};

// ---- 中間テーブルの低レベル操作 ----
//
// db を引数に取る関数にしてあるのは、repository.create / update / remove が
// **自分のトランザクションの中で**呼ぶため（tx をそのまま渡せる）。
// タグ側の入口（tagRepository.setTagsForRecord）は自前でトランザクションを張る。
//
// **この 2 本は自分では db.transaction() を張らない。** 張ると呼び出し側の
// トランザクションの中で二重に begin することになり、expo-sqlite のドライバでは
// エラーになる（drizzle の expo 実装は `begin` を素で流すだけで、better-sqlite3 のように
// savepoint へ切り替えてはくれない。§9-15 の調査結果）。入れ子にしないのが規約。

/**
 * 記録に付いたタグを入れ替える（§1.4）。**全消し → 入れ直し**で、差分は計算しない。
 * 1 記録あたり数件なので、消して入れ直す方が経路が 1 本で済む。
 *
 * 呼び出し側でトランザクションを張ること（消えたまま入らない中間状態を作らない）。
 * 重複した id は複合 PK に弾かれる前に Set で落とす ── 同じ組み合わせの 2 度目の
 * INSERT は制約違反になるので、選択シート側の取りこぼしで保存が失敗しないようにする。
 */
export function writeRecordTags(db: Database, recordId: string, tagIds: readonly string[]): void {
  deleteRecordTags(db, recordId);

  const unique = [...new Set(tagIds)];
  if (unique.length === 0) return;
  db.insert(recordTags)
    .values(unique.map((tagId) => ({ recordId, tagId })))
    .run();
}

/** ある記録の中間行をすべて消す（§1.4 の「記録を削除」）。呼び出し側でトランザクションを張ること */
export function deleteRecordTags(db: Database, recordId: string): void {
  db.delete(recordTags).where(eq(recordTags.recordId, recordId)).run();
}

/**
 * 1 本の `IN` に入れる id の数（tagNamesByRecord / tagsByRecord）。
 *
 * **記録の全件をそのまま渡してはいけない。** `inArray` は id 1 つにつき変数を 1 つ使い、
 * SQLite の変数上限（SQLITE_MAX_VARIABLE_NUMBER）を超えると
 * `too many SQL variables` で**例外**になる ── 一覧・実績・CSV 書き出しはどれも
 * 「並んでいる記録ぶんの id」を渡すので、記録が増えたある日を境に
 * **画面が開かなくなる**（ErrorBoundary が無いので落ちたまま戻らない）。
 *
 * expo-sqlite 57 が同梱する SQLite 3.50 の既定値は 32,766（podspec で上書きしていない）で、
 * 32,766 件は通り 32,767 件で落ちることを実測で確認してある。
 *
 * 900 にしてあるのは、SQLite 3.32 より前の既定値（999）でも収まる大きさだから ──
 * 上限そのものを当てにしないでおけば、SQLite の版が変わっても壊れない。
 * 分割で往復は増えるが、記録ごとに引く N+1 とは桁が違う（50,000 件で 45 回）。
 */
const ID_CHUNK_SIZE = 900;

/**
 * id を `IN` に収まる大きさへ分ける。
 *
 * **重複を先に落とす。** 1 本の `IN` は重複した id を勝手に畳むが、分割すると
 * 同じ id が 2 つのチャンクに入り得る ── そのまま引くと同じ記録の行が 2 回返り、
 * Map に同じタグが 2 つ積まれる。分ける前に Set を通して、1 本で引いていた頃と
 * 同じ結果になるようにしておく（writeRecordTags の Set と同じ理由）。
 */
function chunkRecordIds(recordIds: readonly string[]): string[][] {
  const unique = [...new Set(recordIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + ID_CHUNK_SIZE));
  }
  return chunks;
}

export function createTagRepository(
  db: Database,
  deps: { generateId: () => string },
) {
  const { generateId } = deps;

  /**
   * 追加は末尾（max(sortOrder) + 1。§1.5）。手動並べ替えを持たないので 10 刻みにしない
   * （presets と同じ採番）。
   */
  function nextSortOrder(): number {
    const row = db.select({ max: sql<number | null>`max(${tags.sortOrder})` }).from(tags).get();
    return (row?.max ?? 0) + 1;
  }

  return {
    /** 全件を並び順で（§1.5）。一覧・選択シート・チップの並びはすべてこの順 */
    listAll(): Tag[] {
      return db.select().from(tags).orderBy(asc(tags.sortOrder)).all();
    },

    getById(id: string): Tag | undefined {
      return db.select().from(tags).where(eq(tags.id, id)).get();
    },

    /** 設定タブのカードに出す登録件数（§2.1） */
    count(): number {
      const row = db.select({ count: sql<number>`count(*)` }).from(tags).get();
      return row?.count ?? 0;
    },

    create(input: TagInput): Tag {
      const row = { id: generateId(), ...input, sortOrder: nextSortOrder() };
      db.insert(tags).values(row).run();
      return row;
    },

    /**
     * 編集シートからの更新（§2.3）。sortOrder は動かさない ──
     * 並び順は追加時に決まったまま固定だから（§1.5）。
     */
    update(id: string, input: TagInput): void {
      db.update(tags)
        .set({ name: input.name, colorKey: input.colorKey })
        .where(eq(tags.id, id))
        .run();
    },

    /**
     * タグ本体と中間行を同時に消す（§1.4）。**消す前の recordId[] を返す** ──
     * 取り消し（§2.2 の UndoBar）は本体だけ戻しても足りず、
     * 付いていた記録から静かに剥がれたままになるため。
     *
     * 行が既に無ければ null。§1.4 の型に `| null` を足したのは、二度押し・
     * 別画面で先に消えていた場合に落とさないため（戻す本体が無いので Undo も出せない）。
     */
    remove(id: string): { tag: Tag; recordIds: string[] } | null {
      return db.transaction((tx) => {
        const tag = tx.select().from(tags).where(eq(tags.id, id)).get();
        if (tag == null) return null;

        const recordIds = tx
          .select({ recordId: recordTags.recordId })
          .from(recordTags)
          .where(eq(recordTags.tagId, id))
          .all()
          .map((row) => row.recordId);

        tx.delete(recordTags).where(eq(recordTags.tagId, id)).run();
        tx.delete(tags).where(eq(tags.id, id)).run();

        return { tag, recordIds };
      });
    },

    /**
     * 削除の取り消し（§2.2 の UndoBar）。**本体と中間行の両方を書き戻す**（§1.4）。
     *
     * create で作り直さないのは presets.restore と同じ理由 ── id と sortOrder が
     * 新しくなると、一覧の中の位置も、記録との紐付けも元どおりにならない。
     */
    restore(tag: Tag, recordIds: readonly string[]): void {
      db.transaction((tx) => {
        tx.insert(tags).values(tag).run();
        if (recordIds.length === 0) return;
        tx.insert(recordTags)
          .values(recordIds.map((recordId) => ({ recordId, tagId: tag.id })))
          .run();
      });
    },

    /**
     * tagId -> 使用件数（§3.3）。**1 本のクエリで全タグぶん**数える（タグごとに引くと N+1）。
     * 0 件のタグはキーごと現れないので、呼び出し側で `?? 0` すること。
     *
     * 状態（売れた / 出品中）を問わない全記録で数える（§2.2）── タグは記録の属性であって
     * 状態の属性ではない。設定画面と選択シートで同じ数字を出すために、数え方をここ 1 か所に持つ。
     */
    countsByTag(): Map<string, number> {
      const rows = db
        .select({ tagId: recordTags.tagId, count: sql<number>`count(*)` })
        .from(recordTags)
        .groupBy(recordTags.tagId)
        .all();
      return new Map(rows.map((row) => [row.tagId, row.count]));
    },

    /**
     * 絞り込みシートの販売サイトの候補（§4.2）。
     *
     * **プリセット（`presets` の type='site'）ではなく、記録に実在する名前の集合**を返す ──
     * プリセットを消しても、その名前で保存された記録は残っているため（SPEC-V3 §1.5.1 の
     * 「写し」の帰結）。ここは候補の一覧を作るクエリなので DISTINCT が正しい
     * （§4.4 で DISTINCT を退けたのはレコードを引くクエリの話で、別物）。
     */
    siteNames(): string[] {
      return db
        .selectDistinct({ siteName: saleRecords.siteName })
        .from(saleRecords)
        .where(sql`${saleRecords.siteName} <> ''`)
        .orderBy(asc(saleRecords.siteName))
        .all()
        .map((row) => row.siteName);
    },

    /**
     * 記録に付いたタグを入れ替える（§1.4）。フォーム経由の保存は repository.update が
     * 同じトランザクションの中で行うので、ここを使うのは記録を保存せずに付け替える経路だけ。
     */
    setTagsForRecord(recordId: string, tagIds: readonly string[]): void {
      db.transaction((tx) => writeRecordTags(tx, recordId, tagIds));
    },

    /**
     * ある記録に付いたタグの id（フォームを開くときの初期値。§3.1）。
     * 並びは `tags.sortOrder` 昇順 ── 中間テーブルは順序を持たないので、
     * ここで order by を書かないと記録ごとに違う並びで出る（§1.5）。
     */
    tagIdsByRecord(recordId: string): string[] {
      return db
        .select({ tagId: recordTags.tagId })
        .from(recordTags)
        .innerJoin(tags, eq(tags.id, recordTags.tagId))
        .where(eq(recordTags.recordId, recordId))
        .orderBy(asc(tags.sortOrder))
        .all()
        .map((row) => row.tagId);
    },

    /**
     * 複数の記録ぶんのタグ名を**まとめて**引く（§5.4 の CSV 書き出し）。
     * 記録ごとに引くと件数ぶんクエリが飛ぶ。値の並びは `tags.sortOrder` 昇順（§5.2）。
     *
     * id は `ID_CHUNK_SIZE` ごとに分けて引く（理由はその定義を参照）。**並びは崩れない** ──
     * 1 つの記録の id はちょうど 1 つのチャンクにしか入らないので、
     * その記録ぶんの行はまとめて 1 回の問い合わせで、sortOrder 昇順のまま返る。
     *
     * 1 件も付いていない記録はキーごと現れない（呼び出し側で空配列に倒すこと）。
     */
    tagNamesByRecord(recordIds: readonly string[]): Map<string, string[]> {
      const result = new Map<string, string[]>();

      for (const chunk of chunkRecordIds(recordIds)) {
        const rows = db
          .select({ recordId: recordTags.recordId, name: tags.name })
          .from(recordTags)
          .innerJoin(tags, eq(tags.id, recordTags.tagId))
          .where(inArray(recordTags.recordId, chunk))
          .orderBy(asc(tags.sortOrder))
          .all();

        for (const row of rows) {
          const names = result.get(row.recordId);
          if (names) names.push(row.name);
          else result.set(row.recordId, [row.name]);
        }
      }
      return result;
    },

    /**
     * 一覧の行に出すタグ（§2.3 の点 ＋ 名前）。tagNamesByRecord と同じ引き方だが、
     * **色キーまで要る**ので行そのものを返す ── 名前だけでは点が描けない。
     *
     * 名前と分けて 2 本持つのは、CSV（名前だけ）と画面（色つき）で必要な列が違うため。
     * どちらも `tags.sortOrder` 昇順で、記録ごとに引かない（N+1 回避）。
     * id の分割も同じ（`ID_CHUNK_SIZE` を参照）。
     *
     * 1 件も付いていない記録はキーごと現れない（呼び出し側で空配列に倒すこと）。
     */
    tagsByRecord(recordIds: readonly string[]): Map<string, Tag[]> {
      const result = new Map<string, Tag[]>();

      for (const chunk of chunkRecordIds(recordIds)) {
        const rows = db
          .select({ recordId: recordTags.recordId, tag: tags })
          .from(recordTags)
          .innerJoin(tags, eq(tags.id, recordTags.tagId))
          .where(inArray(recordTags.recordId, chunk))
          .orderBy(asc(tags.sortOrder))
          .all();

        for (const row of rows) {
          const list = result.get(row.recordId);
          if (list) list.push(row.tag);
          else result.set(row.recordId, [row.tag]);
        }
      }
      return result;
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
