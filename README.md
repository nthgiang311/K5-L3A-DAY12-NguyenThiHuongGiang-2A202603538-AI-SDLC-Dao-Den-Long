# Đảo Đèn Lồng

> **Video demo:** _(sẽ gắn ở Phase 4 – Release v1.0.0)_
> Nguyễn Thị Hương Giang · 2A202603538 · Day 12 AI SDLC · Đề bài lab: [docs/lab/](docs/lab/README-lab.md)

Game 3D góc nhìn thứ ba. Mây – người giữ đèn nhỏ đội nón lá – gom đom đóm qua **3 Đêm** (Đảo Bến, Đảo Cau, Đảo Chuông)
để thắp lại các Đèn Lồng Lớn, né Bóng Mực và Gió Lạc. Viết bằng JavaScript: logic thuần (`src/sim/`) dùng chung cho
bản 3D (three.js, chạy trên trình duyệt) và chế độ headless theo **Test Contract v1.2**.

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

## Luật chơi và cách tính điểm (Ticket-02 + Ticket-03)
- **Mục tiêu mỗi Đêm: giữ đảo sáng tới bình minh.** Thắng nếu còn sống khi hết giờ (240/270/300 s) và số đèn **đang sáng** ≥ 60% (Đêm 1: 3/5, Đêm 2: 4/6, Đêm 3: 5/7). Thắp hết đèn không kết thúc Đêm sớm.
- Đèn chưa từng sáng cần **10** đom đóm; đèn đã tắt thắp lại cần **5**. Đèn sáng có **dầu 100**, hao 1/s; bấm **E** ở đèn sáng để **châm dầu** (+10 dầu mỗi đom đóm). Dầu < 30: đèn nhấp nháy và mất vùng an toàn.
- Mang tối đa **10 + 2 × số lần thắp thành công** (tối đa 20). Tự nhặt khi cách ≤ 1 m.
- **Bóng Mực** đuổi trong 12 m (4 m/s, Đêm 3: 4,5); khi lang thang sẽ tìm tới đèn yếu để **hút dầu** (5/s). Bị chạm: −1 Ngọn Lửa (có 3), rơi một nửa đom đóm, bất tử 1,5 s.
- **Tỏa Sáng**: tốn 3 đom đóm, bán kính 5 m, choáng 2 s, đẩy lùi 4 m, hồi chiêu 3 s. **Lướt**: 14 m/s × 0,2 s, hồi chiêu 1,5 s. **Rơi khỏi đảo**: −1 Ngọn Lửa, mất hết đom đóm.
- **Gió Lạc** (Đêm 2–3) cướp 3 đom đóm khi bạn mang ≥ 5. **Bùa Gió**: 10 s chạy 7,2 m/s, lướt không hồi chiêu.
- **Điểm:** +5 mỗi đom đóm nạp/châm · +100 thắp lần đầu · +40 thắp lại · +5 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu nó đang hút dầu) · khi thắng: mỗi đèn đang sáng +50 + dầu còn lại, mỗi Ngọn Lửa +50. Tổng điểm = tổng các Đêm đã thắng.
- **Cài đặt:** âm lượng, độ nhạy chuột, **Bảng màu dễ phân biệt** (mù màu) – được lưu.

Mọi số tuning nằm ở `game.contract.json` (code đọc trực tiếp). Giả định: [phase-1](docs/notes/phase-1.md), [phase-2](docs/notes/phase-2.md), [phase-3](docs/notes/phase-3.md). Quyết định thiết kế: [docs/adr/](docs/adr/). Thay đổi phá vỡ tương thích: [CHANGELOG.md](CHANGELOG.md).

## Test và chế độ headless
```bash
npm test                 # 60 test: luật chơi + CLI headless + exit code + tính tất định
npm run proof            # chạy scenario cho từng tính năng, đo hiệu năng, sinh docs/proof/phase-3/SUMMARY.md
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
và hash tất định trong `docs/proof/phase-3/SUMMARY.md`.

## Tài liệu
- Ghi chép từng phase (giả định, tiêu chí, đánh giá): [docs/notes/](docs/notes/) · Nhật ký dùng AI: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Bằng chứng: [docs/proof/](docs/proof/) (mỗi phase một thư mục, khớp tag tương ứng)
- Harness AI: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), hook `.claude/settings.json`, skill `.claude/skills/verify/`, CI `.github/workflows/ci.yml`
- [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
