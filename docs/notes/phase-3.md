# Phase 3 – Ticket-03 "Đèn cạn dầu" (Change Request) + Contract v1.2

Quyết định thiết kế: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Breaking changes: [CHANGELOG.md](../../CHANGELOG.md).

## Giả định (chỗ ticket chưa quy định)
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | Tốc độ Bóng Mực `wander` khi đi tới đèn yếu / đèn tắt | `shade_speed` (4 / 4,5 m/s); lượn ngẫu nhiên 1,5 m/s chỉ khi không có đèn nào để tới |
| C2 | Bóng Mực tới đèn tắt rồi làm gì | Dừng trong 2 m quanh đèn, không hút |
| C3 | `fuel_drain` mỗi 60 tick | Đếm theo từng con từ lúc vào `drain` (60, 120, … tick hút liên tục) |
| C4 | Đèn `lit: true` trong scenario không có `ever_lit` | `ever_lit = true` |
| C5 | Khóa điểm trong contract | Thêm `per_relight`, `per_stun_drain`, `per_lantern_at_dawn`; `per_second_left = 0` |
| C6 | "Đèn đầy dầu" | Do trừ dầu ở bước 2 trước tương tác ở bước 5, đèn sáng không bao giờ đúng 100 lúc bấm (ghi ở ADR) |

## Acceptance criteria → bằng chứng
| Yêu cầu | Tiêu chí | Bằng chứng |
|---|---|---|
| Nhiên liệu | sáng: fuel 100, −1/s; hết → `lantern_out`, deposited 0, ever_lit | test `fuel`, proof `fuel_out` |
| Châm dầu | used = min(mang, ceil((100−fuel)/10)), +10 fuel, +5 điểm mỗi con, `refuel` | test `refuel`, proof `refuel` |
| Thắp lại | đèn ever_lit cần 5, +40, `relight: true`, relit_count++ | test `relight`, proof `relight` |
| Vùng an toàn yếu | fuel < 30 mất vùng; 30 giữ | test `low fuel` |
| drain | wander → đèn yếu gần nhất, ≤ 2 m → drain 5/s + hao 1/s; `fuel_drain` mỗi 60 tick; thoát khi Mây ≤ 6 m / châm ≥ 30 (đẩy ra) / đèn tắt; pulse +15; hết choáng → wander | test `drain` ×3, proof `drain` |
| Luật thắng | không thắng sớm; bình minh: ≥ ceil(0,6×N) sáng → `dawn_survived`; ít hơn → `dawn`; hết lửa luôn `no_flames` | test ×4 `[P3 change]`, proof `dawn_win`, `dawn_lose`, `win_run` |
| Sức chứa | 10 + 2 × lần thắp thành công, max 20, `player.capacity` | test `capacity`, proof `relight` |
| Điểm mới | bảng điểm Ticket-03 | test deposit/refuel/relight/dawn, proof `dawn_win` (148+88+58+150) |
| Mù màu, thanh dầu, nhấp nháy 1 Hz, HUD mang/sức chứa | cài đặt lưu localStorage | **thủ công** (`npm start` → Cài đặt) |

## Test cũ bị thay (không skip)
`contract v1.1` → v1.2; `deposit` (+10 → +5, fuel); `win: checked after the tick…` → 4 test luật bình minh; headless `time_left_s` 299.833 → 239.833; `win_run` thêm `time_left_s: 40`. Tất cả đánh dấu `[P3 change]`.

## Đánh giá Phase 3
- **Đạt (tự động):** 60 test; 26 scenario proof (6 mới cho Ticket-03 + regression Phase 1–2), hiệu năng và tất định 3 Đêm.
- **Chưa kiểm chứng tự động:** thay đổi giao diện (thanh dầu, nhấp nháy, mù màu) – cần chơi thử.
- **AI sai:** script Python lồng heredoc quá dài làm bash lỗi cú pháp (chuyển sang file `.tmp/*.py`); 3 test viết sai (nút giữ nên không có cạnh false→true, kiểm sức chứa sớm 1 tick, đứng ngoài bán kính 2 m); chèn comment giữa dòng làm hỏng cú pháp; cắt chuỗi khi sửa test để thừa dòng. Phát hiện nhờ test đỏ / SyntaxError.
