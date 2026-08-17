// レコード詳細の帯グラフ（レシートの上に足す横 1 本の積み上げ棒）の材料。
//
// レシート（RecordDetailSections.ReceiptCard）は「販売価格から順に引いて結果に至る」縦の流れ、
// この帯は「その 1 件のお金がどう分かれたか」の横の割合で、同じ数字を 2 通りに見せる。
// **レシート側は変えない** ── 帯はその上に足すもの。
//
// 数字の作り方は計算タブの costBreakdown（logic/calcForm.ts）に合わせる:
// 各項を先に丸めてから足し引きするので、帯・凡例・レシートに出る額が互いに 1 円ずれない。
// 色は決めない。区画と凡例のドットの色は components/CostProportionBar.partColor が持つ
// （計算タブの逆算の配色をそのまま使う）ので、ここは色の対応づけに使う key だけを返す。
import type { SaleRecord } from '@/db/schema';

import type { BreakdownPartKey } from './calcForm';
import {
  ENVELOPE_AND_OTHERS_FIELD_LABEL,
  POSTAGE_LABEL,
  PURCHASE_PRICE_LABEL,
  SHORTFALL_SEGMENT_LABEL,
  commissionRowLabel,
  profitLabel,
} from './labels';
import { commissionCost, roundForDisplay } from './profit';

/**
 * 帯に文字（項目名・割合）を入れる下限。区画の幅が全体のこれ未満なら色だけで示す。
 *
 * 入る幅が無いところに文字を置くと、切り詰められた項目名の断片が並んで
 * どの区画の名前なのかが読めなくなる。読めない文字を置くくらいなら、
 * 名前と割合は凡例（帯の下の一覧）に任せて帯は色だけにする。
 */
export const BAR_LABEL_MIN_RATIO = 0.15;

/**
 * 帯と凡例の 1 項目。
 *
 * **並びは常に計算タブの帯と同じ**（仕入 → 送料 → 販売手数料 → 梱包材・その他 → 利益。
 * logic/calcForm.ts の costBreakdown と同じ「入力順」で、利益が最後に来る）。
 * 同じ配色の帯が 2 か所にあるので、色だけでなく並びも揃える ──
 * 画面をまたいだ瞬間に読み方を覚え直さずに済む。
 * 額の大きい順に詰めない ── 黒字と赤字、記録と記録で順番が入れ替わると、
 * 同じ色が別の項目を指しているように見える。
 */
export type RecordBarPart = {
  /** 色の対応づけ（partColor）。梱包材・その他は envelopeCost の色でまとめる */
  key: BreakdownPartKey;
  label: string;
  /** 表示用に丸め済み。赤字のときの利益だけが負になる */
  amount: number;
  /**
   * 帯に区画を作るか。
   *
   * 0 円の項目は作らない（`false`）── 幅 0 の区画は色だけが残って意味を持たない。
   * その項目にかかっていないことは、下のレシートに残る行が言う。
   *
   * **赤字でも費用側は区画を作る**（黒字と同じ積み上げ）。`false` になるのは
   * 赤字の `kept` ── 手元に残った額の区画ではなく「足りなかった分」の斜線区画に
   * 入れ替わるので、この一覧ではなく DeficitBreakdown.shortfall が幅を持つ。
   * 費用側の 1 項目が帯の 90% を超えた記録も全部 `false` になる
   * （内訳を 1 色にまとめる。DeficitBreakdown.collapsedCosts）。
   *
   * **レシートのドットの色はこれで決めない**（`amount > 0` で決める。RecordDetailSections）──
   * 区画があるかどうかと、行に色を付けるかどうかは別の話で、
   * ここに寄せると赤字の記録でレシートの「手元に残る」行のドットだけが理由なく変わる。
   */
  inBar: boolean;
  /** 帯の全長に対する割合（0..1）。区画を作らない項目は null */
  ratio: number | null;
};

/**
 * 黒字（費用が販売価格に収まっている）。帯は 1 本で、全長 ＝ 販売価格。
 */
export type SurplusBreakdown = {
  deficit: false;
  parts: RecordBarPart[];
  /** 帯の全長が表す額 */
  total: number;
};

/**
 * 赤字（費用が販売価格を上回る）。**黒字と同じ積み上げ 1 本で、右端の 1 区画だけが違う。**
 *
 *     ███仕入███│送料│手数料│▨▨足りない▨▨
 *
 * 黒字で緑の「手元に残る」が伸びる位置に、赤字では**斜線の「足りなかった分」**が入る。
 * 費用側（仕入・送料・手数料・梱包）は色も並びも黒字とまったく同じ ──
 * 黒字と赤字で帯の作りが変わらないので、記録をまたいでも視線の動きが変わらない。
 *
 * **「売った / かかった」の 2 本立ても、内訳を持たない単色 1 本も廃止した**（2026-08-14）。
 * 2 本立ては桁違いの記録（販売 1,000 円・仕入 400,000 円）で「売った」バーの塗りが
 * 0.25% になり空の器に見えた。単色 1 本はそれを避けたが、今度は赤字の記録だけ
 * 内訳が読めなくなった ── 区画の下限（MIN_SEGMENT_WIDTH）を守れば積み上げでも潰れない。
 */
export type DeficitBreakdown = {
  deficit: true;
  /**
   * 費用側は黒字と同じく `inBar` / `ratio` を持つ（`collapsedCosts` のときを除く）。
   * **`kept` だけは常に `inBar: false`** ── その位置は下の `shortfall` の区画が占める。
   */
  parts: RecordBarPart[];
  /**
   * 帯の全長が表す額 ＝ **かかった費用の合計 ＋ 足りなかった額**。
   *
   * 黒字の全長（販売価格 ＝ 費用 ＋ 手元に残る額）と同じ組み立てで、
   * 「手元に残る」の項が「足りなかった分」に入れ替わっただけ。販売価格を分母にすると
   * 費用の合計だけで 100% を超えてしまい、足りない分の区画を置く場所が残らない。
   */
  total: number;
  /** かかった費用 − 売った金額。斜線の区画が表す額 */
  shortfall: number;
  /** 斜線の区画の割合（0..1）。`shortfall / total` */
  shortfallRatio: number;
  /**
   * 費用側の内訳をまとめて 1 色で描くか（1 項目が帯の COLLAPSE_COST_RATIO を超えたとき）。
   *
   * 1 項目が 90% を超えると残りの費用は全部合わせても 10% 未満に潰れ、
   * 区画も引き出し線も互いに重なって読めない。まとめた側の正確な金額は
   * すぐ下のレシートの行が持っているので、帯は「費用が大半」とだけ言えばいい。
   * このとき費用側の `parts` はどれも `inBar: false`（描くのは 1 区画だけ）。
   */
  collapsedCosts: boolean;
};

/** 費用側の内訳をまとめる境目（DeficitBreakdown.collapsedCosts） */
export const COLLAPSE_COST_RATIO = 0.9;

export type RecordBreakdown = SurplusBreakdown | DeficitBreakdown;

/**
 * 販売価格に依存する額（帯グラフ・レシートの利益行）を確定した数字として出すか。
 *
 * 販売価格が未設定（0 円）だと、`recordBreakdown` は費用だけを分母にした割合や
 * 「足りない」を計算してしまい、`netProfit` も 0 円で売れた体の損失額を返す ──
 * どちらもまだ価格を入れていないだけの記録を、確定した赤字であるかのように見せてしまう。
 * ここが `false` を返す記録では、帯グラフ（RecordBreakdownBar）を出さず不活性文に差し替え、
 * レシートの利益行（ReceiptCard）も金額の代わりに `AMOUNT_PLACEHOLDER`（「ーー」）を出す ──
 * 「いくらで売る?」画面の未設定時（E。pricing.ts の `unpriced` 状態）と同じ考え方。
 *
 * **費用側（仕入・送料・手数料・梱包）は対象外** ── これらは販売価格に依存しない値なので、
 * レシートはこれまでどおり金額を出す。
 */
export function showsPricedAmounts(record: Pick<SaleRecord, 'salesPrice'>): boolean {
  return record.salesPrice !== 0;
}

/**
 * レコード 1 件を帯グラフの材料に分解する。
 *
 * - **不用品は仕入の項目自体を作らない**（SPEC-V2 §1.3）。0 円の項として落としても
 *   結果は同じだが、種別の意味として持たない ── レシートも行ごと出していない。
 *   その分は他の項目の割合が自然に大きくなる。
 * - 梱包材とその他はレシートと同じく 1 行にまとめる（UI-SPEC §1.4-4）。
 * - 利益は引き算の結果（販売価格 − 丸めた費用の合計）。netProfit を丸めた値と
 *   同じ額になり、レシートの結果行と一致する。
 */
export function recordBreakdown(record: SaleRecord): RecordBreakdown {
  const salesPrice = roundForDisplay(record.salesPrice);
  const purchasePrice = roundForDisplay(record.purchasePrice);
  const postage = roundForDisplay(record.postage);
  const commission = roundForDisplay(commissionCost(record));
  const packing = roundForDisplay(record.envelopeCost + record.othersCost);

  // 計算タブの帯と同じ並び（仕入 → 送料 → 販売手数料 → 梱包材・その他）。利益は末尾に付く
  const costs: { key: BreakdownPartKey; label: string; amount: number }[] = [
    // 不用品には仕入価格の概念がない（常に 0）ので項目ごと作らない
    ...(record.kind === 'sourced'
      ? [{ key: 'purchasePrice' as const, label: PURCHASE_PRICE_LABEL, amount: purchasePrice }]
      : []),
    { key: 'postage', label: POSTAGE_LABEL, amount: postage },
    { key: 'commission', label: commissionRowLabel(roundForDisplay(record.commission)), amount: commission },
    { key: 'envelopeCost', label: ENVELOPE_AND_OTHERS_FIELD_LABEL, amount: packing },
  ];

  const costTotal = costs.reduce((sum, cost) => sum + cost.amount, 0);
  const profit = salesPrice - costTotal;
  const profitPart = { key: 'kept' as const, label: profitLabel(record.kind), amount: profit };

  // 帯の全長。黒字は販売価格（＝ 費用 ＋ 手元に残る額）、
  // 赤字はその「手元に残る額」を「足りなかった額」に置き換えた 費用 ＋ 不足額
  const shortfall = -profit;
  const total = profit >= 0 ? salesPrice : costTotal + shortfall;

  /** 0 円の項目は区画を作らない。割合の分母は帯の全長 */
  const toPart = (part: { key: BreakdownPartKey; label: string; amount: number }): RecordBarPart => {
    const inBar = part.amount > 0 && total > 0;
    return { ...part, inBar, ratio: inBar ? part.amount / total : null };
  };

  if (profit < 0) {
    const costParts = costs.map(toPart);
    // 1 項目で帯の大半を占めてしまったら、費用側は 1 色にまとめて内訳をレシートに任せる
    const collapsedCosts = costParts.some((part) => (part.ratio ?? 0) > COLLAPSE_COST_RATIO);

    return {
      deficit: true,
      parts: [
        ...(collapsedCosts
          ? costParts.map((part) => ({ ...part, inBar: false, ratio: null }))
          : costParts),
        // 手元に残る額の区画は無い（その位置は shortfall の斜線が占める）。
        // 並び・金額はそのまま残す ── レシートの行がこの一覧から項目を引くため
        { ...profitPart, inBar: false, ratio: null },
      ],
      total,
      shortfall,
      shortfallRatio: shortfall / total,
      collapsedCosts,
    };
  }

  return { deficit: false, parts: [...costs, profitPart].map(toPart), total };
}

/** 区画の中に項目名と割合を入れるか（BAR_LABEL_MIN_RATIO） */
export function showsBarLabel(part: RecordBarPart): boolean {
  return part.ratio != null && part.ratio >= BAR_LABEL_MIN_RATIO;
}

/**
 * 斜線の区画の中に不足額を入れる下限。**費用の区画の下限（15%）より広く取る。**
 *
 * 費用の区画に入るのは割合（「30%」＝ 3 文字）だが、こちらに入るのは金額
 * （「−¥399,100」＝ 9 文字）で、同じ幅では収まらない。同じ 15% にすると
 * 桁の多い記録で額の頭が切れて、**不足額が実際より小さく読める**。
 */
export const SHORTFALL_AMOUNT_MIN_RATIO = 0.25;

/**
 * 不足額を斜線の区画の中に出すか。**false でも額は必ず出す** ── 入らないだけで、
 * 出す場所が帯の外（引き出し線の先）に変わる（UI 側の ShortfallAmount）。
 */
export function showsShortfallAmount(breakdown: DeficitBreakdown): boolean {
  return breakdown.shortfallRatio >= SHORTFALL_AMOUNT_MIN_RATIO;
}

/**
 * 帯の外に引き出す割合ラベル（引き出し線）の 1 本。
 * 位置と色は区画そのものが決めるので、ここが持つのは「どの区画か」と「何段目か」だけ。
 */
export type LeaderLine = {
  key: BreakdownPartKey;
  /** 0..1。ラベルに出すのはこれだけで、金額は出さない（額はレシートの行が持つ） */
  ratio: number;
  /**
   * 引き出し線の段（0 が短い側）。
   * 細い区画が隣り合うと、線の先のラベルどうしが必ず重なる ── 幅で避けられないので
   * **高さをずらす**。対象を左から数えて交互に段を振るだけで、隣は必ず別の段になる。
   */
  tier: number;
};

/** 引き出し線の段数（0 と 1 の 2 段） */
export const LEADER_TIERS = 2;

/**
 * 帯の中に文字が入らなかった区画に付ける引き出し線（15% 未満）。
 *
 * **帯に区画のあるものだけ**が対象 ── 0 円の項目・不用品の仕入・赤字の「手元に残る」は
 * 指す先が無いので線も出さない（`inBar` が false のものは最初から入らない）。
 * **費用側をまとめた赤字（collapsedCosts）の結果は必ず空**で、
 * 呼び出し側に「まとめていないときだけ呼ぶ」という約束を置かずに済む。
 * 閾値は帯の中に文字を入れる判定（showsBarLabel）と同じ 1 つを使う ──
 * 別の値にすると、文字も線も付かない区画や、両方付く区画ができる。
 */
export function leaderLines(parts: RecordBarPart[]): LeaderLine[] {
  return parts
    .filter((part) => part.inBar && !showsBarLabel(part))
    .map((part, index) => ({ key: part.key, ratio: part.ratio ?? 0, tier: index % LEADER_TIERS }));
}

/**
 * レシートの行に付けるドットの色を決めるために、行の項目を引く。
 *
 * 独立した凡例を置かない代わりに、**レシートの各行に帯と同じ色のドットを付けて**
 * 色と項目を対応づける（RecordDetailSections.ReceiptCard）。
 * 見つからない（不用品の仕入）ときは `null` を返す。
 *
 * **色を付けるかどうかは `amount > 0` で決める（`inBar` では決めない）。**
 * 赤字では「手元に残る」に区画が無く、費用側をまとめた記録（collapsedCosts）では
 * 費用の区画も無いので、`inBar` で決めるとその記録だけドットが全部グレーになる ──
 * レシートは黒字でも赤字でも同じ面なので、色の付き方が状態で変わってはいけない。
 */
export function findBarPart(
  breakdown: RecordBreakdown,
  key: BreakdownPartKey,
): RecordBarPart | null {
  return breakdown.parts.find((part) => part.key === key) ?? null;
}

/**
 * ミニ帯グラフ（PricingScreen のシミュレーターカードに常時出す帯）の並び。
 *
 * 仕入 → 送料 → 手数料 → 梱包 → 利益。記録詳細の帯（recordBreakdown）・計算タブの帯
 * （calcForm.costBreakdown）と同じ「入力順、利益は最後」に揃えてある。
 * シミュレーターはこの並びのモック（2a 案）で確定した ── 費用を先に積み上げて、
 * 最後に残る／足りないが来るほうが「動かした結果どうなるか」を追いやすい。
 * 引き出し線を持たないぶん凡例が全項目を必ず言うので、額の大小で並べ替える必要もない。
 */
export const MINI_BAR_ORDER: readonly BreakdownPartKey[] = [
  'purchasePrice',
  'postage',
  'commission',
  'envelopeCost',
  'kept',
];

/** ミニ帯グラフの 1 区画・凡例行。帯と凡例はこの一覧を共通の材料にする */
export type MiniBarItem = {
  key: BreakdownPartKey;
  label: string;
  /** 表示用の額。斜線の「足りない」区画は不足額（正の数）を持つ */
  amount: number;
  /** 帯に区画を作るか（0 円以下の項目は作らない） */
  inBar: boolean;
  /** 赤字で利益の位置に入る斜線の「足りない」区画か */
  shortfall: boolean;
};

/**
 * レコード 1 件をミニ帯グラフの材料に分解する。**価格だけシミュレーター値に差し替える**──
 * 新しい計算式はここに置かず、recordBreakdown（帯・レシートと同じ数字）をそのまま呼ぶ。
 *
 * 黒字・赤字のどちらでも区画の位置は変わらない（MINI_BAR_ORDER で固定）。赤字では
 * 「利益」の位置が「足りない」に入れ替わるだけで、費用側は黒字とまったく同じ項目・色・順。
 */
export function miniBarItems(record: SaleRecord, price: number): MiniBarItem[] {
  const breakdown = recordBreakdown({ ...record, salesPrice: price });

  return MINI_BAR_ORDER.map((key): MiniBarItem | null => {
    const part = breakdown.parts.find((candidate) => candidate.key === key);
    if (part == null) return null;

    if (key === 'kept' && breakdown.deficit) {
      return {
        key,
        label: SHORTFALL_SEGMENT_LABEL,
        amount: breakdown.shortfall,
        inBar: true,
        shortfall: true,
      };
    }

    return { key, label: part.label, amount: part.amount, inBar: part.amount > 0, shortfall: false };
  }).filter((item): item is MiniBarItem => item != null);
}
