import { StyleSheet, Text, View } from 'react-native';

import { unimplementedLabel } from '@/logic/labels';
import { useLocale } from '@/settings';

type Props = {
  title: string;
};

// 各タブの仮画面。実装が進んだら各画面コンポーネントに置き換える。
export function PlaceholderScreen({ title }: Props) {
  // 表示語は locale を引数に取る（src/i18n/index.ts の冒頭）
  const locale = useLocale();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{unimplementedLabel(locale)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  note: {
    fontSize: 14,
    color: '#888',
  },
});
