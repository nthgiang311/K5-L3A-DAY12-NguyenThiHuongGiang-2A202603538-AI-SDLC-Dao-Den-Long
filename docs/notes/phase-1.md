# Phase 1 – PRD-0 + Test Contract v1.0

## Phân tích yêu cầu
**Bắt buộc chính xác (contract):** `game.contract.json` ở gốc; CLI `--seed --night 1 [--scenario] [--inputs] --ticks --out [--snapshot-every=10]`;
60 tick/s; snapshot tick 0 trước input; bước k đọc input k → trạng thái k+1, event ghi tick k+1; dừng khi đủ tick hoặc game over, exit 0;
lỗi → exit ≠ 0 + stderr, file sai định dạng → exit 2; JSONL snapshot/event/end; tọa độ 3 chữ số; tất định theo seed;
khoảng cách XZ, "trong bán kính" là ≤; công thức xoay `cam_yaw_deg`; nút kích hoạt ở cạnh false→true; scenario không phát event/điểm.

**Mơ hồ (PRD-0) → giả định của tôi:**

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A1 | "Tỏa sáng tốn ánh sáng" | Tốn `pulse_cost` = 1 đom đóm đang mang. Không đủ → không pulse, không event |
| A2 | Máu | Máu = `flames` = 3 ngọn lửa. Bị chạm −1, hết → thua `no_flames` |
| A3 | Rơi khỏi đảo | Không phạt (`fall_enabled: false`): người chơi bị chặn ở mép đảo bán kính 40 m |
| A4 | "Bóng Mực sợ đèn" | Chỉ đèn **đã thắp** có vùng an toàn `safe_radius` = 6 m; Bóng Mực bị đẩy ra mép vòng |
| A5 | Nạp đèn | Nhấn interact trong `interact_radius` của đèn chưa thắp gần nhất: nạp min(đang mang, còn thiếu). Đủ `lantern_cost` = 5 → thắp |
| A6 | Đánh rơi khi bị chạm | Mất `floor(carried × 0.5)` đom đóm (biến mất, không rơi xuống đất) |
| A7 | Hết giờ (`dawn`) | Bình minh tới khi chưa thắp hết đèn = **thua** (`lost/dawn`). Đêm 1 dài 300 s |
| A8 | Điểm | +10/đom đóm nhặt, +100/đèn thắp, +5/Bóng Mực bị choáng. Khi **thắng**: +2 × số giây còn lại (làm tròn xuống) + 50 × lửa còn lại |
| A9 | Đom đóm | Đầu màn 25 con rải ngẫu nhiên (seed), hồi 1 con/3 s khi < 25. Nhặt tự động khi trong `pickup_radius`, tối đa 10 |
| A10 | Bóng Mực | Đầu màn 2 con ở mép đảo (≥ 15 m từ người chơi), thêm 1 con mỗi 30 s (tối đa 6), đuổi thẳng với 3,5 m/s (chậm hơn Mây 6 m/s). Trạng thái `chase` / `stunned` |
| A11 | Pulse | Bán kính 6 m: choáng 2 s, đẩy lùi 4 m, hồi chiêu 1 s |
| A12 | Sau khi bị chạm | Bất tử 1,5 s; mỗi tick tối đa một lần trúng. Nhảy không né được (khoảng cách tính trên XZ) |
| A13 | Bố trí đèn | 5 đèn trên vòng tròn bán kính 25 m, L1 tại (0,0,25), cách nhau 72° |
| A14 | id đèn lạ trong scenario | Bỏ qua + cảnh báo stderr (không phải lỗi định dạng). `move` ngoài [−1,1] → exit 2 |
| A15 | Thứ tự trong một bước | timers → di chuyển → nhặt → interact → pulse → Bóng Mực đi → va chạm → sinh → kết thúc. Thắng ngay khi đèn cuối được thắp (bỏ phần còn lại của bước) |
| A16 | Snapshot cuối | Chỉ ghi snapshot ở bội số `--snapshot-every`; dòng `end` luôn là dòng cuối |

## Tiêu chí nghiệm thu → cách kiểm chứng
| Yêu cầu | Tiêu chí kiểm tra được | Bằng chứng |
|---|---|---|
| Đi lại, camera | 60 tick move [0,1] → z = 6,0; yaw 90° → +X; vector chéo chuẩn hóa | `tests/sim.test.js` movement |
| Nhảy | Nhấn jump → y > 0 rồi về 0; giữ nút không nhảy lại | jump test |
| Đom đóm nhặt được | ở đúng `pickup_radius` nhặt, +0,01 m không nhặt; đầy thì không nhặt | pickup, capacity test |
| Thắp đèn | nạp 3 rồi 2 → `deposit` + `lantern_lit`, +100 | deposit test |
| Bóng Mực đuổi | 60 tick đi đúng 3,5 m | chase test, `default_idle_seed42` |
| Bị chạm | mất 1 lửa, rơi 50%, lần sau cách đúng 90 tick | hit test, `lose_no_flames` |
| Tỏa sáng | chỉ choáng con trong 6 m, đẩy 4 m, tốn 1, hồi chiêu, đứng yên đúng 120 tick | pulse tests, `pulse_stun` |
| Sợ đèn | không bị chạm khi đứng cạnh đèn đã thắp; đèn tắt thì bị chạm | safe_radius test, `safe_zone` |
| Thắng / thua / dawn | `won/all_lit`, `lost/no_flames`, `lost/dawn` ở tick 60·t | win/lose/dawn test, `win_run`, `dawn` |
| Contract CLI | snapshot 0,10,20; end cuối; exit 2/1; làm tròn 3 số | `tests/headless.test.js` |
| Tất định | cùng seed → sha256 giống; seed khác → khác | determinism test + `docs/proof/phase-1/SUMMARY.md` |
| Chơi lại, HUD, 3D | R chơi lại; HUD: lửa, đom đóm, đèn, giờ, điểm | **thủ công** (`npm start`) |

## Đánh giá Phase 1
- **Đạt (có bằng chứng tự động):** toàn bộ logic + contract: 30 test, 7 scenario proof + kiểm tra tất định.
  Kiểm tra chất lượng test bằng cách gài lỗi: đổi `<=` → `<` ở pickup, đảo dấu công thức yaw, tắt safe_radius → mỗi lần đều có test đỏ.
- **Chưa kiểm chứng tự động:** client 3D (`web/main.js`). Agent không chụp được màn hình (Edge headless lỗi trên máy do ổ C đầy).
  Cần người chơi thử và ghi lại ở đây.
- **AI sai:** viết kỳ vọng proof sai luật (người đứng yên chết trước lần sinh Bóng Mực 30 s), viết scenario pulse ở tick 30 khi Bóng Mực còn ngoài 6 m.
  Phát hiện nhờ `scripts/proof.js` báo CHƯA ĐẠT. Sửa: tính lại kỳ vọng từ luật; thêm bài học vào AGENTS.md.
- **Harness:** AGENTS.md, Stop hook chặn kết thúc khi test đỏ, skill `verify`, CI (Ubuntu + macOS).
