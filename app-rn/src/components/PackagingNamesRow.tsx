// 梱包材の欄の下に、いま選んだ資材の名前を出す 1 行（案 c）。
//
//     ＋ 梱包材            98
//     クッション封筒・緩衝材・テープ
//
// **これは「押した直後だけ出る控え」で、記録には残らない。**
// 記録が持つのは金額（envelope_cost）だけで、どの資材を選んだかは保存しない
// （梱包材のプリセット保存は見送った）。開き直すと消える。
//
// それでも出すのは、行の「🏷」が**他の 2 行と意味が違う**ため ── 販売サイト・送料の
// タグボタンは選んだプリセットのバッジに変わって「何を選んだか」を示し続けるが、
// 梱包材は複数選択なので 1 つのバッジに畳めず、押しても見た目が変わらない。
// 何も出さないと「選んだのに何も起きていない」ように見えるので、
// **押した直後だけでも選んだものが読める**方を採る。
//
// **名前の出どころは電卓の積み上げ（committedMemo）**で、欄の値がその確定値と
// 一致する間だけ有効（NumericField 参照）── 手で金額を打ち直せば控えは無効になり、
// この行も一緒に消える。**金額と食い違った名前が残らないのはそのため**で、
// この部品の側に消す判定は持たせていない。
//
// バッジ（色）は出さない（決定 §8-6 と同じ扱い）。同じ出どころの情報で、
// 3 件並んだときは名前だけの方が読みやすい。
import { StyleSheet, Text, View } from 'react-native';

import { pickedPresetNamesLabel } from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  /** 積み上げのうちプリセットから来た行の名前（logic/calcMemo の presetRowNames）。空なら出さない */
  names: readonly string[];
};

export function PackagingNamesRow({ names }: Props) {
  // 表示語は locale を引数に取る（渡さないと React Compiler が初回の文字列で固定する。
  // src/i18n/index.ts の冒頭）。この購読で言語を変えたときに引き直される
  const locale = useLocale();

  const colors = useThemeColors();

  const text = pickedPresetNamesLabel(locale, names);
  if (text == null) return null;

  return (
    <View style={styles.row}>
      {/* 1 行に収める。**折り返さない** ── 金額行の下に生える控えなので、
          ここが伸びると伝票の行の間隔が選んだ数で変わる（SiteNameRow と同じ扱い） */}
      <Text style={[styles.names, { color: colors.secondaryLabel }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // 余白は SiteNameRow と同じ値。同じ「金額行の下に付く控え」なので、
    // 行の付き方が欄によって変わらないようにする
    paddingVertical: 4,
  },
  names: {
    flex: 1,
    fontSize: 14,
  },
});
