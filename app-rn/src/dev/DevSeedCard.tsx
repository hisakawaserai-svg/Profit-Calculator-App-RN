// 開発用テストデータの投入・削除ボタン（__DEV__ 専用）。設定タブの末尾に出る。
//
// **2 セットある。**
//   開発用（devSeed.ts）    … 画面を壊さないための材料。乱数・端の場合入り・50 件
//   撮影用（storeShotSeed.ts） … Google Play の掲載画像に写す材料。固定値・42 件・写真つき
// どちらも id の接頭辞が違うので、片方だけを消せる（seedKit.ts）。
//
// 本番ビルドには入らない ── app/(tabs)/settings/index.tsx が import ではなく
// `__DEV__ ? require(...) : null` で読むので、production では require ごと畳まれて
// このファイルも devSeed.ts も testData.ts もバンドルに含まれない（理由はそちらのコメント）。
//
// 見た目は設定タブの他の群に合わせたカード。文言は labels.ts に置いていない ──
// 利用者に見えない開発用の画面なので、文言を本番の辞書に混ぜない。

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '@/settings';
import { useThemeColors } from '@/theme';

import { countDevSeedRecords, insertDevSeed, removeDevSeed } from './devSeed';
import { STORE_SHOT_COUNTS } from './storeShotData';
import {
  countStoreShotRecords,
  insertStoreShotSeed,
  removeStoreShotSeed,
} from './storeShotSeed';

/** 投入・削除の 1 セットぶん。2 つのカードが共有する見た目と手順 */
function SeedCard({
  title,
  insertLabel,
  note,
  count,
  busy,
  onInsert,
  onRemove,
}: {
  title: string;
  insertLabel: string;
  note: string;
  count: number;
  busy: boolean;
  onInsert: () => void;
  /** 確認は共通なので、ここが受け取るのは「はい」を押されたあとの処理だけ */
  onRemove: () => void;
}) {
  const colors = useThemeColors();

  const confirmRemove = useCallback(() => {
    // 手入力の記録・もう一方のセットを巻き込まないことを明示してから消す
    Alert.alert(
      `${title}を削除しますか？`,
      'このセットで投入したぶん（記録・タグ・プリセット・写真）だけを削除します。' +
        '手で入力した記録も、もう一方のセットも残ります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: onRemove },
      ],
    );
  }, [title, onRemove]);

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: colors.label }]}>{title}</Text>
        <Text style={[styles.value, { color: colors.secondaryLabel }]}>
          {busy ? <ActivityIndicator size="small" /> : `投入済み ${count} 件`}
        </Text>
      </View>

      <Pressable
        style={[styles.button, { backgroundColor: colors.blue }]}
        disabled={busy}
        onPress={onInsert}
        accessibilityRole="button">
        <Text style={styles.buttonLabel}>{insertLabel}</Text>
      </Pressable>

      <Pressable
        style={[styles.button, { backgroundColor: colors.red }]}
        disabled={busy || count === 0}
        onPress={confirmRemove}
        accessibilityRole="button">
        <Text style={[styles.buttonLabel, count === 0 && styles.disabledLabel]}>
          {title}を削除
        </Text>
      </Pressable>

      <Text style={[styles.note, { color: colors.secondaryLabel }]}>{note}</Text>
    </View>
  );
}

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
  // 商品名・タグ名・プリセット名は DB の行なので、**投入した時点の表示言語で固まる**
  // （入れたあとに言語を変えても訳されない。storeShotSeed.insertStoreShotSeed のコメント）
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [devCount, setDevCount] = useState(0);
  const [storeCount, setStoreCount] = useState(0);

  /**
   * このカードの「投入済み N 件」だけを引き直す。**onChanged はここから呼ばない** ──
   * 画面復帰のたびに親の state を触ると、親の再描画 → onChanged の同一性が変わる →
   * 効果が再実行、で回り続ける。親へ知らせるのは投入・削除を実際に行った直後だけでよい。
   */
  const reload = useCallback(() => {
    setDevCount(countDevSeedRecords());
    setStoreCount(countStoreShotRecords());
  }, []);
  useFocusEffect(reload);

  /** 投入・削除の後始末。自分の数字と、設定画面のほかの数字の両方を引き直す */
  const finish = useCallback(() => {
    setBusy(false);
    reload();
    onChanged();
  }, [reload, onChanged]);

  /** 投入・削除を 1 本にまとめた実行部。結果もエラーもそのままダイアログに出す */
  const run = useCallback(
    (title: string, action: () => string) => {
      setBusy(true);
      try {
        Alert.alert(title, action());
      } catch (error) {
        Alert.alert(`${title}に失敗しました`, String(error));
      } finally {
        finish();
      }
    },
    [finish],
  );

  const insertDev = useCallback(
    () =>
      run('テストデータを投入しました', () => {
        const summary = insertDevSeed();
        return `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / プリセット ${summary.presets} 件を追加しました。`;
      }),
    [run],
  );

  const removeDev = useCallback(
    () =>
      run('テストデータを削除しました', () => {
        const summary = removeDevSeed();
        return `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / プリセット ${summary.presets} 件を削除しました。`;
      }),
    [run],
  );

  const insertStore = useCallback(
    () =>
      run('撮影用データを投入しました', () => {
        const summary = insertStoreShotSeed(locale);
        return (
          `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / ` +
          `プリセット ${summary.presets} 件 / 写真 ${summary.photos} 枚を追加しました（${locale}）。`
        );
      }),
    [run, locale],
  );

  const removeStore = useCallback(
    () =>
      run('撮影用データを削除しました', () => {
        const summary = removeStoreShotSeed();
        return `記録 ${summary.records} 件 / タグ ${summary.tags} 件 / プリセット ${summary.presets} 件を削除しました。`;
      }),
    [run],
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        開発用（__DEV__ のみ）
      </Text>

      <SeedCard
        title="テストデータ"
        insertLabel="テストデータを投入（50 件）"
        note="販売済み 40 件 / 出品中 10 件。乱数なので毎回値が変わる。id が devseed- で始まる行だけを消します。"
        count={devCount}
        busy={busy}
        onInsert={insertDev}
        onRemove={removeDev}
      />

      <SeedCard
        title="撮影用データ"
        insertLabel={`撮影用データを投入（${STORE_SHOT_COUNTS.records} 件・${locale}）`}
        note={
          `2026 年 6〜8 月・販売済み ${STORE_SHOT_COUNTS.sold} 件 / 出品中 ${STORE_SHOT_COUNTS.listing} 件、` +
          `写真 ${STORE_SHOT_COUNTS.photos} 枚。ストア掲載画像用の固定データで、商品名に実在の商標を含みません。` +
          `商品名とタグは投入時の表示言語（いまは ${locale}）で固まります。` +
          'id が storeshot- で始まる行だけを消します。'
        }
        count={storeCount}
        busy={busy}
        onInsert={insertStore}
        onRemove={removeStore}
      />
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
