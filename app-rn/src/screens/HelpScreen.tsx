// HelpView.swift の移植。ヘルプタブ（SPEC §3.2 / §3.1）。
// 静的な 3 セクションのアコーディオンのみで、データ処理は一切しない。
//
// 本文は Swift 版の文言をそのまま持ってきている。アイコンは SF Symbols を
// Ionicons の近いものに置き換えた（タブアイコンと同じ方針。app/(tabs)/_layout.tsx 参照）。
// 決定 §7-14 により macOS 分岐（listStyle の出し分け）は移植しない。
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accordion } from '@/components/Accordion';
import { useThemeColors, type ThemeColors } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** テーマの色キーで持つ（配色を theme.ts に集約するため。直接の色文字列は書かない） */
type ColorKey = keyof ThemeColors;

type HelpItem = {
  icon: IoniconName;
  colorKey: ColorKey;
  title: string;
  content: string;
};

type HelpSection = {
  icon: IoniconName;
  colorKey: ColorKey;
  title: string;
  items: HelpItem[];
};

/** Swift 版の 3 つの Section（DisclosureGroup）と同じ内容・同じ順序 */
const SECTIONS: HelpSection[] = [
  {
    icon: 'calculator',
    colorKey: 'blue',
    title: '利益計算機について',
    items: [
      {
        icon: 'calculator-outline',
        colorKey: 'blue',
        title: 'かんたん電卓',
        content:
          '各入力欄の右側にある青いボタンを押すと電卓が開きます。仕入れ金額の合算や、送料の計算に便利です。',
      },
      {
        icon: 'arrow-undo-circle',
        colorKey: 'teal',
        title: '目標利益の逆算',
        content:
          '「これくらい利益がほしい」という目標がある時に便利です。目標利益と経費を入力すると、いくらで売ればいいか自動で計算します。',
      },
      {
        icon: 'refresh',
        colorKey: 'gray',
        title: '入力欄のリセット',
        content:
          '画面右上にある、くるっと回った矢印のボタンを押すと、入力した数字をすべて消して最初から計算し直すことができます。',
      },
      {
        icon: 'add-circle',
        colorKey: 'green',
        title: '出品の記録（＋ボタン）',
        content:
          '計算機画面の右上にある「＋」ボタンを押すと記録できます。出品日を入力すると「出品中」タブに登録されます。',
      },
    ],
  },
  {
    icon: 'cube',
    colorKey: 'orange',
    title: '出品と売却のルール',
    items: [
      {
        icon: 'refresh',
        colorKey: 'gray',
        title: '表示のリセット',
        content:
          'カレンダーで月を選んでいる時に、右上の矢印ボタンを押すと、すべての期間のデータをまとめて表示する状態に戻せます。',
      },
      {
        icon: 'pencil',
        colorKey: 'blue',
        title: 'データの編集',
        content:
          '詳細画面の右上にある「ペン」ボタンを押すと編集画面が開き、そのデータの編集ができます。',
      },
      {
        icon: 'checkmark-circle',
        colorKey: 'orange',
        title: '売れた時の操作',
        content:
          '商品が売れたら、編集画面で「売却済み」スイッチをオンにして、販売日を入力してください。自動的に「実績」タブへ移動します。',
      },
      {
        icon: 'flash',
        colorKey: 'yellow',
        title: 'かんたん売却更新',
        content:
          '詳細画面にある「出品中」のスイッチをオンにするだけで、販売日を「今日」にして実績へ移動させることができます。',
      },
    ],
  },
  {
    icon: 'bar-chart',
    colorKey: 'purple',
    title: '記録の整理と分析',
    items: [
      {
        icon: 'create',
        colorKey: 'red',
        title: '記録の直し方・消し方',
        content:
          'リストの記録をタップして詳細画面を開くと、右上に「編集（ペン）」や「削除（ゴミ箱）」ボタンがあります。',
      },
      {
        icon: 'search',
        colorKey: 'gray',
        title: '商品の探し方',
        content:
          '画面上の検索バーに名前を入れたり、並び替えボタン（上下矢印マーク）を使ってみたい記録を探せます。',
      },
      {
        icon: 'bar-chart',
        colorKey: 'indigo',
        title: '分析グラフの活用',
        content:
          '分析タブではこれまでの売上推移が見れます。グラフの棒を触ると、その日の詳細な数字と下にその内訳が表示され、日々の頑張りを振り返ることができます。',
      },
    ],
  },
];

export function HelpScreen() {
  const colors = useThemeColors();

  return (
    <>
      {/* タブのラベル（'ヘルプ'）は _layout.tsx の title のまま残し、ヘッダーだけ上書きする */}
      <Tabs.Screen options={{ headerTitle: '使いかたガイド' }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}>
        {SECTIONS.map((section) => (
          <Accordion
            key={section.title}
            accessibilityLabel={section.title}
            label={
              <View style={styles.sectionLabel}>
                <Ionicons name={section.icon} size={22} color={colors[section.colorKey]} />
                <Text style={[styles.sectionTitle, { color: colors[section.colorKey] }]}>
                  {section.title}
                </Text>
              </View>
            }>
            <View style={styles.itemList}>
              {section.items.map((item) => (
                <HelpContentRow key={item.title} item={item} />
              ))}
            </View>
          </Accordion>
        ))}
      </ScrollView>
    </>
  );
}

/** Swift 版 HelpContentRow。アイコン＋タイトル＋説明文の 1 項目 */
function HelpContentRow({ item }: { item: HelpItem }) {
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      <Ionicons
        name={item.icon}
        size={24}
        color={colors[item.colorKey]}
        style={styles.rowIcon}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.label }]}>{item.title}</Text>
        <Text style={[styles.rowContent, { color: colors.secondaryLabel }]}>{item.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    flexShrink: 1,
  },
  itemList: {
    gap: 20,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 15,
  },
  rowIcon: {
    width: 35,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowContent: {
    fontSize: 15,
    lineHeight: 22,
  },
});
