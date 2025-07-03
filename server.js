require("dotenv").config();
const express = require("express");
const multer  = require("multer");
const { spawn } = require("child_process");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const axios = require('axios');
const cheerio = require('cheerio');

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

// DuckDuckGo HTML search for top N results
async function ddgSearch(query, limit = 4) {
  const res = await axios.get("https://html.duckduckgo.com/html", {
    params: { q: query }
  });
  const $ = cheerio.load(res.data);
  const results = [];
  $(".result").slice(0, limit).each((i, el) => {
    const $el     = $(el);
    const title   = $el.find(".result__a").text();
    const link    = $el.find(".result__a").attr("href");
    const snippet = $el.find(".result__snippet").text();
    results.push({ title, link, snippet });
  });
  return results;
}

// Fetch first paragraph from each page
async function extractFirstPara(url) {
  try {
    const res = await axios.get(url, { timeout: 8000 });
    const $   = cheerio.load(res.data);
    const p   = $("p").first().text().trim();
    return p.length > 0 ? p : "";
  } catch {
    return "";
  }
}

// Build prompt & call Gemini
async function verifyClaim(claim) {
  // a) Get DDG results
  const results = await ddgSearch(claim);

  // b) Enrich with first paragraph (optional)
  for (const r of results) {
    r.excerpt = await extractFirstPara(r.link);
  }

  // c) Format evidence list
  const evidence = results
    .map((r,i) => 
      `${i+1}. ${r.title} — ${r.link}\n   Snippet: ${r.snippet}`
      + (r.excerpt ? `\n   Excerpt: ${r.excerpt}` : "")
    )
    .join("\n\n");

  // d) Compose an enhanced, multi-faceted prompt for Gemini
  const prompt = `
You are a veteran investigative analyst and fact–finder with expertise in semantic reasoning, sentiment analysis, and motive inference. Before offering your verdict, perform the following steps in order:

1. **Factual Verification:**  
   - Rigorously assess the truth of the claim against each piece of evidence.  
   - Consider alternative interpretations or underlying assumptions.  

2. **Motivation & Benefit Analysis:**  
   - Examine what advantage or benefit the speaker gains by making this statement.  
   - Identify any reputational, legal, or financial incentives at play.  

3. **Intent & Framing:**  
   - Describe how the speaker frames the narrative and why.  
   - Note any persuasive language or emotional appeals.  

4. **Sentiment & Tone:**  
   - Analyze the speaker's emotional tone (e.g., defensive, apologetic, deflective).  
   - Comment on how that tone influences the listener's perception.  

5. **Final Verdict:**  
   - Use **Motivation & Benefit Analysis** as the primary criterion when making your verdict.  
   - If the evidence and analyses collectively suggest the claim is more than 30% likely to be false, you must conclude **FALSE** (never "UNKNOWN").  
   - Phrase your verdict as:  
     "**Taking the data into consideration, I conclude that:** [TRUE/FALSE]."  
   - Provide clear reasons citing Sentiment & Tone, Evidence, Motivation & Benefit Analysis, and Intent & Framing.  

6. **Resource List:**  
   - At the end, provide a clear list of each evidence source's URL.

CLAIM:  
"${claim}"

EVIDENCE SOURCES:  
${evidence}

Respond in clear, numbered sections corresponding to the tasks above, using concise, professional prose.
  `.trim();

  // e) Call Gemini 2.5 Flash
  const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";
  const resp = await axios.post(
    GEMINI_URL,
    {
      contents: [{ parts: [{ text: prompt }] }]
    },
    {
      params: { key: process.env.GEMINI_API_KEY },
      headers: { "Content-Type": "application/json" }
    }
  );

  // f) Extract the answer
  const answer =
    resp.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "No answer.";
  return { answer, evidence: results };
}

// Gemini Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { transcript, question } = req.body;
  if (!transcript || !question) {
    return res.status(400).json({ error: 'Transcript and question are required.' });
  }

  const prompt = `You are assigned to the user to answer everything regarding this summary:\n${transcript}\n\nUser question: ${question}`;

  try {
    const geminiRes = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
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

// Fact Verification endpoint
app.post('/api/verify', async (req, res) => {
  const { claim } = req.body;
  if (!claim) {
    return res.status(400).json({ error: 'Claim is required.' });
  }
  try {
    const { answer, evidence } = await verifyClaim(claim);
    res.json({ answer, evidence });
  } catch (err) {
    console.error("Error during verification:", err);
    res.status(500).json({ error: "Failed to verify claim." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 