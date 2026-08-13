// 自由色の選択シート（SPEC-V7 §3）。固定パレットの丸の最後の 1 つから開く。
//
// **確定ボタンを置く**（プリセットの選択シート §4.3 とは逆）── あちらは「並んでいるものを
// 1 つ選ぶ」ので押した時点で決まるが、こちらは**連続量を合わせる**操作で、
// 指を動かしている途中の色はまだ選択ではない。
//
// ライブラリは `reanimated-color-picker`（MIT・依存 0）。peer の reanimated /
// gesture-handler はこのアプリに既にある（並び替えのスワイプ・アニメーションで使用）ので、
// ネイティブの追加は無い。
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { HueSlider, Panel1, Preview } from 'reanimated-color-picker';

import { SheetModal } from '@/components/SheetModal';
import { normalizeHex } from '@/logic/color';
import {
  CANCEL_LABEL,
  COLOR_PICKER_DONE_LABEL,
  COLOR_PICKER_TITLE,
} from '@/logic/labels';
import { useThemeColors } from '@/theme';

type Props = {
  visible: boolean;
  /** 開いたときの色（`#RRGGBB`）。読めない値は既定色で開く */
  value: string;
  /** 「決定」を押したときだけ呼ばれる。`#RRGGBB`（大文字） */
  onSelect: (hex: string) => void;
  onClose: () => void;
};

export function ColorPickerSheet({ visible, value, onSelect, onClose }: Props) {
  const colors = useThemeColors();
  // 指を動かしている間の色。**確定するまで呼び出し側には渡さない**
  const [draft, setDraft] = useState(value);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {(close) => (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: colors.blue }]}>{CANCEL_LABEL}</Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.label }]} numberOfLines={1}>
              {COLOR_PICKER_TITLE}
            </Text>
            <Pressable
              onPress={() => {
                // 透明度は扱わない（§3）ので、8 桁で来ても 6 桁に落として渡す
                onSelect(normalizeHex(draft.slice(0, 7)) ?? draft);
                close();
              }}
              hitSlop={8}
              accessibilityRole="button">
              <Text style={[styles.headerButton, styles.done, { color: colors.blue }]}>
                {COLOR_PICKER_DONE_LABEL}
              </Text>
            </Pressable>
          </View>

          {/* 色相スライダー ＋ 明度彩度の面。**透明度のスライダーは出さない**（§3）──
              半透明の地色は下地しだいで文字色の判定が変わり、色ごとに決められなくなる */}
          <ColorPicker
            value={value}
            sliderThickness={24}
            thumbSize={28}
            thumbShape="circle"
            boundedThumb
            onCompleteJS={({ hex }) => setDraft(hex)}
            style={styles.picker}>
            <Preview hideInitialColor style={styles.preview} textStyle={styles.previewText} />
            <Panel1 style={styles.panel} />
            <HueSlider style={styles.slider} />
          </ColorPicker>
        </View>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerButton: {
    fontSize: 16,
  },
  done: {
    fontWeight: '600',
  },
  picker: {
    gap: 16,
  },
  preview: {
    borderRadius: 10,
  },
  previewText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // 面は正方形に近い高さを取る（色相 × 明度彩度を指で追える大きさ）
  panel: {
    height: 220,
    borderRadius: 12,
  },
  slider: {
    borderRadius: 12,
  },
});
