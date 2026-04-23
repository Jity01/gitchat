use serde::{Deserialize, Serialize};

const IMPORT_SYSTEM: &str = r#"You convert text copied from AI chat UIs (Claude.ai, ChatGPT, etc.) into structured JSON.

Your ENTIRE response is a single JSON object. First character `{`, last character `}`. No prose, no fences, no preamble, no apology.

Shape:
{"title":"<3-7 word title>","messages":[{"role":"user"|"assistant","content":"..."}]}

Rules:
- Preserve message order exactly.
- Preserve full message text including code. Escape quotes and backslashes correctly for JSON.
- Role mapping: "You said:", "You:", "User:", "Human:" → "user". "Claude", "Claude responded:", "Assistant", "ChatGPT", "GPT-4" → "assistant".
- Claude.ai web UI specifically duplicates each turn — first a preview snippet, then the full text. DEDUPLICATE: if consecutive lines repeat, keep only the longer full version.
- Claude.ai also inserts summary labels before each assistant response like "Identified X's core function" or "Weighed competing approaches" — DROP these entirely; they are not part of the conversation.
- Drop all UI chrome: "Apr 20", other timestamps, "Show more", "Copy", "Regenerate", "Claude is AI and can make mistakes...", "Share", "Edit message", thumbs labels, avatars, footers, nav.
- If processing a chunk of a larger paste: only extract what's literally in the fragment. Include partial first/last messages as-is; a downstream step will merge them.
- Never respond in prose. If a fragment is truly just ambient noise, return {"title":"imported chat","messages":[]}.
"#;

const PSEUDOCODE_SYSTEM: &str = r#"You rewrite source code as high-level structured pseudocode.

Rules:
1. Preserve the control flow and logic of the source.
2. Be substantially more succinct than the original — abstract away syntactic boilerplate (type annotations, trivial imports, visibility modifiers, unnecessary parentheses, decorators that are purely mechanical).
3. Use UPPERCASE keywords: FUNCTION, IF, ELSE, ELIF, FOR, WHILE, RETURN, CLASS, IMPORT, TRY, CATCH, THROW, AWAIT, ASYNC, CONST, LET, MATCH.
4. Use INDENTATION (2 spaces) to show block structure. No braces, no semicolons.
5. One logical step per line. Collapse trivial multi-line constructions into a single descriptive line.
6. Keep identifiers from the source (function names, variable names, key string literals) so the correspondence is clear.
7. Annotate non-obvious intent in a short parenthetical — but be terse.
8. If the file is config/data/markup (not program logic), respond with a 2–3 sentence description of what it contains instead of pseudocode.
9. Output ONLY the pseudocode block (or description) — no markdown fences, no preamble, no trailing commentary."#;

#[derive(Serialize)]
struct AnthropicReq<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<AnthropicMsg<'a>>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

#[derive(Serialize)]
struct AnthropicMsg<'a> {
    role: &'a str,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResp {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    ty: String,
    text: Option<String>,
}

#[tauri::command]
pub async fn pseudocode(
    path: String,
    content: String,
    language: String,
) -> Result<String, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        "ANTHROPIC_API_KEY is not set. Add it to gitchat/.env or export it in your shell before launching."
            .to_string()
    })?;

    if content.len() > 120_000 {
        return Err("file is too large for pseudocode generation (>120 KB).".into());
    }

    let user_prompt = format!(
        "Source path: {}\nLanguage: {}\n\nSource:\n{}",
        path, language, content
    );

    let body = AnthropicReq {
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: PSEUDOCODE_SYSTEM,
        messages: vec![AnthropicMsg {
            role: "user",
            content: user_prompt,
        }],
        stream: false,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("anthropic api error ({status}): {text}"));
    }

    let parsed: AnthropicResp = resp.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.ty == "text")
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("\n");

    if text.trim().is_empty() {
        return Err("model returned empty response".into());
    }

    Ok(text)
}

#[derive(Serialize, Deserialize)]
pub struct ImportedChat {
    pub title: String,
    pub messages: Vec<ImportedMessage>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ImportedMessage {
    pub role: String,
    pub content: String,
}

/// Import from user-pasted content. Claude's share pages and ChatGPT's share
/// pages both block server-side fetching, so we don't try — the user copies
/// the conversation from their browser and pastes it here for extraction.
///
/// For long pastes we split into line-aligned chunks (~60k chars each) and
/// run extraction per chunk, then dedupe adjacent same-role messages whose
/// contents overlap at a chunk boundary. This keeps each API call fast and
/// avoids the multi-minute single-shot generation time that was timing out
/// for large conversations.
#[tauri::command]
pub async fn import_pasted_chat(content: String) -> Result<ImportedChat, String> {
    let content = content.trim().to_string();
    let total = content.chars().count();
    if total < 20 {
        return Err("pasted content is empty or too short.".into());
    }

    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        "ANTHROPIC_API_KEY is not set. Add it to gitchat/.env or export it in your shell before launching."
            .to_string()
    })?;

    // Hard upper cap — anything larger gets truncated.
    const HARD_CAP: usize = 900_000;
    // Smaller chunks mean smaller expected output too, which keeps each call
    // well under max_tokens and cuts latency. Empirically (verified end-to-end
    // against the Anthropic API), 30k chars is the sweet spot for Sonnet.
    const SINGLE_SHOT_THRESHOLD: usize = 30_000;

    let body = if total > HARD_CAP {
        content.chars().take(HARD_CAP).collect::<String>()
    } else {
        content
    };

    if body.chars().count() <= SINGLE_SHOT_THRESHOLD {
        return extract_chunk(&api_key, &body, 1, 1).await;
    }

    let chunks = split_on_lines(&body, SINGLE_SHOT_THRESHOLD);
    let n = chunks.len();

    // Fire chunks in parallel, bounded. 3 is empirically a sweet spot on
    // residential networks — higher values start producing connection-reset
    // and timeout storms against Anthropic's CDN.
    const MAX_CONCURRENT: usize = 3;
    use futures::stream::{self, StreamExt};

    let results: Vec<Result<(usize, ImportedChat), String>> = stream::iter(
        chunks.into_iter().enumerate().map(|(i, chunk)| {
            let key = api_key.clone();
            async move {
                match extract_chunk(&key, &chunk, i + 1, n).await {
                    Ok(c) => Ok((i, c)),
                    Err(e) => Err(format!("chunk {}/{}: {}", i + 1, n, e)),
                }
            }
        }),
    )
    .buffer_unordered(MAX_CONCURRENT)
    .collect()
    .await;

    // Re-order by chunk index so the final message list follows source order.
    let mut ordered: Vec<Option<ImportedChat>> = (0..n).map(|_| None).collect();
    for r in results {
        let (i, c) = r?;
        ordered[i] = Some(c);
    }

    let mut all_msgs: Vec<ImportedMessage> = Vec::new();
    let mut title_from_first: Option<String> = None;
    for slot in ordered {
        if let Some(c) = slot {
            if title_from_first.is_none() && !c.title.trim().is_empty() {
                title_from_first = Some(c.title);
            }
            all_msgs.extend(c.messages);
        }
    }

    Ok(ImportedChat {
        title: title_from_first.unwrap_or_else(|| "imported chat".into()),
        messages: dedupe_messages(all_msgs),
    })
}

/// Split `content` into chunks of roughly `target_chars` characters each,
/// breaking only on line boundaries so we don't cut inside a message.
fn split_on_lines(content: &str, target_chars: usize) -> Vec<String> {
    let total = content.chars().count();
    if total <= target_chars {
        return vec![content.to_string()];
    }
    let num_chunks = (total + target_chars - 1) / target_chars;
    let per_chunk = total / num_chunks + 1;

    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in content.lines() {
        current.push_str(line);
        current.push('\n');
        if current.chars().count() >= per_chunk && chunks.len() + 1 < num_chunks {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.trim().is_empty() {
        chunks.push(current);
    }
    chunks
}

/// Run extraction on one chunk (or a whole small paste).
async fn extract_chunk(
    api_key: &str,
    chunk: &str,
    index: usize,
    total: usize,
) -> Result<ImportedChat, String> {
    let context_note = if total > 1 {
        format!(
            "(You are processing chunk {} of {}. Only extract messages that appear in THIS fragment. Do not invent or infer messages that would have been before or after it. If the fragment starts or ends mid-message, include that partial as-is — a later pass stitches them together.)\n\n",
            index, total
        )
    } else {
        String::new()
    };

    let user_prompt = format!(
        "{}The user has pasted the content of an AI conversation (copied from their browser). It may include page chrome or menu labels around the conversation — ignore those. Extract the conversation as specified.\n\nPasted content:\n{}",
        context_note, chunk
    );

    let body = AnthropicReq {
        model: "claude-sonnet-4-6",
        // Each 30k-char chunk produces at most ~12k tokens of JSON output.
        // Headroom to 16k avoids truncation that would yield invalid JSON.
        max_tokens: 16_000,
        system: IMPORT_SYSTEM,
        stream: true,
        messages: vec![AnthropicMsg {
            role: "user",
            content: user_prompt,
        }],
    };

    // Send with retries + exponential backoff. Flaky timeouts and rate-limit
    // responses are common on long parallel pastes; one bad lottery pick
    // shouldn't fail the whole import.
    let text = send_with_retry(api_key, &body, 3, index, total).await?;

    let out = match parse_imported_chat(&text) {
        Some(v) => v,
        None => {
            // Model returned prose, not JSON. Treat the whole chunk as an
            // assistant note so the user doesn't lose content — better than
            // erroring out the whole import. Other chunks may still parse.
            ImportedChat {
                title: "imported chat".into(),
                messages: vec![ImportedMessage {
                    role: "assistant".into(),
                    content: text.trim().to_string(),
                }],
            }
        }
    };

    let clean_messages: Vec<ImportedMessage> = out
        .messages
        .into_iter()
        .map(|m| ImportedMessage {
            role: if m.role == "user" || m.role == "assistant" {
                m.role
            } else {
                "assistant".into()
            },
            content: m.content,
        })
        .collect();

    Ok(ImportedChat {
        title: out.title,
        messages: clean_messages,
    })
}

/// After concatenating per-chunk results, merge adjacent same-role messages
/// whose contents exactly match or are a prefix/suffix of one another (the
/// typical footprint of a message that got split across a chunk boundary).
/// Send the request with retries. Errors are classified as:
///   - Retryable: send-error (timeout/dns/tls/reset), 408, 429, 500, 502, 503, 504
///   - Fatal: 4xx other than above
/// Backoff: 1s, then 3s, then 7s (jittered lightly).
async fn send_with_retry(
    api_key: &str,
    body: &AnthropicReq<'_>,
    max_attempts: u32,
    index: usize,
    total: usize,
) -> Result<String, String> {
    let mut last_err: String = String::new();
    for attempt in 1..=max_attempts {
        match try_once(api_key, body).await {
            Ok(text) => return Ok(text),
            Err((msg, retryable)) => {
                last_err = msg;
                if !retryable || attempt == max_attempts {
                    break;
                }
                let base = match attempt {
                    1 => 1000u64,
                    2 => 3000u64,
                    _ => 7000u64,
                };
                let jitter = (attempt as u64) * 137 % 500;
                let wait = base + jitter;
                eprintln!(
                    "[gitchat] chunk {}/{} attempt {} failed, retrying in {}ms: {}",
                    index, total, attempt, wait, last_err
                );
                tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
            }
        }
    }
    Err(last_err)
}

/// One attempt. Returns `(err_message, retryable?)` on failure.
async fn try_once(
    api_key: &str,
    body: &AnthropicReq<'_>,
) -> Result<String, (String, bool)> {
    // Streaming path: used for import chunks where total generation can take
    // longer than any reasonable total-timeout. Instead of capping the whole
    // request we cap *per-read* idleness — Anthropic sends ping events every
    // ~15s during generation, so a 90s gap means something's genuinely wrong.
    //
    // Non-streaming path: small replies (pseudocode, chat_send) — use a plain
    // total timeout.
    if body.stream {
        try_once_streaming(api_key, body).await
    } else {
        try_once_blocking(api_key, body).await
    }
}

async fn try_once_blocking(
    api_key: &str,
    body: &AnthropicReq<'_>,
) -> Result<String, (String, bool)> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err((e.to_string(), false)),
    };

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(body)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => return Err((format_err_chain("anthropic request failed", &e), true)),
    };

    let status = resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        let retryable = matches!(code, 408 | 425 | 429 | 500 | 502 | 503 | 504);
        let text = resp.text().await.unwrap_or_default();
        return Err((format!("anthropic api error ({status}): {text}"), retryable));
    }

    let parsed: AnthropicResp = match resp.json().await {
        Ok(p) => p,
        Err(e) => return Err((format!("could not parse response: {e}"), true)),
    };
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.ty == "text")
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");
    Ok(text)
}

async fn try_once_streaming(
    api_key: &str,
    body: &AnthropicReq<'_>,
) -> Result<String, (String, bool)> {
    use futures::StreamExt;

    // No total timeout — generation can legitimately run 2-3 minutes. Idle
    // detection is done per-chunk with tokio::time::timeout below.
    let client = match reqwest::Client::builder().build() {
        Ok(c) => c,
        Err(e) => return Err((e.to_string(), false)),
    };

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .json(body)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => return Err((format_err_chain("anthropic request failed", &e), true)),
    };

    let status = resp.status();
    if !status.is_success() {
        let code = status.as_u16();
        let retryable = matches!(code, 408 | 425 | 429 | 500 | 502 | 503 | 504);
        let text = resp.text().await.unwrap_or_default();
        return Err((format!("anthropic api error ({status}): {text}"), retryable));
    }

    // 90s idle timeout: if no bytes arrive for 90s we consider the stream hung.
    // (Anthropic sends pings every ~15s, so this is very conservative.)
    const IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);

    let stream = resp.bytes_stream();
    futures::pin_mut!(stream);
    let mut buf = String::new();
    let mut out = String::new();
    let mut saw_message_stop = false;

    loop {
        let next = tokio::time::timeout(IDLE_TIMEOUT, stream.next()).await;
        let chunk = match next {
            Err(_) => {
                return Err((
                    "anthropic stream idle for >90s; abandoning".into(),
                    true,
                ));
            }
            Ok(None) => break, // stream ended
            Ok(Some(Err(e))) => {
                return Err((
                    format_err_chain("anthropic stream chunk read failed", &e),
                    true,
                ));
            }
            Ok(Some(Ok(b))) => b,
        };

        // b is `bytes::Bytes`; decode incrementally.
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // Parse complete SSE events, separated by "\n\n".
        while let Some(sep) = buf.find("\n\n") {
            let event: String = buf.drain(..sep + 2).collect();
            for line in event.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    let v: serde_json::Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    match v["type"].as_str().unwrap_or("") {
                        "content_block_delta" => {
                            if let Some(t) = v["delta"]["text"].as_str() {
                                out.push_str(t);
                            }
                        }
                        "message_stop" => {
                            saw_message_stop = true;
                        }
                        "error" => {
                            let msg = v["error"]["message"]
                                .as_str()
                                .unwrap_or("unknown stream error");
                            return Err((
                                format!("anthropic stream error: {msg}"),
                                true,
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if out.is_empty() {
        let note = if saw_message_stop {
            "stream ended with message_stop but no text deltas"
        } else {
            "stream ended before message_stop"
        };
        return Err((note.into(), true));
    }
    Ok(out)
}

fn format_err_chain(prefix: &str, e: &impl std::error::Error) -> String {
    let mut out = format!("{prefix}: {e}");
    let mut src = e.source();
    while let Some(s) = src {
        out.push_str(&format!("\n  caused by: {s}"));
        src = s.source();
    }
    out
}

fn dedupe_messages(msgs: Vec<ImportedMessage>) -> Vec<ImportedMessage> {
    let mut out: Vec<ImportedMessage> = Vec::with_capacity(msgs.len());
    for m in msgs {
        // Decide based on a short-lived borrow, then mutate without it held.
        enum Action {
            Append,
            Skip,
            Replace,
        }
        let action = match out.last() {
            Some(last) if last.role == m.role => {
                let a = last.content.trim();
                let b = m.content.trim();
                if a == b {
                    Action::Skip
                } else if b.starts_with(a) {
                    Action::Replace
                } else if a.starts_with(b) {
                    Action::Skip
                } else {
                    Action::Append
                }
            }
            _ => Action::Append,
        };
        match action {
            Action::Append => out.push(m),
            Action::Skip => {} // drop the shorter duplicate
            Action::Replace => {
                out.pop();
                out.push(m);
            }
        }
    }
    out
}

#[derive(Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn chat_send(
    model: String,
    system: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("no messages to send".into());
    }

    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        "ANTHROPIC_API_KEY is not set. Add it to gitchat/.env or export it in your shell before launching."
            .to_string()
    })?;

    // Map UI model ids to actual Anthropic model identifiers.
    let api_model: &str = match model.as_str() {
        "opus" => "claude-opus-4-7",
        "sonnet" => "claude-sonnet-4-6",
        // "code" is handled out-of-band (it drives the Claude Code agent, not a
        // plain /v1/messages completion). Fall back to Sonnet for now so chats
        // mid-flight don't error out if someone switches to "code" without a
        // working directory. The code-mode path is wired separately.
        "code" => "claude-sonnet-4-6",
        other => {
            return Err(format!("unsupported model id: {other}"));
        }
    };

    // Sanitize roles: only "user" / "assistant" are valid for /v1/messages.
    let msgs: Vec<AnthropicMsg> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| AnthropicMsg {
            role: if m.role == "user" { "user" } else { "assistant" },
            content: m.content.clone(),
        })
        .collect();
    if msgs.is_empty() {
        return Err("no valid user/assistant messages".into());
    }

    let system_str = system.unwrap_or_default();
    let system_ref: &str = if system_str.is_empty() { "" } else { system_str.as_str() };

    let body = AnthropicReq {
        model: api_model,
        max_tokens: 4096,
        system: system_ref,
        messages: msgs,
        stream: false,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("anthropic api error ({status}): {text}"));
    }

    let parsed: AnthropicResp = resp.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.ty == "text")
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        return Err("model returned empty response".into());
    }

    Ok(text)
}


/// Pull an `ImportedChat` out of an arbitrary model reply.
/// Strategies, in order:
///   1. Direct parse.
///   2. Strip ```json / ``` fences and parse.
///   3. Find the first balanced {...} block in the reply and parse that.
/// Returns `None` if none succeed.
fn parse_imported_chat(text: &str) -> Option<ImportedChat> {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<ImportedChat>(trimmed) {
        return Some(v);
    }
    let fenced = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|s| s.strip_suffix("```"))
        .map(|s| s.trim());
    if let Some(inner) = fenced {
        if let Ok(v) = serde_json::from_str::<ImportedChat>(inner) {
            return Some(v);
        }
    }
    if let Some(obj) = find_first_json_object(trimmed) {
        if let Ok(v) = serde_json::from_str::<ImportedChat>(&obj) {
            return Some(v);
        }
    }
    None
}

/// Scan `s` for the first balanced `{...}` block, respecting string literals
/// (so braces inside quoted strings don't throw off the depth counter).
fn find_first_json_object(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{')?;
    let mut depth: i32 = 0;
    let mut in_str = false;
    let mut escape = false;
    for i in start..bytes.len() {
        let b = bytes[i];
        if in_str {
            if escape {
                escape = false;
            } else if b == b'\\' {
                escape = true;
            } else if b == b'"' {
                in_str = false;
            }
            continue;
        }
        match b {
            b'"' => in_str = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(s[start..=i].to_string());
                }
            }
            _ => {}
        }
    }
    None
}
