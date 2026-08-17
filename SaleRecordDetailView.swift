//  SaleRecordDetailView.swift
//  Profit Calculator App
import SwiftUI
import CoreData

struct SaleRecordDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext

    @FetchRequest(
        entity: SaleRecordEntities.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SaleRecordEntities.saleDate, ascending: false)]
    ) var allRecords: FetchedResults<SaleRecordEntities>

    @ObservedObject var record: SaleRecordEntities

    @State private var showingDeleteAlert = false
    @State private var editingRecord: SaleRecordEntities?

    let targetMonth: Date
    
    // 累計計算ロジックをシンプルに
    private var careerProfit: Double {
        allRecords.reduce(0.0) { $0 + $1.netProfit }
    }
    private var careerExpenses: Double {
        allRecords.reduce(0.0) { $0 + $1.totalExpenses }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                SaleStatusToggleCard(record: record)
                // 1. 商品情報カード
                ProductInfoSection(record: record)
                
                // 2. 費用内訳カード
                ExpenseDetailSection(record: record)
                
                // 3. メモカード
                MemoSection(record: record)
                Spacer(minLength: 100) 
            }
            .padding()
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.gray, lineWidth: 1)
            )
            .background(Color.platformBackground)
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
            .padding(.vertical, 8)
        }
        .safeAreaInset(edge: .bottom) {
            // 3. 累計エリア（共通部品）
            CareerSummarySection(record)
            .background(Color.platformBackground)
        }
        .navigationTitle("詳細")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button() { editingRecord = record } label: {
                    Image(systemName: "pencil")
                }
                Button(role: .destructive) { showingDeleteAlert = true } label: {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                }
            }
        }
        .sheet(item: $editingRecord) { _ in
            RecordFormView(editingRecord: $editingRecord)
                .environment(\.managedObjectContext, viewContext)
        }
        .alert("削除しますか？", isPresented: $showingDeleteAlert) {
            Button("キャンセル", role: .cancel) { }
            Button("削除", role: .destructive) {
                viewContext.delete(record)
                try? viewContext.save()
                dismiss()
            }
        }
    }
}

// MARK: - 独立させた部品1：商品情報カード
struct ProductInfoSection: View {
    @ObservedObject var record: SaleRecordEntities
    // 販売日
    private var formattedDate: String {
        let formattedDate = record.saleDate?.formatted(date: .numeric, time: .omitted) ?? "未設定"
        return formattedDate
    }
    // 出品日
    private var formattedStartDate: String {
        let formattedStartDate = record.saleStartDate?.formatted(date: .numeric, time: .omitted) ?? "未設定"
        return formattedStartDate
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("📦 商品情報").font(.headline)
            
            DetailTextLine(label: "商品名", value: record.itemName ?? "無題")
            DetailTextLine(label: "出品日", value: formattedStartDate)
            if record.isSold {
                // 【売却済みの場合】
                DetailTextLine(label: "販売日", value: formattedDate)
            } else {
                // 【出品中（在庫）の場合】
                DetailTextLine(label: "状態", value: "出品中")
            }
            
            DetailAmountLine(label: "販売価格", amount: record.salesPrice, color: .green)
            DetailAmountLine(label: "経費合計", amount: record.totalExpenses, color: .red)
            
            Divider()
            
            HStack {
                Text("純利益").bold()
                Spacer()
                Text("\(Int(record.netProfit))円")
                    .foregroundColor(record.netProfit >= 0 ? .green : .red)
                    .font(.title3).bold()
            }
        }
        .padding()
        .background(Color.platformSecondaryBackground)
        .cornerRadius(12)
        .shadow(radius: 1)
    }
}

// MARK: - 独立させた部品2：費用内訳カード
struct ExpenseDetailSection: View {
    @ObservedObject var record: SaleRecordEntities
    
    // 手数料のみの計算
    private var commissionAmount: Double {
        record.salesPrice * (record.commission / 100.0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("💰 費用内訳").font(.headline)
            
            DetailAmountLine(label: "仕入価格", amount: record.purchasePrice, color: .red)
            DetailAmountLine(label: "送料", amount: record.postage, color: .red)
            DetailAmountLine(label: "梱包材", amount: record.envelopeCost, color: .red)
            DetailAmountLine(label: "その他", amount: record.othersCost, color: .red)
            
            HStack {
                Text("手数料 (\(Int(record.commission))%)").foregroundColor(.secondary)
                Spacer()
                Text("\(Int(commissionAmount)) 円").foregroundColor(.orange)
            }
            
            Divider()
            
            HStack {
                Text("経費合計").bold()
                Spacer()
                Text("\(Int(record.totalExpenses))円").foregroundColor(.red).bold()
            }
        }
        .padding()
        .background(Color.platformSecondaryBackground)
        .cornerRadius(12)
        .shadow(radius: 1)
    }
}
// MARK: - 独立させた部品3：メモカード
struct MemoSection: View {
    @ObservedObject var record: SaleRecordEntities
    private var memoString: String {record.memo ?? "なし"}
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12){
            Text("📝 メモ")
                .font(.headline)
                .foregroundColor(.secondary)
            Text(memoString)
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.body)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true) //枠を縦に広げる
                .padding()
                .background(Color.platformSecondaryBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )
        }
        .padding()
        .background(Color.platformSecondaryBackground)
        .cornerRadius(12)
        .shadow(radius: 1)
    }
}
// MARK: - 小さな共通部品（さらに細かく分ける）
struct DetailTextLine: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text("\(label)：").foregroundColor(.secondary)
            Spacer()
            Text(value)
        }
    }
}

struct DetailAmountLine: View {
    let label: String
    let amount: Double
    let color: Color
    var body: some View {
        HStack {
            Text("\(label)：").foregroundColor(.secondary)
            Spacer()
            Text("\(Int(amount)) 円")
                .foregroundColor(amount == 0 ? .primary : color)
        }
    }
}

// 出品中・売却済みを切り替えるトグル
struct SaleStatusToggleCard: View {
    @ObservedObject var record: SaleRecordEntities
    @Environment(\.managedObjectContext) private var viewContext

    var body: some View {
        HStack {
            // 左側：アイコンとテキスト
            Label(
                record.isSold ? "売却済み" : "出品中",
                systemImage: record.isSold ? "checkmark.circle.fill" : "shippingbox.fill"
            )
            .font(.headline)
            .foregroundColor(record.isSold ? .green : .orange)

            Spacer()

            // 右側：トグルスイッチ
            Toggle("", isOn: Binding(
                get: { record.isSold },
                set: { newValue in
                    updateStatus(isSold: newValue)
                }
            ))
            .labelsHidden() // ラベルは左側のLabelビューで出しているので隠す
            .toggleStyle(SwitchToggleStyle(tint: .orange)) // フリマアプリらしいオレンジ
        }
        .padding()
        .background(Color.platformSecondaryBackground)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
    }

    private func updateStatus(isSold: Bool) {
        // 💡 トグルを変えた瞬間にデータを更新して保存する
        record.isSold = isSold
        if isSold {
            // 売却済みにしたなら、販売日を今日にする
            record.saleDate = Date()
        } else {
            // 出品中に戻したなら、販売日を消す（任意）
            record.saleDate = nil
        }
        
        try? viewContext.save()
    }
}
