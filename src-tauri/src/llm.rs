use serde::{Deserialize, Serialize};

const IMPORT_SYSTEM: &str = r#"You are given the text of an AI chat conversation that the user has copied from their browser. The pasted text may include stray UI labels from the site (e.g. "Copy", "Regenerate", "Share", "You said", timestamps, menu items). Your job is to extract the conversation as a clean, ordered list of messages.

Output ONLY this JSON shape, no markdown fences, no commentary:

{
  "title": "<a concise 3-7 word title describing the conversation>",
  "messages": [
    { "role": "user" | "assistant", "content": "<message text>" },
    ...
  ]
}

Rules:
- Preserve message order exactly as in the source.
- Preserve each message's full text content, including code blocks — wrap code in triple backticks with the correct language tag when obvious.
- Infer roles from the pasted text. Labels like "You:", "You said:", "User:", "Human:" mean "user". Labels like "Claude", "Assistant", "ChatGPT", "GPT-4" mean "assistant". When the pattern is user-then-assistant alternating with no explicit labels, assume the first block is "user".
- Drop UI chrome: "Copy", "Regenerate", "Share this conversation", "Continue this chat", thumbs-up/down labels, timestamps, avatars, navigation, footers.
- If messages contain images or attachments, describe them in brackets, e.g. [image of a UI mockup].
- "role" MUST be exactly "user" or "assistant".
- If you genuinely cannot find a conversation, return {"title": "imported chat", "messages": []}.
- Output raw JSON only. The very first character of your response must be `{` and the last must be `}`."#;

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

#[derive(Serialize, Deserialize)]
pub struct ImportedMessage {
    pub role: String,
    pub content: String,
}

/// Import from user-pasted content. Claude's share pages and ChatGPT's share
/// pages both block server-side fetching, so we don't try — the user copies
/// the conversation from their browser and pastes it here for extraction.
#[tauri::command]
pub async fn import_pasted_chat(content: String) -> Result<ImportedChat, String> {
    let content = content.trim().to_string();
    if content.chars().count() < 20 {
        return Err("pasted content is empty or too short.".into());
    }

    let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| {
        "ANTHROPIC_API_KEY is not set. Add it to gitchat/.env or export it in your shell before launching."
            .to_string()
    })?;

    const MAX_CHARS: usize = 400_000;
    let snippet = if content.chars().count() > MAX_CHARS {
        content.chars().take(MAX_CHARS).collect::<String>()
    } else {
        content
    };

    let user_prompt = format!(
        "The user has pasted the content of a shared AI conversation (copied from their browser). It may include page chrome or menu labels around the conversation — ignore those. Extract the conversation as specified.\n\nPasted content:\n{}",
        snippet
    );

    let body = AnthropicReq {
        model: "claude-sonnet-4-6",
        max_tokens: 32_000,
        system: IMPORT_SYSTEM,
        messages: vec![AnthropicMsg {
            role: "user",
            content: user_prompt,
        }],
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    let llm = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            // Walk the error chain so we see the root cause (TLS, DNS, etc.)
            // rather than reqwest's one-line summary.
            let mut out = format!("anthropic request failed: {e}");
            let mut src = std::error::Error::source(&e);
            while let Some(s) = src {
                out.push_str(&format!("\n  caused by: {s}"));
                src = s.source();
            }
            out
        })?;

    let status = llm.status();
    if !status.is_success() {
        let text = llm.text().await.unwrap_or_default();
        return Err(format!("anthropic api error ({status}): {text}"));
    }

    let parsed: AnthropicResp = llm.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.ty == "text")
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");

    let trimmed = text.trim();
    let json = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|s| s.strip_suffix("```"))
        .unwrap_or(trimmed)
        .trim();

    let out: ImportedChat = serde_json::from_str(json)
        .map_err(|e| format!("could not parse model output: {e}\n\nraw: {text}"))?;

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

