// データアクセスを集約するリポジトリ層。UI からは必ずここを経由し、直接クエリを書かない。
//
// - SPEC §4.1 filteredAndGrouped 相当の絞り込み・月次グループ化・8 種ソートを提供する
// - 月次集計は SQL の GROUP BY / SUM で行う。合算値は Double のまま返し、
//   丸めは表示側の roundForDisplay に任せる（SPEC 決定 §7-2: SQL では丸めない）
// - db を注入する構成にして、アプリ本体 (expo-sqlite) と Node のスモークテスト
//   (better-sqlite3) の両方から同じコードを使えるようにしている

import { asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { ChartUnit, MetricType } from '../logic/analytics';
import {
  CHART_KEY_LENGTH,
  chartKeyToDate,
  endOfDay,
  monthKeyToDate,
  startOfDay,
  toDbDate,
} from './dates';
import { saleRecords, type RecordKind, type SaleRecord } from './schema';

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

/**
 * 記録タブ（UI-SPEC §1.2）のレコード単位の並び順（8 種）。
 * 月グループが廃止されたので、SortTypeMonthly と同じ 8 種をレコード 1 件ずつに適用する。
 * 値（profitDesc 等）は内部の識別子なので SortTypeMonthly と揃えたまま改名しない（SPEC-V2 §5.3）。
 */
export type RecordSortType = SortTypeMonthly;

export type RecordListFilter = {
  /** true = 実績タブ（売却済み） / false = 出品中タブ */
  isSoldMode: boolean;
  /** 商品名の部分一致検索。空文字・undefined は無条件 */
  searchText?: string;
  /** 月フィルタ "YYYY-MM"。null/undefined = 全期間（SPEC §6.1: 年月の完全一致） */
  monthKey?: string | null;
  /** 種別フィルタ（SPEC-V2 §4.2）。null/undefined = すべて */
  kind?: RecordKind | null;
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
  /** Σ salesPrice。出品中の合計行「出品価格の合計」に使う（UI-SPEC §6-3）。丸めなし */
  totalSales: number;
  recordCount: number;
};

/**
 * DataView の集計対象期間（SPEC §6.2）。
 * null = 「全期間を表示」ON（期間条件なし）。
 * 日付の境界正規化（決定 §7-10）はここでは行わず、SQL を組み立てる直前に行う。
 */
export type AnalyticsRange = { startDate: Date; endDate: Date } | null;

/**
 * DataView の集計条件（SPEC-V2 §4.2）。
 * 期間だけだった AnalyticsRange に種別を足すため、両者をまとめた型にしてある。
 * 種別で絞っても集計の形は変わらず、対象レコードが減るだけ（§4.4）。
 */
export type AnalyticsFilter = {
  range: AnalyticsRange;
  /** 種別フィルタ。null/undefined = すべて */
  kind?: RecordKind | null;
};

/** DataView のサマリーカード（期間内合計）。すべて丸めなし（SPEC §6.2） */
export type AnalyticsSummary = {
  /** Σ salesPrice */
  totalSales: number;
  /** Σ totalExpenses */
  totalExpenses: number;
  /** totalSales − totalExpenses（= Σ netProfit と等価） */
  totalNetProfit: number;
  recordCount: number;
};

/** チャートの集計点（Swift 版 AggregatedPoint）。値は丸めなし */
export type AggregatedPoint = {
  /** 集計キー（販売日の先頭 n 文字。単位ごとの粒度） */
  key: string;
  /** キーが表す代表日（明細 = 販売日そのもの / 日別 = その日 0:00 / 月別 = 月初 / 年別 = 年初） */
  date: Date;
  /** Σ salesPrice */
  sales: number;
  /** Σ netProfit */
  profit: number;
  recordCount: number;
};

/** 保存時に正規化して受け取る入力（SPEC §5.2）。id は採番するので受け取らない */
export type SaveRecordInput = {
  itemName: string;
  /** レコード種別（SPEC-V2 §1.1）。'used' のとき purchasePrice は 0 に正規化される（§2.4） */
  kind: RecordKind;
  salesPrice: number;
  /** 不用品（kind = 'used'）では保存時に 0 へ強制される（SPEC-V2 §2.4） */
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
  // 種別フィルタ（SPEC-V2 §4.2）。検索と違い「見る対象そのものの限定」なので、
  // リスト本体だけでなく下部累計（summaryFilter）にも同じ条件が渡される。
  if (filter.kind != null) {
    conditions.push(eq(saleRecords.kind, filter.kind));
  }
  return sql.join(conditions, sql` AND `);
}

/**
 * DataView の対象条件（SPEC §6.2）。
 * - isSold = true かつ saleDate が非 null のみ（出品中は一切含まれない）
 * - 期間は startDate その日の 00:00:00.000 〜 endDate その日の 23:59:59.999 の閉区間（決定 §7-10）。
 *   保存形式が固定長のローカル ISO 文字列なので、辞書順比較がそのまま時系列比較になる。
 * - 種別（SPEC-V2 §4.2）は指定があればそのまま等値条件にする。
 */
function buildAnalyticsWhere(filter: AnalyticsFilter): SQL {
  const { range } = filter;
  const conditions: SQL[] = [
    eq(saleRecords.isSold, true),
    sql`${saleRecords.saleDate} IS NOT NULL`,
  ];
  if (range != null) {
    conditions.push(sql`${saleRecords.saleDate} >= ${toDbDate(startOfDay(range.startDate))}`);
    conditions.push(sql`${saleRecords.saleDate} <= ${toDbDate(endOfDay(range.endDate))}`);
  }
  if (filter.kind != null) {
    conditions.push(eq(saleRecords.kind, filter.kind));
  }
  return sql.join(conditions, sql` AND `);
}

/** 集計キー = 販売日の先頭 n 文字（SPEC §6.2 の「単位ごとの日付キーに丸める」） */
function chartKeySql(unit: ChartUnit): SQL<string> {
  return sql<string>`substr(${saleRecords.saleDate}, 1, ${CHART_KEY_LENGTH[unit]})`;
}

/** 保存時の正規化（SPEC §5.2）: 出品中なら saleDate を強制 null、売却済みで null なら現在時刻 */
function normalizeSaleDate(input: SaveRecordInput): Date | null {
  if (!input.isSold) return null;
  return input.saleDate ?? new Date();
}

/**
 * 保存時の正規化（SPEC-V2 §2.4）: 不用品は仕入価格を持たないので 0 に強制する。
 * フォーム側（§1.5）でも切替時にクリアするが、DB に入る値の保証は repository の責務とする
 * （saleDate の正規化と同じ方針。UI は見た目、repository は不変条件）。
 */
function normalizePurchasePrice(input: SaveRecordInput): number {
  return input.kind === 'used' ? 0 : input.purchasePrice;
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
      kind: input.kind,
      salesPrice: input.salesPrice,
      purchasePrice: normalizePurchasePrice(input),
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
     * 出品中⇔売却済みの切り替え（UI-SPEC §8.1 / §8.4。旧・売却トグル）。
     * 売れた側は saleDate = 現在時刻 / 出品中に戻す側は saleDate = null。
     *
     * 売れた側の日付を呼び出し側から渡せるようにしてあるのは、出品日が未来の記録では
     * 今日ではなく出品日を入れるため（§8.5 派生決定 3）。どの日を入れるかの判断は
     * 画面の制約（[出品日, 今日]）に属するので logic/saleDate.ts が決め、ここは受け取るだけ。
     */
    setSoldStatus(id: string, isSold: boolean, saleDate: Date = new Date()): void {
      db.update(saleRecords)
        .set({ isSold, saleDate: isSold ? toDbDate(saleDate) : null })
        .where(eq(saleRecords.id, id))
        .run();
    },

    /**
     * 売れた日だけの差し替え（UI-SPEC §8.2 の常設行）。状態は変えない。
     * 「押した時点で今日として確定し、後からいつでも直せる」の後半を受け持つ。
     */
    setSaleDate(id: string, saleDate: Date): void {
      db.update(saleRecords)
        .set({ saleDate: toDbDate(saleDate) })
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

    /**
     * 記録タブ（UI-SPEC §1.2）のフラットなレコード一覧。
     * 月グループを廃止したので、絞り込み後のレコードを 8 種の並び順で 1 本のリストとして返す。
     * 並べ替えは SQL 側で行う（画面ではクエリも並べ替えも書かない）。
     */
    filteredRecords(
      filter: RecordListFilter,
      sortType: RecordSortType = 'saleDateDesc',
    ): SaleRecord[] {
      // 売却済みモードの saleDate は非 null が保証されるが、出品中モードでは常に null。
      // どちらでも比較できるよう、月グループ化と同じ coalesce 済みの式を使う。
      const saleDate = basisDateSql(true);
      const orderBy: Record<RecordSortType, SQL> = {
        saleDateDesc: desc(saleDate),
        saleDateAsc: asc(saleDate),
        saleStartDateDesc: desc(saleRecords.saleStartDate),
        saleStartDateAsc: asc(saleRecords.saleStartDate),
        profitDesc: desc(netProfitSql),
        profitAsc: asc(netProfitSql),
        expensesDesc: desc(totalExpensesSql),
        expensesAsc: asc(totalExpensesSql),
      };

      return db
        .select()
        .from(saleRecords)
        .where(buildWhere(filter))
        // 同値のときの並びを決めておく（基準日の新しい順）。指定した並び順と衝突しても
        // 第 2 キーなので影響しない
        .orderBy(orderBy[sortType], desc(basisDateSql(filter.isSoldMode)))
        .all();
    },

    /**
     * 条件に合う最古の月キー（UI-SPEC §5-14「◀ はデータのある最古の月で無効」）。
     * 対象は月バーが動かす範囲そのものなので、呼び出し側は monthKey を含まない filter を渡す。
     * 0 件なら null。
     */
    earliestMonthKey(filter: RecordListFilter): string | null {
      const row = db
        .select({ earliest: sql<string | null>`min(${monthKeySql(filter.isSoldMode)})` })
        .from(saleRecords)
        .where(buildWhere(filter))
        .get();
      return row?.earliest ?? null;
    },

    /** 画面下部の累計（SPEC §6.1 CareerSummarySection）。丸めなしで返す */
    careerSummary(filter: RecordListFilter): CareerSummary {
      const row = db
        .select({
          totalNetProfit: sql<number>`coalesce(sum(${netProfitSql}), 0)`,
          totalExpenses: sql<number>`coalesce(sum(${totalExpensesSql}), 0)`,
          totalSales: sql<number>`coalesce(sum(${saleRecords.salesPrice}), 0)`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(buildWhere(filter))
        .get();
      return row ?? { totalNetProfit: 0, totalExpenses: 0, totalSales: 0, recordCount: 0 };
    },

    // ---- DataView（分析グラフ）の集計。SPEC §6.2 ----
    //
    // 合算はすべて SQL の SUM で行い、丸めなしの Double を返す（決定 §7-2）。
    // 画面側は返ってきた値を roundForDisplay して出すだけで、全件ループはしない。

    /** サマリーカードの期間内合計（SPEC §6.2） */
    analyticsSummary(filter: AnalyticsFilter): AnalyticsSummary {
      const row = db
        .select({
          totalSales: sql<number>`coalesce(sum(${saleRecords.salesPrice}), 0)`,
          totalExpenses: sql<number>`coalesce(sum(${totalExpensesSql}), 0)`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(buildAnalyticsWhere(filter))
        .get() ?? { totalSales: 0, totalExpenses: 0, recordCount: 0 };

      return {
        ...row,
        // SPEC §6.2 の定義どおり差で求める（Σ netProfit と等価）
        totalNetProfit: row.totalSales - row.totalExpenses,
      };
    },

    /** チャートの集計点（SPEC §6.2 AggregatedPoint）。日付キーの昇順 */
    analyticsSeries(filter: AnalyticsFilter, unit: ChartUnit): AggregatedPoint[] {
      const key = chartKeySql(unit);
      const rows = db
        .select({
          key,
          sales: sql<number>`sum(${saleRecords.salesPrice})`,
          profit: sql<number>`sum(${netProfitSql})`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(buildAnalyticsWhere(filter))
        .groupBy(key)
        .orderBy(asc(key))
        .all();

      return rows.map((row) => ({ ...row, date: chartKeyToDate(row.key, unit) }));
    },

    /**
     * 選択された集計点の内訳（SPEC §6.2「下部に内訳リスト」）。
     * 指標に応じて売上額 or 純利益の降順。タップされた 1 点ぶんだけを引くので、
     * 全期間ぶんのレコードを画面に持ち込まずに済む。
     */
    analyticsDetails(
      filter: AnalyticsFilter,
      unit: ChartUnit,
      key: string,
      metric: MetricType,
    ): SaleRecord[] {
      return db
        .select()
        .from(saleRecords)
        .where(sql`${buildAnalyticsWhere(filter)} AND ${chartKeySql(unit)} = ${key}`)
        .orderBy(metric === 'sales' ? desc(saleRecords.salesPrice) : desc(netProfitSql))
        .all();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
