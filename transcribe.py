import sys, json
import whisper

if len(sys.argv) < 2:
    print(json.dumps({"error": "No file provided"}))
    sys.exit(1)

video_path = sys.argv[1]
model = whisper.load_model("base")
result = model.transcribe(video_path)

# Output JSON so Node can parse it
print(json.dumps({"transcript": result["text"]})) 