// 開発用テストデータの投入・削除ボタン（__DEV__ 専用）。設定タブの末尾に出る。
//
// 本番ビルドには入らない ── app/(tabs)/settings/index.tsx が import ではなく
// `__DEV__ ? require(...) : null` で読むので、production では require ごと畳まれて
// このファイルも devSeed.ts も testData.ts もバンドルに含まれない（理由はそちらのコメント）。
//
// 見た目は設定タブの他の群に合わせたカード 1 枚。文言は labels.ts に置いていない ──
// 利用者に見えない開発用の画面なので、文言を本番の辞書に混ぜない。

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme';

import { countDevSeedRecords, insertDevSeed, removeDevSeed } from './devSeed';

export function DevSeedCard({
  onChanged,
}: {
  /**
   * 投入・削除のあとに呼ぶ。設定画面のほかの数字（プリセット・タグ・記録の件数）は
   * 画面復帰でしか引き直さないので、その場で更新させるために外から渡してもらう。
   */
  onChanged: () => void;
}) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [seededCount, setSeededCount] = useState(0);

  /**
   * このカードの「投入済み N 件」だけを引き直す。**onChanged はここから呼ばない** ──
   * 画面復帰のたびに親の state を触ると、親の再描画 → onChanged の同一性が変わる →
   * 効果が再実行、で回り続ける。親へ知らせるのは投入・削除を実際に行った直後だけでよい。
   */
  const reload = useCallback(() => setSeededCount(countDevSeedRecords()), []);
  useFocusEffect(reload);

  /** 投入・削除の後始末。自分の数字と、設定画面のほかの数字の両方を引き直す */
  const finish = useCallback(() => {
    setBusy(false);
    reload();
    onChanged();
  }, [reload, onChanged]);

  const insert = useCallback(() => {
    setBusy(true);
    try {
      const summary = insertDevSeed();
      Alert.alert(
        'テストデータを投入しました',
        `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / プリセット ${summary.presets} 件を追加しました。`,
      );
    } catch (error) {
      Alert.alert('投入に失敗しました', String(error));
    } finally {
      finish();
    }
  }, [finish]);

  const remove = useCallback(() => {
    // 手入力の記録を巻き込まないことを明示してから消す
    Alert.alert(
      'テストデータを削除しますか？',
      '投入したテストデータ（記録・タグ・プリセット）だけを削除します。手で入力した記録は残ります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            try {
              const summary = removeDevSeed();
              Alert.alert(
                'テストデータを削除しました',
                `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / プリセット ${summary.presets} 件を削除しました。`,
              );
            } catch (error) {
              Alert.alert('削除に失敗しました', String(error));
            } finally {
              finish();
            }
          },
        },
      ],
    );
  }, [finish]);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        開発用（__DEV__ のみ）
      </Text>
      <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.label, { color: colors.label }]}>テストデータ</Text>
          <Text style={[styles.value, { color: colors.secondaryLabel }]}>
            {busy ? <ActivityIndicator size="small" /> : `投入済み ${seededCount} 件`}
          </Text>
        </View>

        <Pressable
          style={[styles.button, { backgroundColor: colors.blue }]}
          disabled={busy}
          onPress={insert}
          accessibilityRole="button">
          <Text style={styles.buttonLabel}>テストデータを投入（50 件）</Text>
        </Pressable>

        <Pressable
          style={[styles.button, { backgroundColor: colors.red }]}
          disabled={busy || seededCount === 0}
          onPress={remove}
          accessibilityRole="button">
          <Text style={[styles.buttonLabel, seededCount === 0 && styles.disabledLabel]}>
            テストデータを削除
          </Text>
        </Pressable>

        <Text style={[styles.note, { color: colors.secondaryLabel }]}>
          販売済み 40 件 / 出品中 10 件。削除は投入したぶん（id が devseed- で始まる行）だけを消します。
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 15,
  },
  button: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledLabel: {
    opacity: 0.5,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
