# Đảo Đèn Lồng

> **Video demo:** _(sẽ gắn ở Phase 4 – Release v1.0.0)_
> Nguyễn Thị Hương Giang · 2A202603538 · Day 12 AI SDLC · Đề bài lab: [docs/lab/](docs/lab/README-lab.md)

Game 3D góc nhìn thứ ba. Mây – người giữ đèn nhỏ đội nón lá – gom đom đóm khắp Đảo Bến để thắp lại 5 Đèn Lồng Lớn
và né Bóng Mực trong sương đen. Viết bằng JavaScript: logic thuần (`src/sim/`) dùng chung cho bản 3D (three.js, chạy trên trình duyệt)
và chế độ headless theo **Test Contract v1.0**.

## Cài đặt và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)
```bash
npm install
npm start          # mở http://localhost:8080
```

## Điều khiển
| Phím | Hành động |
|---|---|
| W A S D | Đi (theo hướng camera) |
| Space | Nhảy |
| E | Nạp đom đóm vào đèn (đứng gần đèn chưa thắp) |
| F | Tỏa sáng: xua Bóng Mực quanh mình (tốn 1 đom đóm) |
| ← / → hoặc kéo chuột | Xoay camera |
| R | Chơi lại (bất cứ lúc nào, kể cả sau khi thắng/thua) |

## Luật chơi và cách tính điểm
- Đom đóm tự nhặt khi chạm (mang tối đa **10**). Mỗi đèn cần **5** đom đóm để thắp.
- Bóng Mực đuổi theo Mây; bị chạm: mất **1 ngọn lửa** (có 3), rơi **một nửa** đom đóm đang mang, bất tử 1,5 s.
- Tỏa sáng: Bóng Mực trong 6 m bị choáng 2 s và đẩy lùi 4 m; hồi chiêu 1 s. Bóng Mực không vào được vòng 6 m quanh đèn **đã thắp**.
- **Thắng:** thắp đủ 5 đèn. **Thua:** hết lửa, hoặc bình minh tới (hết 300 s) khi đảo chưa sáng.
- **Điểm:** +10 mỗi đom đóm nhặt · +100 mỗi đèn thắp · +5 mỗi Bóng Mực bị choáng · khi thắng: +2 × giây còn lại + 50 × lửa còn lại.

Mọi con số nằm ở `game.contract.json` (code đọc trực tiếp từ đây). `fall_enabled: false`: đảo có mép chặn, không thể rơi nên không có phạt rơi.
Giả định đầy đủ: [docs/notes/phase-1.md](docs/notes/phase-1.md).

## Test và chế độ headless
```bash
npm test                 # 30 test: luật chơi + CLI headless + exit code + tính tất định
npm run proof            # chạy các scenario, sinh docs/proof/phase-1/SUMMARY.md
node src/headless.js --seed 42 --night 1 --ticks 18000 --out out.jsonl \
  --scenario tests/scenarios/win_run.scenario.json --inputs tests/scenarios/win_run.inputs.json
```
Exit 0 khi chạy xong (đủ tick hoặc game over), 2 khi file inputs/scenario sai định dạng, 1 cho lỗi khác.
CI (GitHub Actions, Ubuntu + macOS) chạy `npm test` và kiểm tra bằng chứng tái lập được ở mỗi lần push.

## Sáng tạo của tôi
- **Đèn trên nón của Mây sáng theo số đom đóm đang mang**, nhấp nháy khi đang bất tử sau khi bị chạm.
- **Đảo ấm dần:** mỗi đèn được thắp làm sương đen mỏng đi và bầu trời chuyển từ tím đen sang tím ấm; vòng an toàn của đèn hiện trên mặt đất.
- Vòng đo tiến độ nạp đèn quanh cột đèn.

Tất cả chỉ nằm ở `web/main.js` (hiển thị), không chạm `src/sim/`, nên output headless không đổi – bằng chứng: `npm test` và
`docs/proof/phase-1/SUMMARY.md` (hash tất định) vẫn đạt.

## Tài liệu
- Ghi chép từng phase (giả định, tiêu chí, đánh giá): [docs/notes/](docs/notes/) · Nhật ký dùng AI: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Bằng chứng: [docs/proof/](docs/proof/)
- Harness AI: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), hook `.claude/settings.json`, skill `.claude/skills/verify/`, CI `.github/workflows/ci.yml`
- [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
