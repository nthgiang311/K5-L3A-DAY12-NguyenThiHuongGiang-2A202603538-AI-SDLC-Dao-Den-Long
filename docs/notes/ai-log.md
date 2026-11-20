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

## Phase 2
| Bước | Lời nhắc chính / việc agent làm | Ước tính token |
|---|---|---|
| Hỗ trợ ngoài lề | Sửa hook đỏ giả (ổ C đầy), dọn cache ổ C, push, đổi remote, sửa CI Node < 21, hướng dẫn chơi | ~40k |
| Đọc ticket + thiết kế | Dán Ticket-02. Agent lập danh sách thay đổi + giả định trong đầu, viết `levels.js` + viết lại `sim.js` một lần | ~45k |
| Test | Viết lại unit test theo số chuẩn, sửa 5 kỳ vọng lệch 1 tick, 1 lỗi thật, gài lỗi kiểm tra | ~35k |
| Scenario + proof | 20 scenario, đo hiệu năng, tất định 3 Đêm | ~20k |
| Bản 3D | Menu/chuỗi Đêm/tạm dừng/cài đặt/âm thanh/HUD/bảng màu | ~25k |
| Docs | phase-2.md, AGENTS.md, skill, README | ~15k |
| **Tổng Phase 2** | | **~180k** |

**Cách tiết kiệm:** sửa nhiều file bằng một script Python thay vì nhiều lần Edit; chỉ in dòng `pass/fail` và assertion lỗi của test;
dừng thử chụp màn hình Edge sau 2 lần (không ra ảnh); tách phần headless (chấm điểm) làm trước, giao diện sau.

**AI sai:** 5 kỳ vọng test lệch 1 tick vì quên quy ước "bộ đếm giảm từ tick sau"; 1 lỗi code thật (bộ đếm flee của Gió Lạc giảm ngay trong tick đặt nó → biến mất sớm 1 tick);
test TTL để Mây chết trước khi kiểm; scenario pulse đặt tick quá sớm, scenario bùa cho Mây đi khỏi cầu. Đã ghi quy ước bộ đếm vào AGENTS.md.
Ngoài ra một test không bắt được lỗi gài (tắt đẩy Bóng Mực ra khỏi vùng an toàn) → thêm test cho Bóng Mực đang choáng.

## Phase 3
| Bước | Việc agent làm | Ước tính token |
|---|---|---|
| Hỗ trợ ngoài lề | Cài/đăng nhập `gh`, ghi kết quả chơi thử Phase 2 | ~10k |
| Code v1.2 | Một script Python sửa contract + sim + validator (lần đầu lỗi heredoc, ghi lại ra file) | ~30k |
| Test | Sửa 5 test bị thay, thêm 12 test luật mới, sửa 3 test viết sai + 2 lỗi cú pháp do sửa vội | ~30k |
| ADR, CHANGELOG, proof, UI tối thiểu, docs | | ~30k |
| **Tổng Phase 3** | | **~100k** |

**Cách tiết kiệm (30 phút):** ưu tiên headless (chấm điểm) → test → ADR/CHANGELOG (DoD) → UI tối thiểu; gom sửa vào script; không thử chụp màn hình.
