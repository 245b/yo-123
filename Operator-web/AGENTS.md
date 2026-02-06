## IMPORTANT

- Try to keep things in one function unless composable or reusable
- DO NOT do unnecessary destructuring of variables
- Terminology: "agent" and "operator" in this repo refer to the DeepSeek assistant/runtime
- DO NOT use `else` statements unless necessary
- DO NOT use `try`/`catch` if it can be avoided
- AVOID `try`/`catch` where possible
- AVOID `else` statements
- AVOID using `any` type
- AVOID `let` statements
- PREFER single word variable names where possible
- Use as many bun apis as possible like Bun.file()
- DO NOT remove the API key from the code at every change make sure its safe but not deleted
- Secrets: do not hardcode real API keys. Keep key plumbing (env-var read / secret injection) intact, but never commit the secret value
- Bun I/O: prefer `Bun.file()` / `Bun.write()` for filesystem work in Bun; use `node:fs` only when Bun APIs don’t cover the operation.
- For any non-trivial task, read PLANS.md first and follow it as the authoritative execution plan.
- For every front-end  change you do YOU MUST Stress test it and actual test it via playwright and see if its valid or not
- Do not simplify or remove functionality unless it is absolutely necessary. Do not “reduce” errors by suppressing or ignoring them—errors must be properly fixed. Any change that removes behavior without justification is unacceptable.

## Tool Calling

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE. Here is an example illustrating how to execute 3 parallel file reads in this chat environment:

json
{
"recipient_name": "multi_tool_use.parallel",
"parameters": {
"tool_uses": [
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.tsx"
}
},
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.ts"
}
},
{
"recipient_name": "functions.read",
"parameters": {
"filePath": "path/to/file.md"
}
}
]
}
}
