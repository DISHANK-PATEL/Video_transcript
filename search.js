require("dotenv").config();
const axios   = require("axios");
const cheerio = require("cheerio");

// 1️⃣ DuckDuckGo HTML search for top N results
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

// 2️⃣ (Optional) Fetch first paragraph from each page
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

// 3️⃣ Build prompt & call Gemini
async function verifyClaim(claim) {
  // a) Get DDG results
  const results = await ddgSearch(claim);

  // b) Enrich with first paragraph (optional, comment out if not needed)
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
   - Analyze the speaker’s emotional tone (e.g., defensive, apologetic, deflective).  
   - Comment on how that tone influences the listener’s perception.  

5. **Final Verdict:**  
   - Use **Motivation & Benefit Analysis** as the primary criterion when making your verdict.  
   - If the evidence and analyses collectively suggest the claim is more than 30% likely to be false, you must conclude **FALSE** (never “UNKNOWN”).  
   - Phrase your verdict as:  
     “**Taking the data into consideration, I conclude that:** [TRUE/FALSE].”  
   - Provide clear reasons citing Sentiment & Tone, Evidence, Motivation & Benefit Analysis, and Intent & Framing.  

6. **Resource List:**  
   - At the end, provide a clear list of each evidence source’s URL.

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

// 4️⃣ Example usage
(async () => {
  const claim =
    "There is micro chip installed in 500 note in india";
  console.log("Verifying:", claim, "\n");

  try {
    const { answer, evidence } = await verifyClaim(claim);
    console.log("▶ Verdict:\n", answer, "\n");
    console.log("▶ Evidence used:");
    evidence.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title} — ${r.link}`);
    });
  } catch (err) {
    console.error("Error during verification:", err);
  }
})();
