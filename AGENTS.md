# AGENTS.md – Đảo Đèn Lồng

Game 3D (three.js) + chế độ headless theo **Test Contract v1.0**. Node >= 18, không phụ thuộc gì ngoài `three`.

## Lệnh
- Cài: `npm install` · Chơi: `npm start` (http://localhost:8080)
- Test (unit + headless CLI): `npm test` — phải xanh trước khi kết thúc việc
- Bằng chứng: `npm run proof` → `docs/proof/phase-N/` (sinh tự động, KHÔNG sửa tay)
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`

## Cấu trúc
- `src/sim/sim.js` – toàn bộ luật chơi, thuần JS, dùng chung cho headless và web. Không dùng `Math.random`/`Date` ở đây (phá tính tất định) — chỉ `rng()` có seed.
- `src/sim/validate.js` – kiểm tra file inputs/scenario (sai định dạng → `FormatError` → exit 2).
- `src/headless.js` – CLI theo contract. `web/main.js` – chỉ hiển thị + map phím → input contract.
- `game.contract.json` – **nguồn duy nhất** của các số tuning; code đọc trực tiếp, không chép số vào code.

## Quy ước
- Thứ tự một bước sim (giữ nguyên, test phụ thuộc): timers → di chuyển/nhảy → nhặt → interact → pulse → Bóng Mực di chuyển → va chạm → sinh → kết thúc.
- Khoảng cách luôn theo mặt phẳng XZ, "trong bán kính" là `<=`. Timer đếm bằng tick nguyên.
- Mỗi yêu cầu mới: ghi giả định + tiêu chí vào `docs/notes/phase-N.md` TRƯỚC, viết test, rồi mới code.
- Thực thể/hiệu ứng sáng tạo thêm chỉ ở `web/` hoặc phải tắt khi headless; không được đổi output headless.
- Không viết test "luôn đạt"; khi thêm test mới, thử làm hỏng code để chắc test bắt được lỗi.
- Không sửa tay file trong `docs/proof/`. Không commit `node_modules`, `.env`, key.

## Bài học (cập nhật khi agent sai lặp lại)
- Kỳ vọng của scenario proof phải khớp luật: người đứng yên sẽ bị Bóng Mực chạm chết trước lần sinh 30 s.
