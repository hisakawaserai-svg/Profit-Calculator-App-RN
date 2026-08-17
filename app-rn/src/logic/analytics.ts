// データタブ（UI-SPEC §1.5 / 採用案 7b）の純粋ロジック。
// Y 軸レンジと軸ラベルの整形、そして「期間から刻みを決める」規則だけを持ち、DB も React も触らない。
// 集計そのものは repository（SQL の GROUP BY / SUM）の担当。
//
// 案 7b で切替が 3 つとも廃止されたため、この層からも対応する概念が消えている（§6-10）:
//   - 指標切替（売上金額 / 収支）  → MetricType / METRIC_TYPES
//   - 表示単位切替（明細/日別/月別/年別） → CHART_UNITS と 'record'
//   - 期間指定（startDate / endDate と ◀▶ の平行移動） → Period / defaultPeriod / shiftPeriod
// 期間は月キー（または全期間）だけになり、刻みはそこから自動で決まる（§5-5）。
// 'year' だけは後から戻っている ── **切替としてではなく**、全期間が長くなったときに
// 自動で選ばれる刻みとして（36 か月超。YEAR_UNIT_MONTH_THRESHOLD）。

import { formatMonthDay, formatMonthTitle, formatYearTitle } from './format';
import { isMonthPeriod, isYearPeriod, periodYear, type Period } from './period';

/**
 * グラフの刻み（UI-SPEC §5-5）。期間から自動で決まる 3 値。
 * 設計案 6b の 62 日規則は採らない（期間指定 UI そのものがないため働く場面がない）。
 */
export type ChartUnit = 'day' | 'month' | 'year';

/**
 * 全期間で「年ごと」へ切り替わる月数の境界（UI-SPEC §5-5）。**36 か月ちょうどまでは月ごと。**
 *
 * 横スクロールはさせない（§1.5「期間ぶんを画面幅に収める」）ので、棒の幅は
 * 画面幅 ÷ スロット数で決まる。3 年ぶん = 36 本なら iPhone 幅でも 1 本あたりの幅が残るが、
 * それを超えると 10pt を切って潰れ始める（5 年ぶんの 60 本では棒の形が読めない）。
 * スクロールを入れずに読める密度を保つ側を採る。
 */
export const YEAR_UNIT_MONTH_THRESHOLD = 36;

/**
 * 期間が覆う月数（両端の月を含む）。"最も古い記録の月から今月まで" の数え方。
 * 同じ月なら 1、隣の月なら 2。
 */
function monthCount(span: { from: Date; to: Date }): number {
  return (
    (span.to.getFullYear() - span.from.getFullYear()) * 12 +
    (span.to.getMonth() - span.from.getMonth()) +
    1
  );
}

/**
 * 期間 → 刻み（UI-SPEC §5-5）。**月を選択 = 日ごと / それ以外は覆う月数で決まる**
 * （36 か月以下 = 月ごと / 超えたら年ごと）。
 *
 * 画面に切替を出さないので、ここが刻みを決める唯一の場所になる（画面側では分岐しない）。
 * 月数は chartSpan が出す範囲から数える ── 軸が覆う範囲と刻みの判定が同じ範囲を見ることで、
 * 「軸は 5 年ぶんなのに刻みは月ごと」のような食い違いが起こらない。
 *
 * **年を選んだときは 12 か月なので、閾値に触れずそのまま「月ごと」に落ちる**
 * （X 軸は 2025/01 〜 2025/12 の 12 スロット）。年を足すために変えたのは
 * 「日ごと」の入口を `monthKey != null` から `isMonthPeriod` にした 1 か所だけで、
 * 36 か月の規則そのものは動かしていない。
 *
 * 記録が 1 件もない全期間（span = null）は月ごと。軸そのものが引けないので
 * どちらでも表示は変わらないが、記録が増えたときに近いほうを既定にしておく。
 */
export function chartUnitFor(params: {
  /** 表示中の期間（全期間 / 年 / 月。logic/period.ts） */
  period: Period;
  earliestMonthKey: string | null;
  today: Date;
}): ChartUnit {
  if (isMonthPeriod(params.period)) return 'day';

  const span = chartSpan(params);
  if (span == null) return 'month';
  return monthCount(span) > YEAR_UNIT_MONTH_THRESHOLD ? 'year' : 'month';
}

/** SPEC §6.2 Y 軸上限 = max(1000, データ最大値) × 1.15。目盛りを丸める前の素の上限 */
export function yAxisUpperBound(values: number[]): number {
  const maxValue = values.length === 0 ? 0 : Math.max(...values);
  return Math.max(1000, maxValue) * 1.15;
}

/**
 * Y 軸下限。
 * SPEC §6.2 が規定しているのは上限だけで、Swift 版の domain は 0...upper だった。
 * ただし純利益はマイナスになり得（§2.3）、0 始まりだとその点が軸下に隠れて読めないため、
 * 負値があるときだけ上限と同じ倍率で下へ広げる。負値がなければ Swift 版と同じ 0。
 */
export function yAxisLowerBound(values: number[]): number {
  const minValue = values.length === 0 ? 0 : Math.min(...values);
  return minValue < 0 ? minValue * 1.15 : 0;
}

/** 複数系列を通した Y 軸の範囲（円） */
export type CombinedAxisBounds = { upper: number; lower: number };

/**
 * タグ別利益ランキングのスパークライン（案 2b）用の Y 軸範囲。
 *
 * **系列ごとに自動フィットさせない。** 各タグの折れ線を別々の範囲で描くと、
 * 小さい純利益のタグの線も大きい純利益のタグの線と同じ高さまで伸びてしまい、
 * 「背が高い＝純利益が多い」と読めなくなる（タグ間で比べるための一覧なので、
 * 比べられないと主題が壊れる）。渡された全系列をまとめて 1 回だけ
 * yAxisUpperBound / yAxisLowerBound に通し、その 1 組の範囲を全員で共有する。
 *
 * 目盛りの数字は出さない（スパークラインは高さの比較だけが役目）ので、
 * dualAxisBounds / singleAxisBounds と違ってキリのいい数への丸めは持たない。
 */
export function combinedAxisBounds(seriesList: readonly (readonly number[])[]): CombinedAxisBounds {
  const values = seriesList.flatMap((series) => series);
  return { upper: yAxisUpperBound(values), lower: yAxisLowerBound(values) };
}

// ─────────────────────────────────────────────────────────────────────────────
// X 軸を「日付の軸」にする（UI-SPEC §1.5-4）。
//
// repository が返すのは**記録のある集計点だけ**なので、そのまま並べると 7/1 と 7/31 の
// 2 件が隣り合って出てしまい、30 日の間隔が見えない。ここで期間の全スロット（日 or 月）を
// 作り、記録のない位置は値 0・件数 0 で埋める。棒は出ず、累計は横ばいで伸びる。
// ─────────────────────────────────────────────────────────────────────────────

/** グラフの 1 スロット。repository の集計点（AggregatedPoint）と構造的に互換 */
export type ChartPoint = {
  /** 集計キー（日ごと = "YYYY-MM-DD" / 月ごと = "YYYY-MM" / 年ごと = "YYYY"） */
  key: string;
  date: Date;
  profit: number;
  recordCount: number;
};

/** 月キー "YYYY-MM" → その月の 1 日（db/dates と同じだが、logic から db を参照しないため再掲） */
function monthKeyStart(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/** その月の末日（翌月 0 日）。月末までの軸を引くのに使う */
function monthKeyEnd(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0);
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function yearKeyOf(date: Date): string {
  return String(date.getFullYear());
}

/**
 * X 軸が覆う範囲（UI-SPEC §1.5-4）。
 *
 * | 期間 | 範囲 |
 * |---|---|
 * | 過去の月 | その月の 1 日 〜 末日 |
 * | 今月 | 1 日 〜 **今日**（まだ来ていない日まで軸を伸ばすと、右半分が常に空になる） |
 * | 過去の年 | その年の 1/1 〜 12/31 |
 * | 今年 | 1/1 〜 **今日**（月と同じ理由。今年の途中までしか軸を引かない） |
 * | 全期間 | 最も古い記録の月 〜 今月 |
 *
 * 記録が 1 件もない全期間では軸の引きようがないので null（呼び出し側は空表示にする）。
 */
export function chartSpan(params: {
  period: Period;
  earliestMonthKey: string | null;
  today: Date;
}): { from: Date; to: Date } | null {
  const { period, earliestMonthKey, today } = params;

  if (isMonthPeriod(period) && period != null) {
    const isCurrentMonth = period === monthKeyOf(today);
    return { from: monthKeyStart(period), to: isCurrentMonth ? today : monthKeyEnd(period) };
  }
  if (isYearPeriod(period)) {
    const year = periodYear(period) as number;
    // 今年は「今日」で止める。月のときと同じで、まだ来ていない月まで軸を伸ばすと右が常に空になる
    const isCurrentYear = year === today.getFullYear();
    return { from: new Date(year, 0, 1), to: isCurrentYear ? today : new Date(year, 11, 31) };
  }
  if (earliestMonthKey == null) return null;
  return { from: monthKeyStart(earliestMonthKey), to: today };
}

/**
 * from 〜 to（両端を含む）の全スロットを刻みの粒度で並べる。空の期間なら空配列。
 * 埋め方は 3 つの刻みで同じ ── 記録のない日・月・年も枠として置く（densifySeries が 0 で埋める）。
 */
export function chartSlots(unit: ChartUnit, from: Date, to: Date): { key: string; date: Date }[] {
  const slots: { key: string; date: Date }[] = [];

  if (unit === 'year') {
    for (let year = from.getFullYear(); year <= to.getFullYear(); year += 1) {
      const date = new Date(year, 0, 1);
      slots.push({ key: yearKeyOf(date), date });
    }
    return slots;
  }

  if (unit === 'day') {
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    for (
      let date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      date <= last;
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    ) {
      slots.push({ key: dayKey(date), date });
    }
    return slots;
  }

  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  for (
    let date = new Date(from.getFullYear(), from.getMonth(), 1);
    date <= last;
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  ) {
    slots.push({ key: monthKeyOf(date), date });
  }
  return slots;
}

/**
 * 記録のあるスロットに集計値を入れ、ない位置は 0 で埋める（UI-SPEC §1.5-4）。
 * これで X 軸が日付の間隔をそのまま表す ── 「月末に集中して売れた」が形で読める。
 */
export function densifySeries(
  points: readonly ChartPoint[],
  unit: ChartUnit,
  span: { from: Date; to: Date },
): ChartPoint[] {
  const byKey = new Map(points.map((point) => [point.key, point]));

  return chartSlots(unit, span.from, span.to).map(
    (slot) => byKey.get(slot.key) ?? { ...slot, profit: 0, recordCount: 0 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// タグ別純利益推移（データタブ新規セクション）。
// 「収支推移」と同じ軸（span・unit・densifySeries）に、タグの次元を 1 つ足すだけ ──
// 集計そのものは repository の analyticsSeriesByTag（analyticsSeries と同じ SUM 式）に任せ、
// ここでは選ばれたタグぶんだけ切り出して densifySeries に通す。
// ─────────────────────────────────────────────────────────────────────────────

/** repository の集計点（TagSeriesPoint）と構造的に互換。タグの次元が付いた ChartPoint */
export type TagSeriesRow = ChartPoint & { tagId: string | null };

/**
 * 選択中のタグぶんだけ、収支推移グラフと同じ span/unit で密な点列にする。
 * `selectedTagIds` に無いタグは結果に含めない（チェックを外すと系列が消える）。
 * 順序は selectedTagIds の反復順（呼び出し側が Set の挿入順＝チェックした順を渡せば、それが凡例の順になる）。
 */
export function tagTrendSeries(
  rows: readonly TagSeriesRow[],
  selectedTagIds: ReadonlySet<string | null>,
  unit: ChartUnit,
  span: { from: Date; to: Date },
): Map<string | null, ChartPoint[]> {
  const result = new Map<string | null, ChartPoint[]>();
  for (const tagId of selectedTagIds) {
    const points = rows.filter((row) => row.tagId === tagId);
    result.set(tagId, densifySeries(points, unit, span));
  }
  return result;
}

/**
 * X 軸ラベルを打つスロットの添字（UI-SPEC §1.5-4）。**両端を必ず含む。**
 *
 * 素朴に「先頭から一定間隔」で打つと、間隔が期間の長さを割り切るときしか末尾に当たらない ──
 * 31 日の月では 1・8・15・22・29 日で止まり、**月末の 31 日がラベルに現れない**。
 * ラベルのない 2 日ぶんが軸の右端に残るので、最後の棒が軸の手前で浮いて見える
 * （30 日の月はさらに悪く、5 日ぶんが残る）。
 *
 * そこで間隔は保ったまま**末尾を必ず打つ**。末尾が直前のラベルと近すぎるときは直前のほうを
 * 落とす ── 端で 2 つのラベルが重なるのを避けるため。
 * 期間の日数（28 / 29 / 30 / 31 日）に関わらず、軸の右端は必ずその月の最終日になる。
 *
 * **「近すぎる」は文字の幅で決める**（`minEndGap`）。スロット数の半分だけで見ていた頃は、
 * 12 スロットの月で末尾の 2 つが 2 スロット（52pt）しか離れず、ラベルの幅（36pt）と
 * 負の棒でのラベルの置き方が重なって**文字が地続きに見えた**（実機で確認）。
 * スロットの数ではなく**実際に何 pt 空くか**で判定すれば、月の日数にも端末の幅にも左右されない。
 *
 * @param slotCount スロット数（日ごとならその期間の日数）
 * @param maxLabels ラベルの目安の数。実際はこれ以下になる
 * @param minEndGap 末尾と直前のラベルの間に最低限空けるスロット数（呼び出し側が
 *                  「必要な pt ÷ スロットの幅」で出す）。0 なら幅を見ない
 */
export function labelSlotIndices(
  slotCount: number,
  maxLabels: number,
  minEndGap = 0,
): number[] {
  if (slotCount <= 0) return [];
  const last = slotCount - 1;
  if (last === 0) return [0];

  const step = Math.max(1, Math.ceil(last / Math.max(1, maxLabels - 1)));
  const indices: number[] = [];
  for (let index = 0; index < last; index += step) indices.push(index);

  // 末尾は必ず打つ。直前のラベルと近すぎるならそちらを落として場所を空ける。
  // **先頭は必ず残す**（両端を打つのがこの関数の約束なので、詰めきって 1 つにしない）
  const endGap = Math.max(step / 2, minEndGap);
  while (indices.length > 1 && last - indices[indices.length - 1] <= endGap) indices.pop();
  indices.push(last);

  return indices;
}

/**
 * タップ位置から選ぶスロット（UI-SPEC §1.5-4）。
 * 押された位置から**外側へ広げながら、記録のあるスロットを探す**。
 *
 * 日付の軸にしたことでスロットの大半が空になり得るので、押した位置ちょうどに記録がないことが
 * 普通に起きる。そこで「最も近い棒」を選ぶ ── 空振りに見える操作を作らないため。
 * 同じ距離に 2 つあるときは**古い側**（左）を採る（どちらかに決めておけばよく、
 * 左右で揺れないことのほうが大事）。記録が 1 件もなければ null。
 */
export function nearestRecordedIndex(
  points: readonly ChartPoint[],
  index: number,
): number | null {
  for (let distance = 0; distance < points.length; distance += 1) {
    const before = index - distance;
    if (before >= 0 && points[before].recordCount > 0) return before;
    const after = index + distance;
    if (after < points.length && points[after].recordCount > 0) return after;
  }
  return null;
}

/**
 * 期間の初めからの累計収支（UI-SPEC §1.5-4 の折れ線）。
 *
 * 累計の起点は**表示中の期間の先頭**で、アプリ全体の通算ではない ── グラフが答えるのは
 * 「この期間でどこまで積み上がったか」で、期間を選び直せば起点も動く。
 * 最後の値は合計行の収支と一致する（同じ集合の合計なので、見比べたときに食い違わない）。
 */
export function cumulativeProfits(values: readonly number[]): number[] {
  let running = 0;
  return values.map((value) => {
    running += value;
    return running;
  });
}

/** 左（棒＝刻みごとの収支）と右（折れ線＝累計収支）の 2 軸の範囲 */
export type DualAxisBounds = {
  /** 左軸の上限・下限（下限は 0 以下） */
  barMax: number;
  barMin: number;
  /** 右軸の上限・下限（下限は 0 以下） */
  cumulativeMax: number;
  cumulativeMin: number;
  /** 0 より上の目盛りの段数。**両軸で同じ**にして罫線を 1 組に保つ */
  sections: number;
  /** 0 より下の目盛りの段数。0 なら負の領域を描かない */
  sectionsBelow: number;
};

/** 目盛り幅の候補（1 桁の倍率）。3 を入れてあるので「3000 / 6000 / 9000」が出る */
const NICE_STEPS = [1, 1.5, 2, 3, 5, 10];

/** 目安の段数。実際の段数は刻み幅を丸めた結果で決まるので、これより増減する */
const TARGET_SECTIONS = 4;

/**
 * 目盛り 1 段ぶんの「キリのいい」幅（UI-SPEC §1.5-4）。
 * 素の上限を段数で割った値以上で、いちばん近い 1 / 1.5 / 2 / 3 / 5 × 10^n を返す。
 */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  return (NICE_STEPS.find((step) => normalized <= step) ?? 10) * magnitude;
}

/** 軸が覆う縦の範囲（上限 − 下限）。負値がなければ上限そのもの */
function axisSpan(values: number[]): number {
  return yAxisUpperBound(values) - yAxisLowerBound(values);
}

/**
 * 2 軸の範囲を決める（UI-SPEC §1.5-4）。満たすことが 2 つある。
 *
 * 1. **目盛りがキリのいい数**であること。素の上限（max(1000, 最大値) × 1.15）をそのまま
 *    段数で割ると「2149 / 4298 / …」のような半端な数字が並ぶので、1 段の幅を
 *    1 / 1.5 / 2 / 3 / 5 × 10^n に丸め、上限は「丸めた幅 × 段数」に取り直す。
 * 2. **0 の高さが両軸で揃う**こと。桁の違う 2 系列なので軸は分けるが、0 の位置まで
 *    別々にすると「棒は 0 より上なのに線は 0 より下」といった読み違いが起きる。
 *
 * 2 を満たす仕掛けが**段数を両軸で共有**すること ── 幅は軸ごとに丸めるが、上下の段数を
 * 揃えれば負側が占める割合（下の段数 ÷ 上の段数）も自動的に一致し、0 は同じ高さに来る。
 * 罫線も 1 組で済む（段数が違うと、左右のラベルが別の高さに並ぶ）。
 *
 * 3. **段数が青天井にならない**こと。1 段の幅は上下を合わせた範囲から決めるので、
 *    外れ値がどれだけ大きくても段数は TARGET_SECTIONS の前後に収まる（下記）。
 */
export function dualAxisBounds(
  barValues: number[],
  cumulativeValues: number[],
): DualAxisBounds {
  // 1 段の幅は**上下を合わせた範囲**（上限 − 下限）から決める。
  // **上限だけから決めてはいけない** ── 赤字の 1 日が黒字の何十倍にもなると、
  // 上限から出した細かい幅で下を刻むことになり、段数が際限なく増える
  // （+7,475 円の月に −999,910 円の日が入ると幅 3,000 円 × 下 384 段 = 合計 387 段になり、
  // その数だけ罫線と目盛りが描かれて画面が埋まった。実機で確認）。
  // 範囲全体で割れば、段数は常に TARGET_SECTIONS の前後に収まる。
  const barStep = niceStep(axisSpan(barValues) / TARGET_SECTIONS);
  const cumulativeStep = niceStep(axisSpan(cumulativeValues) / TARGET_SECTIONS);

  // 段数は「どちらの軸も収まる」ように大きい方を採る
  const sections = Math.max(
    Math.ceil(yAxisUpperBound(barValues) / barStep),
    Math.ceil(yAxisUpperBound(cumulativeValues) / cumulativeStep),
  );
  const sectionsBelow = Math.max(
    0, // 負値がないとき Math.ceil(-0 / step) は -0 になるので、ここで 0 に落とす
    Math.ceil(-yAxisLowerBound(barValues) / barStep),
    Math.ceil(-yAxisLowerBound(cumulativeValues) / cumulativeStep),
  );
  /** 負の領域がないときは素直に 0 を返す（-0 を外へ出さない） */
  const lowerBound = (step: number) => (sectionsBelow === 0 ? 0 : -step * sectionsBelow);

  return {
    barMax: barStep * sections,
    barMin: lowerBound(barStep),
    cumulativeMax: cumulativeStep * sections,
    cumulativeMin: lowerBound(cumulativeStep),
    sections,
    sectionsBelow,
  };
}

/** 1 軸だけの目盛り（タグ別純利益の推移グラフ用。dualAxisBounds の 1 系列版） */
export type SingleAxisBounds = {
  /** 目盛りの上限・下限（下限は 0 以下） */
  max: number;
  min: number;
  /** 目盛り 1 段ぶんのキリのいい幅 */
  step: number;
  /** 0 より上の段数 */
  sections: number;
  /** 0 より下の段数。0 なら負の領域を描かない */
  sectionsBelow: number;
};

/**
 * 1 系列ぶんの Y 軸の範囲（UI-SPEC §1.5-4 と同じ規則。dualAxisBounds §366 のコメント参照）。
 * 軸を 1 本しか持たないタグ別純利益の推移グラフ向け ── 段数を揃える相手がいないので、
 * 自分の値だけから丸めた幅・段数を決める。
 */
export function singleAxisBounds(values: number[]): SingleAxisBounds {
  const step = niceStep(axisSpan(values) / TARGET_SECTIONS);
  const sections = Math.ceil(yAxisUpperBound(values) / step);
  const sectionsBelow = Math.max(0, Math.ceil(-yAxisLowerBound(values) / step));
  const min = sectionsBelow === 0 ? 0 : -step * sectionsBelow;

  return { max: step * sections, min, step, sections, sectionsBelow };
}

/**
 * 右側に累計の目盛りを出すか（UI-SPEC §1.5-4）。**2 軸の上限が一致したら出さない** ──
 * そのときは左の数字がそのまま両方に当てはまるので、同じ数字を 2 列並べない。
 * 一致は珍しくない（棒の最大と累計の最大が同じ丸め幅に乗ると起きる。
 * 大きな赤字が 1 つ入って両軸とも同じ範囲まで広がる場合など）。
 *
 * 目盛り（YAxisTicks）と凡例の寄せ（ChartHeadRow）が**同じ条件**を見るために関数にしてある ──
 * 片方だけ直すと「右に何も無いのに凡例だけ右端にある」状態になる。
 */
export function hasSeparateCumulativeAxis(bounds: DualAxisBounds): boolean {
  return bounds.cumulativeMax !== bounds.barMax;
}

/**
 * X 軸ラベル（Swift 版 AxisValueLabel の書式）。刻みと同じ粒度まで出す ──
 * 年ごとの軸に「2026/01」と出すと、その年の 1 月だけを指しているように読める。
 */
export function formatChartLabel(date: Date, unit: ChartUnit): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (unit === 'day') return `${month}/${String(date.getDate()).padStart(2, '0')}`;
  if (unit === 'year') return String(date.getFullYear());
  return `${date.getFullYear()}/${month}`;
}

/**
 * 選択した点の見出しに出す日付（UI-SPEC §1.5-5「8月9日の記録　N件」）。
 * 刻みと同じ粒度で出す ── 月ごとの点に日付まで出すと、実在しない「その月の 1 日」を
 * 指しているように読めるため。
 */
export function formatPointDate(date: Date, unit: ChartUnit): string {
  if (unit === 'day') return formatMonthDay(date);
  if (unit === 'year') return formatYearTitle(date.getFullYear());
  return formatMonthTitle(date);
}
