// 注意・危険・無事を伝える 1 枚（設計案 53b / 53f / 53g / 53h）。
//
// **同じ形の紙を 3 色で使い分ける。** 出る場所は 4 か所あるが、どれも
// 「本文の流れの中に、別の種類の情報を差し込む」ことをしているので、
// 見た目が場所ごとに違うと、色の意味（注意なのか、取り返しがつかないのか、
// 無事だったのか）を毎回読み直すことになる。
//
// | tone | 使う場所 | 意味 |
// |---|---|---|
// | `warning` | 写真を含めないときの警告（53b）・記録が大きく減るとき（53f） | このまま進むと失うものがある |
// | `danger`  | 写真なしのファイルから戻すとき（53g）・読み込めなかったとき（53h） | 取り返しがつかない／止まった |
// | `success` | 「現在のデータは変更されていません」（53h） | **無事だった** |
//
// **`success` を `danger` の中に置けるようにしてある**（53h の 3 行目）。
// 赤の中に同じ色で埋めると読み飛ばされる ── 失敗したときに利用者が
// 一番知りたいのは「壊れていないか」なので、そこだけは色を分ける。
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

export type NoticeTone = 'warning' | 'danger' | 'success';

type Props = {
  tone: NoticeTone;
  /** 太字の 1 行目。省略すると本文だけの帯になる */
  title?: string;
  /** 本文。複数行になってよい */
  body?: string;
  /**
   * 枠で囲うか（`danger` の既定は枠）。
   * 地色だけの帯は「本文の一部」に見えるので、画面全体を止める報せには枠を使う。
   */
  outlined?: boolean;
  /**
   * 行頭の記号を出すか（既定は出す）。
   *
   * **見出しが 1 行だけの帯では効くが、中に何行も抱える紙では邪魔になる**（案 53h）──
   * 記号のぶん本文が右に寄り、下に続く行と頭が揃わなくなる。
   */
  icon?: boolean;
  /** 中に足すもの（53h の理由・対処・緑の帯） */
  children?: ReactNode;
};

export function NoticeCard({ tone, title, body, outlined, icon: showIcon = true, children }: Props) {
  const colors = useThemeColors();

  const accent =
    tone === 'warning' ? colors.orange : tone === 'danger' ? colors.red : colors.green;
  const background =
    tone === 'warning'
      ? colors.warningBackground
      : tone === 'danger'
        ? colors.dangerBackground
        : colors.successBackground;
  const bordered = outlined ?? tone === 'danger';
  const icon =
    tone === 'warning' ? 'alert-circle' : tone === 'danger' ? 'alert-circle' : 'checkmark-circle';

  return (
    <View
      accessible
      style={[
        styles.card,
        {
          // 枠で囲うときは地をカードの色に戻す ── 枠と地色を両方濃くすると、
          // 中の文字より先に紙そのものが目立って本文が読めない
          backgroundColor: bordered ? colors.secondaryBackground : background,
          borderColor: accent,
          borderWidth: bordered ? 1.5 : 0,
        },
      ]}>
      <View style={styles.head}>
        {showIcon && <Ionicons name={icon} size={18} color={accent} style={styles.icon} />}
        <View style={styles.text}>
          {title != null && (
            <Text style={[styles.title, { color: tone === 'success' ? colors.label : accent }]}>
              {title}
            </Text>
          )}
          {body != null && <Text style={[styles.body, { color: colors.label }]}>{body}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  // 1 行目の文字の高さに合わせて下げる（行頭の記号として読める位置）
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
  },
});
