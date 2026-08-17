// データアクセスを集約するリポジトリ層。UI からは必ずここを経由し、直接クエリを書かない。
//
// - SPEC §4.1 filteredAndGrouped 相当の絞り込み・月次グループ化・8 種ソートを提供する
// - 月次集計は SQL の GROUP BY / SUM で行う。合算値は Double のまま返し、
//   丸めは表示側の roundForDisplay に任せる（SPEC 決定 §7-2: SQL では丸めない）
// - db を注入する構成にして、アプリ本体 (expo-sqlite) と Node のスモークテスト
//   (better-sqlite3) の両方から同じコードを使えるようにしている

import { asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { ChartUnit } from '../logic/analytics';
import { periodKeyLength, type Period } from '../logic/period';
import { CHART_KEY_LENGTH, chartKeyToDate, monthKeyToDate, toDbDate } from './dates';
import { recordTags, saleRecords, type RecordKind, type SaleRecord } from './schema';
// 中間テーブル（record_tags）の書き込みは tags.ts が持つ（SPEC-V4 §1.4）。
// ここは「記録本体と同じトランザクションで呼ぶ」責務だけを引き受ける。
import { deleteRecordTags, writeRecordTags } from './tags';

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
  /**
   * 期間フィルタ（SPEC.md §6.1 / logic/period.ts）。null/undefined = 全期間。
   * "YYYY-MM" = その月 / "YYYY" = その年。**どちらも基準日の先頭一致**で効く（periodKeySql）。
   */
  period?: Period;
  /** 種別フィルタ（SPEC-V2 §4.2）。null/undefined = すべて */
  kind?: RecordKind | null;
  /**
   * 販売サイト名の完全一致（SPEC-V4 §4.2）。null/undefined = すべて。
   *
   * **isSoldMode = false のときは無視する。** 出品中の記録は site_name が空なので、
   * 条件として残すと「選ぶと必ず 0 件になる欄」になる。画面でも節ごと消すが、
   * 見た目だけで落とすと「見えないのに効いている」状態を作り得るので SQL の側でも無視する（§4.2）。
   */
  siteName?: string | null;
  /** タグの OR 条件（SPEC-V4 §4.4）。空配列・undefined = すべて */
  tagIds?: readonly string[];
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
 * データタブの集計条件（UI-SPEC §1.5 / SPEC-V2 §4.2）。
 *
 * 期間は開始日・終了日の自由指定（旧 AnalyticsRange）をやめ、記録タブと同じ期間キーにした（§5-5）。
 * 月バーと期間シートが選べるのは「全期間 / 1 年 / 1 か月」のいずれかだけなので、
 * 境界の正規化（旧・決定 §7-10）は不要になり、期間の絞り込みは一覧と同じ substr の等値比較で済む
 * （年は 4 文字・月は 7 文字。長さが変わるだけで条件の形は同じ。SPEC-V3 §5.5 の改訂）。
 * 種別で絞っても集計の形は変わらず、対象レコードが減るだけ（§4.4）。
 */
export type AnalyticsFilter = {
  /** 期間フィルタ。null = 全期間 / "YYYY-MM" = その月 / "YYYY" = その年（logic/period.ts） */
  period: Period;
  /**
   * 前期間比較（logic/periodComparison.ts）専用。指定があると period の代わりにこちらで絞る
   * （月キーの範囲。両端を含む）── 前年同期間比較が「その年の 1〜N 月」のような
   * period 単体では表せない範囲を要求するため。period はここでは無視される。
   */
  monthKeyRange?: { from: string; to: string };
  /** 種別フィルタ。null/undefined = すべて */
  kind?: RecordKind | null;
  /**
   * 販売サイト名の完全一致（SPEC-V4 §4.2 / §6）。null/undefined = すべて。
   *
   * 記録タブと違い**状態による無視の分岐がない** ── データタブは売却済みだけを見る面なので
   * （SPEC §6.2）、「選ぶと必ず 0 件になる」状態が起きない。節も常に出る（§6）。
   */
  siteName?: string | null;
  /** タグの OR 条件（SPEC-V4 §4.4）。空配列・undefined = すべて */
  tagIds?: readonly string[];
};

/**
 * 記録タブの絞り込み条件 → データタブの集計条件（SPEC-V4 §6）。
 *
 * 絞り込みページは記録タブ・データタブで**同じ画面**を使う（§7.1）ので、下書きから組む条件も
 * 1 つの型（RecordListFilter）で持ち回る。データタブ側のクエリに渡す直前でここを通す。
 *
 * **落ちるのは isSoldMode と searchText だけ。** データタブは isSold = true かつ
 * saleDate 非 null が固定条件で（SPEC §6.2）、検索欄も持たない。
 */
export function toAnalyticsFilter(filter: RecordListFilter): AnalyticsFilter {
  return {
    period: filter.period ?? null,
    kind: filter.kind ?? null,
    siteName: filter.siteName ?? null,
    tagIds: filter.tagIds,
  };
}

/** データタブの合計行（期間内合計）。すべて丸めなし（SPEC §6.2） */
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
  /** 集計キー（販売日の先頭 n 文字。刻みごとの粒度） */
  key: string;
  /** キーが表す代表日（日ごと = その日 0:00 / 月ごと = 月初） */
  date: Date;
  /** Σ salesPrice */
  sales: number;
  /** Σ netProfit */
  profit: number;
  recordCount: number;
};

/**
 * タグ別純利益ランキング（データタブ新規セクション）の集計 1 行ぶん。
 * `tagId: null` は「未分類」（タグが 1 つも付いていない記録をまとめたもの）。
 */
export type TagProfitStat = {
  tagId: string | null;
  totalNetProfit: number;
  totalSales: number;
  recordCount: number;
};

/**
 * タグ別純利益推移（データタブ新規セクション）の集計 1 点ぶん。AggregatedPoint にタグの次元が
 * 1 つ増えただけの形 ── 集計点は「刻みキー × タグ」の組ごとに 1 行（記録が無い組み合わせは行自体が無い。
 * 密な点列に埋めるのは logic/analytics 側の densifySeries に任せる）。
 */
export type TagSeriesPoint = {
  tagId: string | null;
  key: string;
  date: Date;
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
  /**
   * 販売サイト名の写し（SPEC-V3 §1.5.1）。空文字 = 未設定。
   * プリセットの id ではなく名前そのものを持つので、プリセットを直しても過去の記録は動かない。
   * 省略可にしないのは、保存経路が「入れ忘れて空になる」ことを型で防ぐため（§6.1）。
   */
  siteName: string;
  /**
   * 商品写真のファイル名（SPEC-V5 §1.3）。**null = 写真なし。**
   *
   * 実体は既に写真置き場へ書かれている前提で、ここが受け取るのは名前だけ
   * （media/photoFiles.ts が保存し、DB へ載せるのは記録の保存の瞬間）。
   * siteName / tagIds と同じ理由で**省略可にしない** ── 省略できると
   * 「渡し忘れて静かに写真が外れる（＝ファイルが消える）」経路が作れてしまう。
   */
  photoFileName: string | null;
  /**
   * 選んだ送料プリセットの資材費の控えと、「専用資材を使わない」の状態（SPEC-V6 §3）。
   *
   * **金額そのものは postage が持つ**（資材費は含まれた形で入っている）ので、
   * この 2 つは計算にも集計にも CSV にも入らない ── 記録を開き直したときに
   * トグルを出すか／どちらに倒すかを決めるためだけの控え。
   * 省略可にしないのは siteName / photoFileName と同じ理由（渡し忘れで静かに 0 に戻る）。
   */
  shippingMaterialCost: number;
  excludesShippingMaterial: boolean;
  /**
   * 目標利益（SPEC-V9 §1）。**null = 目標を決めていない。0 で代用しない。**
   *
   * **省略可にしない**（siteName / photoFileName / tagIds と同じ理由）── update は
   * 行を丸ごと書き換えるので、省略できると「渡し忘れて静かに目標が消える」経路ができる。
   * 保存時の正規化はしない ── 0 も「目標は 0 円」という有効な値で、
   * 決めていない状態と混ぜてはいけない（normalizePurchasePrice のような矯正をかけない理由）。
   *
   * **listedAt（将来の出品日）はここに無い**（SPEC-V9 §1）。書き込む経路をまだ作らないので、
   * insert では null のまま・update では列に触らない（drizzle の set は渡した列だけを書く）。
   */
  targetProfit: number | null;
  /**
   * 付けるタグの id（SPEC-V4 §1.4）。空配列 = タグなし。
   *
   * **省略可にしない。** siteName と同じ理由で、保存経路が「渡し忘れて静かに全部外れる」
   * ことを型で防ぐ ── update は全消し → 入れ直しなので（§1.4）、省略できると
   * 既存のタグが消える経路が作れてしまう。
   */
  tagIds: string[];
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

/**
 * 期間の絞り込み条件（SPEC.md §6.2 / logic/period.ts）。
 *
 * 保存形式が "YYYY-MM-DDTHH:mm:ss.SSS" で先頭から年・月・日と並ぶので、**期間キーは
 * そのまま日付の先頭一致**になる ── 年（4 文字）でも月（7 文字）でも条件は同じ形で、
 * 切り出す長さが変わるだけ（periodKeyLength）。年を足しても SQL の作りは変わらない。
 */
function periodMatchSql(dateSql: SQL<string>, period: string): SQL {
  return sql`substr(${dateSql}, 1, ${periodKeyLength(period)}) = ${period}`;
}

/**
 * 状態を問わない基準日（期間シートの「記録あり」判定。UI-SPEC §1.2）。
 *
 * basisDateSql は「いま見ている状態」で基準日を選ぶが、こちらは**状態チップを無視する**ので
 * レコード自身の状態で選ぶ ── 売却済みは販売日、出品中は出品日。
 * 絞り込みでグリッドの見た目が変わると期間選びの手がかりとして不安定になる、という理由での判定なので、
 * 状態・種別・検索のいずれにも依存させない（§1.2 の派生決定）。
 */
const recordMonthKeySql = sql<string>`substr(
  case when ${saleRecords.isSold}
    then coalesce(${saleRecords.saleDate}, ${saleRecords.saleStartDate})
    else ${saleRecords.saleStartDate}
  end, 1, 7)`;

/** LIKE 用エスケープ（% _ \ をリテラル扱いにする） */
function likePattern(searchText: string): string {
  return `%${searchText.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function buildWhere(filter: RecordListFilter): SQL {
  const conditions: SQL[] = [eq(saleRecords.isSold, filter.isSoldMode)];
  if (filter.period != null) {
    conditions.push(periodMatchSql(basisDateSql(filter.isSoldMode), filter.period));
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
  // 販売サイト（SPEC-V4 §4.2）。出品中モードでは組み立てない（型のコメントの理由）
  if (filter.isSoldMode && filter.siteName != null && filter.siteName !== '') {
    conditions.push(eq(saleRecords.siteName, filter.siteName));
  }
  // タグ（SPEC-V4 §4.4）。種別と同じ「見る対象そのものの限定」なので合計行にも同じ条件が渡る
  if (filter.tagIds != null && filter.tagIds.length > 0) {
    conditions.push(tagExistsSql(filter.tagIds));
  }
  return sql.join(conditions, sql` AND `);
}

/**
 * 複数タグの OR 条件（SPEC-V4 §4.4）。**相関サブクエリ（EXISTS）で書く。**
 *
 * JOIN + DISTINCT を採らないのは、集計が壊れるから ── careerSummary / analyticsSummary は
 * sum(netProfit) を引いており、2 つのタグが付いた記録は JOIN で 2 行に増える。
 * DISTINCT は行の重複を消すだけで集計の重複計上は消せない（§4.4 の案 B）。
 * EXISTS は行を増やさないので DISTINCT が最初から要らず、buildWhere に 1 本足すだけで
 * 一覧・合計・月グループ・最古の月の 4 経路すべてに同時に効く。
 *
 * buildAnalyticsWhere（データタブ。§6）からも同じ式を使うため、関数として 1 か所に持つ。
 */
function tagExistsSql(tagIds: readonly string[]): SQL {
  return sql`EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id} AND ${inArray(recordTags.tagId, [...tagIds])})`;
}

/**
 * データタブの対象条件（SPEC §6.2 / UI-SPEC §1.5）。
 * - isSold = true かつ saleDate が非 null のみ（出品中は一切含まれない）
 * - 期間は販売日の先頭一致（月 "YYYY-MM" / 年 "YYYY"）。null なら期間条件なし（全期間。§5-5）
 * - 種別（SPEC-V2 §4.2）は指定があればそのまま等値条件にする。
 * - 販売サイト・タグ（SPEC-V4 §6）は buildWhere と**同じ式**を足す。
 *
 * **集計式（netProfitSql / totalExpensesSql）は変更しない。** タグの OR は EXISTS で書いてあり
 * （§4.4）、行を増やさないので SUM はそのまま正しい ── JOIN + DISTINCT を退けた帰結。
 * この関数に条件を足すだけで、合計行・集計点・内訳・最古の月の 4 経路すべてに同時に効く。
 */
function buildAnalyticsWhere(filter: AnalyticsFilter): SQL {
  const conditions: SQL[] = [
    eq(saleRecords.isSold, true),
    sql`${saleRecords.saleDate} IS NOT NULL`,
  ];
  if (filter.monthKeyRange != null) {
    const { from, to } = filter.monthKeyRange;
    conditions.push(sql`substr(${saleRecords.saleDate}, 1, 7) BETWEEN ${from} AND ${to}`);
  } else if (filter.period != null) {
    conditions.push(periodMatchSql(sql<string>`${saleRecords.saleDate}`, filter.period));
  }
  if (filter.kind != null) {
    conditions.push(eq(saleRecords.kind, filter.kind));
  }
  // 記録タブの buildWhere にある isSoldMode の分岐はここには要らない（型のコメント参照）
  if (filter.siteName != null && filter.siteName !== '') {
    conditions.push(eq(saleRecords.siteName, filter.siteName));
  }
  if (filter.tagIds != null && filter.tagIds.length > 0) {
    conditions.push(tagExistsSql(filter.tagIds));
  }
  return sql.join(conditions, sql` AND `);
}

/**
 * CSV 書き出しの対象（SPEC-V3 §5.5）。**条件は期間と対象の 2 つだけ。**
 * 記録タブ・データタブの絞り込みは持ち込まない（§5.5 / SPEC-V4 §5.4 / 決定 §9-9）──
 * CSV は設定タブから開くもので、別タブの画面ローカルな状態が効くと
 * 「なぜ一部しか出ないのか」が分からないまま一部だけ書き出す事故になる。
 */
export type ExportFilter = {
  /** 期間キー。null = 全期間 / "YYYY" = 年 / "YYYY-MM" = 月 */
  period: Period;
  /** true = 出品中も含める / false = 売れた記録のみ（既定。決定 §8-9） */
  includeListing: boolean;
};

/**
 * 書き出しの基準日（§5.5 / 決定 §8-8）。**販売日基準で、出品中の行だけ出品日で判定する。**
 * 期間の判定・並び順・日ごとのまとめのすべてがこの 1 本を通る
 * （logic/csv.ts の basisDate と同じ規則。片方だけ直すと期間と中身がずれる）。
 *
 * recordMonthKeySql と式は同じだが、あちらは月キー（7 文字）に切ったものなので共有できない。
 */
const exportBasisDateSql = sql<string>`case when ${saleRecords.isSold}
    then coalesce(${saleRecords.saleDate}, ${saleRecords.saleStartDate})
    else ${saleRecords.saleStartDate}
  end`;

/** 書き出しの対象条件（§5.5）。期間と対象だけを組む */
function buildExportWhere(filter: ExportFilter): SQL {
  const conditions: SQL[] = [];
  // 「出品中も含める」は状態の条件そのものを置かない（= 全件）
  if (!filter.includeListing) conditions.push(eq(saleRecords.isSold, true));
  if (filter.period != null) {
    conditions.push(periodMatchSql(exportBasisDateSql, filter.period));
  }
  // 条件が 1 本も無い（全期間・出品中も含める）ときは常に真を置く。sql.join が空になると
  // where(undefined 相当) になり、意図が読めない形で全件になるため明示する
  if (conditions.length === 0) return sql`1 = 1`;
  return sql.join(conditions, sql` AND `);
}

/** 集計キー = 販売日の先頭 n 文字（SPEC §6.2 の「刻みごとの日付キーに丸める」） */
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

/**
 * 記録の削除・写真の差し替えで**どこからも指されなくなった画像ファイルを消す**（SPEC-V5 §1.5）。
 *
 * repository が持つのは「いつ消すか」だけで、消し方（expo-file-system）は知らない ──
 * この層は Node のテストからも動かすので、端末に触る処理を直接持てない。
 * アプリ本体は db/client.ts が photoStore.remove を渡す。
 */
export type DeletePhotoFile = (fileName: string) => void;

export function createRepository(
  db: Database,
  deps: { generateId: () => string; deletePhotoFile: DeletePhotoFile },
) {
  const { generateId, deletePhotoFile } = deps;

  /**
   * 実体の削除は**トランザクションを抜けてから**（SPEC-V5 §1.5）。
   * 中で消すと、後続の SQL が失敗して巻き戻ったときに「行は残っているのに
   * ファイルだけ無い」状態になる ── 逆（ファイルだけ残る）と違い、画面から直せない。
   */
  function deletePhotoIfPresent(fileName: string | null | undefined): void {
    if (fileName == null || fileName === '') return;
    deletePhotoFile(fileName);
  }

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
      // 写しなので正規化しない（SPEC-V3 §1.5.1）。率を手で変えても名前は消さない
      siteName: input.siteName,
      // 写真はファイル名だけ（SPEC-V5 §1.3）。空文字は来ない想定だが、来ても
      // 「無い」に倒す ── 空文字のまま入ると uri() が壊れた URI を組み立てる
      photoFileName: input.photoFileName === '' ? null : input.photoFileName,
      // 送料の内訳の控え（SPEC-V6 §3）。postage と違って計算には入らない
      shippingMaterialCost: input.shippingMaterialCost,
      excludesShippingMaterial: input.excludesShippingMaterial,
      // 目標利益（SPEC-V9 §1）。**null をそのまま入れる** ── 0 に落とすと
      // 「決めていない」が「目標 0 円」に化ける。listed_at は列に触らない（型のコメント参照）
      targetProfit: input.targetProfit,
    };
  }

  return {
    // ---- CRUD ----

    getById(id: string): SaleRecord | undefined {
      return db.select().from(saleRecords).where(eq(saleRecords.id, id)).get();
    },

    /**
     * 記録本体と中間行（record_tags）を 1 つのトランザクションで書く（SPEC-V4 §1.4）。
     * 外部キーに頼らない代わりに、途中で失敗しても「タグだけ付いた記録」が残らないことを
     * ここで保証する。
     */
    create(input: SaveRecordInput): SaleRecord {
      // listedAt は toRow に入れない（SPEC-V9 §1）── **新規のときだけ null を置く。**
      // toRow へ入れると update も毎回この列を書くことになり、
      // 将来この列に値を入れる経路ができたときに、記録を編集するたび黙って消える
      const row = { id: generateId(), listedAt: null, ...toRow(input) };
      return db.transaction((tx) => {
        tx.insert(saleRecords).values(row).run();
        writeRecordTags(tx, row.id, input.tagIds);
        return row;
      });
    },

    /**
     * 同上。タグは差分を取らず全消し → 入れ直し（SPEC-V4 §1.4）。
     *
     * **写真を差し替えた／外したときは、古いファイルをここで消す**（SPEC-V5 §1.5）──
     * 消さないと、どの記録からも指されない画像がドキュメントディレクトリに残り続ける。
     * 判断できるのは「更新の前後で列がどう変わったか」を知っているここだけなので、
     * フォームや画面には持たせない。
     */
    update(id: string, input: SaveRecordInput): void {
      const previousPhoto = db.transaction((tx) => {
        const before = tx
          .select({ photoFileName: saleRecords.photoFileName })
          .from(saleRecords)
          .where(eq(saleRecords.id, id))
          .get();
        tx.update(saleRecords).set(toRow(input)).where(eq(saleRecords.id, id)).run();
        writeRecordTags(tx, id, input.tagIds);
        return before?.photoFileName ?? null;
      });

      // 同じファイル名のまま保存し直した（写真は触っていない）ときは消さない
      if (previousPhoto != null && previousPhoto !== input.photoFileName) {
        deletePhotoIfPresent(previousPhoto);
      }
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

    /**
     * 販売価格だけの差し替え（SPEC-V9 §9.11。「いくらで売る？」のシミュレーターからの書き戻し）。
     *
     * **1 列だけを書く**のは setSaleDate と同じ理由 ── 分析画面はフォームの値一式を
     * 持っていないので、`update`（行を丸ごと書き換える）を通すと、
     * 画面が知らない列（タグ・写真・目標）を渡し忘れて消すことになる。
     */
    setSalesPrice(id: string, salesPrice: number): void {
      db.update(saleRecords).set({ salesPrice }).where(eq(saleRecords.id, id)).run();
    },

    /**
     * 目標利益だけの差し替え（SPEC-V9 §9.14。目標を決めるシート）。
     *
     * **`null` をそのまま書ける**のがこの関数の要点 ── 「目標を消す」は
     * 0 を書くことではなく null を書くこと（§1.2）。0 は「利益ゼロを目標にする」で、
     * 消した状態とは別のもの。書き先は記録フォームの目標欄と**同じ 1 列**で、
     * 分析画面が別の値を別の場所に持つことはしない。
     */
    setTargetProfit(id: string, targetProfit: number | null): void {
      db.update(saleRecords).set({ targetProfit }).where(eq(saleRecords.id, id)).run();
    },

    /**
     * 記録の削除（SPEC §5.4）。**中間行も同じトランザクションで消す**（SPEC-V4 §1.4）──
     * ON DELETE CASCADE には頼らない（PRAGMA foreign_keys の既定は OFF で、
     * 「有効になっているつもり」の孤児行は絞り込みの件数を静かに狂わせる）。
     */
    remove(id: string): void {
      const photoFileName = db.transaction((tx) => {
        // 消す前に写真の名前を控える（消した後では行ごと引けない）。SPEC-V5 §1.5
        const row = tx
          .select({ photoFileName: saleRecords.photoFileName })
          .from(saleRecords)
          .where(eq(saleRecords.id, id))
          .get();
        deleteRecordTags(tx, id);
        tx.delete(saleRecords).where(eq(saleRecords.id, id)).run();
        return row?.photoFileName ?? null;
      });

      // 記録が消えれば写真を指すものは他に無い（1 件 1 枚・共有しない。SPEC-V5 §0.1）
      deletePhotoIfPresent(photoFileName);
    },

    // ---- 件数（絞り込みを持たない 2 本。集計は analyticsSummary 側の責務） ----

    /** 設定タブ「データ」群の「記録の件数」（UI-SPEC §1.6-4）。出品中も含めた全件 */
    totalCount(): number {
      const row = db.select({ count: sql<number>`count(*)` }).from(saleRecords).get();
      return row?.count ?? 0;
    },

    /**
     * ある販売サイト名を写した記録の件数（SPEC-V3 §1.5.1）。
     * プリセットの削除確認（設計案 25c）が使う。
     *
     * **数えられるのは販売サイトだけ。** 記録はプリセットの id を持たず（§1.5）、
     * 名前の写しがあるのは site_name の 1 列だけなので、送料・梱包材には対応する数え方がない。
     * 写しなので同名の別プリセットも数に入るが、利用者から見れば「この名前を使った記録」で
     * 合っている（削除で消えるのも入力候補としての名前）。
     */
    countBySiteName(siteName: string): number {
      const row = db
        .select({ count: sql<number>`count(*)` })
        .from(saleRecords)
        .where(eq(saleRecords.siteName, siteName))
        .get();
      return row?.count ?? 0;
    },

    /**
     * 絞り込みシート下部の「この条件に合う記録 N 件」（SPEC-V4 §4.6）。**集計はしない。**
     *
     * シートは下書きの条件を持ち、タップのたびにこれを引く（同期クエリで数千件規模なので
     * 引き直して問題にならない。SPEC-V2 §8-6）。条件は buildWhere と同じものを使うので、
     * 「N 件と出たのに一覧の件数が違う」がそもそも起き得ない。
     *
     * 検索語を含めないのは呼び出し側の責務（合計行と同じ扱い。シートに検索欄がない）。
     */
    countRecords(filter: RecordListFilter): number {
      const row = db
        .select({ count: sql<number>`count(*)` })
        .from(saleRecords)
        .where(buildWhere(filter))
        .get();
      return row?.count ?? 0;
    },

    /**
     * 絞り込み画面のタグの行に出す使用件数（SPEC-V4 §4.2.1 / §2.2 の例外）。
     * tagId -> 件数。0 件のタグはキーごと現れないので、呼び出し側で `?? 0` すること。
     *
     * **この数字は「押したら何件出るか」の予告**なので、下部の countRecords と
     * **同じ集合の上で数える** ── だから `buildWhere` をそのまま使い回す。
     * 条件の組み立てを 2 か所に書くと、片方だけ直したときに予告と結果が食い違う。
     *
     * **渡された filter から `tagIds` だけを外して数える。**
     * 外す理由は**タグが OR だから**（§4.4）── 「洋服」を選んだ状態で「春夏物」の数字に
     * 洋服の条件をかけると `洋服 AND 春夏物` の数になるが、実際に押すと `洋服 OR 春夏物` で
     * 件数は**増える**方向に動く。予告としてまるで嘘になる。タグ以外の条件で絞った数なら、
     * 押したときの結果を OR の性質を壊さずに予告できる。
     *
     * 状態・期間・種別・販売サイトは**そのまま効く**。販売サイトが isSoldMode = false のとき
     * 無視されるのも buildWhere の規則がそのまま効く（§4.2）── ここで条件を組み直さない
     * ことの利点そのもの。
     *
     * §3.3 と同じく**1 本のクエリで全タグぶん**数える（タグごとに引くと N+1）。
     */
    countsByTagForFilter(filter: RecordListFilter): Map<string, number> {
      const rows = db
        .select({ tagId: recordTags.tagId, count: sql<number>`count(*)` })
        .from(recordTags)
        .innerJoin(saleRecords, eq(saleRecords.id, recordTags.recordId))
        .where(buildWhere({ ...filter, tagIds: undefined }))
        .groupBy(recordTags.tagId)
        .all();
      return new Map(rows.map((row) => [row.tagId, row.count]));
    },

    /**
     * 「過去の記録から複製」の複製元の候補。
     *
     * **`buildWhere` を通さない理由は 1 つだけ ── 売却済みと出品中を混ぜて返すため。**
     * `RecordListFilter.isSoldMode` は必須の boolean で、`buildWhere` は必ず
     * `is_sold = ?` を積む（記録タブが「売れた記録」「出品中」を切り替える画面だから）。
     * 複製元にその区別は要らない ── 写すのは経費・タグ・目標で、どれも売れたかどうかと
     * 無関係（logic/duplicateRecord.ts）。「前に売れた物の同型をまた出す」も
     * 「出品中の物をもう 1 つ出す」も同じ操作になる。
     *
     * **条件の中身は一覧と同じものを使い回す。** 商品名の部分一致は同じ `likePattern`
     * （`% _ \` のエスケープ込み）、タグの OR は同じ `tagExistsSql`（EXISTS。行を増やさない）。
     * 新しい検索規則をここで書かないので、片方だけ直る事故は起きない。
     *
     * 並びは**出品日の新しい順**。このアプリに「作成日時」の列は無く（schema.ts）、
     * 記録が生まれた日にいちばん近いのが出品日 ── 売却済みの記録を販売日で並べると、
     * 古く出品して最近売れた物が「最近の記録」の先頭に来て、直前に作った記録が下へ落ちる。
     *
     * @param limit 上限。省略 = 全件（「すべての記録を見る」側）
     */
    duplicateSources(
      filter: { searchText?: string; tagIds?: readonly string[] } = {},
      limit?: number,
    ): SaleRecord[] {
      const conditions: SQL[] = [];
      const search = filter.searchText?.trim();
      if (search) {
        conditions.push(sql`${saleRecords.itemName} LIKE ${likePattern(search)} ESCAPE '\\'`);
      }
      if (filter.tagIds != null && filter.tagIds.length > 0) {
        conditions.push(tagExistsSql(filter.tagIds));
      }

      const query = db
        .select()
        .from(saleRecords)
        // 条件が 1 つも無いとき（絞り込み無しの「最近の記録」）は WHERE ごと付けない
        .where(conditions.length === 0 ? undefined : sql.join(conditions, sql` AND `))
        // 第 2 キーに id を置いて、同じ日の記録の並びが引くたびに入れ替わらないようにする
        .orderBy(desc(saleRecords.saleStartDate), desc(saleRecords.id));

      return limit == null ? query.all() : query.limit(limit).all();
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
     * 対象は月バーが動かす範囲そのものなので、呼び出し側は period を含まない filter を渡す。
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

    /**
     * 記録が 1 件以上ある月キーの一覧（期間シートの月グリッド。UI-SPEC §1.2）。古い順。
     *
     * **絞り込みを一切受け取らない**のが要点 ── 種別・状態・検索を無視した全記録で判定する
     * （§1.2 の派生決定）。絞り込むたびにグリッドの濃淡が変わると、期間を選ぶときの
     * 手がかりとして当てにならなくなるため。記録タブ・データタブのどちらから開いても同じ盤面になる。
     */
    monthsWithRecords(): string[] {
      return db
        .select({ monthKey: recordMonthKeySql })
        .from(saleRecords)
        .groupBy(recordMonthKeySql)
        .orderBy(recordMonthKeySql)
        .all()
        .map((row) => row.monthKey);
    },

    // ---- CSV 書き出し（SPEC-V3 §5.5 / §5.6） ----
    //
    // 記録タブの buildWhere は使わない。書き出しが持つ条件は**期間と対象の 2 つだけ**で、
    // 状態（isSoldMode）を「どちらか一方」としてしか表せない buildWhere では
    // 「売れた記録＋出品中」の集合が作れない（§5.5-3 の「出品中も含める」がそれ）。
    // 絞り込み（種別・販売サイト・タグ）を受け取る口も**わざと作らない**（§5.5 / SPEC-V4 §5.4）──
    // CSV の主用途はバックアップなので、一部だけが入ったファイルを作る事故の方が大きい。

    /**
     * 書き出す記録（§5.5）。**並びは基準日の昇順、同日は id**（§5.4）──
     * 申告も表計算も時系列で読むので、画面の並び（降順）とは逆にする。
     * 並べ替えを SQL 側でやり切ることで、csv.ts は受け取った順に書くだけで済む。
     */
    listForExport(filter: ExportFilter): SaleRecord[] {
      return db
        .select()
        .from(saleRecords)
        .where(buildExportWhere(filter))
        .orderBy(asc(exportBasisDateSql), asc(saleRecords.id))
        .all();
    },

    /**
     * 書き出しシート下部の予告の件数（§5.7）。**listForExport と同じ条件で数える**ので、
     * 「12件と出たのに中身が違う」が起き得ない。
     *
     * 0 件のときに出す「出品中の記録は N 件あります」も、対象だけを差し替えて
     * この 1 本から取る（数え方を 2 か所に書かない）。
     */
    countForExport(filter: ExportFilter): number {
      const row = db
        .select({ count: sql<number>`count(*)` })
        .from(saleRecords)
        .where(buildExportWhere(filter))
        .get();
      return row?.count ?? 0;
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

    // ---- データタブ（分析グラフ）の集計。SPEC §6.2 / UI-SPEC §1.5 ----
    //
    // 合算はすべて SQL の SUM で行い、丸めなしの Double を返す（決定 §7-2）。
    // 画面側は返ってきた値を roundForDisplay して出すだけで、全件ループはしない。

    /** 固定の合計行の期間内合計（売上・収支・経費。UI-SPEC §1.5-3） */
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

    /**
     * 条件に合う最古の月キー（UI-SPEC §5-14「◀ はデータのある最古の月で無効」）。
     * データタブから開いた絞り込みページのタグの使用件数（SPEC-V4 §6 / §4.2.1）は
     * analyticsCountsByTagForFilter（下）。
     *
     * 記録タブの earliestMonthKey と役割は同じだが、対象がデータタブの集合
     * （売却済み・saleDate 非 null）なので条件を共有できない。月バーが動かす範囲そのものを
     * 返すため、呼び出し側は period を外した filter を渡す。0 件なら null。
     */
    analyticsEarliestMonthKey(filter: AnalyticsFilter): string | null {
      const row = db
        .select({ earliest: sql<string | null>`min(substr(${saleRecords.saleDate}, 1, 7))` })
        .from(saleRecords)
        .where(buildAnalyticsWhere({ ...filter, period: null }))
        .get();
      return row?.earliest ?? null;
    },

    /**
     * データタブから開いた絞り込みページのタグの使用件数（SPEC-V4 §6 / §4.2.1）。
     *
     * 記録タブの `countsByTagForFilter` と**数え方の考え方は同じ**（選択中のタグ以外の
     * すべての条件で絞った件数 ＝「押したら何件出るか」の予告）だが、**数える集合が違う**。
     * データタブは `isSold = true` かつ `saleDate` 非 null が固定条件（SPEC §6.2）で、
     * 記録タブ側の `buildWhere` はその条件を持たない ── そのまま使うと、下部に出る件数
     * （`analyticsSummary.recordCount`）と行の数字が食い違う。
     *
     * `tagIds` だけを外す理由は記録タブ側と同じ（タグは OR なので、織り込むと逆向きの嘘になる）。
     * 期間・種別・販売サイトは効いたまま。1 本のクエリで全タグぶん数える（§3.3）。
     */
    analyticsCountsByTagForFilter(filter: AnalyticsFilter): Map<string, number> {
      const rows = db
        .select({ tagId: recordTags.tagId, count: sql<number>`count(*)` })
        .from(recordTags)
        .innerJoin(saleRecords, eq(saleRecords.id, recordTags.recordId))
        .where(buildAnalyticsWhere({ ...filter, tagIds: undefined }))
        .groupBy(recordTags.tagId)
        .all();
      return new Map(rows.map((row) => [row.tagId, row.count]));
    },

    /**
     * タグ別の純利益・売上・件数（データタブ「タグ別利益ランキング」）。
     *
     * **タグが複数付いた記録は、それぞれのタグの集計に重複して数える** ── 「そのタグの商品で
     * いくら稼いだか」を見るランキングなので、記録タブの合計行（EXISTS で二重計上を防ぐ。§4.4）
     * とは逆に、ここは JOIN + GROUP BY でよい。1 レコードが持つタグの数だけ行に分かれて、
     * 狙いどおりそれぞれのタグの SUM に 1 回ずつ乗る。
     *
     * タグが 1 つも無い記録は「未分類」として tagId: null の 1 行にまとめる（0 件なら含めない）。
     * `filter.tagIds` を指定したときはタグなしの記録が buildAnalyticsWhere の EXISTS 条件で
     * そもそも対象から落ちるので、この行は自然に消える。
     */
    analyticsProfitByTag(filter: AnalyticsFilter): TagProfitStat[] {
      const tagged = db
        .select({
          tagId: recordTags.tagId,
          totalNetProfit: sql<number>`sum(${netProfitSql})`,
          totalSales: sql<number>`sum(${saleRecords.salesPrice})`,
          recordCount: sql<number>`count(*)`,
        })
        .from(recordTags)
        .innerJoin(saleRecords, eq(saleRecords.id, recordTags.recordId))
        .where(buildAnalyticsWhere(filter))
        .groupBy(recordTags.tagId)
        .all();

      const untagged = db
        .select({
          totalNetProfit: sql<number>`coalesce(sum(${netProfitSql}), 0)`,
          totalSales: sql<number>`coalesce(sum(${saleRecords.salesPrice}), 0)`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(
          sql`${buildAnalyticsWhere(filter)} AND NOT EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id})`,
        )
        .get() ?? { totalNetProfit: 0, totalSales: 0, recordCount: 0 };

      const rows: TagProfitStat[] = tagged;
      if (untagged.recordCount > 0) rows.push({ tagId: null, ...untagged });
      return rows;
    },

    /**
     * タグ別純利益推移（データタブ新規セクション）。analyticsProfitByTag と analyticsSeries を
     * 掛け合わせただけ ── グループ化の軸を tagId と刻みキーの 2 本にする以外、SUM の式・
     * 未分類の作り方（NOT EXISTS）はどちらも既存のまま流用する（新しい集計方式を増やさない）。
     *
     * タグが複数付いた記録が各タグの合計に重複して乗る点も analyticsProfitByTag と同じ。
     */
    analyticsSeriesByTag(filter: AnalyticsFilter, unit: ChartUnit): TagSeriesPoint[] {
      const key = chartKeySql(unit);

      const tagged = db
        .select({
          tagId: recordTags.tagId,
          key,
          profit: sql<number>`sum(${netProfitSql})`,
          recordCount: sql<number>`count(*)`,
        })
        .from(recordTags)
        .innerJoin(saleRecords, eq(saleRecords.id, recordTags.recordId))
        .where(buildAnalyticsWhere(filter))
        .groupBy(recordTags.tagId, key)
        .orderBy(asc(key))
        .all();

      const untagged = db
        .select({
          key,
          profit: sql<number>`sum(${netProfitSql})`,
          recordCount: sql<number>`count(*)`,
        })
        .from(saleRecords)
        .where(
          sql`${buildAnalyticsWhere(filter)} AND NOT EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id})`,
        )
        .groupBy(key)
        .orderBy(asc(key))
        .all();

      return [
        ...tagged.map((row) => ({ ...row, date: chartKeyToDate(row.key, unit) })),
        ...untagged.map((row) => ({ ...row, tagId: null, date: chartKeyToDate(row.key, unit) })),
      ];
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
     * 選択された点の内訳（UI-SPEC §1.5-5「選択日の一覧」）。
     * タップされた 1 点ぶんだけを引くので、全期間ぶんのレコードを画面に持ち込まずに済む。
     *
     * 並びは純利益の降順で固定。指標切替（売上金額 / 収支）を廃止してグラフが収支だけになったので、
     * 並び順を選ばせる軸そのものがなくなった（§6-10）。
     */
    analyticsDetails(filter: AnalyticsFilter, unit: ChartUnit, key: string): SaleRecord[] {
      return db
        .select()
        .from(saleRecords)
        .where(sql`${buildAnalyticsWhere(filter)} AND ${chartKeySql(unit)} = ${key}`)
        .orderBy(desc(netProfitSql))
        .all();
    },

    /**
     * 期間合計の平均販売日数（データタブの期間サマリー段・展開時の 4 列目）を求めるための生レコード。
     * buildAnalyticsWhere（データタブの対象条件。売却済み固定）に一致する記録を、日付の計算に
     * 要る saleStartDate・saleDate ごとそのまま返す。**日付の演算（経過日数・逆転の判定）は
     * ここではやらない** ── 日付は text 列で保存されており、SQL 側で暦日の差を正しく出すには
     * 別途パースが要る。既存の集計（sum/count）はすべて SQL で完結させている一方、
     * 日付演算は logic/profit.ts の elapsedDays/daysBetween に一本化する方針（§4.4 と同じ理由の
     * 裏返し）なので、ここは対象レコードを渡すだけに留める。
     */
    analyticsSoldRecords(filter: AnalyticsFilter): SaleRecord[] {
      return db.select().from(saleRecords).where(buildAnalyticsWhere(filter)).all();
    },

    /**
     * 実績タブの「はじめる系」（販売デビュー・タグデビュー・記録を続けよう）が要る、
     * 状態を問わない全記録（出品中・売却済みの両方）。analyticsSoldRecords と違い
     * buildAnalyticsWhere（isSold 固定）を通さない ── これらの実績は「売れた」ではなく
     * 「記録した」を数える（構成の条件どおり）。全期間・絞り込みなし固定（他の実績と同じ母集団）。
     */
    allRecordsForAchievements(): SaleRecord[] {
      return db.select().from(saleRecords).all();
    },

    /**
     * タグ別利益ランキングの行タップの内訳（analyticsDetails のタグ版）。
     * 未分類（tagId: null）の作り方は analyticsProfitByTag と同じ NOT EXISTS。
     * 複数タグが付いた記録はタグごとの内訳それぞれに出てよい（analyticsProfitByTag と同じ重複計上の考え方）。
     */
    analyticsDetailsByTag(filter: AnalyticsFilter, tagId: string | null): SaleRecord[] {
      const tagCondition =
        tagId == null
          ? sql`NOT EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id})`
          : sql`EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id} AND ${recordTags.tagId} = ${tagId})`;
      return db
        .select()
        .from(saleRecords)
        .where(sql`${buildAnalyticsWhere(filter)} AND ${tagCondition}`)
        .orderBy(desc(netProfitSql))
        .all();
    },

    /**
     * タグ別純利益の推移（「グラフ」）の日付タップで開くタグ別内訳、その 1 行をさらにタップした
     * ときの内訳（analyticsDetails の日付条件 ＋ analyticsDetailsByTag のタグ条件を両方かける）。
     * その日付・そのタグの両方に一致する記録だけを返す。
     */
    analyticsDetailsByDateAndTag(
      filter: AnalyticsFilter,
      unit: ChartUnit,
      key: string,
      tagId: string | null,
    ): SaleRecord[] {
      const tagCondition =
        tagId == null
          ? sql`NOT EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id})`
          : sql`EXISTS (SELECT 1 FROM ${recordTags} WHERE ${recordTags.recordId} = ${saleRecords.id} AND ${recordTags.tagId} = ${tagId})`;
      return db
        .select()
        .from(saleRecords)
        .where(sql`${buildAnalyticsWhere(filter)} AND ${chartKeySql(unit)} = ${key} AND ${tagCondition}`)
        .orderBy(desc(netProfitSql))
        .all();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
