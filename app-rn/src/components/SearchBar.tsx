// SwiftUI の .searchable(prompt: "商品名で検索") 相当。
// ナビゲーションバーに差し込む API は RN にないため、リスト上部の固定バーとして置く。
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useThemeColors } from '@/theme';

type Props = {
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeValue, placeholder = '商品名で検索' }: Props) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.disabledBackground }]}>
      <Ionicons name="search" size={16} color={colors.secondaryLabel} />
      <TextInput
        style={[styles.input, { color: colors.label }]}
        value={value}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        autoCorrect={false}
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
