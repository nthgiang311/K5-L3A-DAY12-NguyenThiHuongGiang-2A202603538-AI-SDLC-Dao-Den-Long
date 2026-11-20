# Changelog

## [phase-3] – Contract v1.2 "Đèn cạn dầu"
### ⚠ Breaking changes
- **Luật thắng:** không còn thắng khi thắp hết đèn. Thắng chỉ ở bình minh nếu còn sống và đèn đang sáng ≥ ceil(0,6 × tổng) (3/5, 4/6, 5/7). `game_over.reason`: `dawn_survived` thay `all_lit` (không dùng nữa).
- **Thời lượng Đêm:** 300/330/360 s → **240/270/300 s**.
- **Điểm:** +10 → **+5** mỗi đom đóm nạp (cả châm dầu); thắp lại +40; Tỏa Sáng trúng Bóng Mực đang `drain` +15; **bỏ thưởng thời gian**; thắng: +50 + floor(fuel) mỗi đèn đang sáng, +50 mỗi Ngọn Lửa.
- **Đèn:** có `fuel` (100, hao 1/s), tắt khi hết (`lantern_out`, `deposited` về 0). Đèn sáng nhận đom đóm để châm dầu (`refuel`). Đèn đã từng sáng thắp lại chỉ cần 5.
- **Vùng an toàn:** đèn có fuel < 30 mất vùng an toàn.
- **Bóng Mực:** trạng thái mới `drain`; hết choáng luôn về `wander` (trước: chase nếu ≤ 12 m).
- **Sức chứa:** 10 cố định → 10 + 2 × số lần thắp thành công, tối đa 20 (`player.capacity`).
- **Snapshot:** đèn thêm `fuel`, `ever_lit`, `relit_count`; `player.capacity`. **Sự kiện:** `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit` thêm `relight`.
- **Scenario:** đèn nhận `fuel`, `ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`; trạng thái `drain`.
### Thêm
- Cài đặt "Bảng màu dễ phân biệt" (mù màu), thanh dầu trên đèn, nhấp nháy 1 Hz khi fuel < 30, HUD đang mang / sức chứa.
- ADR: `docs/adr/0001-lantern-fuel-and-dawn-win.md`.
### Test
- Test bị thay đổi đánh dấu `[P3 change]` trong `tests/` (không skip): contract, deposit/điểm, win (thay bằng 4 test luật bình minh), headless `time_left_s`, kịch bản `win_run` (Đêm rút còn 40 s).

## [phase-2] – Contract v1.1 "Ba hòn đảo"
### ⚠ Breaking changes
- Số liệu chuẩn thay mọi số tự chọn ở Phase 1 (đèn 10, nhặt 1 m, Tỏa Sáng 3/5 m/3 s…); +10 điểm khi **nạp** thay vì khi nhặt.
- Rơi khỏi đảo có phạt (trước: chặn ở mép). 20 đom đóm trên điểm sinh cố định; Bóng Mực sinh từ tick 300.
- Thắng/thua xét sau mỗi tick; sự kiện `night_start` ở tick 0.
### Thêm
- 3 Đêm, Lướt, bục nhảy, địa hình 3 tầng, gió, Gió Lạc, Bùa Gió, tạm dừng, menu/âm thanh/HUD.

## [phase-1] – Contract v1.0
- Đêm 1 chơi được, chế độ headless, test, bằng chứng, harness.
