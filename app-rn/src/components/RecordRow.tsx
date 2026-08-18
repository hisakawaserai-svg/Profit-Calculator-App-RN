// 一覧の 1 行（UI-SPEC §1.2「行の出し分け」）。記録タブとデータタブの内訳リストで共用する（§6-11）。
//
// 左に写真の枠（56pt・常設）、右に 2 段:
//   1 段目 = 商品名（左）＋ 主金額（右）
//   2 段目 = メタ行。左に「{種別}　M/D 販売 / 出品」、右に補足
//
// | 状態     | 主金額                        | メタ行の右                        |
// |----------|-------------------------------|-----------------------------------|
// | 売れた   | 純利益（ラベルなし・正緑/負赤） | 「経費 ¥…」                       |
// | 出品中   | 出品価格（黒）                 | 「売れたら 約¥…・N 日経過」        |
//
// - 金額ラベル（純利益: / 利益:）は廃止し金額だけを出す（§6-2）。
//   代わりに種別をメタ行に常時表示する（§6-1）。
// - 見込み額には常に「約」を付ける。送料未入力かどうかの判定はしない（§5-3）。
// - 「N 日経過」は出品日起算・当日 0 日（§5-2。算出は logic/listingDays.ts）。
// - 純利益は符号つき（「+¥1,240」）。正負を緑／赤だけに預けない（§0.1。設計案 30b）。
// - タグはメタ行の左端、日付の後ろに**点 ＋ 名前**で続ける（§2.3。設計案 30b）。
// - 写真の枠は**有無にかかわらず常に置く**（SPEC-V5 §2.3 / 採用案 `41a`）。
//   写真のある行だけサムネを出すと、商品名の左端が行ごとに揺れる ── 写真の無い記録の方が
//   多い前提なので、揺れる側が多数派になる。行の高さは 56 + 上下 13 = 82pt
//   （タグの付いた行だけ 3 段目ぶん伸びるのは従来どおり）。
import { StyleSheet, Text, View } from 'react-native';

import { PhotoThumbnail, PHOTO_THUMBNAIL_SIZE } from '@/components/PhotoThumbnail';
import { StrikeAchievementBadge } from '@/components/StrikeAchievementBadge';
import { TagDot } from '@/components/TagChip';
import { fromDbDate } from '@/db/dates';
import type { SaleRecord, Tag } from '@/db/schema';
import type { Achievement } from '@/logic/achievements';
import {
  formatApproxYenSymbol,
  formatElapsedDays,
  formatShortDate,
  formatSignedYenSymbol,
  formatYenSymbol,
} from '@/logic/format';
import {
  expensesLabel,
  listedDateLabel,
  soldDateLabel,
  expectedProfitText,
  untitledLabel,
  recordKindLabel,
} from '@/logic/labels';
import { listingDays } from '@/logic/listingDays';
import { netProfit, totalExpenses } from '@/logic/profit';
import { useLocale, type Locale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  record: SaleRecord;
  /** true = 売れた記録（売却済み） / false = 出品中 */
  isSoldMode: boolean;
  /** 「N 日経過」の基準日。省略時は今日（テスト・プレビューから固定日を渡せるように） */
  today?: Date;
  /**
   * この記録に付いたタグ（sortOrder 昇順。§1.5）。省略・空なら何も出さない ──
   * 付いていない記録の方が多いので、空欄や「なし」の語で行を太らせない。
   */
  tags?: readonly Tag[];
  /**
   * この記録が「達成した記録」になっている⚡一撃実績（logic/achievements の
   * strikeAchievementsByRecordId で呼び出し側が引いたもの）。省略・null ならバッジを出さない。
   * ここでは判定をやり直さない ── 呼び出し側（一覧画面）が全記録ぶんを一括で評価した
   * 結果を、行ごとに Map から引いて渡すだけ（評価をここで N 回繰り返さないため）。
   */
  strikeAchievement?: Achievement | null;
  /**
   * 3 段（商品名・日付と金額・タグ）の**縦の間隔**（既定 `'compact'`）。
   *
   * 既定を詰めてあるのは、記録タブとデータタブが**眺める一覧**だから ── 1 画面に入る
   * 件数が多いほうがよく、行の高さも 82pt に揃えてある（SPEC-V5 §2.3 / 採用案 41a）。
   *
   * `'comfortable'` は**選ぶための一覧**（複製元を選ぶ画面）用。1 件ずつ読み比べて押す面では、
   * 件数より 1 行の読みやすさが要る。**既定を変えずに選べるようにした**のは、
   * この部品を使う 3 画面のうち 2 つは今の詰め方のままが正しいため。
   */
  density?: RecordRowDensity;
};

export type RecordRowDensity = 'compact' | 'comfortable';

/** 3 段の間隔。`body` の gap にそのまま渡す */
const DENSITY_GAP: Record<RecordRowDensity, number> = {
  compact: 4,
  comfortable: 10,
};

export function RecordRow({
  record,
  isSoldMode,
  today,
  tags = [],
  strikeAchievement = null,
  density = 'compact',
}: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();
  const profit = netProfit(record);

  // 表示するのはグループ化と同じ基準日（SPEC §6.1）。出品中は saleDate が常に null なので出品日を出す
  const basisDate = isSoldMode ? record.saleDate : record.saleStartDate;
  const dateText =
    basisDate == null
      ? ''
      : `${formatShortDate(fromDbDate(basisDate))} ${isSoldMode ? soldDateLabel(locale) : listedDateLabel(locale)}`;

  return (
    <View style={styles.row}>
      {/* 写真の枠は常設（SPEC-V5 §2.3）。無い記録では薄い枠だけが出る */}
      <PhotoThumbnail fileName={record.photoFileName} />

      {/* 写真の右側。1 段目・メタ行・タグ行はここに積む */}
      <View style={[styles.body, { gap: DENSITY_GAP[density] }]}>
        <View style={styles.mainLine}>
          <View style={styles.nameAndBadge}>
            <Text style={[styles.itemName, { color: colors.label }]} numberOfLines={1}>
              {record.itemName === '' ? untitledLabel(locale) : record.itemName}
            </Text>
            {/* ⚡一撃系のバッジ。呼び出し側が strikeAchievementsByRecordId で引いた分だけ渡ってくる
                （＝この記録が実際に「達成した記録」になっている場合のみ。重複表示防止） */}
            {strikeAchievement != null && (
              <StrikeAchievementBadge achievement={strikeAchievement} />
            )}
          </View>
          <Text
            style={[
              styles.amount,
              // 売れた記録は正負で色を変える。出品中の主金額（出品価格）は損益ではないので黒
              {
                color: isSoldMode ? (profit >= 0 ? colors.green : colors.red) : colors.label,
              },
            ]}
            numberOfLines={1}>
            {/* 売れた記録は損益なので符号つき。出品中の主金額（出品価格）は損益ではないので素のまま */}
            {isSoldMode ? formatSignedYenSymbol(profit) : formatYenSymbol(record.salesPrice)}
          </Text>
        </View>

        <View style={styles.metaLine}>
          <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {/* 金額ラベルを廃止したぶん、種別はここで常時読めるようにする（§6-1） */}
            {recordKindLabel('ja', record.kind)}
            {dateText === '' ? '' : `　${dateText}`}
          </Text>
          <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
            {isSoldMode
              ? `${expensesLabel(locale)} ${formatYenSymbol(totalExpenses(record))}`
              : listingMetaText(locale, record, profit, today ?? new Date())}
          </Text>
        </View>

        {/* タグは**メタ行と同じ列の下に独立して置く**（§2.3）。設計案 30b は日付の後ろに
            続けていたが、実際の行にはメタ行の右（「経費 ¥…」「売れたら 約¥…・N 日経過」）が
            あり、同じ行に入れると日付もタグ名も両方省略されて読めなくなる。
            **チップにはしない** ── 点 ＋ 名前だけの方がメタ行の他の語と同じ重さで読める
            （チップにすると行の中で最も目立つ要素になる）。 */}
        {tags.length > 0 && (
          <View style={styles.tagLine}>
            {tags.map((tag) => (
              <View key={tag.id} style={styles.tagItem}>
                <TagDot colorKey={tag.colorKey} />
                <Text style={[styles.meta, { color: colors.secondaryLabel }]} numberOfLines={1}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** 出品中のメタ行の右「売れたら 約¥…・N 日経過」（UI-SPEC §1.2 / §5-2 / §5-3） */
// コンポーネントではないので locale は引数で受ける（フックは使えない）
function listingMetaText(
  locale: Locale,
  record: SaleRecord,
  profit: number,
  today: Date,
): string {
  const days = listingDays(
    {
      saleStartDate: fromDbDate(record.saleStartDate),
      saleDate: record.saleDate == null ? null : fromDbDate(record.saleDate),
    },
    today,
  );

  return `${expectedProfitText(locale, formatApproxYenSymbol(locale, profit))}・${formatElapsedDays(days)}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // 文字は上から積むので、写真の枠も上端に揃える（タグで 3 段目が生えても頭が動かない）
    alignItems: 'flex-start',
    gap: 12,
  },
  // 写真の右側。1 段目・メタ行・タグ行はここに積む（gap は density で決まる）
  body: {
    flex: 1,
    // 枠（56pt）より中身が短いときも行の高さを揃える
    minHeight: PHOTO_THUMBNAIL_SIZE,
    justifyContent: 'center',
  },
  mainLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  // 商品名 + ⚡一撃バッジをまとめる側。flexShrink は元々 itemName が持っていたものを
  // ここへ移し、商品名はこの中でだけ縮む（バッジは固定サイズのまま押し出されない）
  nameAndBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  // タグが多い記録でも行の高さが伸び続けないよう、折り返さず 1 行に収める
  tagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  tagItem: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
});
