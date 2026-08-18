// 表示用の文字列組み立て。金額の丸めは必ず roundForDisplay を通す（SPEC §2.6）。
//
// **桁区切りは「表示の文字列を組み立てる瞬間」だけに入れる。**
// 丸めと同じ扱いで（決定 §7-2 / §2.6「合算後の表示の瞬間だけ」）、集計値そのものは触らない。
// CSV 書き出し（SPEC-V3 §5・未実装）では**桁区切りを入れないこと** ──
// "12,685" は表計算ソフトが数値として読めず（区切り文字とも衝突する）、
// 書き出した金額で合計や並べ替えができなくなる。CSV は素の数値を書く。

import { t } from '@/i18n';
import type { Locale } from '@/settings/language';

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
 * グラフの Y 軸の目盛り 1 つぶん（UI-SPEC §1.5「目盛りはキリのいい数」。案 37b）:
 * `9000` → 「9千円」/ `300000` → 「30万円」/ `600` → 「600円」/ `0` → 「0」。
 *
 * **単位をラベル 1 つずつに書き切る。** 「単位: 千円」のようなバッジを軸の上に 1 回だけ出す形は、
 * **見落としたときに 10 倍・100 倍を読み違える**（`9` が 9 円なのか 9 千円なのか 9 万円なのかは
 * 数字だけでは決まらない）。ラベルごとに書けば原理的に起きない ── 目盛りは本体の内側に
 * 重ねてあるので、2〜3 文字長くなっても本体の幅を食わない。
 *
 * **0 だけは単位を付けない**（「0円」ではなく「0」）── 0 に単位は要らず、
 * 0 の線は他の目盛りより濃くして位置そのものを読ませるため（§1.5）。
 *
 * 切り替えは値そのものの桁で決める（1000 未満 = 円 / 10000 未満 = 千円 / それ以上 = 万円）。
 * 目盛りの値は `dualAxisBounds` が 1 / 1.5 / 2 / 3 / 5 × 10^n に丸めた幅の整数倍なので、
 * ここで割ると**小数第 1 位までにしかならない**（1500 → 1.5千円、45000 → 4.5万円）。
 * 割り切れない値は小数第 1 位に丸める ── キリのいい目盛りには現れない値なので、
 * 桁を増やして正確さを保つより短く出すほうがよい。
 *
 * 負の値は符号を付けたまま同じ規則（-3000 → 「-3千円」）。実額（累計のピルや吹き出し）は
 * この関数を通さず**常に全桁**で出す（§1.5）── 丸めた目盛りと実額の役割を分けるため。
 */
export function formatCompactYen(locale: Locale, value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';

  const abs = Math.abs(value);
  // **英語は万・千を使わない**（軸に並べて比べたうえでの決定）。
  // 万は日本語の数え方で、英語には対応する単位がない（10,000 を 1 万と数えない）。
  //
  // 「日本在住者には ¥30万 のほうが読みやすいのでは」という案も検討したが、
  // K / M を採った ── 幅はどちらも 4〜5 文字で差が無く、レイアウト上の優劣が無いため、
  // 英語を選んだ人には英語の数え方で出す、という素直な形にする。
  if (locale === 'en') {
    // 負号は ¥ の前（yenSymbol と同じ規則）。`¥-3K` の形にしない
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}¥${trimDecimal(abs / 1_000_000)}M`;
    if (abs >= 1_000) return `${sign}¥${trimDecimal(abs / 1_000)}K`;
    return yenSymbol(value);
  }
  if (abs >= 10000) return `${trimDecimal(value / 10000)}万円`;
  if (abs >= 1000) return `${trimDecimal(value / 1000)}千円`;
  return `${groupDigits(value)}円`;
}

/**
 * 「¥12,685」「-¥12,685」の形を作る。**負号は ¥ の前**（formatYenSymbol と同じ規則）──
 * `¥${groupDigits(...)}` とそのまま組むと `¥-12,685` になってしまう。
 */
function yenSymbol(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${groupDigits(Math.abs(value))}`;
}

/** 小数第 1 位まで。末尾の「.0」は出さない（3 → 「3」/ 1.5 → 「1.5」） */
function trimDecimal(value: number): string {
  return Number(value.toFixed(1)).toString();
}

/**
 * 金額表示「1234 円」。丸めは §2.6 の Math.round。
 * 桁区切りは付けない（Swift 版に合わせる）── 区切りを入れたのは「¥」表記のほう
 * （formatYenSymbol）だけで、こちらは計算タブの内訳など桁の小さい値に使う。
 */
export function formatYen(locale: Locale, value: number): string {
  const rounded = roundForDisplay(value);
  return locale === 'en' ? yenSymbol(rounded) : `${rounded} 円`;
}

/**
 * 電卓の合計「175 円」（UI-SPEC §7.1-5）。**roundForDisplay は通さない** ──
 * 行の結果は小数第 1 位まで出る（`10 ÷ 3` → `3.3`）ので、合計だけ整数に丸めると
 * 見えている行を足した数と合計が食い違う（§7.6 派生決定）。丸めは電卓の規則に合わせる。
 */
export function formatCalcTotal(locale: Locale, value: number): string {
  const shown = formatCalculatorNumber(value);
  return locale === 'en' ? `¥${shown}` : `${shown} 円`;
}

/**
 * まとめ買いの「1 個あたり」（SPEC-V3 §2.6.3）:「8円」「9.8円」。
 *
 * roundForDisplay を通さないのは、単価が小数第 1 位まで意味を持つため
 * （100 枚 980 円の封筒を 9 円に丸めると 80 円ぶん消える）。
 * **末尾の `.0` は出さない** ── 整数で割り切れる場合がふつうなので、
 * 常に小数を出すと落ち着かない。丸め方は電卓の行（formatCalcTotal）と同じ。
 */
export function formatUnitYen(locale: Locale, value: number): string {
  const shown = formatCalculatorNumber(value);
  return locale === 'en' ? `¥${shown}` : `${shown}円`;
}

/**
 * 金額表示「1234円」。文中や詰めて並べる 2 値（計算タブの逆算結果）で使う。
 *
 * formatYen との違いは数字と「円」の間の空白だけ。逆算結果の説明文
 * 「962円で売ると、手数料96円と…」のように 1 文に金額が 3 つ以上入る場所では、
 * 空白があるぶんだけ語の切れ目が読み取りにくくなるため詰める。
 * 単独のセル（内訳の行など）は従来どおり formatYen。
 */
export function formatYenTight(locale: Locale, value: number): string {
  const rounded = roundForDisplay(value);
  // 英語は「詰める / 空ける」の区別を持たない ── ¥ が前に付く 1 種類に集約される
  return locale === 'en' ? yenSymbol(rounded) : `${rounded}円`;
}

/**
 * 金額表示「¥12,685」「-¥12,685」。月カード（Swift 版 MonthlySummaryCard）の表記。
 *
 * **3 桁区切りを入れる**（Claude Design のモックの表記）── 合計や一覧の行は 5 桁を超えると
 * 区切りなしでは桁が数えられない（`¥15145` は一目では読めない）。
 * 丸めの規則は変えていない: roundForDisplay を**通したあとの値**に区切りを入れるだけで、
 * 丸めるのは従来どおり合算後・表示の瞬間だけ（決定 §7-2 / §2.6）。
 *
 * **負号は ¥ の前に出す**（`-¥12,685`）。groupDigits は数字の頭に符号を置くので、
 * `¥${groupDigits(...)}` とそのまま組むと `¥-12,685`（¥ の直後に負号）になってしまう ──
 * 一覧の行・グラフカードの選択値・帯グラフの不足額（すべて formatSignedYenSymbol 経由）
 * とアプリ内で表記の順序が食い違うため、符号だけ外に出して組み直す。
 */
export function formatYenSymbol(value: number): string {
  const rounded = roundForDisplay(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}¥${groupDigits(Math.abs(rounded))}`;
}

/**
 * 符号つきの金額「+¥1234」「-¥1234」（一覧の行の純利益。設計案 30b）。
 *
 * **符号を文字でも出す**のは、正負を緑／赤だけで伝えると色が唯一の手がかりになるため
 * （§0.1「色は識別の補助」）。0 は符号なしの「¥0」── 「+¥0」は増えたと読める。
 * 負号は formatYenSymbol がすでに ¥ の前に出すので、ここでは黒字にだけ「+」を足す。
 */
export function formatSignedYenSymbol(value: number): string {
  const rounded = roundForDisplay(value);
  if (rounded === 0) return formatYenSymbol(0);
  return rounded > 0 ? `+${formatYenSymbol(rounded)}` : formatYenSymbol(rounded);
}

/**
 * 見込み額「約¥1234」。出品中の行の「売れたら 約¥…」で使う。
 * 「約」は常に付く（UI-SPEC §5-3: 送料未入力かどうかの判定はしない）。
 */
export function formatApproxYenSymbol(locale: Locale, value: number): string {
  const amount = formatYenSymbol(value);
  return locale === 'en' ? `about ${amount}` : `約${amount}`;
}

/**
 * 経過日数「7日経過」/「7 days listed」（UI-SPEC §5-2。日数の算出は logic/listingDays.ts）。
 * 英語だけ 1 日と 2 日で語形が変わるので、辞書の複数形を通す。
 */
export function formatElapsedDays(locale: Locale, days: number): string {
  return t('elapsed.listing', locale, { count: days });
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

/**
 * 月キー "YYYY-MM" → 「2026年8月」（月バー・絞り込みの注記）。
 * Date を経由しないのは、期間の表示語（labels.periodTitle）が db/dates を参照しないため。
 */
export function formatMonthKeyTitle(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}年${month}月`;
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
