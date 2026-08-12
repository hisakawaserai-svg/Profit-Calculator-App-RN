// 記録フォームの写真の欄（SPEC-V5 §3.1 / 採用案 `41a`）。
// **伝票カードの商品名の行の左**に正方形の枠として置く。
//
// 見出し「写真（任意）」＋ 88pt の欄を商品名の上に積む形（初期の実装）から改めた ──
// 写真は任意で、付けない記録の方が多い（§0.2）。専用の 1 段を常に取ると、
// 伝票（商品名 → タグ → 種別 → 金額）の読みの前に、多くの場合は空の欄が挟まる。
// 商品名の横に畳めば**縦を 1pt も使わない**。詳細画面で足す口を商品名の行の
// アイコンにしたのと同じ考え方（§2.2 / 決定 §6-4）。
//
// **左に置くのは、一覧の行（左に 56pt の枠）・詳細（商品名の左）と揃えるため**（決定 §6-9）──
// 同じ記録を 3 つの画面で見るので、写真と名前の位置関係が画面ごとに入れ替わらないようにする。
//
// この部品が**商品名のブロックごと**受け取る（`children`）のは、行の組み立てと
// 失敗の表示（§3.3）を 1 か所に持つため ── 画面側は「名前と写真の行」を 1 つ置くだけになる。
//
// 選ぶ・差し替える・外すの 3 つができる（§3.2）。カメラは起動しない（決定 §6-2）。
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  PHOTO_ADD_LABEL,
  PHOTO_FIELD_LABEL,
  PHOTO_IMAGE_LABEL,
  PHOTO_OPEN_SETTINGS_LABEL,
  PHOTO_PERMISSION_DENIED_MESSAGE,
  PHOTO_REMOVE_LABEL,
  PHOTO_REPLACE_LABEL,
  PHOTO_SAVE_FAILED_MESSAGE,
  PHOTO_SQUARE_LABEL,
} from '@/logic/labels';
import { photoStore } from '@/media/expoPhotoFiles';
import { pickPhoto } from '@/media/photoPicker';
import { useThemeColors } from '@/theme';

/**
 * 枠の一辺（SPEC-V5 §3.1）。商品名（22px）＋ キャプション（12px）の 2 行とほぼ同じ高さで、
 * **行の高さを写真が決めない**ようにしてある（写真の有無でカードの形が変わらない）。
 */
const PHOTO_SQUARE_SIZE = 72;

type Props = {
  /** いま選ばれている写真のファイル名。null = 写真なし */
  fileName: string | null;
  /**
   * 写真が決まったとき（選択・差し替え・削除）。
   *
   * **ファイル名が渡るときは「ファイルが増えた」ことも意味する**（§1.5）── 呼び出し側は
   * 保存／取り消しのときに、使われなかったファイルを片づける責任を負う
   * （logic/photo.orphanPhotoFiles）。削除では `null` が来るだけで、
   * 実体は消さない ── 保存されるまでは元の写真に戻せなければならない。
   */
  onChange: (fileName: string | null) => void;
  /** 行の左に置くもの（商品名の入力とキャプション）。写真の枠はその右に並ぶ */
  children: ReactNode;
};

/** 失敗の表示（§3.3）。原因ごとに出す文が違うので、押した結果をそのまま持つ */
type Notice = 'denied' | 'failed' | null;

export function PhotoField({ fileName, onChange, children }: Props) {
  const colors = useThemeColors();
  const [notice, setNotice] = useState<Notice>(null);
  /** カメラロールを開いてから保存が終わるまで。二重に開かせない */
  const [busy, setBusy] = useState(false);

  const uri = photoStore.uri(fileName);

  const handlePick = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await pickPhoto();
      if (result.status === 'picked') onChange(result.fileName);
      // 閉じただけ（canceled）なら何も出さない ── 利用者が選んだ結果なので伝えることがない
      else if (result.status !== 'canceled') setNotice(result.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        {/* 写真は**行の左**（SPEC-V5 §3.1）。一覧の行（左に 56pt の枠）・詳細（商品名の左）と
            同じ並びにする ── 同じ記録を 3 つの画面で見るので、写真と名前の位置関係が
            画面ごとに入れ替わらないようにする */}
        <View style={styles.square}>
          <Pressable
            onPress={handlePick}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={uri == null ? PHOTO_ADD_LABEL : PHOTO_REPLACE_LABEL}
            style={({ pressed }) => [styles.squareFill, { opacity: pressed || busy ? 0.5 : 1 }]}>
            {uri == null ? (
              // 破線 ＋「写真」の語。**押せる場所であることを形で言う** ──
              // 実線の枠だと「写真が出る場所」に見えて、押せることが読めない
              <View style={[styles.placeholder, { borderColor: colors.separator }]}>
                <Ionicons name="image-outline" size={22} color={colors.blue} />
                <Text style={[styles.placeholderLabel, { color: colors.blue }]}>
                  {PHOTO_SQUARE_LABEL}
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri }}
                // 白っぽい写真がカードの地に溶けないよう枠を回す（一覧・詳細と同じヘアライン）
                style={[
                  styles.image,
                  { backgroundColor: colors.disabledBackground, borderColor: colors.separator },
                ]}
                contentFit="cover"
                accessibilityLabel={PHOTO_IMAGE_LABEL}
                transition={0}
              />
            )}
            {busy && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator />
              </View>
            )}
          </Pressable>

          {/* 外す口は枠の右上の「✕」（写真があるときだけ）。タグのチップと同じ作法で、
              消えるのは**写真だけ**（記録は消えない）。実体を消すのは保存が済んでから（§1.5）。
              差し替えは枠そのものを押す ── 口を 2 つ並べず、押した先で選び直す */}
          {uri != null && !busy && (
            <Pressable
              onPress={() => {
                setNotice(null);
                onChange(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${PHOTO_FIELD_LABEL}を${PHOTO_REMOVE_LABEL}`}
              style={({ pressed }) => [styles.removeBadge, { opacity: pressed ? 0.5 : 1 }]}>
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </Pressable>
          )}
        </View>

        {/* 商品名のブロック。写真の枠のぶんだけ幅が狭くなるが、位置は動かない */}
        <View style={styles.nameArea}>{children}</View>
      </View>

      {/* 失敗は行の下に全幅で出す（枠の右には収まらない長さなので）。
          権限の拒否は**アプリの中では直せない**ので、行き先まで出す（§3.3） */}
      {notice === 'denied' && (
        <View style={styles.notice}>
          <Text style={[styles.noticeText, { color: colors.red }]}>
            {PHOTO_PERMISSION_DENIED_MESSAGE}
          </Text>
          <Pressable onPress={() => Linking.openSettings()} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.noticeText, { color: colors.blue }]}>
              {PHOTO_OPEN_SETTINGS_LABEL}
            </Text>
          </Pressable>
        </View>
      )}
      {notice === 'failed' && (
        <Text style={[styles.noticeText, { color: colors.red }]}>{PHOTO_SAVE_FAILED_MESSAGE}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    // 商品名の行の上端に枠の上端を揃える（キャプションのぶんだけ下に余る）
    alignItems: 'flex-start',
    gap: 16,
  },
  nameArea: {
    flex: 1,
    gap: 4,
  },
  square: {
    width: PHOTO_SQUARE_SIZE,
    height: PHOTO_SQUARE_SIZE,
    // 「✕」が枠の外へ半分はみ出すので切り取らない
    overflow: 'visible',
  },
  squareFill: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  placeholderLabel: {
    fontSize: 11,
  },
  image: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    // 明るい写真の上でも「✕」が消えないよう、濃いグレーを敷く（テーマに振らない）
    backgroundColor: 'rgba(60, 60, 67, 0.75)',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: {
    fontSize: 13,
  },
});
