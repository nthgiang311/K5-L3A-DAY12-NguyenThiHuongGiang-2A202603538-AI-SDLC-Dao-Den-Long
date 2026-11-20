# Phase 2 – Ticket-02 "Ba hòn đảo" + Test Contract v1.1

## Thay đổi yêu cầu so với Phase 1 (và cách xử lý)
| Phase 1 (giả định của tôi) | Ticket-02 (chuẩn) | Xử lý |
|---|---|---|
| Tốc độ 6, đèn cần 5, nhặt 1,5 m, nạp 2,5 m, pulse tốn 1 / 6 m / 1 s | Đèn 10, nhặt 1,0 m, nạp 2,0 m, pulse 3 / 5 m / 3 s, Bóng Mực 4 m/s | `game.contract.json` cập nhật; code đọc trực tiếp nên không phải sửa số trong code |
| +10 điểm khi **nhặt** | +10 khi **nạp** vào đèn | Đổi luật, test `[P2 change] deposit` |
| Không rơi (chặn ở mép) | Rơi khỏi đảo (Y < −10) có phạt | Thêm địa hình + rơi; test cũ "island edge" bỏ, thay bằng test rơi |
| 25 đom đóm ngẫu nhiên, hồi mỗi 3 s | 20 trên điểm sinh cố định, +1 tại tick 240k, trần 30 | Test `[P2 change] motes` |
| 2 Bóng Mực ngay từ đầu, +1 mỗi 30 s | 2 con tại tick 300, rồi mỗi 480/420/360 tick, điểm sinh cố định | Test `[P2 change] shades` |
| Thắng thì dừng ngay trong bước | Xét thắng/thua **sau** mỗi tick; thắng cả ở tick hết giờ | Đổi thứ tự; test win/dawn |
| Bị chạm: đom đóm biến mất | Rơi ra vành 1,5–2,5 m, tồn tại 480 tick | Test hit |
| Không có `night_start` | v1.1 có `night_start` | Ghi ở tick 0 (ngay sau snapshot 0); test headless cũ đổi số dòng |

Test Phase 1 bị đổi: đánh dấu `[P2 change]` trong `tests/*.test.js` kèm lý do. Các scenario proof Phase 1 được chạy lại với số chuẩn (`docs/proof/phase-2/`: `win_run`, `lose_no_flames`, `dawn`, `pulse_stun`, `safe_zone`).

## Giả định cho chỗ Ticket-02 chưa quy định
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | Tăng tốc/dừng ≤ 0,1 s | Tức thời (0 s), thỏa ≤ 0,1 s và dễ kiểm chứng |
| B2 | Điểm xuất phát Đêm 2, 3 | Đêm 2: (0,0,0). Đêm 3: **(0,0,−30)** vì (0,0,0) nằm trong tháp chuông |
| B3 | `night_start` ở tick nào | Tick 0, ghi ngay sau snapshot tick 0 |
| B4 | Thời gian trạng thái `spawning` | 60 tick (không di chuyển, không gây sát thương, vẫn bị Tỏa Sáng) |
| B5 | `wander` | Lượn 1,5 m/s tới điểm ngẫu nhiên (seed) cách 2–8 m, đổi mục tiêu mỗi 180 tick |
| B6 | Sau choáng / recoil / spawning | Về `chase` nếu cách ≤ 12 m, ngược lại `wander` |
| B7 | `player.invuln` trong snapshot | Boolean (đang bất tử hay không); số tick dùng `invuln_ticks` trong scenario |
| B8 | Bóng Mực và địa hình | Bay theo mặt đất (cao hơn đất 1 m), không bị vách tầng chặn; bị chặn bởi vùng an toàn và tháp |
| B9 | Gió | Cơn gió bắt đầu ở sim_tick 1800k, dài 300 tick, hướng ngẫu nhiên (seed, độ nguyên, đo từ +X ngược chiều kim đồng hồ); chỉ đẩy Mây. Báo trước 2 s chỉ là hiển thị/âm thanh |
| B10 | Gió Lạc: điểm sương | Chọn ngẫu nhiên trong các điểm sinh Bóng Mực của Đêm, bay cao 1,5 m; Gió Lạc đã `removed` vẫn hiện trong snapshot |
| B11 | Gió Lạc chỉ cướp khi | Đang `chase` (chạm lúc `idle` không cướp) |
| B12 | `pulse.stunned_ids` | Chỉ id Bóng Mực (Gió Lạc có `drifter_drop` riêng) |
| B13 | "Vật cản" khi đẩy lùi | Mép vùng an toàn của đèn đã sáng và tháp chuông |
| B14 | Đếm 30 đom đóm | Gồm cả đom đóm rơi; điểm sinh "trống" = không có đom đóm ngẫu nhiên đang chiếm |
| B15 | Bậc thang | Đi lên được chênh ≤ 0,35 m (dốc); vách 3 m chặn |
| B16 | Tạm dừng trên bản 3D | Esc/P dừng hẳn vòng lặp sim (không gọi `step`); headless dùng input `pause` |

## Acceptance criteria – Phần 3 (tính năng mới) và cách kiểm chứng
| Tính năng | Tiêu chí kiểm tra được | Bằng chứng |
|---|---|---|
| Gió Lạc | idle→chase khi mang ≥ 5 và ≤ 15 m; chạm ≤ 1,2 m cướp min(3, mang); flee 240 tick → removed; không mất lửa; bất tử không chặn | `sim.test.js` drifter ×3, proof `drifter_steal` |
| Gió Lạc + Tỏa Sáng | chase→flee không cướp; flee có đồ → `drifter_drop`, thả n đom đóm rơi, biến mất sau 120 tick | test drifter+pulse, proof `drifter_drop` |
| Gió Lạc sinh | tick 1200k, tối đa 2, id D1, D2, chỉ Đêm 2–3 | test drifters spawn |
| Bùa Gió | nhặt như đom đóm → `charm_picked` 600 tick; tốc độ 7,2; lướt không hồi chiêu, nhấn khi đang lướt bị bỏ qua; hồi lại sau 2700 tick | test charm ×2, proof `charm` |
| Lướt | 14 m/s × 12 tick, hồi chiêu 90 tick tính từ lúc bắt đầu, giữ độ cao trên không | test dash, proof `dash` |
| Rơi | Y < −10 → 1 sự kiện, −1 lửa, mất hết; chờ 60 tick; hồi sinh tại điểm xuất phát, bất tử 90 tick; hết lửa thì thua | test fall ×2, proof `fall` |
| Bục nhảy | Đêm 2 đáp đảo kia; Đêm 3 đáp tầng 2 | test pad, proof `pad_n2`, `pad_n3` |
| Địa hình Đêm 3 | vách chặn, dốc lên tầng 1, tháp không leo được | test terrain, night 3 |
| Gió Đêm 3 | bật ở tick 1800, 300 tick, đẩy 2 m/s | test wind, proof `wind_n3` |
| Tạm dừng | tick tăng, sim_tick/thời gian/hồi chiêu đứng yên, state `paused`, sự kiện paused/resumed | test pause, proof `pause` |
| Chuỗi 3 Đêm, menu, kết quả, Bình Minh | menu → giới thiệu (Ông Đăng) → chơi → kết quả → Đêm kế; thua → chơi lại Đêm; thắng Đêm 3 → Bình Minh + tổng điểm | **thủ công** (`npm start`) |
| Menu tạm dừng, Cài đặt | Esc/P: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu; âm lượng + độ nhạy chuột lưu localStorage | **thủ công** |
| Âm thanh | nhạc nền + 10 hiệu ứng (nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s) | **thủ công** (`web/audio.js`) |
| HUD | lửa trên trái; mm:ss trên giữa (đỏ nhấp nháy ≤ 30 s); đèn k/n + điểm trên phải; thanh 10 ô; hồi chiêu Lướt/Tỏa Sáng; nhắc "E — Nạp ánh sáng (x/10)"; mũi tên tới đèn chưa sáng gần nhất | **thủ công** |
| Bảng màu + ánh sáng | hex chuẩn trong `web/main.js` (`C`); ambient = 0,15 + 0,55 × đèn sáng/tổng | đọc code + thủ công |
| Hiệu năng headless | 1 Đêm 21.600 tick ≤ 30 s | `docs/proof/phase-2/SUMMARY.md` (≈ 1–2 s) |
| ≥ 30 FPS ở 1280×720 | bộ đếm FPS góc dưới trái; `window.__fps.samples` | **thủ công**, chưa đo |

## Đánh giá Phase 2
- **Đạt (tự động):** 49 test (unit + CLI), 20 scenario proof + hiệu năng + tất định 3 Đêm (`docs/proof/phase-2/SUMMARY.md`).
  Gài lỗi kiểm tra test: bỏ chênh cao khi nhặt → đỏ; Gió Lạc cướp hết → đỏ; tắt đẩy Bóng Mực khỏi vùng an toàn → **xanh** ⇒ test thiếu, đã thêm test Bóng Mực đang choáng trong vùng vừa thắp → đỏ khi gài lỗi.
- **Chưa kiểm chứng tự động:** toàn bộ bản 3D mới (menu, HUD, âm thanh, FPS). Edge headless không chụp được ảnh trên máy này. Cần người chơi thử và ghi lại.
- **Không làm hỏng Phase 1?** Các yêu cầu Phase 1 chạy lại với số chuẩn đều đạt; những test đổi kỳ vọng là do ticket đổi luật (bảng trên).
- **AI sai:** viết 5 kỳ vọng test lệch 1 tick (bộ đếm giảm từ tick sau), 1 lỗi thật trong code (bộ đếm flee của Gió Lạc giảm ngay trong tick đặt nó → biến mất sớm 1 tick; recoil chỉ 59 tick), kịch bản test để Mây chết trước khi kiểm TTL, scenario pulse/charm đặt sai thời điểm/vị trí.
  Phát hiện nhờ test đỏ và proof báo CHƯA ĐẠT. Bài học thêm vào AGENTS.md.

## Chơi thử thủ công (sau khi gắn tag phase-2, cùng mã)
- 2026-11-20, người chơi (chủ repo) chạy `node server.js` trên Windows, trình duyệt Chrome: **FPS hiển thị 60**, có nhạc nền, menu và game chạy bình thường.
- Đây là bằng chứng thủ công cho các mục "thủ công" ở bảng trên (≥ 30 FPS, âm thanh, chuỗi màn hình). Chưa đo chính xác ở đúng 1280×720 và chưa thử hết Đêm 2–3.
