// Color+Extensions.swift の移植。
// Swift 版の platformBackground / platformSecondaryBackground は
// macOS・Mac Catalyst で固定色に分岐していたが、決定 §7-14 で macOS はスコープ外のため
// iOS 側（systemGroupedBackground / secondarySystemGroupedBackground）のみを移植する。
// 併せて、各 View が .green / .red / .orange / .blue / .secondary で参照していた
// システム標準色もここに集約する。
import { useColorScheme } from 'react-native';

export type ThemeColors = {
  /** UIColor.systemGroupedBackground 相当。画面の地色 */
  background: string;
  /** UIColor.secondarySystemGroupedBackground 相当。カード・入力欄の地色 */
  secondaryBackground: string;
  /** Color.primary 相当 */
  label: string;
  /** Color.secondary 相当 */
  secondaryLabel: string;
  /** Divider 相当 */
  separator: string;
  /** 純利益プラス・必要販売価格 */
  green: string;
  /** 純利益マイナス */
  red: string;
  /** 販売手数料の行・電卓の演算子キー */
  orange: string;
  /** 電卓ボタン・決定ボタン */
  blue: string;
  gray: string;
  /** disabled 時に入力欄へかぶせる地色 */
  disabledBackground: string;
};

const light: ThemeColors = {
  background: '#F2F2F7',
  secondaryBackground: '#FFFFFF',
  label: '#000000',
  secondaryLabel: 'rgba(60, 60, 67, 0.6)',
  separator: 'rgba(60, 60, 67, 0.29)',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  blue: '#007AFF',
  gray: '#8E8E93',
  disabledBackground: 'rgba(120, 120, 128, 0.12)',
};

const dark: ThemeColors = {
  background: '#000000',
  secondaryBackground: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235, 235, 245, 0.6)',
  separator: 'rgba(84, 84, 88, 0.6)',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  blue: '#0A84FF',
  gray: '#8E8E93',
  disabledBackground: 'rgba(120, 120, 128, 0.24)',
};

export const themes = { light, dark };

/** 端末の外観設定（app.json の userInterfaceStyle: automatic）に追従した配色を返す。 */
export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? dark : light;
}
