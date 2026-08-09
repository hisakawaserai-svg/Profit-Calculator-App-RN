import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// SPEC.md §3.1 の 5 タブ構成。アイコンは元アプリの SF Symbols に近い Ionicons を選定:
//   function → calculator / shippingbox → cube / yensign.circle → logo-yen
//   chart.bar → bar-chart / questionmark.circle → help-circle
function tabIcon(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: '計算', tabBarIcon: tabIcon('calculator', 'calculator-outline') }}
      />
      <Tabs.Screen
        name="listings"
        options={{ title: '出品中', tabBarIcon: tabIcon('cube', 'cube-outline') }}
      />
      <Tabs.Screen
        name="sold"
        options={{ title: '実績', tabBarIcon: tabIcon('logo-yen', 'logo-yen') }}
      />
      <Tabs.Screen
        name="data"
        options={{ title: 'データ', tabBarIcon: tabIcon('bar-chart', 'bar-chart-outline') }}
      />
      <Tabs.Screen
        name="help"
        options={{ title: 'ヘルプ', tabBarIcon: tabIcon('help-circle', 'help-circle-outline') }}
      />
    </Tabs>
  );
}
