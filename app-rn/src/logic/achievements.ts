// データタブ「実績」の判定ロジック（純粋関数）。
//
// 対象は基本的に**全期間・絞り込みなしの売れた記録**（累計・自己ベストという性質上、
// 月バーや絞り込みページの状態とは無関係。DataScreen の収支/タグと違う母集団を見る）。
// 呼び出し側（db/useRecords.ts）が repository.analyticsSoldRecords に
// 全期間フィルタを渡して集めた配列をそのままここへ渡す想定。
//
// **実績は「成長系」（5 ジャンル × 5 段階 = 25 種）と「特殊実績」（階段構造の対象外。
// はじめる系 5 種 + タグ系 3 種 + その他 5 種 = 13 種）の 2 群、計 38 種で構成する**
// （今回の再編）。
//
// 「その他」（AchievementCategory は内部名 sales_technique のまま。表示名は UI 側の要望で
// 「その他」に変更した。UI-SPEC-ACHIEVEMENTS §追補）は、以下の 5 種で構成する:
//   - 長期戦突破: 出品日（saleStartDate）→ 販売日（saleDate）の経過日数が 30 日以上の
//     売却済み記録が 1 件でもあれば達成
//   - 即売れ: 同じ経過日数が 0 日（出品したその日のうちに売れた）の売却済み記録が
//     1 件でもあれば達成
//   - 有言実行: targetProfit（目標利益）が設定された売却済み記録のうち、実際の純利益が
//     目標利益以上だった記録が 1 件でもあれば達成
//   - 目標マスター: 上記「有言実行」の条件を満たす記録が 10 件以上あれば達成
//     （有言実行と同じ判定を共有し、しきい値だけ変える。💰累計利益などの成長系と同じ考え方）
//   - なんでも屋: purchasePrice > 0（仕入品）で純利益がプラスの売却済み記録が 1 件以上、
//     かつ purchasePrice === 0（不用品）で純利益がプラスの売却済み記録が 1 件以上、両方満たせば達成
//
// 長期戦突破・即売れの経過日数の計算は既存の elapsedSaleDays（daysBetween のラッパ）を
// そのまま使い、日付逆転（経過日数が負）は比較の形（0 と一致 / 30 以上）でどちらも
// 自然に除外される（periodAverageSaleDays・fastestSale と同じ §4.7 の規則）。
// 有言実行・目標マスターは、実際の純利益（recordNetProfit。profit.ts の netProfit をそのまま
// 使う）と目標利益を直接比較する ── pricing.ts の meetsTarget は「売る前にいくらで出すか」を
// 決めるための価格ドメインの判定（切り上げの安全マージンを含む）で、判定の目的が違うため
// ここでは使わない（式を書き直してはいないので重複ではない。profit.ts の CostInput と
// AchievementSaleRecord の列がそのまま一致するので netProfit を素通しできる）。
// なんでも屋の仕入品/不用品の判定は kind 列ではなく purchasePrice の有無で行う
// （不用品は repository.toRow が purchasePrice = 0 を保証するので同値。AchievementSaleRecord に
// kind 列を新たに足さずに済む）。
// 成長系の 5 ジャンル（⚡一撃 / 💰累計利益 / 📦販売件数 / 🎯得意分野 / 🔍売れ筋）は、
// どれも「1 つの集計値に対して、しきい値を 5 段階に区切っただけ」という同じ形なので、
// ジャンルごとに 1 本の判定関数をしきい値配列と一緒に持つ（判定ロジックを段階の数だけ
// 複製しない）。🔥継続系（黒字経営）は定義未確定のため今回は実装しない（旧実装の
// longestProfitableStreak / profit_streak_10 はこの再編で削除した）。
//
// 「はじめる系」の一部（販売デビュー・タグデビュー・記録を続けよう）だけは**出品中も含む
// 全記録**が要る ── 売れる前の「記録した」という行為そのものを数える実績のため。
// これらは evaluateAchievements の第 2 引数（listingRecords）で別に受け取る
// （売れた記録の判定ロジックと母集団が違うので、型からして混ぜない）。
//
// 純利益・経過日数の計算式は logic/profit.ts・logic/listingDays.ts の既存ロジックをそのまま使い、
// ここで式を書き直さない（重複すると丸め・端数の扱いがずれる余地ができる）。

import { daysBetween } from './listingDays';
import { netProfit } from './profit';

/** 実績判定に要る 1 件ぶんの入力。SaleRecord から必要な列だけを抜いた形 */
export type AchievementSaleRecord = {
  /** 全画面表示の「達成した記録」行から記録詳細へ飛ぶための id */
  id: string;
  /** 全画面表示の「達成した記録」行に出す商品名 */
  itemName: string;
  saleStartDate: Date;
  /** 売れた記録のみが対象なので null を許さない（呼び出し側が isSold=true で絞る） */
  saleDate: Date;
  salesPrice: number;
  purchasePrice: number;
  postage: number;
  envelopeCost: number;
  othersCost: number;
  commission: number;
  /** 付いているタグの id。空配列 = 未分類 */
  tagIds: readonly string[];
  /** 目標利益（schema.targetProfit）。決めていなければ null（有言実行・目標マスターが使う） */
  targetProfit: number | null;
};

/**
 * 「はじめる系」の一部が要る、状態を問わない（出品中も含む）記録。
 * AchievementSaleRecord と違い saleDate・金額の列を持たない ── これらの実績は
 * 「記録した」こと自体を数えるもので、売れているかどうか・いくらで売れたかは条件に入らない。
 */
export type AchievementListingRecord = {
  id: string;
  itemName: string;
  saleStartDate: Date;
  tagIds: readonly string[];
};

function recordNetProfit(record: AchievementSaleRecord): number {
  return netProfit({
    salesPrice: record.salesPrice,
    purchasePrice: record.purchasePrice,
    postage: record.postage,
    envelopeCost: record.envelopeCost,
    othersCost: record.othersCost,
    commission: record.commission,
  });
}

/** 記録日 → 販売日の経過日数。負なら日付逆転（listingDays と同じ規則。§4.7） */
function elapsedSaleDays(record: AchievementSaleRecord): number {
  return daysBetween(record.saleStartDate, record.saleDate);
}

function sortedBySaleDate(
  records: readonly AchievementSaleRecord[],
): AchievementSaleRecord[] {
  return [...records].sort(
    (a, b) => a.saleDate.getTime() - b.saleDate.getTime(),
  );
}

function sortedByListingDate(
  records: readonly AchievementListingRecord[],
): AchievementListingRecord[] {
  return [...records].sort(
    (a, b) => a.saleStartDate.getTime() - b.saleStartDate.getTime(),
  );
}

// ---- 実績の種類 ----

export type AchievementId =
  // 特殊実績: はじめる系
  | 'first_sale'
  | 'sale_debut'
  | 'first_profit'
  | 'career_profit_1000'
  | 'record_count_10'
  // 特殊実績: タグ系
  | 'tag_debut'
  | 'tag_synergy'
  | 'tag_mastery'
  // 特殊実績: その他
  | 'long_battle'
  | 'instant_sale'
  | 'goal_kept'
  | 'goal_master'
  | 'all_rounder'
  // 成長系: ⚡一撃（1 件の商品の純利益）
  | 'profit_1000'
  | 'profit_5000'
  | 'profit_10000'
  | 'profit_30000'
  | 'profit_50000'
  // 成長系: 💰累計利益（全期間の売却済み記録の純利益合計）
  | 'career_profit_10000'
  | 'career_profit_50000'
  | 'career_profit_100000'
  | 'career_profit_500000'
  | 'career_profit_1000000'
  // 成長系: 📦販売件数（全期間の売却済み件数）
  | 'sold_1'
  | 'sold_10'
  | 'sold_50'
  | 'sold_250'
  | 'sold_500'
  // 成長系: 🎯得意分野（1 つのタグの累計純利益）
  | 'tag_specialty_1000'
  | 'tag_specialty_5000'
  | 'tag_specialty_10000'
  | 'tag_specialty_50000'
  | 'tag_specialty_100000'
  // 成長系: 🔍売れ筋（1 つのタグの売却済み件数）
  | 'tag_bestseller_3'
  | 'tag_bestseller_10'
  | 'tag_bestseller_25'
  | 'tag_bestseller_50'
  | 'tag_bestseller_100';

/**
 * 実績の分類（獲得した実績カードの色・アイコンの割り当てに使う）。
 *
 * 色・アイコンそのもの（Ionicons の名前・theme.ts の色）は UI 層（AchievementsSection.tsx）が
 * 持つ ── logic 層は React Native / アイコンライブラリに依存させないため。ここは
 * 「この実績がどの分類か」という、UI に依存しない事実だけを返す。
 *
 * 成長系の 5 ジャンルはそれぞれ別のカテゴリにする（🎯得意分野・🔍売れ筋は色こそ同じオレンジだが、
 * アイコンを変えて一覧で見分けられるようにする。AchievementsSection.CATEGORY_ICONS 参照）。
 */
export type AchievementCategory =
  | 'start'
  | 'tag'
  | 'sales_technique'
  | 'strike'
  | 'career_profit'
  | 'sold_count'
  | 'tag_specialty'
  | 'tag_bestseller';

/**
 * 実績一覧画面（AchievementListScreen）のジャンル別カードの並び順。
 * ⚡一撃 / 💰累計利益 / 📦販売件数 / 🎯得意分野 / 🔍売れ筋（成長系 5 ジャンル）+
 * 🌱はじめる系 / 🏷️タグ系 / その他（内部名 sales_technique。特殊実績 3 種）の計 8 セクション
 * （今回の再編。「その他」は長期戦突破・即売れ・有言実行・目標マスター・なんでも屋の 5 実績）。
 * ジャンル（継続系など）が増えたらここに追記するだけで一覧画面に反映される。
 */
const GENRE_CATEGORY_ORDER: readonly AchievementCategory[] = [
  'strike',
  'career_profit',
  'sold_count',
  'tag_specialty',
  'tag_bestseller',
  'start',
  'tag',
  'sales_technique',
];

export type AchievementGenreSection = {
  category: AchievementCategory;
  achievements: Achievement[];
};

/**
 * 実績をジャンル（AchievementCategory）ごとのカードに分け、各ジャンル内は難易度の昇順
 * （ブロンズ→レジェンド）に並べる。成長系はしきい値の並びとそのまま一致し、特殊実績
 * （はじめる系・タグ系）は難易度が同点のもの（例: はじめる系の★1が 3 種）は
 * achievements の元の並び順を保つ（Array.prototype.sort は安定ソート）。
 */
export function groupAchievementsByGenre(
  achievements: readonly Achievement[],
): AchievementGenreSection[] {
  return GENRE_CATEGORY_ORDER.map((category) => ({
    category,
    achievements: achievements
      .filter((achievement) => achievementCategory(achievement.id) === category)
      .sort((a, b) => achievementDifficulty(a.id) - achievementDifficulty(b.id)),
  }));
}

/** AchievementId → AchievementCategory */
export function achievementCategory(id: AchievementId): AchievementCategory {
  switch (id) {
    case 'first_sale':
    case 'sale_debut':
    case 'first_profit':
    case 'career_profit_1000':
    case 'record_count_10':
      return 'start';
    case 'tag_debut':
    case 'tag_synergy':
    case 'tag_mastery':
      return 'tag';
    case 'long_battle':
    case 'instant_sale':
    case 'goal_kept':
    case 'goal_master':
    case 'all_rounder':
      return 'sales_technique';
    case 'profit_1000':
    case 'profit_5000':
    case 'profit_10000':
    case 'profit_30000':
    case 'profit_50000':
      return 'strike';
    case 'career_profit_10000':
    case 'career_profit_50000':
    case 'career_profit_100000':
    case 'career_profit_500000':
    case 'career_profit_1000000':
      return 'career_profit';
    case 'sold_1':
    case 'sold_10':
    case 'sold_50':
    case 'sold_250':
    case 'sold_500':
      return 'sold_count';
    case 'tag_specialty_1000':
    case 'tag_specialty_5000':
    case 'tag_specialty_10000':
    case 'tag_specialty_50000':
    case 'tag_specialty_100000':
      return 'tag_specialty';
    case 'tag_bestseller_3':
    case 'tag_bestseller_10':
    case 'tag_bestseller_25':
    case 'tag_bestseller_50':
    case 'tag_bestseller_100':
      return 'tag_bestseller';
  }
}

/** 実績の難易度（1〜5。5＝レジェンド）。全画面表示の装飾量・バッジ段位（tier）の元になる値 */
export type AchievementDifficulty = 1 | 2 | 3 | 4 | 5;

/**
 * AchievementId → AchievementDifficulty。
 *
 * 成長系（⚡💰📦🎯🔍）は「ジャンル内の何段階目か」がそのまま難易度になる ── 各ジャンルの
 * しきい値配列（STRIKE_THRESHOLDS など）の並び順と、ここの ★1〜★5 の割り当ては
 * 必ず一致させること（achievements.test.ts の対応表テストがこの一致を検査する）。
 */
export function achievementDifficulty(
  id: AchievementId,
): AchievementDifficulty {
  switch (id) {
    // 特殊実績: はじめる系
    case 'first_sale':
    case 'sale_debut':
    case 'first_profit':
      return 1;
    case 'career_profit_1000':
    case 'record_count_10':
      return 2;
    // 特殊実績: タグ系
    case 'tag_debut':
      return 1;
    case 'tag_synergy':
      return 4;
    case 'tag_mastery':
      return 5;
    // 特殊実績: その他（階段構造を持たない特殊実績どうしなので、5 種とも優劣を付けず同格の★2に
    // 揃える。差を付けると groupAchievementsByGenre の難易度昇順ソートで並びが崩れ、
    // 収録順＝表示順が保てなくなるため）
    case 'long_battle':
    case 'instant_sale':
    case 'goal_kept':
    case 'goal_master':
    case 'all_rounder':
      return 2;
    // 成長系: ⚡一撃
    case 'profit_1000':
      return 1;
    case 'profit_5000':
      return 2;
    case 'profit_10000':
      return 3;
    case 'profit_30000':
      return 4;
    case 'profit_50000':
      return 5;
    // 成長系: 💰累計利益
    case 'career_profit_10000':
      return 1;
    case 'career_profit_50000':
      return 2;
    case 'career_profit_100000':
      return 3;
    case 'career_profit_500000':
      return 4;
    case 'career_profit_1000000':
      return 5;
    // 成長系: 📦販売件数
    case 'sold_1':
      return 1;
    case 'sold_10':
      return 2;
    case 'sold_50':
      return 3;
    case 'sold_250':
      return 4;
    case 'sold_500':
      return 5;
    // 成長系: 🎯得意分野
    case 'tag_specialty_1000':
      return 1;
    case 'tag_specialty_5000':
      return 2;
    case 'tag_specialty_10000':
      return 3;
    case 'tag_specialty_50000':
      return 4;
    case 'tag_specialty_100000':
      return 5;
    // 成長系: 🔍売れ筋
    case 'tag_bestseller_3':
      return 1;
    case 'tag_bestseller_10':
      return 2;
    case 'tag_bestseller_25':
      return 3;
    case 'tag_bestseller_50':
      return 4;
    case 'tag_bestseller_100':
      return 5;
  }
}

/** 難易度の段位表記（ブロンズ〜レジェンド） */
export type AchievementBadgeTier =
  'bronze' | 'silver' | 'gold' | 'platinum' | 'legend';

const BADGE_TIERS: Record<AchievementDifficulty, AchievementBadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'legend',
};

export function achievementBadgeTier(id: AchievementId): AchievementBadgeTier {
  return BADGE_TIERS[achievementDifficulty(id)];
}

/** 全画面表示の「達成した記録」行に出す、達成の元になった 1 件の記録 */
export type AchievementCompletedRecord = {
  id: string;
  itemName: string;
  /** 未売却の記録が元になった実績（はじめる系の一部）は null。全画面表示は null なら金額を出さない */
  netProfit: number | null;
  saleDate: Date;
  /**
   * この記録が実績の達成にどのタグとして関与したか。タグに紐づかない実績（一撃・累計利益・
   * 販売件数・はじめる系など）は null。🎯得意分野・🔍売れ筋・🏷️タグの総合力・タグの達人は、
   * その記録が「どのタグの分として」しきい値に積み上がったかを表す（1 件の記録が複数のタグを
   * 持っていても、ここに入るのはこの実績が数えている 1 つだけ）。全画面表示がタグの色・名前で
   * 記録をグループ分けするのに使う。
   */
  tagId: string | null;
};

export type Achievement = {
  id: AchievementId;
  /** 目標値。件数か円（id ごとに単位が決まる。表示側が判断する） */
  target: number;
  /** 現在値。target と同じ単位・0〜target の範囲に収める */
  current: number;
  completed: boolean;
  /** 達成した記録の販売日（はじめる系の一部は出品日）。未達成なら null */
  completedAt: Date | null;
  /** 達成の元になった記録（全画面表示の「達成した記録」行）。未達成なら null。
   * completedRecords の最後の要素（＝しきい値を超えた瞬間の記録）と常に一致する */
  completedRecord: AchievementCompletedRecord | null;
  /**
   * 達成に関与した記録すべて（販売日 / 出品日の昇順）。未達成なら []。
   *
   * 「一撃」系や「はじめる系」の単発実績（1 件の記録だけで決まる）は completedRecord と
   * 同じ 1 件だけの配列。「累計利益」「販売件数」「得意分野」「売れ筋」「タグ系」など、
   * 複数の記録の積み重ねで到達する実績は、しきい値に届くまでの全記録をここに入れる
   * （全画面表示の「達成した記録」がアコーディオンで全件見せられるようにするため）。
   */
  completedRecords: AchievementCompletedRecord[];
};

/** ⚡一撃（1 件の商品の純利益）の 5 段階しきい値。★1〜★5 の並びと一致させる */
const STRIKE_THRESHOLDS = [1000, 5000, 10000, 30000, 50000] as const;
/** 特殊実績「累計¥1,000」のしきい値。💰累計利益（成長系）の★1（¥10,000）より手前の節目 */
const CAREER_PROFIT_STARTER_THRESHOLD = 1000;
/** 💰累計利益（成長系）の 5 段階しきい値 */
const CAREER_PROFIT_THRESHOLDS = [
  10000, 50000, 100000, 500000, 1000000,
] as const;
/** 📦販売件数（成長系）の 5 段階しきい値 */
const SOLD_COUNT_THRESHOLDS = [1, 10, 50, 250, 500] as const;
/** 🎯得意分野（成長系）の 5 段階しきい値 */
const TAG_SPECIALTY_THRESHOLDS = [1000, 5000, 10000, 50000, 100000] as const;
/** 🔍売れ筋（成長系）の 5 段階しきい値 */
const TAG_BESTSELLER_THRESHOLDS = [3, 10, 25, 50, 100] as const;
/** 🏷️タグ系「タグの総合力」★4・「タグの達人」★5 が対象にするタグ数（固定 3 種類） */
const MULTI_TAG_PROFIT_TARGET_COUNT = 3;
/** タグの総合力（★4）: 3 タグそれぞれの累計純利益のしきい値 */
const TAG_SYNERGY_THRESHOLD = 5000;
/** タグの達人（★5）: 3 タグそれぞれの累計純利益のしきい値 */
const TAG_MASTERY_THRESHOLD = 10000;
/** 記録を続けようの目標件数（出品中・売却済み問わず） */
export const RECORD_COUNT_TARGET = 10;
/** 長期戦突破のしきい値（出品日→販売日の経過日数） */
export const LONG_BATTLE_DAYS_THRESHOLD = 30;
/** 即売れのしきい値（出品日→販売日の経過日数。0 日＝出品したその日のうちに売れた） */
export const INSTANT_SALE_DAYS_THRESHOLD = 0;
/** 目標マスターの目標件数（有言実行の条件を満たす記録の件数） */
export const GOAL_MASTER_TARGET_COUNT = 10;

function maxRecordProfit(records: readonly AchievementSaleRecord[]): number {
  return records.reduce(
    (max, record) => Math.max(max, recordNetProfit(record)),
    0,
  );
}

/** 全期間の売却済み記録の純利益合計（累計利益系の判定に使う。「一撃」系の maxRecordProfit とは別物） */
function totalNetProfit(records: readonly AchievementSaleRecord[]): number {
  return records.reduce((sum, record) => sum + recordNetProfit(record), 0);
}

/** @param tagId この記録がどのタグの分として関与したか（タグに紐づかない実績は未指定＝null） */
function toCompletedRecord(
  record: AchievementSaleRecord,
  tagId: string | null = null,
): AchievementCompletedRecord {
  return {
    id: record.id,
    itemName: record.itemName,
    netProfit: recordNetProfit(record),
    saleDate: record.saleDate,
    tagId,
  };
}

/** listingRecords（状態を問わない記録）版の toCompletedRecord。まだ売れたか分からないので netProfit は null */
function toListingCompletedRecord(
  record: AchievementListingRecord,
): AchievementCompletedRecord {
  return {
    id: record.id,
    itemName: record.itemName,
    netProfit: null,
    saleDate: record.saleStartDate,
    tagId: null,
  };
}

/**
 * 累計純利益がしきい値に届くまでの全記録（販売日の昇順。しきい値に届いた記録を含む）。
 * 届かなければ []。「一撃」系（1 件の記録が単独でしきい値を超える）とは別の判定。
 *
 * 特殊実績「累計¥1,000」と成長系💰累計利益の 5 段階は、しきい値だけを変えてこの 1 本を共有する。
 */
function cumulativeProfitContributingRecords(
  records: readonly AchievementSaleRecord[],
  threshold: number,
): AchievementSaleRecord[] {
  const ordered = sortedBySaleDate(records);
  const result: AchievementSaleRecord[] = [];
  let sum = 0;
  for (const record of ordered) {
    sum += recordNetProfit(record);
    result.push(record);
    if (sum >= threshold) return result;
  }
  return [];
}

/** タグ id → そのタグが付いた売却済み記録（販売日の昇順）。🎯得意分野・🔍売れ筋・🏷️タグ系の共通の下準備 */
function soldRecordsByTag(
  records: readonly AchievementSaleRecord[],
): Map<string, AchievementSaleRecord[]> {
  const ordered = sortedBySaleDate(records);
  const map = new Map<string, AchievementSaleRecord[]>();
  for (const record of ordered) {
    for (const tagId of record.tagIds) {
      const list = map.get(tagId);
      if (list) list.push(record);
      else map.set(tagId, [record]);
    }
  }
  return map;
}

/** タグごとに、累計純利益がしきい値へ届いた瞬間の記録（tipping）と、そこまでの全記録（contributing） */
type TagProfitThresholdHit = {
  tagId: string;
  tipping: AchievementSaleRecord;
  contributing: AchievementSaleRecord[];
};

/** 1 タグぶんの、達成に関与した記録一覧。全画面表示がタグ色・タグ名でグループ分けするのに使う */
export type TaggedContributingRecords = {
  tagId: string;
  records: AchievementSaleRecord[];
};

/**
 * タグごとに、累計純利益がしきい値へ届くまでの記録一覧を集める（販売日の昇順。届かなければ
 * そのタグは含めない）。🎯得意分野（1 タグ）・🏷️タグ系「タグの総合力」「タグの達人」（3 タグ）は
 * どちらも「1 タグの累計純利益としきい値」という同じ判定の積み上げなので、この 1 本を共有する
 * （新しい集計方式を重複して作らない）。
 */
function tagsReachingProfitThreshold(
  records: readonly AchievementSaleRecord[],
  threshold: number,
): TagProfitThresholdHit[] {
  const hits: TagProfitThresholdHit[] = [];
  for (const [tagId, tagRecords] of soldRecordsByTag(records).entries()) {
    let sum = 0;
    const contributing: AchievementSaleRecord[] = [];
    for (const record of tagRecords) {
      sum += recordNetProfit(record);
      contributing.push(record);
      if (sum >= threshold) {
        hits.push({ tagId, tipping: record, contributing });
        break;
      }
    }
  }
  return hits;
}

/**
 * 🎯得意分野（1 タグの累計純利益がしきい値に到達）を最初に達成した、そのタグの記録一覧
 * （販売日の昇順。しきい値に届いた記録を含む）。複数のタグが独立にしきい値へ届き得るので、
 * しきい値に**最も早い日付で**到達したタグを採る（利用者が実際に実績を解除するタイミング
 * と一致させる）。未達成なら null。5 段階すべてこの 1 本を共有する
 */
function tagSpecialtyContributingRecords(
  records: readonly AchievementSaleRecord[],
  threshold: number,
): TaggedContributingRecords | null {
  const hits = tagsReachingProfitThreshold(records, threshold);
  let best: TagProfitThresholdHit | null = null;
  for (const hit of hits) {
    if (best == null || hit.tipping.saleDate.getTime() < best.tipping.saleDate.getTime()) {
      best = hit;
    }
  }
  return best == null ? null : { tagId: best.tagId, records: best.contributing };
}

/**
 * 🏷️タグ系「タグの総合力」「タグの達人」: requiredTagCount 種類のタグが、それぞれ独立に
 * 累計純利益しきい値へ到達したときの記録一覧（タグごとにまとめる。達成タイミングが早い
 * requiredTagCount 個のタグぶんだけ、その順で含める）。requiredTagCount 種類に届いていなければ []。
 * tagSpecialtyContributingRecords と同じ tagsReachingProfitThreshold を土台にした、
 * しきい値到達「タグの数」ベースの判定。
 */
function multiTagProfitContributingRecords(
  records: readonly AchievementSaleRecord[],
  threshold: number,
  requiredTagCount: number,
): TaggedContributingRecords[] {
  const hits = tagsReachingProfitThreshold(records, threshold);
  if (hits.length < requiredTagCount) return [];
  const sorted = [...hits].sort(
    (a, b) => a.tipping.saleDate.getTime() - b.tipping.saleDate.getTime(),
  );
  return sorted
    .slice(0, requiredTagCount)
    .map((hit) => ({ tagId: hit.tagId, records: hit.contributing }));
}

/**
 * TaggedContributingRecords の並び（タグごとにまとまっている）を、tagId を保ったまま
 * AchievementCompletedRecord のフラットな配列に開く。タグの総合力・タグの達人が
 * completedRecords を組み立てるのに使う（グループの並び順をそのまま保つ）。
 */
function flattenTaggedContributingRecords(
  groups: readonly TaggedContributingRecords[],
): AchievementCompletedRecord[] {
  return groups.flatMap((group) =>
    group.records.map((record) => toCompletedRecord(record, group.tagId)),
  );
}

/** 🏷️タグ系「タグの総合力」「タグの達人」の現在値。しきい値へ到達しているタグの数（requiredTagCount で頭打ち） */
function tagsReachingProfitThresholdCount(
  records: readonly AchievementSaleRecord[],
  threshold: number,
  requiredTagCount: number,
): number {
  return Math.min(
    tagsReachingProfitThreshold(records, threshold).length,
    requiredTagCount,
  );
}

/** 🎯得意分野の現在値（進捗表示用）。最も稼いでいるタグの累計純利益（負なら 0 に丸める） */
function bestTagCumulativeProfit(
  records: readonly AchievementSaleRecord[],
): number {
  let max = 0;
  for (const tagRecords of soldRecordsByTag(records).values()) {
    const sum = tagRecords.reduce(
      (s, record) => s + recordNetProfit(record),
      0,
    );
    if (sum > max) max = sum;
  }
  return max;
}

/**
 * 🔍売れ筋（1 タグの売却済み件数がしきい値に到達）を最初に達成した、そのタグの記録一覧
 * （販売日の昇順。しきい値件数ぶんだけ）。tagSpecialty と同じ「最速」の考え方。未達成なら null
 */
function tagBestsellerContributingRecords(
  records: readonly AchievementSaleRecord[],
  threshold: number,
): TaggedContributingRecords | null {
  let bestTagId: string | null = null;
  let bestTipping: AchievementSaleRecord | null = null;
  let bestList: AchievementSaleRecord[] = [];
  for (const [tagId, tagRecords] of soldRecordsByTag(records).entries()) {
    if (tagRecords.length >= threshold) {
      const tipping = tagRecords[threshold - 1];
      if (
        bestTipping == null ||
        tipping.saleDate.getTime() < bestTipping.saleDate.getTime()
      ) {
        bestTagId = tagId;
        bestTipping = tipping;
        bestList = tagRecords.slice(0, threshold);
      }
    }
  }
  return bestTagId == null ? null : { tagId: bestTagId, records: bestList };
}

/** 🔍売れ筋の現在値。最も売れているタグの売却済み件数 */
function bestTagSoldCount(records: readonly AchievementSaleRecord[]): number {
  let max = 0;
  for (const tagRecords of soldRecordsByTag(records).values()) {
    if (tagRecords.length > max) max = tagRecords.length;
  }
  return max;
}

/**
 * 有言実行（★1 件）・目標マスター（★10 件）が共有する下準備。
 * targetProfit が設定されていて、実際の純利益（recordNetProfit）がそれ以上だった記録を、
 * 販売日の昇順で返す（届いていなければ 0 件）。しきい値だけが違う 2 つの実績なので、
 * 対象記録の抽出はここ 1 本にまとめ、判定を重複させない（💰累計利益などと同じ考え方）。
 */
function goalAchievedRecords(
  records: readonly AchievementSaleRecord[],
): AchievementSaleRecord[] {
  return sortedBySaleDate(records).filter(
    (record) =>
      record.targetProfit != null && recordNetProfit(record) >= record.targetProfit,
  );
}

/** なんでも屋: purchasePrice > 0（仕入品）／=== 0（不用品）で純利益がプラスの、最初の記録 */
function earliestProfitableRecordByPurchasePrice(
  records: readonly AchievementSaleRecord[],
  hasPurchasePrice: boolean,
): AchievementSaleRecord | null {
  return (
    sortedBySaleDate(records).find(
      (record) =>
        (hasPurchasePrice ? record.purchasePrice > 0 : record.purchasePrice === 0) &&
        recordNetProfit(record) > 0,
    ) ?? null
  );
}

/**
 * 「獲得した実績」全種（成長系 25 + 特殊実績 13 = 38）の判定。0 件でも呼べる（すべて未達成で返る）。
 *
 * @param soldRecords 全期間・絞り込みなしの**売却済み**記録（既存の判定の母集団）。
 * @param options.listingRecords 状態を問わない（出品中も含む）全記録。「はじめる系」の一部
 *   （販売デビュー・タグデビュー・記録を続けよう）が要る。省略時は空配列扱い（それらは未達成のまま）。
 */
export function evaluateAchievements(
  soldRecords: readonly AchievementSaleRecord[],
  options: {
    listingRecords?: readonly AchievementListingRecord[];
  } = {},
): Achievement[] {
  const listingRecords = options.listingRecords ?? [];

  const ordered = sortedBySaleDate(soldRecords);
  const orderedListing = sortedByListingDate(listingRecords);
  const soldCount = soldRecords.length;
  const listingCount = listingRecords.length;
  const bestProfit = maxRecordProfit(soldRecords);
  const careerProfit = totalNetProfit(soldRecords);

  const achievements: Achievement[] = [];

  // ---- 特殊実績: はじめる系 ----

  achievements.push({
    id: 'first_sale',
    target: 1,
    current: Math.min(soldCount, 1),
    completed: soldCount >= 1,
    completedAt: soldCount >= 1 ? ordered[0].saleDate : null,
    completedRecord: soldCount >= 1 ? toCompletedRecord(ordered[0]) : null,
    completedRecords: soldCount >= 1 ? [toCompletedRecord(ordered[0])] : [],
  });

  achievements.push({
    id: 'sale_debut',
    target: 1,
    current: Math.min(listingCount, 1),
    completed: listingCount >= 1,
    completedAt: listingCount >= 1 ? orderedListing[0].saleStartDate : null,
    completedRecord:
      listingCount >= 1 ? toListingCompletedRecord(orderedListing[0]) : null,
    completedRecords:
      listingCount >= 1 ? [toListingCompletedRecord(orderedListing[0])] : [],
  });

  const firstProfitRecord =
    ordered.find((record) => recordNetProfit(record) > 0) ?? null;
  achievements.push({
    id: 'first_profit',
    target: 1,
    current: firstProfitRecord != null ? 1 : 0,
    completed: firstProfitRecord != null,
    completedAt: firstProfitRecord?.saleDate ?? null,
    completedRecord:
      firstProfitRecord != null ? toCompletedRecord(firstProfitRecord) : null,
    completedRecords:
      firstProfitRecord != null ? [toCompletedRecord(firstProfitRecord)] : [],
  });

  {
    const contributing = cumulativeProfitContributingRecords(
      soldRecords,
      CAREER_PROFIT_STARTER_THRESHOLD,
    );
    const achievedRecord =
      contributing.length > 0 ? contributing[contributing.length - 1] : null;
    achievements.push({
      id: 'career_profit_1000',
      target: CAREER_PROFIT_STARTER_THRESHOLD,
      current: Math.max(
        0,
        Math.min(careerProfit, CAREER_PROFIT_STARTER_THRESHOLD),
      ),
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords: contributing.map((record) => toCompletedRecord(record)),
    });
  }

  {
    const achieved = listingCount >= RECORD_COUNT_TARGET;
    const contributing = achieved
      ? orderedListing.slice(0, RECORD_COUNT_TARGET)
      : [];
    const record = achieved ? orderedListing[RECORD_COUNT_TARGET - 1] : null;
    achievements.push({
      id: 'record_count_10',
      target: RECORD_COUNT_TARGET,
      current: Math.min(listingCount, RECORD_COUNT_TARGET),
      completed: achieved,
      completedAt: record?.saleStartDate ?? null,
      completedRecord: record != null ? toListingCompletedRecord(record) : null,
      completedRecords: contributing.map(toListingCompletedRecord),
    });
  }

  // ---- 特殊実績: タグ系 ----

  {
    const tagDebutRecord =
      orderedListing.find((record) => record.tagIds.length > 0) ?? null;
    achievements.push({
      id: 'tag_debut',
      target: 1,
      current: tagDebutRecord != null ? 1 : 0,
      completed: tagDebutRecord != null,
      completedAt: tagDebutRecord?.saleStartDate ?? null,
      completedRecord:
        tagDebutRecord != null
          ? toListingCompletedRecord(tagDebutRecord)
          : null,
      completedRecords:
        tagDebutRecord != null
          ? [toListingCompletedRecord(tagDebutRecord)]
          : [],
    });
  }

  {
    const contributing = multiTagProfitContributingRecords(
      soldRecords,
      TAG_SYNERGY_THRESHOLD,
      MULTI_TAG_PROFIT_TARGET_COUNT,
    );
    const lastGroup =
      contributing.length > 0 ? contributing[contributing.length - 1] : null;
    const record =
      lastGroup == null ? null : lastGroup.records[lastGroup.records.length - 1];
    achievements.push({
      id: 'tag_synergy',
      target: MULTI_TAG_PROFIT_TARGET_COUNT,
      current: tagsReachingProfitThresholdCount(
        soldRecords,
        TAG_SYNERGY_THRESHOLD,
        MULTI_TAG_PROFIT_TARGET_COUNT,
      ),
      completed: record != null,
      completedAt: record?.saleDate ?? null,
      completedRecord:
        record != null && lastGroup != null
          ? toCompletedRecord(record, lastGroup.tagId)
          : null,
      completedRecords: flattenTaggedContributingRecords(contributing),
    });
  }

  {
    const contributing = multiTagProfitContributingRecords(
      soldRecords,
      TAG_MASTERY_THRESHOLD,
      MULTI_TAG_PROFIT_TARGET_COUNT,
    );
    const lastGroup =
      contributing.length > 0 ? contributing[contributing.length - 1] : null;
    const record =
      lastGroup == null ? null : lastGroup.records[lastGroup.records.length - 1];
    achievements.push({
      id: 'tag_mastery',
      target: MULTI_TAG_PROFIT_TARGET_COUNT,
      current: tagsReachingProfitThresholdCount(
        soldRecords,
        TAG_MASTERY_THRESHOLD,
        MULTI_TAG_PROFIT_TARGET_COUNT,
      ),
      completed: record != null,
      completedAt: record?.saleDate ?? null,
      completedRecord:
        record != null && lastGroup != null
          ? toCompletedRecord(record, lastGroup.tagId)
          : null,
      completedRecords: flattenTaggedContributingRecords(contributing),
    });
  }

  // ---- 特殊実績: その他 ----

  {
    // elapsedSaleDays が負（日付逆転）の記録は 30 以上との比較で自然に除外される
    const achievedRecord =
      ordered.find(
        (record) => elapsedSaleDays(record) >= LONG_BATTLE_DAYS_THRESHOLD,
      ) ?? null;
    achievements.push({
      id: 'long_battle',
      target: 1,
      current: achievedRecord != null ? 1 : 0,
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords:
        achievedRecord != null ? [toCompletedRecord(achievedRecord)] : [],
    });
  }

  {
    // elapsedSaleDays が負（日付逆転）の記録は 0 との一致では拾われないので自然に除外される
    const achievedRecord =
      ordered.find(
        (record) => elapsedSaleDays(record) === INSTANT_SALE_DAYS_THRESHOLD,
      ) ?? null;
    achievements.push({
      id: 'instant_sale',
      target: 1,
      current: achievedRecord != null ? 1 : 0,
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords:
        achievedRecord != null ? [toCompletedRecord(achievedRecord)] : [],
    });
  }

  {
    const contributing = goalAchievedRecords(soldRecords);
    const achievedRecord = contributing.length > 0 ? contributing[0] : null;
    achievements.push({
      id: 'goal_kept',
      target: 1,
      current: achievedRecord != null ? 1 : 0,
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords:
        achievedRecord != null ? [toCompletedRecord(achievedRecord)] : [],
    });
  }

  {
    const contributing = goalAchievedRecords(soldRecords);
    const achieved = contributing.length >= GOAL_MASTER_TARGET_COUNT;
    const counted = achieved
      ? contributing.slice(0, GOAL_MASTER_TARGET_COUNT)
      : [];
    const achievedRecord = achieved ? counted[counted.length - 1] : null;
    achievements.push({
      id: 'goal_master',
      target: GOAL_MASTER_TARGET_COUNT,
      current: Math.min(contributing.length, GOAL_MASTER_TARGET_COUNT),
      completed: achieved,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords: counted.map((record) => toCompletedRecord(record)),
    });
  }

  {
    const sourcedRecord = earliestProfitableRecordByPurchasePrice(
      soldRecords,
      true,
    );
    const usedRecord = earliestProfitableRecordByPurchasePrice(
      soldRecords,
      false,
    );
    const completed = sourcedRecord != null && usedRecord != null;
    // 両方が揃って初めて達成なので、達成日は「後から満たされた方」の販売日にする
    const achievedRecord =
      completed && sourcedRecord != null && usedRecord != null
        ? sourcedRecord.saleDate.getTime() >= usedRecord.saleDate.getTime()
          ? sourcedRecord
          : usedRecord
        : null;
    const contributing = [sourcedRecord, usedRecord].filter(
      (record): record is AchievementSaleRecord => record != null,
    );
    achievements.push({
      id: 'all_rounder',
      target: 2,
      current: contributing.length,
      completed,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords: sortedBySaleDate(contributing).map((record) =>
        toCompletedRecord(record),
      ),
    });
  }

  // ---- 成長系: ⚡一撃（1 件の記録が単独でしきい値を超える） ----

  for (const threshold of STRIKE_THRESHOLDS) {
    const achievedRecord = ordered.find(
      (record) => recordNetProfit(record) >= threshold,
    );
    achievements.push({
      id: `profit_${threshold}` as AchievementId,
      target: threshold,
      current: Math.min(bestProfit, threshold),
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords:
        achievedRecord != null ? [toCompletedRecord(achievedRecord)] : [],
    });
  }

  // ---- 成長系: 💰累計利益（全期間の売却済み記録の純利益合計。「一撃」とは独立した判定） ----

  for (const threshold of CAREER_PROFIT_THRESHOLDS) {
    const contributing = cumulativeProfitContributingRecords(
      soldRecords,
      threshold,
    );
    const achievedRecord =
      contributing.length > 0 ? contributing[contributing.length - 1] : null;
    achievements.push({
      id: `career_profit_${threshold}` as AchievementId,
      target: threshold,
      current: Math.max(0, Math.min(careerProfit, threshold)),
      completed: achievedRecord != null,
      completedAt: achievedRecord?.saleDate ?? null,
      completedRecord:
        achievedRecord != null ? toCompletedRecord(achievedRecord) : null,
      completedRecords: contributing.map((record) => toCompletedRecord(record)),
    });
  }

  // ---- 成長系: 📦販売件数 ----

  for (const threshold of SOLD_COUNT_THRESHOLDS) {
    const achieved = soldCount >= threshold;
    const contributing = achieved ? ordered.slice(0, threshold) : [];
    achievements.push({
      id: `sold_${threshold}` as AchievementId,
      target: threshold,
      current: Math.min(soldCount, threshold),
      completed: achieved,
      completedAt: achieved ? ordered[threshold - 1].saleDate : null,
      completedRecord: achieved
        ? toCompletedRecord(ordered[threshold - 1])
        : null,
      completedRecords: contributing.map((record) => toCompletedRecord(record)),
    });
  }

  // ---- 成長系: 🎯得意分野 ----

  for (const threshold of TAG_SPECIALTY_THRESHOLDS) {
    const group = tagSpecialtyContributingRecords(soldRecords, threshold);
    const record =
      group == null ? null : group.records[group.records.length - 1];
    achievements.push({
      id: `tag_specialty_${threshold}` as AchievementId,
      target: threshold,
      current: Math.min(bestTagCumulativeProfit(soldRecords), threshold),
      completed: record != null,
      completedAt: record?.saleDate ?? null,
      completedRecord:
        record != null && group != null
          ? toCompletedRecord(record, group.tagId)
          : null,
      completedRecords:
        group == null
          ? []
          : group.records.map((r) => toCompletedRecord(r, group.tagId)),
    });
  }

  // ---- 成長系: 🔍売れ筋 ----

  for (const threshold of TAG_BESTSELLER_THRESHOLDS) {
    const group = tagBestsellerContributingRecords(soldRecords, threshold);
    const record =
      group == null ? null : group.records[group.records.length - 1];
    achievements.push({
      id: `tag_bestseller_${threshold}` as AchievementId,
      target: threshold,
      current: Math.min(bestTagSoldCount(soldRecords), threshold),
      completed: record != null,
      completedAt: record?.saleDate ?? null,
      completedRecord:
        record != null && group != null
          ? toCompletedRecord(record, group.tagId)
          : null,
      completedRecords:
        group == null
          ? []
          : group.records.map((r) => toCompletedRecord(r, group.tagId)),
    });
  }

  return achievements;
}

/**
 * 記録の保存前後で evaluateAchievements をそれぞれ呼んだ結果を比べ、
 * 保存によって新たに完了した実績（before は未達成 → after は達成）だけを返す。
 * 保存トーストの「実績を獲得しました」表示が使う（呼び出し側は db/useRecords.ts）。
 *
 * before・after は同じ 38 種類を同じ順序で持つ想定（どちらも evaluateAchievements の結果）。
 * after の並び順をそのまま保つ（呼び出し側の表示順 = 実績一覧の並びと一致させるため）。
 */
export function newlyCompletedAchievements(
  before: readonly Achievement[],
  after: readonly Achievement[],
): Achievement[] {
  const completedBefore = new Set(
    before.filter((a) => a.completed).map((a) => a.id),
  );
  return after.filter((a) => a.completed && !completedBefore.has(a.id));
}

/**
 * evaluateAchievements の結果から、⚡一撃系（strike カテゴリ）の completedRecord を
 * recordId → 実績（Achievement）の対応表にする。
 *
 * 記録一覧・記録詳細の小さなバッジが使う。**1 件の記録の純利益だけを独立に見て
 * しきい値判定をやり直すと、同じ段階を満たす記録すべてが光ってしまう**（重複表示のバグ）。
 * 実際に実績として「達成」になるのは、evaluateAchievements の⚡一撃ループが選ぶ
 * completedRecord（各段階で最初にしきい値へ届いた 1 件。全画面表示の「達成した記録」行に
 * 出るのと同じ記録）だけなので、バッジもそれに揃える ── 判定をここで作り直さず、
 * 既に評価済みの achievements 配列を読むだけ。
 *
 * 1 件の記録が複数の段階（例: ★1〜★4）の completedRecord を兼ねることがあるので、
 * その場合は最高難易度のものだけを残す（構成の「最高難易度のバッジのみ表示」）。
 */
export function strikeAchievementsByRecordId(
  achievements: readonly Achievement[],
): Map<string, Achievement> {
  const result = new Map<string, Achievement>();
  for (const achievement of achievements) {
    if (!achievement.completed || achievement.completedRecord == null) continue;
    if (achievementCategory(achievement.id) !== 'strike') continue;

    const recordId = achievement.completedRecord.id;
    const existing = result.get(recordId);
    if (
      existing == null ||
      achievementDifficulty(achievement.id) > achievementDifficulty(existing.id)
    ) {
      result.set(recordId, achievement);
    }
  }
  return result;
}

/**
 * 達成日の新しい順（直近の達成が先頭）に並べ替える。
 *
 * 「獲得した実績」の横スクロール一覧（AchievementsSection）・全画面詳細モーダル
 * （AchievementDetailModal）のスワイプ順・実績一覧画面（AchievementListScreen）が
 * 開くモーダルの並びを統一するのに使う。未達成（completedAt が null）が混ざっても
 * 安全なよう、null は元の並び順を保ったまま末尾に残す（呼び出し側は通常、達成済みだけを渡す）。
 */
export function sortAchievementsByRecency(
  achievements: readonly Achievement[],
): Achievement[] {
  return [...achievements].sort((a, b) => {
    if (a.completedAt == null && b.completedAt == null) return 0;
    if (a.completedAt == null) return 1;
    if (b.completedAt == null) return -1;
    return b.completedAt.getTime() - a.completedAt.getTime();
  });
}

// ---- 次の実績 ----

export type NextAchievement = {
  id: AchievementId;
  current: number;
  target: number;
  /** 進捗率（0〜1）。次点の選定に使った値そのものを画面にも渡す */
  progress: number;
};

/**
 * 「次の実績」の選定（構成のロジックどおり）。未達成の実績のうち、進捗率
 * （現在値 ÷ 目標値）が最も高いものを 1 つ選ぶ。同率のときは並び順で先に出てきたものを採る
 * （構成の「実装しやすい形で構わない」を受けた決定）。
 *
 * 全実績達成済み・0 件（＝すべて未達成だが進捗 0）のどちらでも呼べる。
 * 全達成なら null（呼び出し側はコンプリート表示に倒す）。実績数が増えても同じ考え方で機能する。
 */
export function selectNextAchievement(
  achievements: readonly Achievement[],
): NextAchievement | null {
  let best: NextAchievement | null = null;
  for (const achievement of achievements) {
    if (achievement.completed) continue;
    const progress =
      achievement.target === 0 ? 0 : achievement.current / achievement.target;
    if (best == null || progress > best.progress) {
      best = {
        id: achievement.id,
        current: achievement.current,
        target: achievement.target,
        progress,
      };
    }
  }
  return best;
}

// ---- 自己ベスト ----

export type PersonalBests = {
  /** 最高純利益。1 件の記録の純利益の最大値 */
  bestNetProfit: { value: number; date: Date } | null;
  /** 最高販売価格 */
  bestSalesPrice: { value: number; date: Date } | null;
  /** 最速販売。記録日 → 販売日の最短経過日数（日付逆転は除外。§4.7 と同じ規則） */
  fastestSale: { days: number; date: Date } | null;
  /** 最多販売月。月ごとの件数が最も多かった月とその件数 */
  bestMonthByCount: { monthKey: string; count: number } | null;
  /** 最高月間利益。月ごとの純利益合計が最も高かった月と金額 */
  bestMonthByProfit: { monthKey: string; amount: number } | null;
  /** 最多販売タグ。最も件数の多いタグ（未分類 = null も対象） */
  bestTag: { tagId: string | null; count: number } | null;
};

/** Date → 月キー "YYYY-MM"（db/dates.ts の toMonthKey と同じ規則。ロジック層は db に依存しないため再掲） */
function monthKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function maxMapEntry<K, V>(
  map: ReadonlyMap<K, number>,
  build: (key: K, value: number) => V,
): V | null {
  if (map.size === 0) return null;
  let bestKey: K | undefined;
  let bestValue = -Infinity;
  for (const [key, value] of map) {
    if (value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }
  return build(bestKey as K, bestValue);
}

/** 0 件のときはすべて null（構成の「0件時の扱い」）。それ以外は全記録を 1 回だけ走査して求める */
export function computePersonalBests(
  records: readonly AchievementSaleRecord[],
): PersonalBests {
  if (records.length === 0) {
    return {
      bestNetProfit: null,
      bestSalesPrice: null,
      fastestSale: null,
      bestMonthByCount: null,
      bestMonthByProfit: null,
      bestTag: null,
    };
  }

  let bestNetProfit = {
    value: recordNetProfit(records[0]),
    date: records[0].saleDate,
  };
  let bestSalesPrice = {
    value: records[0].salesPrice,
    date: records[0].saleDate,
  };
  let fastestSale: { days: number; date: Date } | null = null;

  const monthCounts = new Map<string, number>();
  const monthProfits = new Map<string, number>();
  const tagCounts = new Map<string | null, number>();

  for (const record of records) {
    const profit = recordNetProfit(record);
    if (profit > bestNetProfit.value)
      bestNetProfit = { value: profit, date: record.saleDate };
    if (record.salesPrice > bestSalesPrice.value) {
      bestSalesPrice = { value: record.salesPrice, date: record.saleDate };
    }

    const days = elapsedSaleDays(record);
    if (days >= 0 && (fastestSale == null || days < fastestSale.days)) {
      fastestSale = { days, date: record.saleDate };
    }

    const key = monthKeyOf(record.saleDate);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    monthProfits.set(key, (monthProfits.get(key) ?? 0) + profit);

    // 未分類（タグなし）も自己ベストの対象（構成どおり）。tagId: null として同じ集計に混ぜる
    if (record.tagIds.length === 0) {
      tagCounts.set(null, (tagCounts.get(null) ?? 0) + 1);
    } else {
      for (const tagId of record.tagIds) {
        tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
      }
    }
  }

  return {
    bestNetProfit,
    bestSalesPrice,
    fastestSale,
    bestMonthByCount: maxMapEntry(monthCounts, (monthKey, count) => ({
      monthKey,
      count,
    })),
    bestMonthByProfit: maxMapEntry(monthProfits, (monthKey, amount) => ({
      monthKey,
      amount,
    })),
    bestTag: maxMapEntry(tagCounts, (tagId, count) => ({ tagId, count })),
  };
}
