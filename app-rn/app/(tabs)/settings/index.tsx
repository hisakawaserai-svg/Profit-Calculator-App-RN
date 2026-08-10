// 設定タブ（UI-SPEC §1.6 案 5b）。
//
// モーダル（app/settings.tsx）からタブへ昇格した（UI-SPEC §6-8）。入口が常設になったので
// 計算タブのヘッダから歯車を外してある（§6-7）。
// 「使いかた」は設定タブ配下への push（§5-9）。他の画面の「？」からのシート表示は
// ステップ 6 で足すので、ここではまだ push だけ。
//
// §1.6 の残りの群（入力を減らす（今後）/ データ / バージョン表記）と
// 手数料の既定値（defaultCommission）はステップ 1 の完了条件外なので、まだ置いていない。
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecordKindSelector } from '@/components/RecordKindSelector';
import { useSettings } from '@/settings';
import { useThemeColors } from '@/theme';

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { defaultRecordKind, setDefaultRecordKind } = useSettings();

  return (
    <>
      <Stack.Screen options={{ title: '設定' }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        {/* UI-SPEC §1.6-1: 見出しなしの 1 行カード。設定の先頭に置いて探させない */}
        <View style={styles.section}>
          {/* asChild の子は <Slot> がクローンする。style が配列のままだと expo-router が
              弾く（expo-router/build/ui/Slot.js の開発時チェック）ので、渡す前に平坦化する */}
          <Link href="/settings/help" asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.linkRow,
                { backgroundColor: colors.secondaryBackground },
              ])}
              accessibilityRole="link">
              <Text style={[styles.label, { color: colors.label }]}>使いかた</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryLabel} />
            </Pressable>
          </Link>
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            各画面の右上の「？」からも、その画面の説明だけを開けます。
          </Text>
        </View>

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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 4,
  },
});
