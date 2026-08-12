// 写真の全画面表示（SPEC-V5 §2.1）。詳細画面の写真を押すと開く。
//
// **ピンチでの拡大は入れない**（決定 §6-5）。保存する画像は長辺 1000px（§1.4）で、
// 全画面に広げた時点でほぼ等倍まで見えている ── 拡大しても増える情報がない。
// 入れるとしたら「保存する画素数を増やす」方が先で、その判断が済むまでは持たない。
//
// 地は黒で固定する（テーマに追従させない）。写真を見る面なので、明色でも暗色でも
// 周りが暗い方が写真の色が正しく読める。
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PHOTO_IMAGE_LABEL, PHOTO_VIEWER_CLOSE_LABEL } from '@/logic/labels';

export function PhotoViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        {/* 画像そのものを押しても閉じる ── 全画面から抜ける口を「✕」だけにすると、
            端末を横にしたときなどに指が届かないことがある */}
        <Pressable style={styles.imageArea} onPress={onClose} accessibilityRole="button">
          <Image
            source={{ uri }}
            style={styles.image}
            // 全体が入るように収める（切らない）。詳細画面のカードは cover だが、
            // ここは「隅まで確かめる」ための面なので端を落とさない
            contentFit="contain"
            accessibilityLabel={PHOTO_IMAGE_LABEL}
          />
        </Pressable>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={PHOTO_VIEWER_CLOSE_LABEL}
          style={({ pressed }) => [
            styles.close,
            { top: insets.top + 12, opacity: pressed ? 0.5 : 1 },
          ]}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  imageArea: {
    flex: 1,
  },
  image: {
    flex: 1,
  },
  close: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // 明るい写真の上でも「✕」が消えないよう、半透明の黒を敷く
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
