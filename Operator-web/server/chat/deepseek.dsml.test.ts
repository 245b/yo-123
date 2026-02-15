import { afterEach, describe, expect, it } from "bun:test"
import { createDeepSeek, extractDsmlToolCalls } from "./deepseek"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("extractDsmlToolCalls", () => {
  it("parses DSML function calls and strips DSML markup from visible content", () => {
    const raw = [
      "I will keep working and execute the next terminal step.",
      "<|DSML|function_calls>",
      '<|DSML|invoke name="terminal_exec">',
      '<|DSML|parameter name="command" string="true">cd /projects/_workspaces/abc/frontend && cat > postcss.config.js << \'EOF\'',
      "export default {",
      "  plugins: {",
      "    tailwindcss: {},",
      "    autoprefixer: {},",
      "  },",
      "}",
      "EOF</|DSML|parameter>",
      "</|DSML|invoke>",
      "</|DSML|function_calls>",
    ].join("\n")

    const out = extractDsmlToolCalls(raw)
    expect(out.calls.length).toBe(1)
    const call = out.calls[0]
    expect(call?.function.name).toBe("terminal_exec")
    const args = JSON.parse(call?.function.arguments || "{}") as { command?: unknown }
    const command0 = typeof args.command === "string" ? args.command : ""
    expect(command0.includes("cat > postcss.config.js")).toBe(true)
    expect(out.cleaned).toBe("I will keep working and execute the next terminal step.")
  })

  it("keeps content untouched when DSML markup does not exist", () => {
    const raw = "plain assistant text without tool markup"
    const out = extractDsmlToolCalls(raw)
    expect(out.calls.length).toBe(0)
    expect(out.cleaned).toBe(raw)
  })

  it("continues tool loop when assistant returns DSML tool-call markup", async () => {
    var calls = 0
    var reqs = 0

    const mock = Object.assign(
      async (_url: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
        const raw0 = init && typeof init === "object" ? (init as { body?: unknown }).body : undefined
        const raw1 = typeof raw0 === "string" ? raw0 : ""
        const body = raw1 ? (JSON.parse(raw1) as { messages?: unknown }) : { messages: [] }
        const list = Array.isArray(body.messages) ? body.messages : []
        reqs += 1

        if (reqs === 1) {
          const txt = [
            "Working...",
            "<|DSML|function_calls>",
            '<|DSML|invoke name="terminal_exec">',
            '<|DSML|parameter name="command" string="true">echo smoke</|DSML|parameter>',
            "</|DSML|invoke>",
            "</|DSML|function_calls>",
          ].join("\n")
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: txt } }],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          )
        }

        const toolRows = list.filter((row) => {
          const entry = row && typeof row === "object" ? (row as { role?: unknown }) : null
          const role = typeof entry?.role === "string" ? entry.role : ""
          return role === "tool"
        })
        expect(toolRows.length).toBeGreaterThan(0)

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Terminal step finished. Continuing to completion." } }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      },
      { preconnect: realFetch.preconnect },
    ) as typeof fetch

    globalThis.fetch = mock

    const client = createDeepSeek("https://api.deepseek.com", "test-key", "deepseek-chat", {
      tools: [
        {
          type: "function",
          function: {
            name: "terminal_exec",
            description: "run shell",
            parameters: { type: "object", properties: { command: { type: "string" } } },
          },
        },
      ],
      runTool: async (name, args) => {
        const cmd0 = typeof args.command === "string" ? args.command : ""
        const cmd = cmd0.trim()
        calls += 1
        return { ok: true, name, cmd }
      },
      maxSteps: 4,
    })

    const out = await client.call(
      [
        {
          role: "user",
          content: "run command and continue",
        },
      ],
      0.2,
      undefined,
      undefined,
      { tool_choice: "auto" },
    )

    expect(out.ok).toBe(true)
    expect((out.text || "").includes("Continuing to completion.")).toBe(true)
    expect(calls).toBe(1)
    expect(reqs).toBe(2)
  })
})
