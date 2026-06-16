import { WorkCategory, WorkCategoryConfig as WorkCategoryConfigInterface } from "./types";

export class WorkCategoryConfig {
    private readonly categories: Record<WorkCategory, WorkCategoryConfigInterface>;

    constructor() {
        this.categories = {
            [WorkCategory.PH10_ASSET_MANAGEMENT]: {
                id: WorkCategory.PH10_ASSET_MANAGEMENT,
                displayName: "PH10: Quản lý Tài sản",
                keywords: ["tài sản", "vũ khí", "quân trang", "cấp phát", "kiểm kê", "báo cáo tài sản"],
                defaultDeadlineDays: 5,
                estimatedEffortHours: 4,
                actionPlanTemplate: [
                    "Kiểm tra hệ thống tài sản hiện có",
                    "Thu thập thông tin từ các đơn vị",
                    "Xây dựng bản báo cáo",
                    "Review với PH10",
                    "Nộp lên cấp trên"
                ],
                systemPrompt: `Bạn là chuyên gia phân tích công việc quản lý tài sản (PH10).
Tính chất: Báo cáo, kiểm kê, cấp phát tài sản cho các đơn vị.
Thời gian tiêu biểu: 5-7 ngày làm việc.
Yêu cầu: Xác thực số liệu, kiểm tra từng mục, cross-check với hệ thống.
Cảnh báo: Thường có follow-up từ 2-3 bộ phận. Yêu cầu phê duyệt PH10_Manager.`
            },
            [WorkCategory.PC06_WEAPON_LICENSE]: {
                id: WorkCategory.PC06_WEAPON_LICENSE,
                displayName: "PC06: Cấp phép Vũ khí",
                keywords: ["cấp phép", "đăng kí", "giấy phép", "hồ sơ", "vũ khí", "đạn dược"],
                defaultDeadlineDays: 10,
                estimatedEffortHours: 6,
                actionPlanTemplate: [
                    "Tiếp nhận và kiểm tra hồ sơ",
                    "Xác minh thông tin đăng ký",
                    "Trình duyệt lên PC06",
                    "Chỉnh sửa theo phản hồi",
                    "Cấp phép và lưu hồ sơ"
                ],
                systemPrompt: `Bạn là chuyên gia về thủ tục cấp phép vũ khí (PC06).
Tính chất: Hành chính pháp lý, cần chính xác tuyệt đối.
Thời gian tiêu biểu: 10-14 ngày (có thể kéo dài nếu hồ sơ thiếu).
Cảnh báo: Deadline pháp lý nghiêm ngặt. Hồ sơ không đầy đủ gây trễ toàn bộ process.`
            },
            [WorkCategory.PV01_ADMIN_DOCS]: {
                id: WorkCategory.PV01_ADMIN_DOCS,
                displayName: "PV01: Văn thư & Tham mưu",
                keywords: ["văn thư", "công văn", "tham mưu", "viễn thông", "cơ yếu", "thông báo", "chỉ thị"],
                defaultDeadlineDays: 3,
                estimatedEffortHours: 3,
                actionPlanTemplate: [
                    "Soạn thảo văn bản",
                    "Trình duyệt lãnh đạo",
                    "Chỉnh sửa theo ý kiến",
                    "Ký và đóng dấu",
                    "Phát hành"
                ],
                systemPrompt: `Bạn là chuyên gia văn thư, tham mưu hành chính (PV01).
Tính chất: Văn bản hành chính, công văn, thông báo nội bộ.
Thời gian tiêu biểu: 2-4 ngày.
Yêu cầu: Văn phong chính xác, đúng form mẫu, trình bày chuẩn.`
            },
            [WorkCategory.DT_DIGITAL_TRANSFORM]: {
                id: WorkCategory.DT_DIGITAL_TRANSFORM,
                displayName: "DT: Chuyển đổi Số",
                keywords: ["chuyển đổi số", "số hóa", "hệ thống", "ứng dụng", "triển khai", "phần mềm", "công nghệ"],
                defaultDeadlineDays: 15,
                estimatedEffortHours: 16,
                actionPlanTemplate: [
                    "Nghiên cứu và đánh giá hiện trạng",
                    "Lập kế hoạch chi tiết",
                    "Trình duyệt ngân sách",
                    "Triển khai thí điểm",
                    "Đánh giá và điều chỉnh",
                    "Triển khai toàn diện",
                    "Báo cáo kết quả"
                ],
                systemPrompt: `Bạn là chuyên gia chuyển đổi số (DT).
Tính chất: Dự án IT, số hóa quy trình, triển khai phần mềm.
Thời gian tiêu biểu: 15-25 ngày.
Cảnh báo: Thường bị trễ do phê duyệt ngân sách và phối hợp nhiều đơn vị.`
            },
            [WorkCategory.NQ57_IT_DEVELOPMENT]: {
                id: WorkCategory.NQ57_IT_DEVELOPMENT,
                displayName: "NQ57: Nghị Quyết 57",
                keywords: ["NQ 57", "nghị quyết 57", "phát triển CNTT", "hạ tầng", "dự toán", "kế hoạch CNTT"],
                defaultDeadlineDays: 20,
                estimatedEffortHours: 20,
                actionPlanTemplate: [
                    "Thu thập yêu cầu từ các đơn vị",
                    "Lập dự toán ngân sách",
                    "Xây dựng kế hoạch chi tiết",
                    "Trình duyệt nhiều cấp",
                    "Điều chỉnh theo phản hồi",
                    "Phê duyệt cuối cùng"
                ],
                systemPrompt: `Bạn là chuyên gia kế hoạch phát triển CNTT theo NQ57.
Tính chất: Kế hoạch dài hạn, liên quan nhiều đơn vị và cấp phê duyệt.
Thời gian tiêu biểu: 20-30 ngày.
Cảnh báo: Quy trình phê duyệt nhiều bước. Cần buffer thêm 20-30%.`
            },
            [WorkCategory.ND85_INFO_SECURITY]: {
                id: WorkCategory.ND85_INFO_SECURITY,
                displayName: "ND85: Nghị định 85",
                keywords: ["ND 85", "nghị định 85", "an toàn thông tin", "cấp độ an toàn", "bảo mật", "ATTT"],
                defaultDeadlineDays: 30,
                estimatedEffortHours: 24,
                actionPlanTemplate: [
                    "Đánh giá hiện trạng an toàn thông tin",
                    "Xác định cấp độ an toàn",
                    "Lập phương án bảo mật",
                    "Triển khai giải pháp",
                    "Kiểm tra và đánh giá",
                    "Lập báo cáo compliance"
                ],
                systemPrompt: `Bạn là chuyên gia an toàn thông tin theo ND85.
Tính chất: Compliance, audit, bảo mật hệ thống.
Thời gian tiêu biểu: 30-45 ngày.
Cảnh báo: Yêu cầu kỹ thuật cao, phải tuân thủ đúng chuẩn mực pháp lý.`
            },
            [WorkCategory.UNKNOWN]: {
                id: WorkCategory.UNKNOWN,
                displayName: "Chưa phân loại",
                keywords: [],
                defaultDeadlineDays: 7,
                estimatedEffortHours: 5,
                actionPlanTemplate: [
                    "Xem xét yêu cầu",
                    "Lập kế hoạch",
                    "Thực hiện",
                    "Báo cáo"
                ],
                systemPrompt: "Bạn là chuyên gia phân tích công việc hành chính."
            }
        };
    }

    getConfig(category: WorkCategory): WorkCategoryConfigInterface {
        return this.categories[category] ?? this.categories[WorkCategory.UNKNOWN];
    }

    classifyByKeywords(text: string): WorkCategory {
        const lowerText = text.toLowerCase();
        const scores: Record<string, number> = {};

        for (const [category, config] of Object.entries(this.categories)) {
            if (category === WorkCategory.UNKNOWN) continue;
            scores[category] = config.keywords.filter(
                kw => lowerText.includes(kw.toLowerCase())
            ).length;
        }

        const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) {
            return best[0] as WorkCategory;
        }
        return WorkCategory.UNKNOWN;
    }

    getAllCategories(): WorkCategory[] {
        return Object.values(WorkCategory).filter(c => c !== WorkCategory.UNKNOWN);
    }
}
