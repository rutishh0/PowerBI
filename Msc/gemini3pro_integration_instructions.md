# Gemini 3 Pro Integration — Complete Instructions

## Context & Goal

You are working on a **Rolls-Royce Civil Aerospace SOA Dashboard** — a Flask + Vanilla JS web application that lets users upload financial Excel files, view interactive charts, and chat with an AI assistant grounded in the uploaded data.

The app already supports multiple AI providers routed through a dispatcher in `ai_chat.py`:
- **OpenRouter** (Qwen 3 VL) — default
- **DigitalOcean** (GPT-oss-120b) — prefix `digitalocean/`
- **NVIDIA** (Kimi K2.5) — prefix `nvidia/`
- **Google Vertex AI** (GLM-5) — prefix `google/` (already uses service account auth)

**Your task:** Add **Gemini 3 Pro** (`gemini-3-pro-preview`) via the **Google Vertex AI native `generateContent` API** as a new model option. It must support **full multimodal file uploads** — images, PDFs, Excel, Word docs, PowerPoints — matching the functionality of gemini.google.com.

---

## PART 1: Understanding the Existing Architecture

### 1A. File Upload Flow (Current)
```
User drops file → app.js → POST /api/upload (Base64 JSON) → server.py
  → server.py detects file type:
       .xlsx/.xls  → parser.py → parsed data stored in _parsed_store[sid]
       .pdf        → pypdf text extraction → stored as {type: "pdf", text: ..., file_bytes: ...}
       .docx       → python-docx text extraction → stored as {type: "docx", text: ..., file_bytes: ...}
       .png/.jpg   → base64 encoded → stored as {type: "image", base64: ..., mime: ..., file_bytes: ...}
```

### 1B. Chat Flow (Current)
```
User sends message → POST /api/chat {message, model} → server.py
  → Builds serialized_data from _parsed_store
  → For images: collects as OpenAI-format image_url objects
  → Calls build_system_prompt(serialized_data) → big text prompt with all data
  → Calls call_openrouter(history, system_prompt, model)
      → Router checks prefix:
           "digitalocean/" → call_digitalocean()
           "nvidia/"       → call_nvidia()
           "google/"       → call_google_glm()  [currently GLM-5 only]
           default         → OpenRouter API
```

### 1C. Key Files to Modify
| File | What to change |
|------|----------------|
| `ai_chat.py` | Add `call_gemini3pro()` function, update router in `call_openrouter()` |
| `server.py` | Add `.pptx` upload support, store `file_bytes` for ALL file types, pass file attachments to Gemini |
| Frontend JS (model selector) | Add Gemini 3 Pro as a dropdown option |

---

## PART 2: Gemini 3 Pro API Specification

### 2A. Model Details
- **Model ID**: `gemini-3-pro-preview`
- **Inputs**: Text, code, images, audio, video, PDF
- **Outputs**: Text
- **Max Input Tokens**: 1,048,576 (1M)
- **Max Output Tokens**: 65,536
- **Knowledge Cutoff**: January 2025
- **Supports**: System instructions, function calling, thinking, grounding with Google Search
- **New Feature**: `thinkingLevel` parameter (LOW or HIGH) to control reasoning depth
- **New Feature**: `mediaResolution` (LOW, MEDIUM, HIGH) to control token usage for media

### 2B. API Endpoint (Vertex AI Native — NOT OpenAI-compatible)
```
POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{REGION}/publishers/google/models/gemini-3-pro-preview:generateContent
```

**Important**: This is NOT the OpenAI-compatible endpoint you used for GLM-5. Gemini 3 Pro uses Google's native `generateContent` format which is **completely different** from the OpenAI chat/completions format.

### 2C. Authentication
Same as your existing GLM-5 setup — use the Google Service Account credentials:
```python
import google.auth
import google.auth.transport.requests
from google.oauth2 import service_account

# From env var (Render.com) or local file
credentials = service_account.Credentials.from_service_account_info(
    creds_dict,
    scopes=["https://www.googleapis.com/auth/cloud-platform"]
)
auth_req = google.auth.transport.requests.Request()
credentials.refresh(auth_req)
token = credentials.token
```

### 2D. Request Body Structure (Native Vertex AI Format)
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {"text": "Analyze this document"},
        {
          "inlineData": {
            "mimeType": "application/pdf",
            "data": "<base64-encoded-bytes>"
          }
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {"text": "The document shows..."}
      ]
    },
    {
      "role": "user",
      "parts": [
        {"text": "What about the totals?"}
      ]
    }
  ],
  "systemInstruction": {
    "parts": [
      {"text": "You are a professional financial data analyst..."}
    ]
  },
  "generationConfig": {
    "temperature": 0.3,
    "maxOutputTokens": 16384,
    "topP": 0.9,
    "topK": 64
  },
  "thinkingConfig": {
    "thinkingLevel": "LOW"
  },
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
      "threshold": "BLOCK_ONLY_HIGH"
    },
    {
      "category": "HARM_CATEGORY_HARASSMENT",
      "threshold": "BLOCK_ONLY_HIGH"
    },
    {
      "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "threshold": "BLOCK_ONLY_HIGH"
    },
    {
      "category": "HARM_CATEGORY_HATE_SPEECH",
      "threshold": "BLOCK_ONLY_HIGH"
    }
  ]
}
```

### 2E. Response Body Structure
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {"text": "The analysis shows..."}
        ]
      },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 1234,
    "candidatesTokenCount": 567,
    "totalTokenCount": 1801
  }
}
```

### 2F. Critical Differences from OpenAI Format
| Aspect | OpenAI Format (GLM-5, OpenRouter) | Vertex AI Native (Gemini 3 Pro) |
|--------|-----------------------------------|--------------------------------|
| Roles | `system`, `user`, `assistant` | `user`, `model` (system goes in `systemInstruction`) |
| System prompt | In messages array as role "system" | Separate `systemInstruction` field |
| Content | `"content": "string"` | `"parts": [{"text": "string"}]` |
| Images | `image_url` with data URI | `inlineData` with `mimeType` + `data` (raw base64, no data URI prefix) |
| Files (PDF/etc) | Not natively supported | `inlineData` with `mimeType` + `data` |
| Response text | `choices[0].message.content` | `candidates[0].content.parts[0].text` |
| Max tokens param | `max_tokens` | `maxOutputTokens` (inside `generationConfig`) |

### 2G. Supported File MIME Types for `inlineData`
| File Type | MIME Type | Max Size (inline) | Notes |
|-----------|-----------|-------------------|-------|
| PNG | `image/png` | 7 MB | Up to 100 images per prompt |
| JPEG | `image/jpeg` | 7 MB | |
| WebP | `image/webp` | 7 MB | |
| HEIC | `image/heic` | 7 MB | |
| PDF | `application/pdf` | 7 MB (inline), 50 MB (GCS) | Up to 100 pages, 100 files |
| Plain Text | `text/plain` | 7 MB | |

**Files NOT directly supported by inlineData** (must be converted first):
| File Type | Strategy |
|-----------|----------|
| `.xlsx` / `.xls` | Convert to text/CSV representation OR keep existing parser approach (text in system prompt) |
| `.docx` | Extract text with python-docx, send as text part |
| `.pptx` | Extract text with python-pptx OR convert to PDF with LibreOffice, send PDF as inlineData |

---

## PART 3: Implementation — `ai_chat.py` Changes

### 3A. Add the `call_gemini3pro()` Function

Add this new function to `ai_chat.py`. Place it after the existing `call_google_glm()` function:

```python
def call_gemini3pro(messages: list, system_prompt: str, model: str, file_attachments: list = None) -> dict:
    """
    Call Google Vertex AI Gemini 3 Pro using the NATIVE generateContent API.
    
    This is NOT the OpenAI-compatible endpoint. Gemini 3 Pro uses Google's native
    format which supports multimodal inputs (images, PDFs, etc.) natively.
    
    Args:
        messages: List of chat messages [{"role": "user"/"assistant", "content": ...}]
        system_prompt: The grounded system prompt with all SOA data
        model: Model identifier (unused — hardcoded to gemini-3-pro-preview)
        file_attachments: List of dicts with file data for Gemini's native multimodal:
            [{"mime_type": "application/pdf", "base64": "...", "filename": "report.pdf"}, ...]
    
    Returns:
        dict with 'content', 'charts', 'emails', 'error'
    """
    import google.auth
    import google.auth.transport.requests
    from google.oauth2 import service_account
    import os

    # ─── Step 1: Authenticate (same as GLM-5) ───
    try:
        env_creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        
        if env_creds_json:
            print("[Gemini-3-Pro] Using credentials from environment variable.")
            creds_dict = json.loads(env_creds_json)
            credentials = service_account.Credentials.from_service_account_info(
                creds_dict,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        else:
            print("[Gemini-3-Pro] Using local credentials file.")
            key_path = "notional-analog-486611-t3-459586a9ad37.json"
            credentials = service_account.Credentials.from_service_account_file(
                key_path,
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )

        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        token = credentials.token
    except Exception as e:
        return {"content": None, "error": f"Google Auth error: {str(e)}"}

    # ─── Step 2: Build the Vertex AI Native Request ───
    project_id = "notional-analog-486611-t3"  # Same as GLM-5
    region = "us-central1"  # Gemini 3 Pro is available globally, but us-central1 is reliable
    
    endpoint_url = (
        f"https://{region}-aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{region}/publishers/google/models/gemini-3-pro-preview:generateContent"
    )

    # ─── Step 3: Convert Messages from OpenAI format to Vertex AI Native format ───
    # 
    # OpenAI format:  {"role": "user"/"assistant", "content": "text" or [...multimodal...]}
    # Vertex format:  {"role": "user"/"model", "parts": [{"text": "..."}, {"inlineData": {...}}]}
    
    vertex_contents = []
    
    for msg in messages[-MAX_HISTORY_MESSAGES:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        # Map OpenAI roles to Vertex AI roles
        vertex_role = "model" if role == "assistant" else "user"
        
        parts = []
        
        if isinstance(content, str):
            # Simple text message
            if content.strip():
                parts.append({"text": content})
        elif isinstance(content, list):
            # Multimodal message (list of content items from OpenAI format)
            for item in content:
                if item.get("type") == "text":
                    text_val = item.get("text", "")
                    if text_val.strip():
                        parts.append({"text": text_val})
                elif item.get("type") == "image_url":
                    # Convert OpenAI image_url format to Vertex inlineData format
                    url = item.get("image_url", {}).get("url", "")
                    if url.startswith("data:"):
                        # Parse "data:image/png;base64,xxxxx"
                        try:
                            header, b64data = url.split(",", 1)
                            mime_type = header.split(":")[1].split(";")[0]
                            parts.append({
                                "inlineData": {
                                    "mimeType": mime_type,
                                    "data": b64data
                                }
                            })
                        except (ValueError, IndexError):
                            pass  # Skip malformed data URIs
        
        if parts:
            vertex_contents.append({"role": vertex_role, "parts": parts})
    
    # ─── Step 4: Attach files natively (PDFs, images, etc.) to the FIRST user message ───
    # 
    # Strategy: Attach file inlineData to the first user message in the conversation.
    # If the user just uploaded files and asks a question, the files should be
    # part of that question's context.
    #
    # For subsequent messages in the conversation, files are already in context
    # via the system prompt text. But for Gemini's NATIVE multimodal understanding
    # (e.g., seeing charts in images, reading PDF layouts), we attach the raw files.
    
    if file_attachments:
        # Find the last user message and attach files to it
        last_user_idx = None
        for i in range(len(vertex_contents) - 1, -1, -1):
            if vertex_contents[i]["role"] == "user":
                last_user_idx = i
                break
        
        if last_user_idx is not None:
            for attachment in file_attachments:
                mime = attachment.get("mime_type", "")
                b64 = attachment.get("base64", "")
                fname = attachment.get("filename", "unknown")
                
                if not b64 or not mime:
                    continue
                
                # Check size limit: 7MB for inline data (base64 is ~33% larger than raw)
                raw_size_approx = len(b64) * 3 / 4
                if raw_size_approx > 7 * 1024 * 1024:
                    print(f"[Gemini-3-Pro] Skipping {fname} — exceeds 7MB inline limit ({raw_size_approx/(1024*1024):.1f}MB)")
                    continue
                
                vertex_contents[last_user_idx]["parts"].insert(0, {
                    "inlineData": {
                        "mimeType": mime,
                        "data": b64
                    }
                })
                print(f"[Gemini-3-Pro] Attached file: {fname} ({mime}, {raw_size_approx/(1024*1024):.1f}MB)")
    
    # ─── Step 5: Ensure valid alternating roles ───
    # Vertex AI requires strictly alternating user/model turns.
    # Merge consecutive same-role messages.
    merged_contents = []
    for entry in vertex_contents:
        if merged_contents and merged_contents[-1]["role"] == entry["role"]:
            # Merge parts into the previous entry
            merged_contents[-1]["parts"].extend(entry["parts"])
        else:
            merged_contents.append(entry)
    
    # Ensure conversation starts with "user" (Vertex requirement)
    if merged_contents and merged_contents[0]["role"] == "model":
        merged_contents.insert(0, {"role": "user", "parts": [{"text": "(conversation start)"}]})
    
    # ─── Step 6: Build the full payload ───
    payload = {
        "contents": merged_contents,
        "systemInstruction": {
            "parts": [
                {"text": system_prompt}
            ]
        },
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.9,
            "topK": 64,
            "maxOutputTokens": 16384,
        },
        "thinkingConfig": {
            "thinkingLevel": "LOW"  # LOW for speed on financial data; change to HIGH for complex analysis
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
        ]
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # ─── Step 7: Send Request with Retry Logic ───
    print(f"[Gemini-3-Pro] Sending request to Vertex AI ({len(merged_contents)} turns, system prompt: {len(system_prompt)} chars)")
    
    import time
    max_retries = 3
    response = None

    for attempt in range(max_retries):
        try:
            response = requests.post(
                endpoint_url,
                headers=headers,
                json=payload,
                timeout=180  # Gemini 3 Pro with thinking can take longer
            )
            print(f"[Gemini-3-Pro] Response: {response.status_code}")

            if response.status_code == 200:
                break

            if response.status_code in [429, 503]:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 3
                    print(f"[Gemini-3-Pro] Rate limited/busy ({response.status_code}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue

            # Log the error details
            error_text = response.text[:500]
            print(f"[Gemini-3-Pro] Error response: {error_text}")
            return {"content": None, "error": f"Gemini 3 Pro error ({response.status_code}): {error_text}"}

        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                print(f"[Gemini-3-Pro] Timeout on attempt {attempt+1}, retrying...")
                time.sleep(2)
                continue
            return {"content": None, "error": "Gemini 3 Pro request timed out after 180s."}
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            return {"content": None, "error": f"Gemini 3 Pro exception: {str(e)}"}

    if not response:
        return {"content": None, "error": "Gemini 3 Pro: No response received"}

    # ─── Step 8: Parse the Vertex AI Native Response ───
    try:
        data = response.json()
        
        # Check for blocked response
        candidates = data.get("candidates", [])
        if not candidates:
            block_reason = data.get("promptFeedback", {}).get("blockReason", "Unknown")
            return {"content": None, "error": f"Gemini 3 Pro blocked the response. Reason: {block_reason}"}
        
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason", "")
        
        if finish_reason == "SAFETY":
            return {"content": None, "error": "Gemini 3 Pro blocked this response due to safety filters."}
        
        # Extract text from parts (skip thinking parts)
        content_parts = candidate.get("content", {}).get("parts", [])
        text_parts = []
        for part in content_parts:
            # Skip thinking/reasoning parts (they have "thought": true)
            if part.get("thought"):
                continue
            if "text" in part:
                text_parts.append(part["text"])
        
        final_text = "\n".join(text_parts)

        if not final_text:
            return {"content": None, "error": "Empty response from Gemini 3 Pro"}

        # Log token usage
        usage = data.get("usageMetadata", {})
        print(f"[Gemini-3-Pro] Tokens — prompt: {usage.get('promptTokenCount', '?')}, "
              f"response: {usage.get('candidatesTokenCount', '?')}, "
              f"total: {usage.get('totalTokenCount', '?')}")

        return parse_ai_response(final_text)

    except Exception as e:
        print(f"[Gemini-3-Pro] Response parse error: {e}")
        return {"content": None, "error": f"Gemini 3 Pro response parse error: {str(e)}"}
```

### 3B. Update the Router in `call_openrouter()`

In `ai_chat.py`, modify the `call_openrouter()` function to add a new route for Gemini 3 Pro. Find these lines at the top of the function:

```python
def call_openrouter(messages: list, system_prompt: str, model: str = None) -> dict:
    if model and model.startswith("digitalocean/"):
        return call_digitalocean(messages, system_prompt, model.replace("digitalocean/", ""))

    if model and model.startswith("nvidia/"):
        return call_nvidia(messages, system_prompt, model.replace("nvidia/", ""))

    if model and model.startswith("google/"):
        return call_google_glm(messages, system_prompt, model.replace("google/", ""))
```

**Change it to:**

```python
def call_openrouter(messages: list, system_prompt: str, model: str = None, file_attachments: list = None) -> dict:
    if model and model.startswith("digitalocean/"):
        return call_digitalocean(messages, system_prompt, model.replace("digitalocean/", ""))

    if model and model.startswith("nvidia/"):
        return call_nvidia(messages, system_prompt, model.replace("nvidia/", ""))

    if model and model.startswith("gemini/"):
        return call_gemini3pro(messages, system_prompt, model.replace("gemini/", ""), file_attachments=file_attachments)

    if model and model.startswith("google/"):
        return call_google_glm(messages, system_prompt, model.replace("google/", ""))
```

**Key point:** Use a NEW prefix `gemini/` (not `google/`) so it doesn't conflict with the existing GLM-5 route. The model ID sent from the frontend will be `gemini/gemini-3-pro-preview`.

### 3C. Update the `call_openrouter` Signature

Since `call_openrouter` now accepts `file_attachments`, make sure the default is `None` and the parameter is simply passed through. All existing callers that don't pass it will still work.

---

## PART 4: Implementation — `server.py` Changes

### 4A. Add PowerPoint Upload Support

In `server.py`, inside the `upload_files()` function, add a new handler block for `.pptx` files. Add this AFTER the `.docx` handler and BEFORE the `.png/.jpg/.jpeg` handler:

```python
# ─── POWERPOINT ───
elif lower_fname.endswith(".pptx"):
    try:
        from pptx import Presentation
        file_bytes = f["bytes"]
        buf = io.BytesIO(file_bytes)
        prs = Presentation(buf)
        
        text_parts = []
        for slide_num, slide in enumerate(prs.slides, 1):
            slide_texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        para_text = paragraph.text.strip()
                        if para_text:
                            slide_texts.append(para_text)
                if shape.has_table:
                    table = shape.table
                    for row in table.rows:
                        row_text = " | ".join(cell.text.strip() for cell in row.cells)
                        if row_text.strip(" |"):
                            slide_texts.append(row_text)
            if slide_texts:
                text_parts.append(f"[Slide {slide_num}]\n" + "\n".join(slide_texts))
        
        text = "\n\n".join(text_parts)
        
        if sid not in _parsed_store:
            _parsed_store[sid] = {}
        _parsed_store[sid][fname] = {
            "type": "pptx",
            "text": text,
            "file_bytes": file_bytes
        }
        results[fname] = {"text_preview": text[:200] + "..."}
    except Exception as e:
        errors.append({"file": fname, "error": f"PPTX Error: {str(e)}"})
```

Also update the image handler to accept more formats:
```python
# ─── IMAGES ───
elif lower_fname.endswith((".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".gif")):
```

### 4B. Modify the `/api/chat` Endpoint to Pass File Attachments

This is the most critical change. The chat endpoint needs to collect raw file bytes for Gemini 3 Pro's native multimodal processing, in ADDITION to the text-based system prompt.

**Replace the entire `/api/chat` route** with this updated version:

```python
@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    """Handle AI chat messages."""
    sid = _get_session_id()
    stored = _parsed_store.get(sid, {})

    if not stored:
        return jsonify({"error": "No data available. Please upload files first."}), 400

    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    model_choice = data.get("model", None)

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Build serialized data dict for system prompt
    serialized_data = {}
    images_to_attach = []           # For OpenAI-format models (Qwen etc.)
    gemini_file_attachments = []    # For Gemini 3 Pro native multimodal

    for fname, fstore in stored.items():
        ftype = fstore.get("type", "excel")
        
        if ftype in ["pdf", "docx", "pptx"]:
            serialized_data[fname] = {"type": ftype, "text": fstore.get("text")}
            
            # For Gemini: attach the raw PDF natively (Gemini can read PDFs directly)
            if ftype == "pdf" and fstore.get("file_bytes"):
                gemini_file_attachments.append({
                    "mime_type": "application/pdf",
                    "base64": base64.b64encode(fstore["file_bytes"]).decode("utf-8"),
                    "filename": fname
                })
            # For DOCX/PPTX: Gemini doesn't support these natively via inlineData,
            # so we rely on the text extraction in the system prompt (already handled above).
            # Optionally, you could convert DOCX/PPTX to PDF with LibreOffice and attach that.
            
        elif ftype == "image":
            serialized_data[fname] = {"type": "image"}
            # OpenAI-format image for non-Gemini models
            images_to_attach.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{fstore['mime']};base64,{fstore['base64']}"
                }
            })
            # Gemini-native image attachment
            gemini_file_attachments.append({
                "mime_type": fstore["mime"],
                "base64": fstore["base64"],
                "filename": fname
            })
        else:
            # Excel — use the parsed data in system prompt (text-based)
            serialized_data[fname] = serialize_parsed_data(fstore["parsed"])
            
            # For Gemini: ALSO attach the raw Excel as a reference
            # Note: Gemini doesn't support .xlsx via inlineData, but we already
            # have all the data in the system prompt. The text representation
            # is actually MORE reliable for financial data than hoping Gemini
            # reads the Excel correctly. So we skip attaching raw Excel.

    system_prompt = build_system_prompt(serialized_data)

    # Get/create chat history for this session
    if sid not in _chat_history:
        _chat_history[sid] = []

    # Construct User Message (Text + Images for OpenAI-format models)
    user_content = []
    if user_message:
        user_content.append({"type": "text", "text": user_message})
    user_content.extend(images_to_attach)

    # Add user message to history
    _chat_history[sid].append({"role": "user", "content": user_content})

    # Call AI — pass file_attachments for Gemini models
    result = call_openrouter(
        _chat_history[sid],
        system_prompt,
        model=model_choice,
        file_attachments=gemini_file_attachments if model_choice and model_choice.startswith("gemini/") else None
    )

    if result.get("error"):
        _chat_history[sid].pop()
        return jsonify({"error": result["error"]}), 502

    # Add assistant response to history
    _chat_history[sid].append({"role": "assistant", "content": result.get("content", "")})

    return jsonify({
        "content": result.get("content", ""),
        "charts": result.get("charts", []),
        "emails": result.get("emails", []),
    })
```

### 4C. Add `python-pptx` to `requirements.txt`

```
python-pptx>=0.6.23
```

Also ensure you have:
```
google-auth>=2.20.0
google-auth-oauthlib>=1.0.0
```

---

## PART 5: Implementation — Frontend Changes

### 5A. Add Gemini 3 Pro to the Model Selector Dropdown

In whatever frontend file contains the model selector (likely `ai-chat.js` or `app.js` or `index.html`), find the model dropdown options and add:

```html
<option value="gemini/gemini-3-pro-preview">Gemini 3 Pro (Google)</option>
```

Or if it's built in JavaScript:
```javascript
{ id: "gemini/gemini-3-pro-preview", name: "Gemini 3 Pro (Google)" }
```

### 5B. Update the Secret Admin Chat Model List

In `secret-chat.js`, add Gemini 3 Pro to the available models:
```javascript
{ id: "gemini/gemini-3-pro-preview", name: "Gemini 3 Pro" }
```

### 5C. Update the Model Comparison Feature

In `server.py`, in the `/api/compare` endpoint, add Gemini 3 Pro to the comparison list:
```python
models = [
    {"id": "qwen/qwen3-vl-235b-a22b-thinking", "name": "Qwen 3 VL (OpenRouter)"},
    {"id": "digitalocean/openai-gpt-oss-120b", "name": "GPT 120b (DigitalOcean)"},
    {"id": "nvidia/moonshotai/kimi-k2.5", "name": "Kimi K2.5 (NVIDIA)"},
    {"id": "gemini/gemini-3-pro-preview", "name": "Gemini 3 Pro (Google)"},
]
```

Note: The compare endpoint also needs to accept and pass `file_attachments`. Update `fetch_model_response` inside the compare endpoint:
```python
def fetch_model_response(model_info):
    start_t = time.time()
    m_id = model_info["id"]
    m_name = model_info["name"]
    temp_history = [{"role": "user", "content": user_message}]
    
    try:
        # Pass file attachments for Gemini models
        fa = gemini_file_attachments if m_id.startswith("gemini/") else None
        resp = call_openrouter(temp_history, system_prompt, model=m_id, file_attachments=fa)
        duration = time.time() - start_t
        
        return {
            "model_id": m_id,
            "model_name": m_name,
            "content": resp.get("content", ""),
            "error": resp.get("error"),
            "time": f"{duration:.2f}s"
        }
    except Exception as e:
        return {
            "model_id": m_id,
            "model_name": m_name,
            "content": None,
            "error": str(e),
            "time": f"{time.time() - start_t:.2f}s"
        }
```

And build `gemini_file_attachments` the same way as in the `/api/chat` endpoint, before the comparison loop.

### 5D. Frontend File Upload — Accept More File Types

In `app.js` (or wherever the file upload validation occurs), update the accepted extensions to include `.pptx`:
```javascript
// Find the validation check and update it:
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp'];
```

Also update any drag-and-drop or file input `accept` attributes:
```html
<input type="file" accept=".xlsx,.xls,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp" multiple>
```

---

## PART 6: Google Cloud Setup Requirements

### 6A. Enable the Vertex AI API
The project `notional-analog-486611-t3` already has Vertex AI enabled (since GLM-5 works). But verify that the Gemini API is accessible:

1. Go to Google Cloud Console → APIs & Services → Enabled APIs
2. Ensure **Vertex AI API** is enabled
3. The service account must have the role: `roles/aiplatform.user`

### 6B. Region Selection
Gemini 3 Pro is available globally. The endpoint URL uses `us-central1` in the implementation above. If you get region errors, try:
- `us-central1`
- `europe-west1` 
- `asia-southeast1`

### 6C. Quotas
Check your Vertex AI quotas for the Gemini 3 Pro model. The model is in **Public Preview**, so quotas may be limited. Go to:
- Google Cloud Console → IAM & Admin → Quotas
- Filter for "Gemini" or "aiplatform"

---

## PART 7: Testing Checklist

After implementation, test these scenarios in order:

### Text-only
- [ ] Upload an Excel SOA file → Select Gemini 3 Pro → Ask "What is the total overdue amount?"
- [ ] Follow-up question: "Which invoices are older than 90 days?"
- [ ] Ask for an email: "Draft a collection email for this customer"
- [ ] Ask for a chart: "Show me the aging breakdown as a bar chart"

### Multimodal — Images
- [ ] Upload a screenshot/photo → Select Gemini 3 Pro → Ask "What do you see in this image?"
- [ ] Upload Excel + Image → Ask a question about the Excel data (should still work via system prompt)

### Multimodal — PDF
- [ ] Upload a PDF document → Select Gemini 3 Pro → Ask "Summarize this document"
- [ ] Upload a PDF with tables → Ask "What are the key figures in this PDF?"

### Multimodal — PowerPoint (new)
- [ ] Upload a .pptx file → Ask "What is this presentation about?"
- [ ] Upload a .pptx file → Ask "Summarize slide 3"

### Multimodal — Word Doc
- [ ] Upload a .docx file → Ask "Summarize this document"

### Edge Cases
- [ ] Large file (>7MB PDF) — should gracefully skip with warning in logs, fall back to text extraction
- [ ] No files uploaded → Error message "No data available"
- [ ] Model comparison with Gemini 3 Pro included
- [ ] Chat history works correctly across multiple turns
- [ ] Clear chat and re-ask — should work

### Error Handling
- [ ] Invalid credentials — should show "Google Auth error"
- [ ] Rate limited — should retry up to 3 times
- [ ] Safety filter triggered — should show user-friendly message

---

## PART 8: Summary of All Changes

| File | Changes |
|------|---------|
| `ai_chat.py` | 1. Add `call_gemini3pro()` function (~150 lines). 2. Update `call_openrouter()` signature to accept `file_attachments`. 3. Add `gemini/` prefix routing before `google/` routing. |
| `server.py` | 1. Add `.pptx` upload handler in `upload_files()`. 2. Update `/api/chat` to build `gemini_file_attachments` list and pass to `call_openrouter()`. 3. Update `/api/compare` similarly. 4. Expand image extensions. |
| `requirements.txt` | Add `python-pptx>=0.6.23` |
| Frontend JS | 1. Add `gemini/gemini-3-pro-preview` to model selector. 2. Add `.pptx` to allowed upload extensions. |
| `templates/index.html` | Update file input `accept` attribute if hardcoded. |

### Model ID for Frontend
The model ID to send from the frontend is: **`gemini/gemini-3-pro-preview`**

This gets routed by `call_openrouter()` → strips `gemini/` prefix → passes `gemini-3-pro-preview` to `call_gemini3pro()` → but the actual model name in the Vertex AI URL is hardcoded as `gemini-3-pro-preview`.

---

## PART 9: Optional Enhancements

### 9A. DOCX/PPTX → PDF Conversion for Native Gemini Processing
Instead of just extracting text from Word/PowerPoint, you could convert them to PDF using LibreOffice (available on Linux servers) and then send the PDF to Gemini natively. This preserves formatting, images, and layout.

```python
import subprocess
import tempfile

def convert_to_pdf(file_bytes: bytes, source_ext: str) -> bytes:
    """Convert DOCX/PPTX to PDF using LibreOffice."""
    with tempfile.NamedTemporaryFile(suffix=source_ext, delete=False) as tmp_in:
        tmp_in.write(file_bytes)
        tmp_in.flush()
        
        out_dir = tempfile.mkdtemp()
        subprocess.run([
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", out_dir, tmp_in.name
        ], timeout=30, check=True)
        
        pdf_path = os.path.join(out_dir, os.path.splitext(os.path.basename(tmp_in.name))[0] + ".pdf")
        with open(pdf_path, "rb") as pdf_file:
            return pdf_file.read()
```

Then for DOCX/PPTX, convert to PDF and add to `gemini_file_attachments`:
```python
if ftype in ["docx", "pptx"] and fstore.get("file_bytes"):
    try:
        pdf_bytes = convert_to_pdf(fstore["file_bytes"], ".docx" if ftype == "docx" else ".pptx")
        gemini_file_attachments.append({
            "mime_type": "application/pdf",
            "base64": base64.b64encode(pdf_bytes).decode("utf-8"),
            "filename": fname.rsplit(".", 1)[0] + ".pdf"
        })
    except Exception as e:
        print(f"[Gemini] DOCX/PPTX to PDF conversion failed for {fname}: {e}")
        # Fall back to text-only (already in system prompt)
```

### 9B. Streaming Support
For a better UX, you could use `streamGenerateContent` instead of `generateContent`. Change the endpoint URL:
```
.../gemini-3-pro-preview:streamGenerateContent?alt=sse
```
This returns Server-Sent Events that you can stream to the frontend. This is optional and requires frontend changes to handle SSE.

### 9C. Thinking Level Toggle
Add a frontend toggle that lets users switch between `LOW` and `HIGH` thinking levels:
- **LOW**: Fast, good for simple factual lookups ("what is the total?")
- **HIGH**: Slow but thorough, good for complex analysis ("compare all sections and identify anomalies")

Pass this as a parameter in the `/api/chat` request body and forward it to `call_gemini3pro()`.
