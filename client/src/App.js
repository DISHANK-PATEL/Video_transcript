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
          <h3>Ask the Chatbot about this transcript</h3>
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
      )}
    </div>
  );
}

export default App; 