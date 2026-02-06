**Grok API Prompt Caching Best Practices**

xAI's Grok API implements **automatic prompt caching** (also called prefix caching) for many models (including grok-4 variants, grok-3 series, grok-code-fast-1, etc.). This feature dramatically reduces costs and latency by reusing computation for identical prompt prefixes across requests.

### How Prompt Caching Works in Grok API
- **Prefix-based matching**: The system caches the KV (key-value) tensors computed during inference for the **exact prefix** of the prompt. If a subsequent request shares the same beginning content (up to a certain point), the cached portion is reused instead of recomputed.
- **Automatic**: No extra parameters are needed to enable it — the API handles detection and application.
- **Pricing benefit**: Cached input tokens cost significantly less (e.g., often ~75-90% cheaper than normal input tokens, such as $0.02–$0.05 per million vs $0.20+ for uncached on fast models).
- **Cache lifetime**: Volatile storage; expires after a period of inactivity (typically minutes to hours, not permanently persistent).
- **Cache scope**: Distributed across clusters; hits are more reliable within the same conversation/session or when grouped properly.
- **Visibility**: In API responses, check the `usage` object for fields like `prompt_tokens_details` or similar (e.g., `cached_tokens`, `cache_read_input_tokens`) to see how much was served from cache.

### Key Best Practices to Maximize Cache Hits
1. **Keep the prompt prefix as stable and identical as possible**
   - Place **fixed, unchanging content first**:
     - System message / instructions
     - Tool definitions (if using function calling)
     - Few-shot examples
     - Any long static context or guidelines
   - Put **dynamic/variable content last**:
     - User message
     - Injected data (e.g., current asset indicators, query-specific info)
     - Conversation history additions (append new messages, don't insert in middle)
   - **Avoid**:
     - Changing wording, spacing, or order in the prefix
     - Injecting timestamps, dynamic IDs, or changing data early in the prompt
     - Reordering messages or tools between similar requests

2. **Use the conversation ID header for better grouping**
   - Add a custom HTTP header: `x-grok-conv-id: <your-fixed-uuid4>`
   - Use the **same constant UUID** for all related requests (e.g., same user session, same agent thread, or same asset/timeframe workflow).
   - This increases the chance of cache hits across requests by routing them to the same cluster/cache pool.

3. **Minimize changes that break prefix matching**
   - In agentic/tool-use flows: Keep the same tool definitions and system prefix across turns; only append new tool results or user inputs.
   - For multi-turn chats: Use message history append-only; avoid regenerating or modifying earlier messages.
   - If injecting large context (e.g., indicators from your backend runner): Make the injection format **exactly consistent** (same JSON keys/order, no extra fields).

4. **Design for repeated patterns**
   - For trading/analysis agents (like your 1m timeframe use-case):
     - Fixed prefix: Full system prompt + trading rules + output format.
     - Dynamic suffix: Asset, timeframe, latest indicator summary.
   - In tool-heavy agents: The prefix (tools + system) stays the same → high cache hits during sequential tool calls.
   - Aim for long stable prefixes (e.g., >1k–2k tokens) to maximize savings.

5. **Monitor and measure cache effectiveness**
   - Log every API response's `usage` details:
     - Look for `cached prompt text tokens`, `cache_read_input_tokens`, or similar.
     - Calculate hit rate: (cached tokens / total prompt tokens) × 100.
   - Target: 50–90%+ cached tokens on repeated patterns (xAI has reported >90% in optimized cases).
   - If hits are low: Debug by comparing exact prompt strings between requests (whitespace, newlines matter).

6. **Combine with other optimizations**
   - **Shorten overall prompts** where possible (still send full prefix, but keep it concise).
   - Use lower `reasoning_effort` or `max_tokens` to reduce output/reasoning costs.
   - For very similar but not identical requests: Consider client-side semantic caching (e.g., via Redis) as a fallback for full responses.

### Expected Benefits
- **Cost**: Cached tokens are ~5–10× cheaper → can turn high prompt spend (e.g., your $22/week) into much lower figures on repetitive calls.
- **Latency**: Faster responses (often 2–5×) since recomputation is skipped.
- **Real-world example**: In agentic coding or trading flows with stable prefixes, cache hits often exceed 80–90% after optimization.

The official xAI docs (e.g., consumption/rate-limits section and model-specific guides like grok-code-fast-1 prompt engineering) emphasize prefix stability and the `x-grok-conv-id` header as the main levers. No manual cache control (like Anthropic-style breakpoints) is exposed — it's fully automatic and prefix-based.

If you're seeing low cached tokens in your usage (like only $0.10 vs $22 uncached), the dynamic injection is likely breaking the prefix — restructuring as described should yield big improvements. Share a sample full prompt (with injected data) if you'd like help debugging the exact prefix issue!