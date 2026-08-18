// 多言語化を済ませたファイルの一覧。**区切りごとにここへ足す。**
//
// reactCompiler.test.ts（生成コードに固定された呼び出しが無いか）と
// frozenJapanese.test.ts（'ja' の倒し忘れが無いか）が同じ表を見る ──
// 片方にだけ足すと、もう片方の検査から漏れる。
export const MIGRATED_FILES = [
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/settings/index.tsx',
  'app/(tabs)/(calc)/index.tsx',
  'src/components/AddRecordFab.tsx',
  'src/components/AddRecordMenuSheet.tsx',
  'src/components/CostProportionBar.tsx',
  'src/components/LanguageSelector.tsx',
  'src/components/MiniCalculator.tsx',
  'src/components/NumericField.tsx',
  'src/components/PresetTagButton.tsx',
  'src/components/RecordKindSelector.tsx',
  'src/components/SiteNameRow.tsx',
  'src/components/Stepper.tsx',
  'src/screens/RecordListScreen.tsx',
  'src/components/LongPressCopy.tsx',
  'src/components/MonthNavBar.tsx',
  'src/components/PeriodSheet.tsx',
  'src/components/RecordRow.tsx',
  'src/components/SearchBar.tsx',
  'src/screens/RecordFormSheet.tsx',
  'src/components/PhotoField.tsx',
  'src/components/TagChip.tsx',
  'src/components/TagPickerSheet.tsx',
  'src/screens/SaleRecordDetailScreen.tsx',
  'src/screens/RecordFilterScreen.tsx',
  'src/screens/DuplicateSourceScreen.tsx',
  'src/components/PhotoViewer.tsx',
  'src/components/RecordDetailSections.tsx',
  // 区切り 2-5: 帯グラフの結論行
  'src/components/RecordBreakdownBar.tsx',
  // 区切り 4: 値付け（いくらで売る？ / どうだった？）
  'src/screens/PricingScreen.tsx',
  'src/screens/TargetProfitSheet.tsx',
  'src/screens/PriceApplySheet.tsx',
  'src/components/PriceLine.tsx',
] as const;
