# ADR 0001 – Đèn có nhiên liệu và luật thắng "giữ đảo sáng tới bình minh"

- **Trạng thái:** Đã chấp nhận (Phase 3, Ticket-03, Contract v1.2)
- **Thay thế:** luật Phase 1–2 "đèn đã sáng là sáng mãi", "thắng ngay khi mọi đèn sáng", "Bóng Mực không bao giờ vào vùng an toàn", điểm cũ.

## Bối cảnh
Người chơi giỏi thắp hết đèn trong 2 phút rồi Đêm kết thúc. Nhà thiết kế muốn căng thẳng tới cuối Đêm: đèn phải có thể tắt và mục tiêu là *giữ* đủ đèn sáng tới bình minh.

## Quyết định
1. **Mô hình trạng thái đèn** đổi từ 2 trạng thái (tắt → sáng, một chiều) sang vòng lặp:
   `chưa từng sáng (cần 10)` → `sáng (fuel 100)` → *(hao 1/s + 5/s mỗi Bóng Mực `drain`)* → `tắt (fuel 0, deposited 0, ever_lit)` → `thắp lại (cần 5)` → `sáng` …
   Thêm thuộc tính `fuel`, `ever_lit`, `relit_count`. Đèn sáng có `fuel < 30` mất vùng an toàn.
2. **Đơn vị nhiên liệu nguyên:** lưu `fuel × 60` (1 đơn vị = 1 tick hao). Hao 1/tick, hút 5/tick/con, châm 600/đom đóm, ngưỡng 30 = 1800, tối đa 6000. Không có sai số số thực, kết quả tất định; chỉ làm tròn 1 chữ số khi xuất snapshot/sự kiện.
3. **Thứ tự tick:** trừ dầu ở bước 2 (sau các bộ đếm khác), ngay sau đó đèn `fuel ≤ 0` tắt (`lantern_out`, Bóng Mực đang hút nó → `wander`). Tương tác (bước 5) chọn đèn "nhận được": chưa sáng, hoặc sáng mà `ceil((100 − fuel)/10) > 0`.
4. **Bóng Mực `drain`:** chỉ con đang `wander` chọn đèn yếu gần nhất (rồi tới đèn tắt gần nhất); trong 2 m thì đứng yên hút. Ra khỏi `drain` khi Mây ≤ 6 m (→ chase), trúng Tỏa Sáng (→ stunned, +15 điểm), đèn tắt / được châm ≥ 30 / cách > 2 m (→ wander). Hết choáng luôn về `wander`.
   Châm dầu lên ≥ 30 tái dùng cơ chế "đẩy ra mép trong ≤ 30 tick, vô hại" đã có cho đèn vừa thắp (bước 6), không viết cơ chế mới.
5. **Luật thắng:** bỏ thắng sớm. Ở tick hết giờ, sau mọi cập nhật: hết lửa → `no_flames`; nếu không, đèn đang sáng ≥ `ceil(0.6 × tổng)` → `won/dawn_survived`, ngược lại `lost/dawn`.
6. **Sức chứa** = `min(20, 10 + 2 × successful_lights)`; tính cả thắp lại, không tính đèn đặt sẵn bằng scenario.
7. **Điểm** nằm trong `game.contract.json → tuning.score` (thêm `per_relight`, `per_stun_drain`, `per_lantern_at_dawn`; `per_second_left = 0`).

## Hệ quả
- Test Phase 1–2 về thắng sớm, điểm +10/+thời gian, số giây Đêm bị thay: đã sửa và đánh dấu `[P3 change]` (xem `CHANGELOG.md`).
- Kịch bản thắng trọn màn (`win_run`) phải rút ngắn Đêm (`time_left_s: 40`) vì đèn chỉ cháy 100 s.
- **Quan sát:** vì dầu bị trừ ở bước 2 trước tương tác ở bước 5, đèn đang sáng không bao giờ "đầy đúng 100" lúc bấm E (tối đa 99,98) ⇒ trường hợp "đèn đầy, used = 0" chỉ xảy ra khi Mây không mang gì. Giữ đúng theo ticket.
- **Giả định:** Bóng Mực `wander` tiến tới đèn mục tiêu với `shade_speed` (4 / 4,5 m/s); đến đèn tắt thì lượn tại chỗ (trong 2 m). `fuel_drain` ghi mỗi 60 tick hút liên tục của từng con (đếm từ lúc vào `drain`). Đèn đặt `lit: true` trong scenario mà không có `ever_lit` thì `ever_lit = true`.

## Phương án đã cân nhắc
- Lưu `fuel` là số thực và làm tròn: bỏ, vì cộng dồn 1/60 gây lệch và khó so sánh tất định.
- Tách "vùng an toàn" thành trạng thái riêng của đèn: bỏ, tính trực tiếp từ `lit && fuel ≥ 30` mỗi tick là đủ và không thể lệch.
