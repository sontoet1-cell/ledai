# Deploy Render - Tienich.pro Downloader

## 1) Push source code
- Push branch mới nhất lên GitHub/GitLab.

## 2) Tạo service trên Render
- New + -> Web Service
- Connect repo
- Render sẽ đọc `render.yaml` tự động.

## 3) Runtime
- Environment: Docker
- Health check: `/healthz`
- Port: dùng biến `PORT` do Render cấp (app đã hỗ trợ sẵn).

## 4) Verify sau khi deploy
- Mở log boot, cần thấy:
  - `[boot] ffmpeg=...` (không phải not found)
  - `[boot] yt-dlp=...` (không phải not found)
- Test nhanh:
  - TikTok tải trực tiếp
  - YouTube 720 tải trực tiếp
  - YouTube/Facebook chất lượng cao cần ghép sẽ chạy hậu kỳ
  - Jimeng resolve qua sora2dl

## 5) Nếu cần scale
- Free plan có thể sleep, nâng plan nếu cần tốc độ/độ ổn định cao hơn.
