# Simple Collaborative Music Streaming App (Local)

This project serves a static frontend and a small FastAPI + Socket.IO backend.
Put your .mp3 files into the `music/` folder. Run `pip install -r requirements.txt`
and then `python server.py`. Open http://localhost:8000 in your browser.

To share with friends use Cloudflared tunnel:
  cloudflared tunnel --url http://localhost:8000
