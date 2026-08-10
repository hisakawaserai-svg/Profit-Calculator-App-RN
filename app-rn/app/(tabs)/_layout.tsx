import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

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
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: '計算', tabBarIcon: tabIcon('calculator', 'calculator-outline') }}
      />
      {/* 記録・設定はタブ内に Stack を持ち（月別詳細・使いかたへのプッシュ遷移。UI-SPEC §2）、
          ヘッダーはその Stack 側が出すのでタブのヘッダーは切る */}
      <Tabs.Screen
        name="records"
        options={{
          title: '記録',
          tabBarIcon: tabIcon('receipt', 'receipt-outline'),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="data"
        options={{ title: 'データ', tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: tabIcon('settings', 'settings-outline'),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
