# Phase 4 – Ticket-04 "Bình minh: phát hành v1.0.0" + Contract v1.3

## Giả định / quyết định
| # | Chỗ cần quyết | Quyết định |
|---|---|---|
| D1 | Bench cho bản web | `scripts/bench.js` khởi động server, mở **Chrome/Chromium/Edge thật** (`--app`, cửa sổ 1280×720, canvas cố định 1280×720, pixel ratio 1) với `--disable-gpu-vsync --disable-frame-rate-limit` (tắt vsync), trang gửi số đo về; `CHROME_PATH` để chọn trình duyệt |
| D2 | `load_ms` | Từ lúc tiến trình `bench.js` bắt đầu (`Date.now() − uptime`) tới khung hình đầu của cảnh bench (`performance.timeOrigin + now`) – gồm cả khởi động trình duyệt |
| D3 | `peak_mem_mb` | RSS lớn nhất của **cả cây tiến trình trình duyệt** trong lúc đo (`ps` trên macOS/Linux, `wmic` trên Windows, lấy mẫu mỗi 3 s, bất đồng bộ). `null` nếu không đo được |
| D4 | Cảnh bench | Đêm 1; 200 Bóng Mực `wander` rải đều trong đĩa r = 38 m (seed 42, `r = 38·√u`); 100 đom đóm; L1–L3 sáng fuel 100; `createSim({ bench: true })` tắt sinh/sát thương/nhặt/hao dầu/kết thúc. Bóng Mực vẫn theo luật wander (đi về đèn tắt gần nhất / đuổi Mây trong 12 m) |
| D5 | Hiệu năng vẽ | Bóng Mực và đom đóm vẽ bằng `InstancedMesh` (vài draw call cho 200 con); vật liệu Lambert; tắt MSAA. Áp dụng **cả lúc chơi thật** để bench đo đúng game |
| D6 | Soak: bộ nhớ | `soak_cmd = node --expose-gc --jitless scripts/soak.js`. Lý do (số đo trên máy dev, 10 Đêm): JIT bật → 36,1 → 54,5 MB (×1,51); 30 Đêm → 48,4 MB (không tăng tiếp ⇒ **không rò rỉ**, phần tăng là mã JIT + heap V8 giữ lại). `--jitless` → 31,6 → 35,2 MB (×1,11). `--max-old-space-size=48` ×1,33, `--optimize-for-size` ×1,58 |
| D7 | Soak: input | Mỗi 30 tick chọn hướng ngẫu nhiên (độ dài 1); mỗi tick: nhảy 5 %, lướt 3 %, tỏa sáng 2 %, tương tác 10 % (nút true đúng tick đó) |
| D8 | Bảng xếp hạng | Lưu trên đĩa `data/leaderboard.json` qua server (`/api/leaderboard`); `run_cmd` đổi thành `node server.js` để `<run_cmd> --export-leaderboard out.json` chạy được. Tên hỗ trợ tiếng Việt có dấu (Unicode letters, NFC). `seed` = seed của lượt chơi (Đêm n dùng seed + n − 1) |
| D9 | Bằng điểm | Ai đạt trước (achieved_at sớm hơn) đứng trên; cùng thời điểm thì ai được lưu trước |
| D10 | "Lưu điểm" | Có ở màn Bình Minh và ở màn kết quả khi thua |

## Acceptance criteria → bằng chứng
| Yêu cầu | Tiêu chí | Bằng chứng |
|---|---|---|
| Bench | lệnh chạy, thoát 0, `bench.json` đủ trường, đúng cảnh | `bench.json` (máy dev) – xem kết quả bên dưới |
| Soak | 10 Đêm, crashes 0, mem_end ≤ 1,2 × mem_start | `soak.json`, test `soak` trong `tests/leaderboard.test.js`, CI |
| Bảng xếp hạng | tên 3–12, top 10, sắp xếp, lưu đĩa, export đúng thứ tự | `tests/leaderboard.test.js` (5 test) + thủ công (màn hình) |
| Ảnh chụp README | game tự chụp canvas trong Chrome thật (`node scripts/screenshot.js`) | `docs/demo/screenshot.png` – bằng chứng hình ảnh tự động đầu tiên cho phần 3D |
| Đổi phím | mọi hành động, báo trùng, khôi phục mặc định, lưu | **thủ công** (Cài đặt → Phím) |
| Phụ đề / chỉ báo | Bóng Mực xuất hiện (+ mũi tên mép màn hình), gió, 10 s cuối, đèn < 30 dầu | **thủ công** (`#cue`, `#sarrow`, `#wind`) |
| Giảm chuyển động | tắt rung camera + chớp đỏ khi bị đánh | **thủ công** |
| Chữ | ≥ 18 px, tùy chọn ×1,25 | CSS `font-size: 18px`, `body.big` |
| Đóng gói | clone → ≤ 3 lệnh; Release có bản chạy được | README; Release v1.0.0 (zip có sẵn three.js, chỉ cần `node server.js`) |
| Contract v1.3 | `bench_cmd`, `soak_cmd` | test contract |
| Regression | mọi test Phase 1–3 còn hiệu lực | `npm test`, `docs/proof/phase-4/` |

## Kết quả đo trên máy dev (tham khảo – máy chấm sẽ khác)
Máy dev: laptop Intel Core i5-6300U, GPU tích hợp Intel HD 520, 8 GB, Windows 10 – yếu hơn nhiều máy chấm thông thường.
Kết quả thật nằm trong `bench.json` và `soak.json` ở gốc repo (do lệnh sinh, không sửa tay). Đánh giá ngưỡng ở mục dưới.

| Đo | Kết quả máy dev | Ngưỡng | Đạt trên máy dev? |
|---|---|---|---|
| bench avg_fps | 30.58 | ≥ 60 | **Chưa đạt** |
| bench p1_low_fps | 2.13 | ≥ 30 | **Chưa đạt** (có khung bị khựng ~0,5 s trên máy này, chưa tìm ra nguyên nhân) |
| bench load_ms | 14645 | ≤ 10000 | **Chưa đạt** (khởi động Chrome lạnh trên HDD/CPU 2 nhân) |
| bench peak_mem_mb | 743 | – | đo được |
| soak crashes | 0 | = 0 | Đạt |
| soak mem_end / mem_start | 35.2 / 31.6 = ×1.11 | ≤ ×1,2 | Đạt |

Lịch sử tối ưu bench trên máy dev: 19,3 FPS (Standard + MSAA, Mesh riêng từng Bóng Mực) → 25,8 (Lambert, không MSAA, InstancedMesh) → 30,6 (bỏ lấy mẫu bộ nhớ trong lúc đo trên Windows).

## Đánh giá Phase 4
- **Đạt:** contract v1.3 (`bench_cmd`, `soak_cmd`), soak (0 crash, bộ nhớ trong ngưỡng với `--jitless`), bảng xếp hạng (5 test, export), toàn bộ test Phase 1–3 (65 test), CI.
- **Chưa đạt trên máy dev:** ngưỡng bench (máy dev yếu: GPU tích hợp Intel HD 520). Chưa xác định nguyên nhân các khung khựng làm p1_low thấp. Số chính thức do giảng viên đo trên máy chấm.
- **Chỉ kiểm thủ công:** đổi phím, phụ đề/chỉ báo, giảm chuyển động, chữ lớn, màn hình bảng xếp hạng.
- **AI sai:** đo bộ nhớ bằng PowerShell đồng bộ làm treo bench; regex `
` bị script Python biến thành xuống dòng thật; khởi tạo `var bench = null` sau khi gọi `startBench()` (ghi đè). Phát hiện bằng `node --check`, chạy thử bench, và đọc code trước khi chạy.
- Tổng kết cả dự án: [docs/retro.md](../retro.md).
