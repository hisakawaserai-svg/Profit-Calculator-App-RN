import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { calcTabLabel, dataTabLabel, recordsTabLabel, settingsTabLabel } from '@/logic/labels';
import { useLocale } from '@/settings';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// UI-SPEC §2 / §6-8 の 4 タブ構成（計算・記録・データ・設定）。
// アイコンは元アプリの SF Symbols に近い Ionicons を選定:
//   function → calculator / list.bullet.rectangle → receipt
//   chart.bar → bar-chart / gearshape → settings
// 選択中は塗り、非選択は outline。返す関数に名前を付けているのは、
// 無名の関数コンポーネントだと react/display-name に引っかかるため。
function tabIcon(focusedName: IoniconName, unfocusedName: IoniconName) {
  function TabBarIcon({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return <Ionicons name={focused ? focusedName : unfocusedName} size={size} color={color} />;
  }

  return TabBarIcon;
}

export default function TabLayout() {
  // タブ名を表示中の言語で出す。**返り値を各関数へ渡すところまでが必須**（src/i18n の冒頭）
  const locale = useLocale();

  return (
    <Tabs>
      {/* 計算タブも自前の Stack を持つ（(calc)/_layout.tsx）。push する行き先は無いが、
          ヘッダをネイティブスタック側に揃えるため ── ここだけ JS ヘッダのままだと、
          ガラスのピルが出ず右の余白も 24pt ずれる。よってタブ側のヘッダは切る */}
      <Tabs.Screen
        name="(calc)"
        options={{
          title: calcTabLabel(locale),
          tabBarIcon: tabIcon('calculator', 'calculator-outline'),
          headerShown: false,
        }}
      />
      {/* 記録・データ・設定はタブ内に Stack を持ち（レコード詳細・使いかたへのプッシュ遷移。UI-SPEC §2）、
          ヘッダーはその Stack 側が出すのでタブのヘッダーは切る */}
      <Tabs.Screen
        name="records"
        options={{
          title: recordsTabLabel(locale),
          tabBarIcon: tabIcon('receipt', 'receipt-outline'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="data"
        options={{
          title: dataTabLabel(locale),
          tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: settingsTabLabel(locale),
          tabBarIcon: tabIcon('settings', 'settings-outline'),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
