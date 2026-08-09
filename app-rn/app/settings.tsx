// 設定画面（SPEC-V2 §3.3）。計算タブのヘッダ右の歯車から開くモーダル。
//
// タブは 5 つのままにして 6 つ目を足さない代わりに、ルート直下の独立ルートにしてある。
// 将来の設定項目（手数料率プリセット・通知など）はこの画面に足していく。
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecordKindSelector } from '@/components/RecordKindSelector';
import { useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

export default function SettingsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { defaultRecordKind, setDefaultRecordKind } = useSettings();

  return (
    <>
      <Stack.Screen
        options={{
          title: '設定',
          // iOS のモーダルは下スワイプでも閉じるが、Android と操作を揃えるために明示の閉じるボタンを置く
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.headerButton, { color: colors.blue }]}>完了</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>記録</Text>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.label, { color: colors.label }]}>新規作成時の種別</Text>
            <RecordKindSelector kind={defaultRecordKind} onChange={setDefaultRecordKind} />
            {/* SPEC-V2 §3.4: 設定が効くのはこれから作るレコードだけ。既存の種別は変わらない */}
            <Text style={[styles.note, { color: colors.secondaryLabel }]}>
              新しく記録を追加するときに最初に選ばれている種別です。保存済みの記録の種別は変わりません。
            </Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  label: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
