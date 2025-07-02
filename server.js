require("dotenv").config();
const express = require("express");
const multer  = require("multer");
const { spawn } = require("child_process");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// 1) Multer setup
const upload = multer({ dest: "uploads/" });

// Ensure transcripts directory exists
const transcriptsDir = path.join(__dirname, 'transcripts');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir);
}

// 2) Upload & Transcribe endpoint
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const videoPath = req.file.path;
  const filename  = req.file.originalname;

  // Spawn the Python script
  const py = spawn("python", ["transcribe.py", videoPath]);
  let transcript = "";

  py.stdout.on("data", data => {
    transcript += data.toString();
  });

  py.stderr.on("data", data => {
    console.error("Python error:", data.toString());
  });

  py.on("close", code => {
    // Delete the uploaded video
    fs.unlinkSync(videoPath);

    try {
      const output = JSON.parse(transcript);
      if (output.error) throw new Error(output.error);

      // Save transcript to a .txt file
      const txtPath = path.join(transcriptsDir, filename + '.txt');
      fs.writeFileSync(txtPath, output.transcript, 'utf8');

      res.json({ transcript: output.transcript, file: filename + '.txt' });
    } catch (err) {
      console.error("Transcription parse/save error:", err);
      res.status(500).json({ error: err.message });
    }
  });
});

// 4) Fetch transcripts
app.get("/api/videos/:id", async (req, res) => {
  const vid = await Video.findById(req.params.id);
  if (!vid) return res.status(404).json({ error: "Not found" });
  res.json(vid);
});

// Gemini Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { transcript, question } = req.body;
  if (!transcript || !question) {
    return res.status(400).json({ error: 'Transcript and question are required.' });
  }

  const prompt = `You are assigned to the user to answer everything regarding this summary:\n${transcript}\n\nUser question: ${question}`;

  try {
    const geminiRes = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent',
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        params: { key: process.env.GEMINI_API_KEY },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    const answer = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer.';
    res.json({ answer });
  } catch (err) {
    console.error('Gemini API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to get response from Gemini.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 