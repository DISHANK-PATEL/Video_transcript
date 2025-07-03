import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [factInput, setFactInput] = useState("");
  const [factResult, setFactResult] = useState(null);
  const [factLoading, setFactLoading] = useState(false);
  const [factError, setFactError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setTranscript("");
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("video", file);

    try {
      const res = await axios.post("http://localhost:5000/api/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTranscript(res.data.transcript);
      setChatHistory([]); // Clear chat when new transcript is uploaded
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    }
    setLoading(false);
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !transcript) return;
    const userMsg = { sender: "user", text: chatInput };
    setChatHistory((h) => [...h, userMsg]);
    setChatLoading(true);
    try {
      const res = await axios.post("http://localhost:5000/api/chat", {
        transcript,
        question: chatInput,
      });
      setChatHistory((h) => [...h, { sender: "bot", text: res.data.answer }]);
    } catch (err) {
      setChatHistory((h) => [...h, { sender: "bot", text: "Error: Could not get answer." }]);
    }
    setChatInput("");
    setChatLoading(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h2>Video Transcription</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept="video/*"
          onChange={e => setFile(e.target.files[0])}
        />
        <button type="submit" disabled={loading || !file} style={{ marginLeft: 8 }}>
          {loading ? "Transcribing…" : "Upload & Transcribe"}
        </button>
      </form>
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
      {transcript && (
        <div style={{ marginTop: 24 }}>
          <h4>Transcript:</h4>
          <pre style={{ background: "#f4f4f4", padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '100%', overflowX: 'auto' }}>{transcript}</pre>
        </div>
      )}
      {transcript && (
        <div style={{ marginTop: 32 }}>
          <h3>Choose an option:</h3>
          <ol>
            <li><b>Ask about the summary</b> (chat below)</li>
            <li><b>Verify a factual claim</b> (form below)</li>
          </ol>
          {/* Option 1: Chatbot about summary */}
          <div style={{ marginTop: 24 }}>
            <h4>1️⃣ Ask the Chatbot about this transcript</h4>
            <div style={{
              minHeight: 120,
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: 12,
              marginBottom: 12,
              maxHeight: 250,
              overflowY: "auto",
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}>
              {chatHistory.length === 0 && <div style={{ color: "#888" }}>No questions yet.</div>}
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ margin: "8px 0", textAlign: msg.sender === "user" ? "right" : "left", wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                  <b>{msg.sender === "user" ? "You" : "Gemini"}:</b> {msg.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleChat} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask a question about the transcript..."
                style={{ flex: 1, padding: 8 }}
                disabled={chatLoading}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>
                {chatLoading ? "Thinking..." : "Ask"}
              </button>
            </form>
          </div>
          {/* Option 2: Fact Verification */}
          <div style={{ marginTop: 32 }}>
            <h4>2️⃣ Verify a factual claim</h4>
            <form
              onSubmit={async e => {
                e.preventDefault();
                setFactError("");
                setFactResult(null);
                if (!factInput.trim()) return;
                setFactLoading(true);
                try {
                  const res = await axios.post("http://localhost:5000/api/verify", { claim: factInput });
                  setFactResult(res.data);
                } catch (err) {
                  setFactError(err.response?.data?.error || "Verification failed");
                }
                setFactLoading(false);
              }}
              style={{ display: "flex", gap: 8, alignItems: 'flex-start' }}
            >
              <input
                type="text"
                value={factInput}
                onChange={e => setFactInput(e.target.value)}
                placeholder="Enter a factual claim to verify..."
                style={{ flex: 1, padding: 8 }}
                disabled={factLoading}
              />
              <button type="submit" disabled={factLoading || !factInput.trim()}>
                {factLoading ? "Verifying..." : "Verify"}
              </button>
            </form>
            {factError && <div style={{ color: "red", marginTop: 8 }}>{factError}</div>}
            {factResult && (
              <div style={{ marginTop: 16, background: 'linear-gradient(90deg, #f0f7ff 0%, #f9f9f9 100%)', padding: 18, borderRadius: 8, boxShadow: '0 2px 8px #e0e7ef55' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1976d2', marginBottom: 8, letterSpacing: 0.5 }}>📝 Verdict</div>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: 18, fontSize: 16, color: '#222' }}>
                  {/* Colorize major headings in the verdict answer */}
                  {factResult.answer.split(/(\d+\.[^\n]*:|\*\*[^\*]+\*\*|Factual Verification:|Motivation & Benefit Analysis:|Intent & Framing:|Sentiment & Tone:|Final Verdict:|Resource List:|Evidence Sources:|Evidence:)/g).map((part, idx) => {
                    // Headings to colorize
                    const headingStyles = {
                      'Factual Verification:': { color: '#1976d2', fontWeight: 700, fontSize: 17 },
                      'Motivation & Benefit Analysis:': { color: '#c62828', fontWeight: 700, fontSize: 17 },
                      'Intent & Framing:': { color: '#6a1b9a', fontWeight: 700, fontSize: 17 },
                      'Sentiment & Tone:': { color: '#00897b', fontWeight: 700, fontSize: 17 },
                      'Final Verdict:': { color: '#f9a825', fontWeight: 700, fontSize: 17 },
                      'Resource List:': { color: '#388e3c', fontWeight: 700, fontSize: 17 },
                      'Evidence Sources:': { color: '#388e3c', fontWeight: 700, fontSize: 17 },
                      'Evidence:': { color: '#388e3c', fontWeight: 700, fontSize: 17 },
                    };
                    // Match **Heading**
                    const boldHeading = part.match(/^\*\*([^\*]+)\*\*$/);
                    if (boldHeading) {
                      // Try to match known headings
                      const h = boldHeading[1].replace(/\.$/, '');
                      const style = headingStyles[h + ':'] || { color: '#1976d2', fontWeight: 700, fontSize: 17 };
                      return <div key={idx} style={{ ...style, marginTop: 10 }}>{boldHeading[1]}</div>;
                    }
                    // Match numbered headings (e.g., 1. Factual Verification:)
                    const numberedHeading = part.match(/^(\d+)\.\s*([^\n]+:)/);
                    if (numberedHeading) {
                      const style = headingStyles[numberedHeading[2]] || { color: '#1976d2', fontWeight: 700, fontSize: 17 };
                      return <div key={idx} style={{ ...style, marginTop: 10 }}>{part.trim()}</div>;
                    }
                    // Match known headings
                    if (headingStyles[part]) {
                      return <div key={idx} style={{ ...headingStyles[part], marginTop: 10 }}>{part.trim()}</div>;
                    }
                    // Detect and render URLs as clickable colored links
                    // This will match lines that look like: '1. https://example.com' or just 'https://example.com'
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    if (urlRegex.test(part)) {
                      // Split by URLs and render each as a link
                      const split = part.split(urlRegex);
                      return split.map((frag, i) => {
                        if (urlRegex.test(frag)) {
                          return <a key={i} href={frag.startsWith('http') ? frag : 'https://' + frag} target="_blank" rel="noopener noreferrer" style={{ color: '#1565c0', fontWeight: 600, textDecoration: 'underline', wordBreak: 'break-all', marginRight: 4 }}>{frag}</a>;
                        }
                        return <span key={i}>{frag}</span>;
                      });
                    }
                    // Default: normal text
                    return <span key={idx}>{part}</span>;
                  })}
                </div>
                {factResult.evidence && factResult.evidence.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, color: '#388e3c', fontSize: 17, marginBottom: 6 }}>🔗 Evidence Sources</div>
                    <ol style={{ marginTop: 4, paddingLeft: 18 }}>
                      {factResult.evidence.map((r, i) => (
                        <li key={i} style={{ marginBottom: 10, background: '#e3f2fd', borderRadius: 5, padding: '8px 10px', boxShadow: '0 1px 3px #e0e7ef33' }}>
                          <div style={{ fontWeight: 500, color: '#1565c0' }}><a href={r.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1565c0', textDecoration: 'underline' }}>{r.title}</a></div>
                          <div style={{ fontSize: '0.97em', color: '#333', marginTop: 2 }}>{r.snippet}</div>
                          {r.excerpt && <div style={{ fontSize: '0.96em', color: '#607d8b', marginTop: 4, fontStyle: 'italic' }}>Excerpt: {r.excerpt}</div>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 