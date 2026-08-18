// 英語の辞書。キーの形は ja.ts が決めるので、ここは `Translations` に従うだけ。
// 足りないキー・余計なキーがあれば型チェックで落ちる。

import type { Translations } from './ja';

export const en: Translations = {
  common: {
    // 日本語の「N件」。英語は 1 件だけ語形が変わるので、ここで複数形が効いてくる
    count: { one: '{{count}} item', other: '{{count}} items' },
    notRegistered: 'Nothing saved yet',
    tag: 'Tags',
  },

  tabs: {
    calc: 'Calculator',
    records: 'Records',
    data: 'Data',
    settings: 'Settings',
  },

  action: {
    cancel: 'Cancel',
    close: 'Close',
    clear: 'Clear',
    delete: 'Delete',
    addition: '+ {{name}}',
    deleteNamed: 'Delete {{name}}',
    removeNamed: 'Remove {{name}}',
    increase: 'Increase {{label}}',
    decrease: 'Decrease {{label}}',
  },

  amount: {
    salesPrice: 'Selling price',
    purchasePrice: 'Purchase price',
    postage: 'Shipping',
    envelopeCost: 'Packaging',
    othersCost: 'Other',
    expenses: 'Expenses',
    totalProfit: 'Net total',
    totalSales: 'Sales',
    totalSalesAmount: 'Total sales',
    deducted: 'Taken out',
    kept: 'You keep',
    breakdown: 'Breakdown',
    breakdownAndMethod: 'Breakdown and how it adds up',
    commissionShort: 'Fee',
    commissionField: 'Fee {{rate}}%',
    formulaTarget: 'Target',
  },

  record: {
    kind: {
      used: 'Personal item',
      sourced: 'Item for resale',
    },
    profit: {
      used: 'Net profit',
      sourced: 'Profit',
    },
    profitInline: {
      used: 'net profit',
      sourced: 'profit',
    },
    targetProfit: {
      used: 'Target net profit',
      sourced: 'Target profit',
    },
    addAction: 'Add a record',
    addFab: 'Record',
    menu: {
      title: 'Create a record',
      newLabel: 'Start from scratch',
      newNote: 'Fill in an empty record',
      duplicateLabel: 'Copy an earlier record',
      duplicateNote: 'Carries over shipping and fees',
    },
  },

  calc: {
    title: 'Profit',
    profitTab: 'Find the {{profit}}',
    targetTab: 'Work back from a target',
    optionalCosts: 'Add packaging and other costs',
    optionalCostsWithTotal: 'Add packaging and other costs ({{total}})',
    clearInputAction: 'Clear the input',
    clearConfirmTitle: 'Clear everything you entered?',
    clearConfirmMessage: 'Every amount is emptied and the type goes back to its default.',
    requiredPriceHeadline: 'List it at this price',
    requiredSales: 'Sales needed',
    requiredSalesPrice: 'Selling price needed',
    formulaTargetOnly: 'Target {{target}}',
    formulaTargetAndExpenses: 'Target {{target}} + expenses {{expenses}} = {{subtotal}}',
    formulaCommission: 'A {{rate}}% fee is taken, so ÷ {{divisor}}',
    formulaResult: '→ {{price}}',
    formulaResultRoundedUp: '→ {{exact}} rounded up to {{price}}',
    summaryWithDeductions: 'Sell at {{price}} and, after {{deductions}}, you keep {{kept}}.',
    summaryNoDeductions: 'Sell at {{price}} and you keep the whole {{kept}}.',
    deductionSeparator: ' and ',
    deductionCommission: 'a fee of {{amount}}',
    deductionExpenses: 'expenses of {{amount}}',
    lowerPriceWarning: '{{price}} only comes to {{profit}}, short of your target',
  },

  calculator: {
    title: '{{field}} calculator',
    accessibility: 'Calculator for {{field}}',
    total: 'Total',
    addRow: 'Add a row',
    pickPackaging: 'Pick from packaging',
    submit: 'Use this',
    backspaceAccessibility: 'Delete one character',
    clearAllAccessibility: 'Clear everything',
    blockedNegative: 'The total is negative, so it cannot be used',
    blockedEmpty: 'Enter numbers to see the total',
  },

  preset: {
    typeSite: 'Marketplace',
    typeShipping: 'Shipping',
    typePackaging: 'Packaging',
    pickerTitle: 'Choose {{type}}',
    tagRateChanged: '{{name}} (rate changed)',
  },

  list: {
    listingStatus: 'Listed',
    listedDate: 'Listed',
    soldDate: 'Sold',
    soldRecords: 'Sold records',
    untitled: 'Untitled',
    search: 'Search',
    searchClear: 'Clear the search',
    searchPlaceholder: 'Search by item name',
    sortSheetTitle: 'Sort',
    filter: 'Filter',
    filterClear: 'Clear the filter',
    filterEmptyTitle: 'No records match',
    noRecordsTitle: 'No records for this period',
    noRecordsBody: 'Tap + at the bottom left to add one',
    totalListingPrice: 'Total listed price',
    recordCount: { one: '{{count}} record', other: '{{count}} records' },
    listedItemCount: { one: '{{count}} item', other: '{{count}} items' },
    expectedProfit: '{{amount}} once it sells',
    recordDetailAccessibility: 'Details for {{name}}',
  },

  period: {
    sheetTitle: 'Period shown',
    all: 'All time',
    allInline: 'all time',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    previousYear: 'Previous year',
    nextYear: 'Next year',
    profitLabel: '{{total}} for {{subject}}',
    thisMonth: 'this month',
    buttonAccessibility: 'Period shown: {{title}}',
  },

  copy: {
    done: 'Copied {{label}}',
    content: 'Copied: {{text}}',
    failed: 'Could not copy {{label}}',
  },

  settings: {
    help: {
      label: 'How to Use',
      note: 'You can also open just one screen’s help from the “?” at its top right.',
    },
    replayTutorial: {
      label: 'Watch the Tutorial Again',
    },
    language: {
      title: 'Language',
      system: 'System',
      note: '“System” follows your device’s language setting. Anything other than Japanese is shown in English.',
    },
    recordKind: {
      label: 'Type for New Records',
      note: 'The type selected first when you add a new record. The type of records you have already saved does not change.',
    },
    preset: {
      title: 'Type Less',
      note: 'Save the values you use often, and you can fill them in by picking one while you record.',
    },
    tag: {
      title: 'Organize Records',
      note: 'Tag your records and you can narrow them down later — “clothes only”, for example.',
    },
    data: {
      title: 'Data',
      csvExport: 'Export (CSV)',
      backup: 'Back Up & Restore',
      // 日本語の「記録の件数」をそのまま訳すと、値の「12 items」と合わせて
      // 「Number of records: 12 items」と重複して読める。行の名前は「Records」に留める
      recordCount: 'Records',
    },
    version: 'Version {{version}}',
  },
};
