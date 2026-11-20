# Đảo Đèn Lồng

> **Video demo:** _(sẽ gắn ở Phase 4 – Release v1.0.0)_
> Nguyễn Thị Hương Giang · 2A202603538 · Day 12 AI SDLC · Đề bài lab: [docs/lab/](docs/lab/README-lab.md)

Game 3D góc nhìn thứ ba. Mây – người giữ đèn nhỏ đội nón lá – gom đom đóm qua **3 Đêm** (Đảo Bến, Đảo Cau, Đảo Chuông)
để thắp lại các Đèn Lồng Lớn, né Bóng Mực và Gió Lạc. Viết bằng JavaScript: logic thuần (`src/sim/`) dùng chung cho
bản 3D (three.js, chạy trên trình duyệt) và chế độ headless theo **Test Contract v1.1**.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)
```bash
npm install
npm start          # mở http://localhost:8080
```
(Windows PowerShell chặn script `npm.ps1`: dùng `npm.cmd start` hoặc `node server.js`.)

## Điều khiển
| Phím | Hành động |
|---|---|
| W A S D | Đi (theo hướng camera) |
| Space | Nhảy |
| Shift | Lướt |
| E | Nạp đom đóm vào đèn (đứng gần đèn chưa thắp) |
| F | Tỏa Sáng: xua Bóng Mực và Gió Lạc quanh mình (tốn 3 đom đóm) |
| ← / → hoặc kéo chuột | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |

## Luật chơi và cách tính điểm (số chuẩn Ticket-02)
- Mang tối đa **10** đom đóm (tự nhặt khi cách ≤ 1 m). Mỗi đèn cần **10**, nạp nhiều lần được, đèn nhớ tiến độ.
- **Bóng Mực** phát hiện trong 12 m, bỏ đuổi ngoài 18 m, chạy 4 m/s (Đêm 3: 4,5). Bị chạm: −1 Ngọn Lửa (có 3), rơi một nửa đom đóm ra quanh mình (nhặt lại được trong 8 s), bất tử 1,5 s.
- **Tỏa Sáng**: tốn 3 đom đóm, bán kính 5 m, choáng 2 s và đẩy lùi 4 m, hồi chiêu 3 s. Bóng Mực không vào được vòng 6 m quanh đèn **đã sáng**.
- **Lướt**: 14 m/s trong 0,2 s, hồi chiêu 1,5 s. **Rơi khỏi đảo**: −1 Ngọn Lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2–3) đuổi khi bạn mang ≥ 5 đom đóm và cướp 3 con; Tỏa Sáng trúng nó thì nó đánh rơi lại. **Bùa Gió**: 10 s chạy nhanh 7,2 m/s và lướt không hồi chiêu.
- Đêm 2: hai đảo nối bằng cầu tre, có bục nhảy. Đêm 3: đảo 3 tầng, dốc, bục nhảy lên tháp chuông, gió mạnh mỗi 30 s.
- **Thắng** Đêm khi thắp hết đèn; **thua** khi hết Ngọn Lửa hoặc bình minh tới (300/330/360 s).
- **Điểm:** +10 mỗi đom đóm **nạp** vào đèn · +100 mỗi đèn thắp · +5 mỗi Bóng Mực trúng Tỏa Sáng · khi thắng: +2 × giây còn lại + 50 × Ngọn Lửa còn lại. Tổng điểm = tổng các Đêm đã thắng.

Mọi số tuning nằm ở `game.contract.json` (code đọc trực tiếp). Giả định: [phase-1](docs/notes/phase-1.md), [phase-2](docs/notes/phase-2.md).

## Test và chế độ headless
```bash
npm test                 # 49 test: luật chơi + CLI headless + exit code + tính tất định
npm run proof            # chạy scenario cho từng tính năng, đo hiệu năng, sinh docs/proof/phase-2/SUMMARY.md
node src/headless.js --seed 42 --night 1 --ticks 18000 --out out.jsonl \
  --scenario tests/scenarios/win_run.scenario.json --inputs tests/scenarios/win_run.inputs.json
```
`--night` nhận 1, 2, 3. Exit 0 khi chạy xong (đủ tick hoặc game over), 2 khi file inputs/scenario sai định dạng, 1 cho lỗi khác.
Một Đêm đầy đủ (21.600 tick) chạy khoảng 1–2 s. CI (GitHub Actions, Ubuntu + macOS, Node 18 + 22) chạy test và kiểm tra bằng chứng tái lập được ở mỗi lần push.

## Sáng tạo của tôi
- **Đèn trên nón của Mây sáng theo số đom đóm đang mang**, nhấp nháy khi đang bất tử.
- **Đảo ấm dần:** mỗi đèn được thắp làm sương đen mỏng đi; vòng an toàn của đèn hiện trên mặt đất; vòng tiến độ nạp quanh cột đèn.
- **Ông Đăng** dẫn chuyện ở màn giới thiệu mỗi Đêm; đom đóm rơi nhấp nháy khi sắp tắt; Bóng Mực mới "trồi lên" to dần lúc `spawning`.
- Toàn bộ âm thanh được **tổng hợp bằng WebAudio** (không dùng file ngoài).

Tất cả chỉ nằm ở `web/` (hiển thị/âm thanh), không chạm `src/sim/`, nên output headless không đổi – bằng chứng: `npm test`
và hash tất định trong `docs/proof/phase-2/SUMMARY.md`.

## Tài liệu
- Ghi chép từng phase (giả định, tiêu chí, đánh giá): [docs/notes/](docs/notes/) · Nhật ký dùng AI: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Bằng chứng: [docs/proof/](docs/proof/) (mỗi phase một thư mục, khớp tag tương ứng)
- Harness AI: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), hook `.claude/settings.json`, skill `.claude/skills/verify/`, CI `.github/workflows/ci.yml`
- [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
