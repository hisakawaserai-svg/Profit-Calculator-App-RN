// SwiftUI の .searchable(prompt: "商品名で検索") 相当。
//
// 記録タブでは常時表示せず、⌕ を押した間だけヘッダ行に差し込む（UI-SPEC §5-10)。
// 差し込み先で余白が変わるので、外側の余白は style で上書きできるようにしてある。
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** 既定の余白（リスト上部の固定バー用）を打ち消すときに渡す */
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
};

export function SearchBar({
  value,
  onChangeValue,
  placeholder = '商品名で検索',
  style,
  autoFocus,
}: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.disabledBackground }, style]}>
      <Ionicons name="search" size={16} color={colors.secondaryLabel} />
      <TextInput
        style={[styles.input, { color: colors.label }]}
        value={value}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value !== '' && (
        <Pressable onPress={() => onChangeValue('')} hitSlop={8} accessibilityLabel="検索を消去">
          <Ionicons name="close-circle" size={16} color={colors.secondaryLabel} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
});
