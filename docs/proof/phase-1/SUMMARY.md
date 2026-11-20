# Bằng chứng headless – phase-1

> File này do `node scripts/proof.js phase-1` sinh tự động từ CLI thật (`src/headless.js`). Không sửa tay.
> Commit: `895e92d` (commit trước khi sinh) · Node v26.13.1

| Scenario | Yêu cầu | Kết thúc | Sự kiện đầu (tick:name) | Kết quả |
|---|---|---|---|---|
| win_run | Chơi hết Đêm 1 tới thắng (thắp 5 đèn) | won, ticks=2075, score=1430 | 35:mote_picked, 66:mote_picked, 96:mote_picked, 126:mote_picked, 156:mote_picked, 231:deposit … (+30) | ĐẠT |
| lose_no_flames | Bị Bóng Mực chạm hết lửa -> thua | lost, ticks=249, score=0 | 69:player_hit, 159:player_hit, 249:player_hit, 249:game_over | ĐẠT |
| dawn | Hết thời gian Đêm -> thua (dawn) | lost, ticks=300, score=0 | 300:game_over | ĐẠT |
| pulse_stun | Tỏa sáng xua Bóng Mực (stun + đẩy lùi, tốn ánh sáng) | playing, ticks=240, score=5 | 41:pulse | ĐẠT |
| safe_zone | Bóng Mực không vào được bán kính đèn đã thắp | playing, ticks=1200, score=0 |  | ĐẠT |
| default_idle_seed42 | Màn mặc định: 25 đom đóm rải rác, 2 Bóng Mực đuổi người đứng yên | lost, ticks=815, score=0 | 635:player_hit, 725:player_hit, 815:player_hit, 815:game_over | ĐẠT |
| shade_spawn | Bóng Mực mới sinh mỗi 30 s (shade_spawned, id duy nhất) | playing, ticks=3700, score=0 | 1800:shade_spawned, 3600:shade_spawned | ĐẠT |

**Tính tất định:** seed 7 + `win_run.inputs.json` trên màn mặc định, chạy 2 lần, 5000 tick:
- run1 sha256 `8ad6a8329e3ccd775bf16406dcbd1cba7c21c4a38788727c91492e2e88d47db7`
- run2 sha256 `8ad6a8329e3ccd775bf16406dcbd1cba7c21c4a38788727c91492e2e88d47db7`
- ĐẠT: giống hệt nhau

Tái lập: `npm run proof` rồi `git diff docs/proof/` (phải không đổi).
