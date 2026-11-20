# Retro – Đảo Đèn Lồng (Day 12 AI SDLC)

Người làm: Nguyễn Thị Hương Giang (2A202603538) cùng Claude Code (Claude Opus 5.5). 4 phase, 4 giờ.

## 1. Số liệu
| Phase | Ticket / Contract | Test tự động | Scenario proof (headless) | Token ước tính | Kết quả chính |
|---|---|---|---|---|---|
| 1 | PRD-0 / v1.0 | 30 | 7 + tất định | ~145k | Đêm 1 chơi được, headless đúng contract |
| 2 | Ticket-02 / v1.1 | 49 | 20 + hiệu năng + tất định ×3 | ~180k | 3 Đêm, số chuẩn, tính năng mới, menu/âm thanh/HUD |
| 3 | Ticket-03 / v1.2 | 60 | 26 | ~100k | Nhiên liệu đèn, `drain`, thắng ở bình minh; ADR + CHANGELOG |
| 4 | Ticket-04 / v1.3 | 65 | 26 (giữ) + bench + soak | ~150k | Bench, soak, bảng xếp hạng, accessibility, Release |
| **Tổng** | | | | **~575k token** (ước tính, không có số chính xác từ công cụ) | CI xanh Ubuntu + macOS × Node 18/22 ở mọi tag |

Một Đêm headless đầy đủ (≤ 21.600 tick) chạy 0,5–1,5 s (yêu cầu ≤ 30 s). Soak 10 Đêm: 0 crash.

## 2. Đánh giá từng phase (tóm tắt – chi tiết trong `docs/notes/phase-N.md`)
- **Phase 1:** đạt toàn bộ yêu cầu headless; phần 3D chỉ kiểm chứng bằng chơi thử. 16 giả định cho PRD mơ hồ.
- **Phase 2:** số chuẩn thay giả định cũ; test Phase 1 đổi kỳ vọng được đánh dấu `[P2 change]`. Không làm hỏng yêu cầu Phase 1 (chạy lại scenario Phase 1 với số mới đều đạt). Người chơi thử: 60 FPS.
- **Phase 3:** đổi luật cốt lõi → ADR 0001 trước, CHANGELOG breaking changes; test bị thay sửa + `[P3 change]`, không skip.
- **Phase 4:** bench/soak đo được; bảng xếp hạng có test; accessibility làm đủ hạng mục nhưng chỉ kiểm thủ công. Số bench trên laptop dev (GPU Intel HD 520) **không đạt** ngưỡng 60 FPS – ghi trung thực; máy chấm mới là số chính thức.

## 3. Điều gì hiệu quả khi làm với AI
- **Tách logic thuần (`src/sim/`) khỏi hiển thị ngay từ Phase 1**: headless, test, bench, soak đều dùng chung một lõi; 3 lần đổi luật chỉ đụng một file.
- **Số tuning đọc thẳng từ `game.contract.json`**: không bao giờ khai lệch với code; đổi số chuẩn ở Phase 2 gần như không phải sửa code.
- **Bằng chứng do script sinh (`scripts/proof.js`)** + CI kiểm tra sinh lại không đổi → bằng chứng luôn khớp tag, không sửa tay.
- **Gài lỗi (mutation) để kiểm tra test**: phát hiện một test không bắt được lỗi (đẩy Bóng Mực khỏi vùng an toàn) ở Phase 2.
- Làm phần được chấm tự động (headless) trước, giao diện sau – quan trọng nhất ở Phase 3 (30 phút).

## 4. Điều không hiệu quả / AI sai và cách phát hiện
| Lần sai | Phát hiện | Sửa harness |
|---|---|---|
| Kỳ vọng proof sai luật (người đứng yên chết trước lần sinh Bóng Mực) | proof báo CHƯA ĐẠT | AGENTS.md: kỳ vọng phải khớp luật |
| 5 test lệch 1 tick (quên bộ đếm giảm từ tick sau) + 1 lỗi thật (Gió Lạc biến mất sớm 1 tick) | test đỏ, đọc thứ tự tick | AGENTS.md: quy ước bộ đếm |
| Hook báo đỏ giả vì ổ C đầy (ENOSPC), npm lỗi | hook đỏ không có chi tiết | hook chạy `node --test` trực tiếp, in chi tiết; file tạm trong `.tmp/` |
| `node --test` với glob chạy được trên Node 26 nhưng không trên Node 20 (CI đỏ) | CI | liệt kê file test; CI ma trận Node 18/22 |
| Sửa nhiều file bằng heredoc dài → bash lỗi cú pháp; regex `\n` bị biến thành xuống dòng thật; chèn comment giữa dòng | SyntaxError / `node --check` | AGENTS.md: script ghi ra `.tmp/*.py`, luôn `node --check` |
| Soak tưởng rò rỉ bộ nhớ (×1,5) | chạy 3/10/30 Đêm: không tăng tiếp → JIT | dùng `--jitless` cho soak, ghi số đo + lý do |
| Bench đo bộ nhớ bằng PowerShell đồng bộ làm treo tiến trình và giật khung | bench không tự thoát, p1_low ~1,5 | đo bất đồng bộ, Windows chỉ đo sau khi đo FPS |

## 5. Harness nào giúp nhiều nhất
1. **Stop hook** (`scripts/stop-hook.js`): agent không thể kết thúc khi test đỏ – bắt được lỗi ngay trong phiên.
2. **`scripts/proof.js` + skill `verify`**: một lệnh ra bằng chứng cho mọi yêu cầu, tái lập được.
3. **CI ma trận OS × Node**: bắt lỗi môi trường mà máy dev (Windows, Node 26) không thấy.
4. **AGENTS.md mục "Bài học"**: mỗi lần AI sai lặp lại thì thêm một dòng; giữ ngắn (~40 dòng).

## 6. Token và cách tiết kiệm
~575k token tổng (ước tính theo độ dài phiên). Cách tiết kiệm: một phiên, không subagent; gom sửa nhiều file vào một script; chỉ in dòng `pass/fail` và assertion lỗi; dừng thử chụp màn hình sau 2 lần thất bại; không đọc lại file vừa sửa; ưu tiên headless.
Lãng phí lớn nhất: các vòng sửa cú pháp do script sửa file viết vội (~20k) và thời gian chờ máy chậm/ổ đầy.

## 7. Nếu làm lại
- Viết sẵn quy ước "bộ đếm đặt ở tick t, giảm từ t+1" và thứ tự tick vào AGENTS.md từ Phase 1.
- Dùng InstancedMesh + Lambert từ đầu thay vì tối ưu ở Phase 4.
- Kiểm tra máy (ổ đĩa, Node, trình duyệt headless) trong 10 phút chuẩn bị.
- Tự động chụp ảnh màn hình bằng trình duyệt có sẵn ngay từ Phase 1 để có bằng chứng hình ảnh cho phần 3D.
