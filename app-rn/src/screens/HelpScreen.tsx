// HelpView.swift の移植。ヘルプタブ（SPEC §3.2 / §3.1）。
// 静的なアコーディオン（Swift 版の 3 セクション + 種別の 1 セクション）のみで、
// データ処理は一切しない。
//
// 本文は Swift 版の文言をそのまま持ってきている。アイコンは SF Symbols を
// Ionicons の近いものに置き換えた（タブアイコンと同じ方針。app/(tabs)/_layout.tsx 参照）。
// 決定 §7-14 により macOS 分岐（listStyle の出し分け）は移植しない。
//
// SPEC-V2 §1.3 / §6.1 で「記録の種別について」セクションを 1 つ追加した（Swift 版にはない）。
// 用語の説明なので、種別語（純利益 / 利益）が最初に出てくる計算タブの説明の直後に置く。
// 文中の表示語は labels.ts の確定値と一致させること（§5.3）。
import { Ionicons } from '@expo/vector-icons';
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

/**
 * Swift 版の 3 つの Section（DisclosureGroup）と同じ内容・同じ順序。
 * 2 番目の「記録の種別について」だけが RN 版での追加（SPEC-V2 §1.3）。
 */
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
    icon: 'pricetags',
    colorKey: 'teal',
    title: '記録の種別について',
    items: [
      {
        icon: 'home',
        colorKey: 'teal',
        title: '不用品と仕入品のちがい',
        content:
          '記録は「不用品」と「仕入品」のどちらかを選びます。不用品は自宅にあった物を売る記録で、仕入れにお金がかかっていないため仕入価格の欄は出てきません（0円として計算します）。仕入品は仕入れて売る記録で、仕入価格を入力できます。計算のしかたはどちらも同じで、経費を差し引いた残りが手元に残る金額です。',
      },
      {
        icon: 'swap-horizontal',
        colorKey: 'green',
        title: '「純利益」「利益」「収支」の使い分け',
        content:
          '1件の記録では、不用品は「純利益」、仕入品は「利益」と呼びます。月ごとの合計や画面下の累計、データタブのように複数の記録をまとめた金額は、2つの種別が混ざることがあるため「収支」と呼びます。呼び方が違うだけで、どれも「販売価格から経費を引いた金額」で、計算のしかたは同じです。「経費」「販売価格」は種別によって変わりません。',
      },
      {
        icon: 'information-circle',
        colorKey: 'orange',
        title: '経費にふくまれるもの',
        content:
          '本アプリの純利益は梱包材やその他の経費も差し引いた額のため、販売サイトに表示される金額より少なくなることがあります。販売サイトの「手取り」は販売手数料と送料だけを引いた金額であることが多いためで、どちらかが間違っているわけではありません。',
      },
      {
        icon: 'settings',
        colorKey: 'gray',
        title: '最初に選ばれる種別を変える',
        content:
          '設定タブを開き、「新規作成時の種別」で選べます。新しく記録を追加するときに最初に選ばれている種別が変わるだけで、保存済みの記録の種別は変わりません。1件ずつの種別は、記録の編集画面でいつでも変えられます。',
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
    // ヘッダーのタイトルは表示元（設定タブ配下の使いかた / 将来は各画面の「？」のシート）が付ける。
    // この画面自身は特定のナビゲータに結び付かない（UI-SPEC §5-9）。
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
