import os
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from google import genai
import time
from pypdf import PdfReader
import io
import json

# Initialize Flask with the current directory as the static folder for simplicity
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Persistent History Management
HISTORY_FILE = 'history.json'

def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            return json.load(f)
    return []

def save_to_history(query, response):
    history = load_history()
    history.append({
        "id": int(time.time()),
        "query": query,
        "response": response,
        "date": time.strftime("%Y-%m-%d %H:%M")
    })
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history[-20:], f) # Keep last 20 for simplicity

# Simple global context for Document RAG (In production, use session-based storage)
document_context = ""
active_doc_name = ""

# Configure Gemini API
API_KEY = "AIzaSyDPTXXM6Iw7gHp1IoN3vrjWUHU9nO-tB08"
client = genai.Client(api_key=API_KEY)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/upload', methods=['POST'])
def upload():
    global document_context
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and file.filename.endswith('.pdf'):
        try:
            pdf_file = io.BytesIO(file.read())
            reader = PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            
            document_context = text
            active_doc_name = file.filename
            return jsonify({
                "status": "success", 
                "message": f"Successfully loaded: {file.filename}",
                "filename": file.filename
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    return jsonify({"error": "Only .pdf files are allowed"}), 400

@app.route('/clear-context', methods=['POST'])
def clear_context():
    global document_context, active_doc_name
    document_context = ""
    active_doc_name = ""
    return jsonify({"status": "success", "message": "Context cleared"})

@app.route('/history', methods=['GET'])
def get_history():
    return jsonify(load_history())

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_query = data.get('query', '')
    
    if not user_query:
        return jsonify({"error": "No query provided"}), 400

    def generate():
        global document_context
        try:
            # Simple RAG injection
            prompt = user_query
            if document_context:
                prompt = f"Using the following Document Context as your primary source of truth, please answer the user's query honestly and accurately.\n\n--- DOCUMENT CONTEXT ---\n{document_context[:20000]}\n--- END CONTEXT ---\n\nUSER QUERY: {user_query}"

            # Use streaming generation
            response_stream = client.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=prompt
            )
            
            res_text = ""
            for chunk in response_stream:
                if chunk.text:
                    res_text += chunk.text
                    yield chunk.text
            
            # Save to persistent history after full response
            if res_text:
                save_to_history(user_query, res_text)
                    
        except Exception as e:
            yield f"Error: {str(e)}"

    return Response(generate(), mimetype='text/plain')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
