// 画面 2: 写真が上限を超えていたとき（SPEC-V8 §4.4・設計案 53e）。
//
// **押した後にしか出さない。** 押す前に「50MB まで」と書いても、大半の利用者には
// 無関係な数字で、「50MB とは何枚か」を考えさせるだけになる（§4.4）。
//
// **ダイアログではなく下からのシート**にした理由:
//
// - ダイアログは 3 行しか書けず、閉じると理由が残らない ── 「なぜ止められたか」を
//   後から追えない
// - **棒グラフを置ける。** 「あと少しなのか、大幅に超えているのか」が分かると、
//   写真を減らして作り直すという判断ができる。数字だけでは、どこまで減らせば
//   通るのかが読めない
//
// **「やめる」で閉じたときは、写真の選択を「含めない」に切り替える**（呼び出し側の責務）。
// 元の行き止まり（含める・上限超過）に戻すと、同じシートをもう一度出すことしかできない。
import { StyleSheet, Text, View } from 'react-native';

import { BottomActionBar } from '@/components/BottomActionBar';
import { SheetModal } from '@/components/SheetModal';
import { photoLimitMarkerRatio } from '@/logic/backupView';
import {
  backupCreateWithoutPhotosLabel,
  backupLimitCancelLabel,
  backupPhotoLimitBarMin,
  backupPhotoLimitMessage,
  backupPhotoLimitTitle,
  backupPhotoLimitBarLabel,
  backupPhotoLimitBarMax,
  backupPhotoLimitFooter,
  formatByteSize,
} from '@/logic/labels';
import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** いま端末にある写真（枚数と合計サイズ） */
  photos: { count: number; bytes: number };
  limit: number;
  /** 記録・タグ・プリセットの件数（「写真なしでも移せるもの」を数で見せる） */
  counts: { records: number; tags: number; presets: number };
  /** 「写真なしで作る」 */
  onCreateWithoutPhotos: () => void;
  /** 「やめる」／幕を押して閉じたとき。**どちらも同じ**（選択を「含めない」に倒す） */
  onCancel: () => void;
};

export function BackupPhotoLimitSheet({
  visible,
  photos,
  limit,
  counts,
  onCreateWithoutPhotos,
  onCancel,
}: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  const colors = useThemeColors();
  const markerRatio = photoLimitMarkerRatio(photos.bytes, limit);

  return (
    <SheetModal visible={visible} onClose={onCancel}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.secondaryBackground }]}>
          {/* iOS のシートと同じつまみ。下に引いて閉じられることの印 */}
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />

          <Text style={[styles.title, { color: colors.label }]}>{backupPhotoLimitTitle(locale)}</Text>
          <Text style={[styles.message, { color: colors.label }]}>
            {backupPhotoLimitMessage(locale)}
          </Text>

          {/* 棒の全長 ＝ 今の写真の量。その中に上限の目盛りを引く（logic/backupView.ts） */}
          <View style={[styles.chart, { borderColor: colors.separator }]}>
            <View style={styles.chartHead}>
              <Text style={[styles.chartLabel, { color: colors.label }]}>
                {backupPhotoLimitBarLabel(locale, photos.count)}
              </Text>
              <Text style={[styles.chartAmount, { color: colors.red }]}>
                {formatByteSize(locale, photos.bytes)}
              </Text>
            </View>

            <View style={[styles.track, { backgroundColor: colors.disabledBackground }]}>
              <View style={[styles.fill, { backgroundColor: colors.orange }]} />
              {/* 上限の目盛り。**塗りの上に重ねる** ── 超えた分が右側に残って見える */}
              <View style={[styles.marker, { backgroundColor: colors.label, left: `${markerRatio * 100}%` }]} />
            </View>

            <View style={styles.chartFoot}>
              <Text style={[styles.scale, { color: colors.secondaryLabel }]}>
                {backupPhotoLimitBarMin(locale)}
              </Text>
              <Text style={[styles.scale, { color: colors.secondaryLabel }]}>
                {backupPhotoLimitBarMax(locale, limit)}
              </Text>
            </View>
          </View>

          <Text style={[styles.footer, { color: colors.secondaryLabel }]}>
            {backupPhotoLimitFooter(locale, counts)}
          </Text>

          <BottomActionBar
            label={backupCreateWithoutPhotosLabel(locale)}
            onPress={() => {
              // 閉じ切ってから作り始める（シートが残ったまま進捗が出ると、
              // どちらの画面の進捗なのかが読めない）
              close();
              onCreateWithoutPhotos();
            }}
            secondary={{ label: backupLimitCancelLabel(locale), onPress: close }}
            variant="plain"
          />
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  chart: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 14,
  },
  chartAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  track: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  // 棒は「今の写真の量」で全部塗る。超過は目盛りの位置で示す（logic/backupView.ts）
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
  chartFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scale: {
    fontSize: 12,
  },
  footer: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 16,
  },
});
