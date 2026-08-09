// データアクセスを集約するリポジトリ層。UI からは必ずここを経由し、直接クエリを書かない。
//
// - SPEC §4.1 filteredAndGrouped 相当の絞り込み・月次グループ化・8 種ソートを提供する
// - 月次集計は SQL の GROUP BY / SUM で行う。合算値は Double のまま返し、
//   丸めは表示側の roundForDisplay に任せる（SPEC 決定 §7-2: SQL では丸めない）
// - db を注入する構成にして、アプリ本体 (expo-sqlite) と Node のスモークテスト
//   (better-sqlite3) の両方から同じコードを使えるようにしている

import { asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { monthKeyToDate, toDbDate } from './dates';
import { saleRecords, type SaleRecord } from './schema';

/** expo-sqlite / better-sqlite3 どちらの同期ドライバも受け付ける */
export type Database = BaseSQLiteDatabase<'sync', any, any>;

/** SPEC §4.1 SortTypeMonthly（8 種）。月グループ同士の並び順 */
export type SortTypeMonthly =
  | 'saleDateDesc'
  | 'saleDateAsc'
  | 'saleStartDateDesc'
  | 'saleStartDateAsc'
  | 'profitDesc'
  | 'profitAsc'
  | 'expensesDesc'
  | 'expensesAsc';

export type RecordListFilter = {
  /** true = 実績タブ（売却済み） / false = 出品中タブ */
  isSoldMode: boolean;
  /** 商品名の部分一致検索。空文字・undefined は無条件 */
  searchText?: string;
  /** 月フィルタ "YYYY-MM"。null/undefined = 全期間（SPEC §6.1: 年月の完全一致） */
  monthKey?: string | null;
};

export type MonthGroup = {
  /** グループ化キー "YYYY-MM"（基準日のローカル年月） */
  monthKey: string;
  /** その月の 1 日 0:00（ローカル） */
  monthDate: Date;
  /** Σ netProfit。丸めなし（表示時に roundForDisplay する） */
  totalNetProfit: number;
  /** Σ totalExpenses。丸めなし */
  totalExpenses: number;
  recordCount: number;
  /** 基準日の降順（sortType に関わらず固定。SPEC §4.1-2） */
  records: SaleRecord[];
};

export type CareerSummary = {
  /** 丸めなし */
  totalNetProfit: number;
  /** 丸めなし */
  totalExpenses: number;
  recordCount: number;
};

/** 保存時に正規化して受け取る入力（SPEC §5.2）。id は採番するので受け取らない */
export type SaveRecordInput = {
  itemName: string;
  salesPrice: number;
  purchasePrice: number;
  postage: number;
  envelopeCost: number;
  othersCost: number;
  /** 手数料率（%）。10 = 10% */
  commission: number;
  isSold: boolean;
  saleStartDate: Date;
  saleDate: Date | null;
  memo: string;
};

// ---- SQL 式（SPEC §2 の計算式。丸めなし） ----

/** commissionCost = salesPrice × commission / 100（§2.2） */
const commissionCostSql = sql`(${saleRecords.salesPrice} * ${saleRecords.commission} / 100.0)`;

/** totalExpenses = 仕入 + 送料 + 梱包材 + その他 + 手数料額（§2.4） */
const totalExpensesSql = sql`(${saleRecords.purchasePrice} + ${saleRecords.postage} + ${saleRecords.envelopeCost} + ${saleRecords.othersCost} + ${commissionCostSql})`;

/** netProfit = salesPrice − totalExpenses（§2.3） */
const netProfitSql = sql`(${saleRecords.salesPrice} - ${totalExpensesSql})`;

/**
 * グループ化・ソートの基準日（SPEC §4.1-1）。
 * 売却済みモード = saleDate / 出品中モード = saleStartDate。
 * saleDate は保存時の正規化で「売却済みなら非 null」が保証されるが、
 * 防御として null は distantPast 相当に落とす（Swift 版と同じ挙動）。
 */
function basisDateSql(isSoldMode: boolean): SQL<string> {
  return isSoldMode
    ? sql<string>`coalesce(${saleRecords.saleDate}, '0000-01-01T00:00:00.000')`
    : sql<string>`${saleRecords.saleStartDate}`;
}

/** 基準日のローカル年月 "YYYY-MM"（日付をローカル ISO 文字列で保存しているため substr で取れる） */
function monthKeySql(isSoldMode: boolean): SQL<string> {
  return sql<string>`substr(${basisDateSql(isSoldMode)}, 1, 7)`;
}

/** LIKE 用エスケープ（% _ \ をリテラル扱いにする） */
function likePattern(searchText: string): string {
  return `%${searchText.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function buildWhere(filter: RecordListFilter): SQL {
  const conditions: SQL[] = [eq(saleRecords.isSold, filter.isSoldMode)];
  if (filter.monthKey != null) {
    conditions.push(sql`${monthKeySql(filter.isSoldMode)} = ${filter.monthKey}`);
  }
  const search = filter.searchText?.trim();
  if (search) {
    // SQLite の LIKE は ASCII の大文字小文字を無視する（日本語には影響しない）。
    // Swift 版の localizedCaseInsensitiveContains の近似。
    conditions.push(
      sql`${saleRecords.itemName} LIKE ${likePattern(search)} ESCAPE '\\'`,
    );
  }
  return sql.join(conditions, sql` AND `);
}

/** 保存時の正規化（SPEC §5.2）: 出品中なら saleDate を強制 null、売却済みで null なら現在時刻 */
function normalizeSaleDate(input: SaveRecordInput): Date | null {
  if (!input.isSold) return null;
  return input.saleDate ?? new Date();
}

export function createRepository(
  db: Database,
  deps: { generateId: () => string },
) {
  const { generateId } = deps;

  function toRow(input: SaveRecordInput) {
    const saleDate = normalizeSaleDate(input);
    return {
      itemName: input.itemName,
      salesPrice: input.salesPrice,
      purchasePrice: input.purchasePrice,
      postage: input.postage,
      envelopeCost: input.envelopeCost,
      othersCost: input.othersCost,
      commission: input.commission,
      isSold: input.isSold,
      saleStartDate: toDbDate(input.saleStartDate),
      saleDate: saleDate ? toDbDate(saleDate) : null,
      memo: input.memo,
    };
  }

  return {
    // ---- CRUD ----

    getById(id: string): SaleRecord | undefined {
      return db.select().from(saleRecords).where(eq(saleRecords.id, id)).get();
    },

    create(input: SaveRecordInput): SaleRecord {
      const row = { id: generateId(), ...toRow(input) };
      db.insert(saleRecords).values(row).run();
      return row;
    },

    update(id: string, input: SaveRecordInput): void {
      db.update(saleRecords).set(toRow(input)).where(eq(saleRecords.id, id)).run();
    },

    /**
     * 出品中⇔売却済みトグル（SPEC §3.2 SaleStatusToggleCard）。
     * ON: saleDate = 現在時刻で保存 / OFF: saleDate = null
     */
    setSoldStatus(id: string, isSold: boolean): void {
      db.update(saleRecords)
        .set({ isSold, saleDate: isSold ? toDbDate(new Date()) : null })
        .where(eq(saleRecords.id, id))
        .run();
    },

    remove(id: string): void {
      db.delete(saleRecords).where(eq(saleRecords.id, id)).run();
    },

    // ---- 検索・絞り込み・月次グループ化（SPEC §4.1 filteredAndGrouped 相当） ----

    filteredAndGrouped(
      filter: RecordListFilter,
      sortType: SortTypeMonthly = 'saleDateDesc',
    ): MonthGroup[] {
      const where = buildWhere(filter);
      const monthKey = monthKeySql(filter.isSoldMode);
      const sumNetProfit = sql<number>`sum(${netProfitSql})`;
      const sumExpenses = sql<number>`sum(${totalExpensesSql})`;

      // 月次集計は SQL の GROUP BY（決定 §7-2: SUM は Double のまま、SQL では丸めない）
      const orderBy: Record<SortTypeMonthly, SQL> = {
        saleDateDesc: desc(monthKey),
        saleDateAsc: asc(monthKey),
        saleStartDateDesc: desc(monthKey),
        saleStartDateAsc: asc(monthKey),
        profitDesc: desc(sumNetProfit),
        profitAsc: asc(sumNetProfit),
        expensesDesc: desc(sumExpenses),
        expensesAsc: asc(sumExpenses),
      };
      const totals = db
        .select({
          monthKey,
          totalNetProfit: sumNetProfit,
          totalExpenses: sumExpenses,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(where)
        .groupBy(monthKey)
        .orderBy(orderBy[sortType])
        .all();

      // 表示用のレコード本体。基準日降順で取り出し、月キーごとに振り分けるだけ
      // （集計はしない）。バケット内は取り出し順のまま = 基準日降順（§4.1-2）。
      const rows = db
        .select({ record: saleRecords, monthKey })
        .from(saleRecords)
        .where(where)
        .orderBy(desc(basisDateSql(filter.isSoldMode)))
        .all();
      const buckets = new Map<string, SaleRecord[]>();
      for (const { record, monthKey: key } of rows) {
        const bucket = buckets.get(key);
        if (bucket) bucket.push(record);
        else buckets.set(key, [record]);
      }

      return totals.map((t) => ({
        monthKey: t.monthKey,
        monthDate: monthKeyToDate(t.monthKey),
        totalNetProfit: t.totalNetProfit,
        totalExpenses: t.totalExpenses,
        recordCount: t.recordCount,
        records: buckets.get(t.monthKey) ?? [],
      }));
    },

    /** 画面下部の累計（SPEC §6.1 CareerSummarySection）。丸めなしで返す */
    careerSummary(filter: RecordListFilter): CareerSummary {
      const row = db
        .select({
          totalNetProfit: sql<number>`coalesce(sum(${netProfitSql}), 0)`,
          totalExpenses: sql<number>`coalesce(sum(${totalExpensesSql}), 0)`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(buildWhere(filter))
        .get();
      return row ?? { totalNetProfit: 0, totalExpenses: 0, recordCount: 0 };
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
