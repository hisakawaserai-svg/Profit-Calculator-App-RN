import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
};

// 各タブの仮画面。実装が進んだら各画面コンポーネントに置き換える。
export function PlaceholderScreen({ title }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>（未実装）</Text>
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
