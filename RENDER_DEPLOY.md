# Deploy Render - Ledai

## 1) Push source code
- Push branch m?i nh?t l?n GitHub repo `sontoet1-cell/ledai`.

## 2) T?o l?i service ??ng ki?u Docker
- New + -> Blueprint ho?c Web Service
- Connect repo `ledai`
- N?u ch?n th? c?ng: Environment ph?i l? `Docker`
- Kh?ng d?ng runtime `Node` cho project n?y.

## 3) Runtime b?t bu?c
- Environment: Docker
- Health check: `/healthz`
- Port: d?ng bi?n `PORT` do Render c?p.

## 4) Verify sau khi deploy
- M? log boot, c?n th?y:
  - `[boot] ffmpeg=...`
  - `[boot] yt-dlp=...`
- N?u thi?u `yt-dlp`, ngh?a l? service ?ang ch?y sai ki?u runtime.

## 5) URL hi?n t?i
- Web service: `https://ledai-364n.onrender.com/`
- Homepage: tool `giongnoi`
