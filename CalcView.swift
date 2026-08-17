//  CalcView.swift
//  Profit Calculator App
//
//  概要：出品前の利益シミュレーション画面。
//  機能：
//   - 手数料や送料を考慮した純利益のリアルタイム計算
//   - 「目標利益」から逆算した販売価格の算出
//   - 計算結果をそのまま販売記録へ保存する機能
//

import SwiftUI
import CoreData

#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

struct CalcView: View {
    @Environment(\.managedObjectContext) private var viewContext
    
    @Environment(\.horizontalSizeClass) private var sizeClass
    
    @FocusState private var focusedField: FocusField?
    enum FocusField: Hashable {
        case salesPrice, purchasePrice, postage, envelopeCost, othersCost, targetProfitInput
    }

    @State private var salesPriceInput: String = ""
    @State private var purchasePriceInput: String = ""
    @State private var postageInput: String = ""
    @State private var envelopeCostInput: String = ""
    @State private var othersCostInput: String = ""
    @State private var commissionValue: Int = 10
    @State private var selectedTab: Int = 0
    @State private var targetProfitInput: String = ""
    
    @State private var showingForm = false
    @Binding var editingRecord: SaleRecordEntities?
    
    private var calculationData: CalcData {
        CalcData(
            salesPrice: Double(salesPriceInput) ?? 0,
            purchasePrice: Double(purchasePriceInput) ?? 0,
            postage: Double(postageInput) ?? 0,
            envelopeCost: Double(envelopeCostInput) ?? 0,
            othersCost: Double(othersCostInput) ?? 0,
            commission: Double(commissionValue)
        )
    }
    
    private func resetAllField() {
        salesPriceInput = ""
        purchasePriceInput = ""
        postageInput = ""
        envelopeCostInput = ""
        othersCostInput = ""
        commissionValue = 10
        
        targetProfitInput = ""
    }
    
    private func filterNumericInput(_ text: String) -> String {
        text.filter { "0123456789.".contains($0) }
    }
    
    var body: some View {
        NavigationStack {
            Group {
                // Mac (nil) または iPad (regular) の場合は横並びレイアウト
                if sizeClass == .regular || sizeClass == nil {
                    iPadLayout()
                } else {
                    iPhoneLayout()
                }
            }
            .navigationTitle("利益計算")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    HStack {
                        Button(action: resetAllField) {
                            Image(systemName: "arrow.counterclockwise")
                        }
                        
                        Button(action: {
                            prepareNewRecord()
                        }) {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
#if os(iOS)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("閉じる") { focusedField = nil }
                }
            }
#endif
            .sheet(isPresented: $showingForm) {
                RecordFormView(editingRecord: $editingRecord)
                    .environment(\.managedObjectContext, viewContext)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            focusedField = nil
        }
    }
    
    private func prepareNewRecord() {
        editingRecord = nil
        let newRecord = SaleRecordEntities(context: viewContext)
        newRecord.itemName = ""
        newRecord.salesPrice = Double(salesPriceInput) ?? 0
        newRecord.purchasePrice = Double(purchasePriceInput) ?? 0
        newRecord.postage = Double(postageInput) ?? 0
        newRecord.envelopeCost = Double(envelopeCostInput) ?? 0
        newRecord.othersCost = Double(othersCostInput) ?? 0
        newRecord.commission = Double(commissionValue)
        newRecord.saleStartDate = Date()
        newRecord.saleDate = Date()
        editingRecord = newRecord
        showingForm = true
    }

    // MARK: - レイアウト（iPad/Mac Catalyst向け）
    @ViewBuilder
    private func iPadLayout() -> some View {
        HStack(alignment: .top, spacing: 0) { // 上揃えに変更
            ScrollView {
                InputFormView(
                    salesPriceInput: $salesPriceInput,
                    purchasePriceInput: $purchasePriceInput,
                    postageInput: $postageInput,
                    envelopeCostInput: $envelopeCostInput,
                    othersCostInput: $othersCostInput,
                    commissionValue: $commissionValue,
                    selectedTab: $selectedTab,
                    focusedField: $focusedField,
                    resetAction: resetAllField,
                    filterAction: filterNumericInput
                )
            }
            .frame(width: 350) // 固定幅にすることで「狭くなる」問題を解決
            .background(Color.platformSecondaryBackground.opacity(0.5)) // 左側の色を少し変えると見やすい
            
            Divider()
            
            ScrollView {
                mainResultContent
                    .padding(30) // Macは余白広めが綺麗
            }
            .frame(maxWidth: .infinity)
            .background(Color.platformBackground)
        }
    }

    // MARK: - LabeledField（Mac Catalyst対応）
    struct LabeledField: View {
        let label: String
        let placeholder: String
        @Binding var text: String
        let filterAction: (String) -> String
        var isNumeric: Bool = false
        var focusTag: CalcView.FocusField? = nil //親要素にあるFocusFieldの型の状態
        var focusedField: FocusState<CalcView.FocusField?>.Binding //親要素にあるFocusFieldの型
        
        @State private var showCalc = false // 電卓の非表示
        
        var body: some View {
            // Mac Catalyst または Native macOS の場合
            #if targetEnvironment(macCatalyst) || os(macOS)
            HStack {
                Text(label)
                    .font(.body)
                    .frame(width: 100, alignment: .trailing) // ラベル幅を固定して揃える
                TextField(placeholder, text: $text, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: text) { oldValue, newValue in
                        text = filterAction(newValue)
                    }
                // 数字オンリーの時だけ電卓を表示
                if isNumeric {
                    Button(action: { showCalc = true }) {
                        Image(systemName: "plus.forwardslash.minus")
                            .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)
                }
            }
            .popover(isPresented: $showCalc){
                MiniCalculatorView(targetText: $text)
            }
            #else
            // iPhoneの場合
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.caption).foregroundColor(.secondary)
                HStack{
                    TextField(placeholder, text: $text, axis: .vertical)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: text) { oldValue, newValue in
                            text = filterAction(newValue)
                        }
                        .focused(focusedField, equals: focusTag)
                    
                    if isNumeric {
                        Button(action: { showCalc = true }) {
                            Image(systemName: "plus.forwardslash.minus")
                                .foregroundColor(.blue)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .popover(isPresented: $showCalc){
                MiniCalculatorView(targetText: $text)
            }
            #endif
        }
    }

    @ViewBuilder
    private func iPhoneLayout() -> some View {
        ScrollView {
            VStack(spacing: 20) {
                InputFormView(
                    salesPriceInput: $salesPriceInput,
                    purchasePriceInput: $purchasePriceInput,
                    postageInput: $postageInput,
                    envelopeCostInput: $envelopeCostInput,
                    othersCostInput: $othersCostInput,
                    commissionValue: $commissionValue,
                    selectedTab: $selectedTab,
                    focusedField: $focusedField,
                    resetAction: resetAllField,
                    filterAction: filterNumericInput
                )
                
                mainResultContent
            }
            .padding()
        }
        .background(Color.platformBackground)
    }
    
    @ViewBuilder
    private var mainResultContent: some View {
        VStack(spacing: 18) {
            Picker("タブ", selection: $selectedTab) {
                Text("純利益表示").tag(0)
                Text("目標利益逆算").tag(1)
            }
            .pickerStyle(.segmented)
            
            if selectedTab == 0 {
                ResultView(data: calculationData)
            } else {
                TargetProfitView(data: calculationData, targetProfitInput: $targetProfitInput, focusTag: .targetProfitInput ,focusedField: $focusedField)
            }
        }
    }

    // MARK: - コンポーネント
    struct TargetProfitView: View {
        let data: CalcData
        @Binding var targetProfitInput: String
        var focusTag: CalcView.FocusField? = nil
        var focusedField: FocusState<CalcView.FocusField?>.Binding
        
        private var requiredSalesPrice: Double {
            let target = Double(targetProfitInput) ?? 0
            let costs = data.purchasePrice + data.postage + data.envelopeCost + data.othersCost
            return (target + costs) / (1 - (data.commission / 100))
        }
        
        var body: some View {
            VStack(spacing: 12) {
                Text("目標利益を入力してください").font(.headline)
                
                TextField("例：500", text: $targetProfitInput)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    #endif
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)
                    .focused(focusedField, equals: focusTag)
                
                VStack(spacing: 8) {
                    Text("必要な販売価格")
                    Text("\(Int(requiredSalesPrice)) 円")
                        .font(.system(size: 40, weight: .heavy))
                        .foregroundColor(.green)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.platformBackground)
                .cornerRadius(12)
                .shadow(radius: 2)
            }
        }
    }

    struct InputFormView: View {
        @Binding var salesPriceInput: String
        @Binding var purchasePriceInput: String
        @Binding var postageInput: String
        @Binding var envelopeCostInput: String
        @Binding var othersCostInput: String
        @Binding var commissionValue: Int
        @Binding var selectedTab: Int
        var focusedField: FocusState<CalcView.FocusField?>.Binding
        
        let resetAction: () -> Void
        let filterAction: (String) -> String
        
        var body: some View {
            VStack(alignment: .leading, spacing: 18) {
                Text("販売情報").font(.title2).bold()
                
                VStack(spacing: 12) {
                    LabeledField(label: "販売価格", placeholder: "0", text: $salesPriceInput, filterAction: filterAction, isNumeric: true, focusTag: .salesPrice, focusedField: focusedField)
                        .disabled(selectedTab == 1)
                    LabeledField(label: "仕入れ価格", placeholder: "0", text: $purchasePriceInput, filterAction: filterAction, isNumeric: true, focusTag: .purchasePrice, focusedField: focusedField)
                    LabeledField(label: "送料", placeholder: "0", text: $postageInput, filterAction: filterAction, isNumeric: true, focusTag: .postage, focusedField: focusedField)
                    LabeledField(label: "梱包材", placeholder: "0", text: $envelopeCostInput, filterAction: filterAction, isNumeric: true, focusTag: .envelopeCost, focusedField: focusedField)
                    LabeledField(label: "その他", placeholder: "0", text: $othersCostInput, filterAction: filterAction, isNumeric: true, focusTag: .othersCost, focusedField: focusedField)
                    
                    Stepper("手数料: \(commissionValue)%", value: $commissionValue, in: 0...50)
                }
                .padding()
                .background(Color.platformSecondaryBackground)
                .cornerRadius(12)
            }
            .padding()
        }
    }

    struct ResultView: View {
        let data: CalcData
        var body: some View {
            VStack(spacing: 18) {
                VStack {
                    Text("純利益").font(.subheadline).foregroundColor(.secondary)
                    Text("\(Int(data.NetProfit)) 円")
                        .font(.system(size: 44, weight: .heavy))
                        .foregroundColor(data.NetProfit >= 0 ? .green : .red)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.platformBackground)
                .cornerRadius(12)
                .shadow(radius: 2)
                
                CalculationDetailsView(data: data)
            }
        }
    }
}

// MARK: - 計算モデル
struct CalcData {
    var salesPrice: Double
    var purchasePrice: Double
    var postage: Double
    var envelopeCost: Double
    var othersCost: Double
    var commission: Double
    
    var commissionCost: Double { salesPrice * (commission / 100) }
    var NetProfit: Double {
        salesPrice - (purchasePrice + postage + envelopeCost + othersCost + commissionCost)
    }
}

// MARK: - 内訳ビュー
struct CalculationDetailsView: View {
    let data: CalcData
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("収益内訳：").font(.headline)
            DetailRow(title: "売上総額", value: data.salesPrice, color: .primary)
            Divider()
            DetailRow(title: "仕入れ価格", value: data.purchasePrice, color: .secondary)
            DetailRow(title: "送料", value: data.postage, color: .secondary)
            DetailRow(title: "梱包・その他", value: data.envelopeCost + data.othersCost, color: .secondary)
            DetailRow(title: "販売手数料", value: data.commissionCost, color: .orange)
        }
        .padding()
        .background(Color.platformSecondaryBackground)
        .cornerRadius(10)
    }
}

struct DetailRow: View {
    let title: String
    let value: Double
    let color: Color
    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(Int(value)) 円").foregroundColor(color)
        }
    }
}
