# Nhật ký dùng AI

Công cụ: **Claude Code** (model Claude Opus 5.5) trong VS Code. Token là **ước tính** (Claude Code không hiện số chính xác trong phiên này).

## Phase 1
| Bước | Lời nhắc chính / việc agent làm | Ước tính token |
|---|---|---|
| Đọc đề | "Đọc README và làm bài lab". Agent đọc tài liệu, không truy cập được lab board → hỏi lại thay vì đoán Test Contract | ~25k |
| Giải thích | Giải thích bài lab bằng tiếng Việt cho tôi | ~5k |
| Build | Dán PRD-0 + Contract. Agent viết sim, CLI, test, scenario, client 3D | ~70k |
| Verify | Chạy test, gài lỗi để kiểm tra test, sinh proof, sửa 2 kỳ vọng sai | ~20k |
| Harness + docs | AGENTS.md, Stop hook (đã thử cả xanh và đỏ), skill, CI, README, ghi chép | ~25k |
| **Tổng Phase 1** | | **~145k** |

**Cách tiết kiệm:** một phiên duy nhất, không dùng subagent; đọc file bằng một lệnh gộp; chỉ in phần cuối output test;
logic thuần không phụ thuộc nên test chạy nhanh, không phải lặp lại nhiều; dừng thử chụp màn hình sau 2 lần lỗi thay vì đốt thêm token.

**AI sai / suýt sai:**
1. Kỳ vọng scenario `default_idle_seed42` sai luật (chờ Bóng Mực sinh khi người chơi đã chết) → proof báo CHƯA ĐẠT → sửa kỳ vọng, thêm bài học vào AGENTS.md.
2. Scenario pulse đặt tick quá sớm (Bóng Mực ngoài bán kính) → tính lại theo tốc độ 3,5 m/s.
3. 30/30 test xanh ngay lần đầu → nghi "test luôn đạt" → gài 3 lỗi vào code, mỗi lần đều có test đỏ.
