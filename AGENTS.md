# AGENTS.md – Đảo Đèn Lồng

Game 3D (three.js), 3 Đêm, + chế độ headless theo **Test Contract v1.2** (đèn có nhiên liệu, thắng ở bình minh – xem `docs/adr/`). Node >= 18, không phụ thuộc gì ngoài `three`.

## Lệnh
- Cài: `npm install` · Chơi: `npm start` (http://localhost:8080)
- Test (unit + headless CLI): `npm test` (liệt kê file test, không dùng glob: Node < 21 không hỗ trợ) — phải xanh trước khi kết thúc việc
- Bằng chứng: `npm run proof` → `docs/proof/phase-N/` (sinh tự động, KHÔNG sửa tay)
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario f] [--inputs f]`

## Cấu trúc
- `src/sim/levels.js` – bản đồ chuẩn 3 Đêm (góc đo từ +X: `(r cos a, y, r sin a)`) + `groundAt` (địa hình, null = biển mây).
- `src/sim/sim.js` – toàn bộ luật chơi, thuần JS, dùng chung cho headless và web. Không dùng `Math.random`/`Date` ở đây (phá tính tất định) — chỉ `rng()` có seed.
- `src/sim/validate.js` – kiểm tra file inputs/scenario (sai định dạng → `FormatError` → exit 2).
- `src/headless.js` – CLI theo contract. `web/main.js` – chỉ hiển thị + map phím → input contract.
- `game.contract.json` – **nguồn duy nhất** của các số tuning; code đọc trực tiếp. Hằng số chuẩn khác (Ticket-02) ở `STD` trong `sim.js`.
- `web/main.js` (render, menu, HUD, bảng màu `C`), `web/audio.js` (âm thanh tổng hợp WebAudio).

## Quy ước
- Thứ tự một tick **bắt buộc theo Ticket-02**: pause → bộ đếm → di chuyển Mây + rơi → nhặt → đèn → vùng an toàn → Tỏa Sáng → Bóng Mực/Gió Lạc di chuyển → chạm (Gió Lạc trước, Bóng Mực theo id) → sinh → thắng/thua.
- Bộ đếm đặt ở tick t giảm từ tick t+1 (ở bước 2): "hiệu lực N tick" ⇒ đặt N. Tính kỳ vọng test theo quy ước này, đừng đoán.
- Đổi luật cốt lõi: viết ADR trong `docs/adr/` + mục breaking changes trong `CHANGELOG.md` trước khi code.
- Nhiên liệu lưu số nguyên đơn vị 1/60 (`fuel × 60`); chỉ làm tròn 1 chữ số khi xuất.
- Test cũ bị ticket mới đổi luật: sửa kỳ vọng + đánh dấu `[P2 change]`/`[P3 change]` + ghi lý do trong `docs/notes/phase-N.md`.
- Khoảng cách luôn theo mặt phẳng XZ, "trong bán kính" là `<=`. Timer đếm bằng tick nguyên.
- Mỗi yêu cầu mới: ghi giả định + tiêu chí vào `docs/notes/phase-N.md` TRƯỚC, viết test, rồi mới code.
- Thực thể/hiệu ứng sáng tạo thêm chỉ ở `web/` hoặc phải tắt khi headless; không được đổi output headless.
- Không viết test "luôn đạt"; khi thêm test mới, thử làm hỏng code để chắc test bắt được lỗi.
- Không sửa tay file trong `docs/proof/`. Không commit `node_modules`, `.env`, key.

## Bài học (cập nhật khi agent sai lặp lại)
- Kỳ vọng của scenario proof phải khớp luật: người đứng yên sẽ bị Bóng Mực chạm chết trước lần sinh 30 s.
- Test/hook không phụ thuộc thư mục tạm hệ thống hay npm: ổ C đầy từng làm `npm test` đỏ giả (ENOSPC). File tạm của test để ở `.tmp/`.
- Kịch bản test có Bóng Mực đuổi: Mây đứng yên sẽ chết sau 3 lần chạm (~180 tick) → sim dừng; cho nhiều `flames` nếu cần chạy lâu.
- Edge headless không chụp được ảnh trên máy này (đường dẫn có dấu / swiftshader): đừng tốn token thử lại, ghi "cần chơi thử".
- Script sửa nhiều file: ghi ra `.tmp/*.py` rồi chạy, đừng nhét script dài vào heredoc của bash (lỗi cú pháp). Không chèn comment giữa một dòng code.
