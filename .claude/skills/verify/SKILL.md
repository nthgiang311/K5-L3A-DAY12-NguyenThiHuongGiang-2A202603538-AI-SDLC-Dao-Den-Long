---
name: verify
description: Chạy game headless theo Test Contract và lưu bằng chứng cho một phase. Dùng khi kết thúc một phase hoặc sau khi đổi luật chơi.
---

# Kiểm chứng một phase

1. `npm test` – phải xanh (unit + headless CLI + exit code + tất định).
2. Nếu thêm luật mới: thêm scenario vào `tests/scenarios/` và một dòng vào mảng `cases` trong `scripts/proof.js`
   (tên, yêu cầu, tham số CLI, hàm kiểm tra trả `null` khi đạt). Kỳ vọng phải suy ra từ yêu cầu, không chép từ output.
3. Đổi `cases` trong `scripts/proof.js` cho phase mới (giữ các case regression của phase trước). Commit code trước, rồi `node scripts/proof.js phase-N` → `docs/proof/phase-N/SUMMARY.md` + các `.jsonl`.
4. Chạy lại lần hai: `git diff --stat docs/proof/phase-N` chỉ được đổi SUMMARY.md (số đo thời gian).
   Proof của phase trước giữ nguyên (khớp tag cũ), không sinh lại bằng code mới.
5. Mục nào `CHƯA ĐẠT`: sửa code hoặc ghi trung thực vào `docs/notes/phase-N.md`. Không sửa tay output.
6. Phần 3D không chụp được tự động: ghi rõ cần người chơi thử (`npm start`); FPS xem góc dưới trái hoặc `window.__fps.samples`.
7. Mỗi tính năng mới: ít nhất 1 unit test + 1 scenario headless; gài lỗi thử để chắc test bắt được.
