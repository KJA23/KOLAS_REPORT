import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
GEMINI_API_KEY = os.getenv('VITE_GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY') or ''

class GeminiRequest(BaseModel):
    prompt: str

@app.post("/gemini-analyze")
async def gemini_analyze(request: GeminiRequest):
    if not request.prompt:
        raise HTTPException(status_code=400, detail="No prompt provided")
    response = requests.post(
        f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
        headers={"Content-Type": "application/json"},
        json={"contents": [{"parts": [{"text": request.prompt}]}]}
    )
    if not response.ok:
        raise HTTPException(status_code=500, detail="Gemini API 호출 실패")
    data = response.json()
    text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    return {"generated_text": text}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
