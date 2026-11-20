# Bằng chứng headless – phase-3

> Sinh tự động bởi `node scripts/proof.js phase-3` từ CLI thật (`src/headless.js`). Không sửa tay.
> Commit gốc: `43be7f2` · Node v26.13.1

## Scenario
| Scenario | Đêm | Yêu cầu | Kết thúc | Sự kiện đầu (tick:name) | Kết quả |
|---|---|---|---|---|---|
| win_run | 1 | P1→P3: thắp 5 đèn rồi giữ sáng tới bình minh (Đêm rút còn 40 s) | won, ticks=2400, score=1545 | 20:mote_picked, 42:mote_picked, 64:mote_picked, 86:mote_picked, 107:mote_picked … (+56) | ĐẠT |
| lose_no_flames | 1 | P1: hết 3 Ngọn Lửa -> thua no_flames | lost, ticks=240, score=0 | 60:player_hit, 150:player_hit, 240:player_hit, 240:game_over | ĐẠT |
| dawn | 1 | P1/P3: hết giờ, 0 đèn sáng -> thua dawn ở tick 300 (5 s) | lost, ticks=300, score=0 | 300:game_over | ĐẠT |
| pulse_stun | 1 | P1/P2: Tỏa Sáng tốn 3, choáng + đẩy lùi 4 m | playing, ticks=120, score=5 | 51:pulse | ĐẠT |
| safe_zone | 1 | P1/P2: Bóng Mực bị chặn ở mép 6 m quanh đèn đã sáng | playing, ticks=1200, score=0 |  | ĐẠT |
| fuel_out | 1 | P3: đèn hao 1/s, hết dầu -> lantern_out (fuel 3 -> tick 180) | playing, ticks=200, score=0 | 180:lantern_out | ĐẠT |
| refuel | 1 | P3: châm dầu used = ceil((100 − fuel)/10), +5 điểm mỗi con | playing, ticks=5, score=25 | 1:refuel | ĐẠT |
| relight | 1 | P3: thắp lại cần 5, +40, relight true, sức chứa 12 | playing, ticks=5, score=65 | 1:deposit, 1:lantern_lit | ĐẠT |
| drain | 1 | P3: Bóng Mực wander tới đèn yếu, drain 5/s, fuel_drain mỗi 60 tick | playing, ticks=400, score=0 | 137:fuel_drain, 197:fuel_drain, 257:fuel_drain, 317:fuel_drain, 355:lantern_out | ĐẠT |
| dawn_win | 1 | P3: bình minh với 3/5 đèn sáng -> won dawn_survived, điểm bình minh | won, ticks=120, score=444 | 120:game_over | ĐẠT |
| dawn_lose | 1 | P3: 1 đèn tắt trước bình minh -> 2/5 < 3 -> lost dawn | lost, ticks=120, score=0 | 60:lantern_out, 120:game_over | ĐẠT |
| spawn_schedule_n1 | 1 | P2: 20 đom đóm lúc đầu, Bóng Mực 2 con ở tick 300 rồi mỗi 480 tick | playing, ticks=1300, score=0 | 300:shade_spawned, 300:shade_spawned, 780:shade_spawned, 1260:shade_spawned | ĐẠT |
| default_n1_motes | 1 | P2: màn mặc định 20 đom đóm, +1 mỗi 240 tick | playing, ticks=240, score=0 |  | ĐẠT |
| dash | 1 | P2: Lướt 14 m/s × 12 tick, hồi chiêu 90 tick từ lúc bắt đầu | playing, ticks=100, score=0 | 1:dash, 91:dash | ĐẠT |
| fall | 1 | P2: rơi khỏi đảo -> −1 lửa, mất hết đom đóm, chờ 60 tick, hồi sinh | playing, ticks=300, score=0 | 79:player_hit | ĐẠT |
| hit_drop | 1 | P2: bị chạm -> rơi floor(n/2) đom đóm, Bóng Mực recoil | playing, ticks=5, score=0 | 1:player_hit | ĐẠT |
| evict | 1 | P2: đèn vừa thắp đẩy Bóng Mực ra mép trong ≤ 30 tick, không gây sát thương | playing, ticks=40, score=150 | 1:deposit, 1:lantern_lit | ĐẠT |
| pause | 1 | P2: tạm dừng: tick tăng, sim_tick đứng yên, state paused | playing, ticks=60, score=0 | 11:paused, 41:resumed | ĐẠT |
| pad_n2 | 2 | P2: bục nhảy Đêm 2 đưa Mây sang đảo B | playing, ticks=120, score=0 |  | ĐẠT |
| pad_n3 | 3 | P2: bục nhảy Đêm 3 đưa Mây lên tầng 2 (Y=6) | playing, ticks=120, score=0 |  | ĐẠT |
| drifter_steal | 2 | P2: Gió Lạc đuổi khi mang ≥ 5, cướp 3, bỏ chạy 240 tick rồi biến mất | playing, ticks=500, score=0 | 76:drifter_steal | ĐẠT |
| drifter_drop | 2 | P2: Tỏa Sáng trúng Gió Lạc đang mang đồ -> thả lại đom đóm | playing, ticks=5, score=0 | 1:drifter_drop, 1:pulse, 2:mote_picked | ĐẠT |
| charm | 2 | P2: nhặt Bùa Gió -> charm_picked, 600 tick, tốc độ 7.2 | playing, ticks=100, score=0 | 10:charm_picked | ĐẠT |
| wind_n3 | 3 | P2: gió Đêm 3 ở tick 1800, 300 tick, đẩy 2 m/s | playing, ticks=2160, score=0 | 1:dash, 91:dash | ĐẠT |
| default_n2 | 2 | P2: Đêm 2 mặc định: 6 đèn, Gió Lạc ở tick 1200 | playing, ticks=1300, score=0 | 300:shade_spawned, 300:shade_spawned, 720:shade_spawned, 1140:shade_spawned | ĐẠT |
| default_n3 | 3 | P2: Đêm 3 mặc định: 7 đèn, 2 bùa | playing, ticks=400, score=0 | 300:shade_spawned, 300:shade_spawned | ĐẠT |

## Hiệu năng headless (một Đêm đầy đủ 21.600 tick, yêu cầu ≤ 30 s)
| Đêm | Thời gian | Kết quả |
|---|---|---|
| Đêm 1 | 0.67 s | ĐẠT |
| Đêm 2 | 0.39 s | ĐẠT |
| Đêm 3 | 0.69 s | ĐẠT |

## Tính tất định (seed 7, cùng inputs, chạy 2 lần, 6000 tick)
| Đêm | sha256 lần 1 | sha256 lần 2 | Kết quả |
|---|---|---|---|
| Đêm 1 | `a2ac68850f3b92a4…` | `a2ac68850f3b92a4…` | ĐẠT |
| Đêm 2 | `1fe5cb649b46531a…` | `1fe5cb649b46531a…` | ĐẠT |
| Đêm 3 | `da30f40dfba4ffb0…` | `da30f40dfba4ffb0…` | ĐẠT |

Tái lập: `npm run proof` rồi `git diff docs/proof/phase-3` (chỉ SUMMARY.md đổi số đo thời gian).
