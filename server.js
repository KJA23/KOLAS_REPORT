// =========================
// AI Agent Script 시작
// =========================
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();


const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Google Gemini API 엔드포인트 및 키
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

app.post('/gemini-analyze', async (req, res) => {
	try {
		const { prompt } = req.body;
		if (!prompt) {
			return res.status(400).json({ error: 'No prompt provided' });
		}
		// Gemini API 호출
		const geminiRes = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		if (!geminiRes.ok) {
			return res.status(500).json({ error: 'Gemini API 호출 실패', status: geminiRes.status });
		}
		const data = await geminiRes.json();
		// Gemini 응답에서 텍스트 추출
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
		res.json({ generated_text: text });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// =========================
// AI Agent Script 끝
// =========================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
	console.log('Gemini analyze endpoint: POST /gemini-analyze');
});
