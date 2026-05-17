import Foundation

enum MailCategory: String, CaseIterable, Identifiable, Codable {
    case bill = "BILL"
    case healthInsurance = "HEALTH-INSURANCE"
    case otherInsurance = "OTHER-INSURANCE"
    case schoolFamily = "SCHOOL-FAMILY"
    case taxLegalGovernment = "TAX-LEGAL-GOVERNMENT"
    case homeAuto = "HOME-AUTO"
    case receiptRecord = "RECEIPT-RECORD"
    case subscription = "SUBSCRIPTION"
    case unknown = "UNKNOWN"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bill: return "Bill"
        case .healthInsurance: return "Health Insurance"
        case .otherInsurance: return "Other Insurance"
        case .schoolFamily: return "School Family"
        case .taxLegalGovernment: return "Tax Legal Government"
        case .homeAuto: return "Home Auto"
        case .receiptRecord: return "Receipt Record"
        case .subscription: return "Subscription"
        case .unknown: return "Unknown"
        }
    }
}
