// 表示用の文字列組み立て。金額の丸めは必ず roundForDisplay を通す（SPEC §2.6）。
//
// **桁区切りは「表示の文字列を組み立てる瞬間」だけに入れる。**
// 丸めと同じ扱いで（決定 §7-2 / §2.6「合算後の表示の瞬間だけ」）、集計値そのものは触らない。
// CSV 書き出し（SPEC-V3 §5・未実装）では**桁区切りを入れないこと** ──
// "12,685" は表計算ソフトが数値として読めず（区切り文字とも衝突する）、
// 書き出した金額で合計や並べ替えができなくなる。CSV は素の数値を書く。

import { formatCalculatorNumber } from './calculator';
import { roundForDisplay } from './profit';

/**
 * 整数部に 3 桁区切りを入れる（`12685` → `"12,685"`）。
 *
 * `toLocaleString('ja-JP')` を使わないのは、RN のエンジン（Hermes）では Intl の有無が
 * ビルド構成で変わり、環境によって区切りが出たり出なかったりするため。表示の見た目が
 * 端末任せになるより、自前で組んで常に同じ形にするほうがよい。
 *
 * 負号は区切りの対象外（`-` を残して絶対値側だけ刻む）。小数部があればそのまま残す ──
 * 金額は roundForDisplay を通った整数のはずだが、ここで落とすと丸めの規則を
 * この関数が二重に持つことになる（丸めは呼び出し側の責務。§2.6）。
 * 非有限値（NaN / Infinity）は区切りようがないのでそのまま文字列にする。
 */
export function groupDigits(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const sign = value < 0 ? '-' : '';
  const [integer, fraction] = Math.abs(value).toString().split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+$)/g, ',');
  return fraction == null ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

/**
 * 金額表示「1234 円」。丸めは §2.6 の Math.round。
 * 桁区切りは付けない（Swift 版に合わせる）── 区切りを入れたのは「¥」表記のほう
 * （formatYenSymbol）だけで、こちらは計算タブの内訳など桁の小さい値に使う。
 */
export function formatYen(value: number): string {
  return `${roundForDisplay(value)} 円`;
}

/**
 * 電卓の合計「175 円」（UI-SPEC §7.1-5）。**roundForDisplay は通さない** ──
 * 行の結果は小数第 1 位まで出る（`10 ÷ 3` → `3.3`）ので、合計だけ整数に丸めると
 * 見えている行を足した数と合計が食い違う（§7.6 派生決定）。丸めは電卓の規則に合わせる。
 */
export function formatCalcTotal(value: number): string {
  return `${formatCalculatorNumber(value)} 円`;
}

/**
 * まとめ買いの「1 個あたり」（SPEC-V3 §2.6.3）:「8円」「9.8円」。
 *
 * roundForDisplay を通さないのは、単価が小数第 1 位まで意味を持つため
 * （100 枚 980 円の封筒を 9 円に丸めると 80 円ぶん消える）。
 * **末尾の `.0` は出さない** ── 整数で割り切れる場合がふつうなので、
 * 常に小数を出すと落ち着かない。丸め方は電卓の行（formatCalcTotal）と同じ。
 */
export function formatUnitYen(value: number): string {
  return `${formatCalculatorNumber(value)}円`;
}

/**
 * 金額表示「1234円」。文中や詰めて並べる 2 値（計算タブの逆算結果）で使う。
 *
 * formatYen との違いは数字と「円」の間の空白だけ。逆算結果の説明文
 * 「962円で売ると、手数料96円と…」のように 1 文に金額が 3 つ以上入る場所では、
 * 空白があるぶんだけ語の切れ目が読み取りにくくなるため詰める。
 * 単独のセル（内訳の行など）は従来どおり formatYen。
 */
export function formatYenTight(value: number): string {
  return `${roundForDisplay(value)}円`;
}

/**
 * 金額表示「¥12,685」。月カード（Swift 版 MonthlySummaryCard）の表記。
 *
 * **3 桁区切りを入れる**（Claude Design のモックの表記）── 合計や一覧の行は 5 桁を超えると
 * 区切りなしでは桁が数えられない（`¥15145` は一目では読めない）。
 * 丸めの規則は変えていない: roundForDisplay を**通したあとの値**に区切りを入れるだけで、
 * 丸めるのは従来どおり合算後・表示の瞬間だけ（決定 §7-2 / §2.6）。
 */
export function formatYenSymbol(value: number): string {
  return `¥${groupDigits(roundForDisplay(value))}`;
}

/**
 * 符号つきの金額「+¥1234」「-¥1234」（一覧の行の純利益。設計案 30b）。
 *
 * **符号を文字でも出す**のは、正負を緑／赤だけで伝えると色が唯一の手がかりになるため
 * （§0.1「色は識別の補助」）。0 は符号なしの「¥0」── 「+¥0」は増えたと読める。
 * 桁区切りは formatYenSymbol に任せる（符号の外側では刻まない ──「+¥4,500」）。
 */
export function formatSignedYenSymbol(value: number): string {
  const rounded = roundForDisplay(value);
  if (rounded === 0) return formatYenSymbol(0);
  return rounded > 0 ? `+${formatYenSymbol(rounded)}` : `-${formatYenSymbol(Math.abs(rounded))}`;
}

/**
 * 見込み額「約¥1234」。出品中の行の「売れたら 約¥…」で使う。
 * 「約」は常に付く（UI-SPEC §5-3: 送料未入力かどうかの判定はしない）。
 */
export function formatApproxYenSymbol(value: number): string {
  return `約${formatYenSymbol(value)}`;
}

/** 経過日数「7日経過」（UI-SPEC §5-2。日数の算出は logic/listingDays.ts） */
export function formatElapsedDays(days: number): string {
  return `${days}日経過`;
}

/** 一覧のメタ行に出す短い日付「8/9」（UI-SPEC §1.2「M/D 販売」） */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 選択した点の見出しに出す日付「8月9日」（UI-SPEC §1.5-5「8月9日の記録　N件」）。
 * メタ行の formatShortDate（「8/9」）と分けてあるのは、こちらが見出しの語
 * （「…の記録」）に続く位置にあり、スラッシュ表記だと日付の切れ目が読み取りにくいため。
 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 月セクションの見出し「2026年08月」（Swift 版 .dateTime.year().month(.twoDigits) 相当） */
export function formatMonthHeader(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}年${month}月`;
}

/** 期間シートの年ブロックの見出し「2026年」（UI-SPEC §1.2-3） */
export function formatYearTitle(year: number): string {
  return `${year}年`;
}

/**
 * 期間シートの月グリッドの 1 マス「8月」（UI-SPEC §1.2-3）。
 * 年は見出しが持っているので、マスには月だけを出す（4 列に 12 個入る幅に収めるため）。
 */
export function formatMonthCell(month: number): string {
  return `${month}月`;
}

/** ナビゲーションタイトル用の「2026年8月」（SPEC §3.2「YYYY年M月の収支」） */
export function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/** 行に出す日付「2026/08/09」（Swift 版 .year().month(.twoDigits).day() の ja 表記相当） */
export function formatRecordDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}/${month}/${day}`;
}

// 日時「2026/08/09 14:30」を組み立てる formatRecordDateTime は、データタブの「明細」
// （時刻まで含めた販売日がそのまま集計キーになる単位）の廃止で参照元がなくなったため削除した
// （UI-SPEC §6-10）。刻みは日ごと / 月ごと / 年ごとのいずれかで、時刻を出す場所はもうない。
