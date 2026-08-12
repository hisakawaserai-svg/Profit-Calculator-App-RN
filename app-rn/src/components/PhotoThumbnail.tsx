// 一覧の行の左に置くサムネイル枠（SPEC-V5 §2.3 / 採用案 `41a`）。
//
// **写真の有無にかかわらず、常に 56pt の枠を置く。** これが案 41a を採った理由そのもので
// （§2.3 / 決定 §6-3）、写真のある行だけサムネを出すと商品名の左端が行ごとに揺れる ──
// 写真の無い記録の方が多い前提なので、揺れる側が多数派になる。
//
// 写真が無いときは薄い枠だけを出す。**押せる印は付けない**（一覧から写真は足せない。
// 足すのは編集フォーム。§3.1）。
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { PHOTO_EMPTY_LABEL, PHOTO_IMAGE_LABEL } from '@/logic/labels';
import { photoStore } from '@/media/expoPhotoFiles';
import { useThemeColors } from '@/theme';

/** 枠の一辺（SPEC-V5 §2.3）。行の高さ（56 + 上下 13 = 82pt）はこの値で決まる */
export const PHOTO_THUMBNAIL_SIZE = 56;

export function PhotoThumbnail({ fileName }: { fileName: string | null }) {
  const colors = useThemeColors();
  const uri = photoStore.uri(fileName);

  if (uri == null) {
    return (
      <View
        style={[styles.frame, styles.placeholder, { borderColor: colors.separator }]}
        accessibilityLabel={PHOTO_EMPTY_LABEL}>
        <Ionicons name="image-outline" size={20} color={colors.disabledContent} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.frame, { backgroundColor: colors.disabledBackground }]}
      // 正方形の枠に横長・縦長のどちらが来ても中身が歪まないよう、はみ出す側を切る
      contentFit="cover"
      accessibilityLabel={PHOTO_IMAGE_LABEL}
      // 一覧をスクロールしている間に淡く現れる演出は入れない（行が点滅して見える）
      transition={0}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    width: PHOTO_THUMBNAIL_SIZE,
    height: PHOTO_THUMBNAIL_SIZE,
    borderRadius: 8,
  },
  placeholder: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
