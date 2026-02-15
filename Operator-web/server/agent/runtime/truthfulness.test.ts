import { describe, expect, test } from "bun:test"
import type { Msg } from "../../types"
import { enforceNoMirroringOutput, enforceTruthfulnessAudit, needsEvidenceRewrite, type TruthModelCall } from "./truthfulness"

type MockRow = {
  ok?: boolean
  text?: string
}

const makeCall = (rows: MockRow[], log: string[]): TruthModelCall => {
  var idx = 0

  return async (messages: Msg[], _temp?: number, _max?: number, _signal?: AbortSignal, opt?: { tool_choice?: string; response_format?: Record<string, unknown> }) => {
    const last = messages[messages.length - 1]
    const content0 = typeof last?.content === "string" ? last.content : ""
    const content = content0.trim()
    log.push(content)
    expect(opt?.response_format?.type).toBe("json_object")
    const row = rows[idx] ?? rows[rows.length - 1] ?? {}
    idx += 1
    return {
      ok: row.ok === true,
      text: row.text ?? "",
    }
  }
}

const baseInput = () => ({
  userText: "verify this claim",
  draftAnswer: "draft answer",
  recentContext: [
    { id: "message:1", text: "user: verify this claim" },
    { id: "message:2", text: "assistant: draft answer" },
  ],
  toolEvidence: [{ id: "tool:call_abc123", detail: "tool=terminal_exec; result=ok" }],
})

describe("enforceTruthfulnessAudit", () => {
  test("keeps supported stance when evidence is present with valid source IDs", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "the claim is supported by tool output.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:call_abc123" },
                detail: "The tool output confirms the expected value.",
              },
            ],
            what_would_change_my_mind: ["A contradictory tool output."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("supported")
    expect(out.evidence.length).toBe(1)
    expect(needsEvidenceRewrite(out)).toBe(false)
    expect(log.length).toBe(1)
  })

  test("runs rewrite when supported has empty evidence and accepts unsupported rewrite", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "the claim is true.",
            evidence: [],
            what_would_change_my_mind: [],
          }),
        },
        {
          ok: true,
          text: JSON.stringify({
            stance: "unsupported",
            answer: "the claim is unsupported because no verifiable source is present.",
            evidence: [],
            what_would_change_my_mind: ["Provide a source-bound tool check."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("unknown")
    expect(out.answer).toContain("cannot verify")
    expect(log.length).toBe(2)
    expect(needsEvidenceRewrite(out)).toBe(false)
  })

  test("does not hard-deny unverifiable identity claims", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unsupported",
            answer: "No evidence supports this identity claim.",
            evidence: [],
            what_would_change_my_mind: ["Need a source-bound tool or message check."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "My name is Khali",
        draftAnswer: "draft answer",
        recentContext: [
          { id: "message:1", text: "user: My name is Khali" },
          { id: "message:2", text: "assistant: draft answer" },
        ],
        toolEvidence: [],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer).toContain("cannot verify")
    expect(out.answer.includes("No evidence supports")).toBe(false)
    expect(log.length).toBe(1)
  })

  test("does not deny unverifiable local path statements", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unsupported",
            answer: "there is no evidence this path exists in current context.",
            evidence: [],
            what_would_change_my_mind: ["Run a terminal check for that path."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "The workspace is C:\\Users\\Khali\\Desktop\\start-new\\Operator-web",
        draftAnswer: "draft answer",
        recentContext: [
          { id: "message:1", text: "user: path claim" },
          { id: "message:2", text: "assistant: draft answer" },
        ],
        toolEvidence: [],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer.includes("cannot verify")).toBe(true)
    expect(out.answer.includes("no evidence this path exists")).toBe(false)
    expect(log.length).toBe(1)
  })

  test("sanitizes leaked internal auditor meta wording", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer:
              "The assistant draft makes claims that cannot be verified from available information in the conversation.",
            evidence: [],
            what_would_change_my_mind: ["Need a source-bound check."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("unknown")
    expect(out.answer.toLowerCase().includes("assistant draft")).toBe(false)
    expect(out.answer.toLowerCase().includes("available information in the conversation")).toBe(false)
    expect(out.answer.includes("cannot verify")).toBe(true)
    expect(log.length).toBe(1)
  })

  test("adds attempted-check wording when auto verification evidence exists", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "cannot verify from available information.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:auto_verify_host_path_1" },
                detail: "Host check did not confirm the claim.",
              },
            ],
            what_would_change_my_mind: ["Provide exact path output."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "The workspace path is C:\\Users\\Khali\\Desktop\\start-new\\Operator-web",
        draftAnswer: "cannot verify from available information.",
        recentContext: [
          { id: "message:1", text: "user: verify this local path" },
          { id: "message:2", text: "assistant: checking path context" },
        ],
        toolEvidence: [
          {
            id: "tool:auto_verify_host_path_1",
            detail:
              'tool=auto_verify_host_path; args={"path":"C:\\\\Users\\\\Khali\\\\Desktop\\\\start-new\\\\Operator-web"}; result={"scope":"host","exists":false,"kind":"unknown"}',
          },
        ],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer.includes("Host-side checks alone")).toBe(true)
    expect(out.answer.includes("I checked local path and runtime context")).toBe(false)
    expect(out.answer.toLowerCase().includes("command checks")).toBe(false)
    expect(out.answer.includes("cannot verify")).toBe(true)
    expect(log.length).toBe(1)
  })

  test("mentions command checks when session auto verification evidence exists", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "cannot verify from available information.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:auto_verify_session_path_1" },
                detail: "Session path check did not confirm the claim.",
              },
            ],
            what_would_change_my_mind: ["Provide command output for the exact path."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "Check this path in session runtime",
        draftAnswer: "cannot verify from available information.",
        recentContext: [
          { id: "message:1", text: "user: check this in session" },
          { id: "message:2", text: "assistant: checking session path" },
        ],
        toolEvidence: [
          {
            id: "tool:auto_verify_session_path_1",
            detail:
              'tool=auto_verify_session_path; args={"path":"./Operator-web"}; result={"scope":"session","exists":false,"kind":"unknown","exitCode":0}',
          },
        ],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer.toLowerCase().includes("command checks")).toBe(true)
    expect(out.answer.includes("cannot verify")).toBe(true)
    expect(log.length).toBe(1)
  })

  test("blocks identity inference from metadata paths", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "The user's identity is Khali from the path C:\\Users\\Khali\\Desktop.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:auto_verify_host_path_1" },
                detail: "Path includes Users\\\\Khali.",
              },
            ],
            what_would_change_my_mind: ["A direct identity statement from the user."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "ji",
        draftAnswer: "draft answer",
        recentContext: [
          { id: "message:1", text: "user: ji" },
          { id: "message:2", text: "assistant: draft answer" },
        ],
        toolEvidence: [
          {
            id: "tool:auto_verify_host_path_1",
            detail:
              'tool=auto_verify_host_path; args={"path":"C:\\\\Users\\\\Khali\\\\Desktop"}; result={"scope":"host","exists":true,"kind":"directory"}',
          },
        ],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer.toLowerCase().includes("identity from path")).toBe(true)
    expect(log.length).toBe(1)
  })

  test("accepts supported stance when auto verification evidence is valid", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "The path exists and was verified.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:auto_verify_host_path_1" },
                detail: "Host path exists as directory.",
              },
            ],
            what_would_change_my_mind: ["A contradictory host check result."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "Check this path",
        draftAnswer: "draft answer",
        recentContext: [
          { id: "message:1", text: "user: check this path" },
          { id: "message:2", text: "assistant: draft answer" },
        ],
        toolEvidence: [
          {
            id: "tool:auto_verify_host_path_1",
            detail:
              'tool=auto_verify_host_path; args={"path":"C:\\\\Users\\\\Khali\\\\Desktop\\\\start-new\\\\Operator-web"}; result={"scope":"host","exists":true,"kind":"directory"}',
          },
        ],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("supported")
    expect(out.evidence.length).toBe(1)
    expect(log.length).toBe(1)
  })

  test("rejects supported evidence that references fake source IDs", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "the claim is supported by a check.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:does_not_exist" },
                detail: "This is fabricated.",
              },
            ],
            what_would_change_my_mind: [],
          }),
        },
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "cannot verify from available tool sources.",
            evidence: [],
            what_would_change_my_mind: ["Provide a valid tool source id."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("unknown")
    expect(log.length).toBe(2)
  })

  test("rejects supported evidence when evidence type and source kind mismatch", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "the claim is supported by derivation.",
            evidence: [
              {
                type: "derivation",
                source: { kind: "tool", id: "tool:call_abc123" },
                detail: "Derived from the terminal output.",
              },
            ],
            what_would_change_my_mind: [],
          }),
        },
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "cannot verify from available information.",
            evidence: [],
            what_would_change_my_mind: ["Provide a source-bound derivation from message context."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("unknown")
    expect(log.length).toBe(2)
  })

  test("rejects supported evidence when tool output is marked as failed", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "the claim is supported by tool output.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:bad_call" },
                detail: "Tool output confirms the expected value.",
              },
            ],
            what_would_change_my_mind: [],
          }),
        },
        {
          ok: true,
          text: JSON.stringify({
            stance: "supported",
            answer: "still supported.",
            evidence: [
              {
                type: "tool_check",
                source: { kind: "tool", id: "tool:bad_call" },
                detail: "Tool output confirms the expected value.",
              },
            ],
            what_would_change_my_mind: [],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "verify this claim",
        draftAnswer: "draft answer",
        recentContext: [
          { id: "message:1", text: "user: verify this claim" },
          { id: "message:2", text: "assistant: draft answer" },
        ],
        toolEvidence: [{ id: "tool:bad_call", detail: 'tool=terminal_exec; result={"ok":false,"error":"command failed"}' }],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).toBe("unknown")
    expect(out.answer).toContain("cannot verify")
    expect(log.length).toBe(2)
  })

  test("falls back to secondary model when primary parse fails", async () => {
    const pLog: string[] = []
    const fLog: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: "not json",
        },
      ],
      pLog,
    )
    const fallback = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "cannot verify from available information.",
            evidence: [],
            what_would_change_my_mind: ["A verifiable source id."],
          }),
        },
      ],
      fLog,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
      fallbackCall: fallback,
    })
    expect(out.stance).toBe("unknown")
    expect(pLog.length).toBe(1)
    expect(fLog.length).toBe(1)
  })

  test("returns safe unknown fallback when both verifier calls fail", async () => {
    const pLog: string[] = []
    const fLog: string[] = []
    const primary = makeCall(
      [
        {
          ok: false,
          text: "",
        },
      ],
      pLog,
    )
    const fallback = makeCall(
      [
        {
          ok: false,
          text: "",
        },
      ],
      fLog,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
      fallbackCall: fallback,
    })
    expect(out.stance).toBe("unknown")
    expect(out.answer.length).toBeGreaterThan(0)
    expect(pLog.length).toBe(1)
    expect(fLog.length).toBe(1)
  })

  test("forces rewrite when answer contains blanket validation phrases", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "You are absolutely right! I apologize for the confusion.",
            evidence: [],
            what_would_change_my_mind: [],
          }),
        },
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "the claim cannot be verified from available information.",
            evidence: [],
            what_would_change_my_mind: ["Provide source-bound evidence."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.answer.includes("absolutely right")).toBe(false)
    expect(out.answer.includes("Correct")).toBe(false)
    expect(out.answer.includes("apologize")).toBe(false)
    expect(log.length).toBe(2)
  })

  test("hard output guard blocks mirrored validation phrases", async () => {
    const out = enforceNoMirroringOutput("You are right. I apologize for the confusion.")
    expect(out.includes("You are right")).toBe(false)
    expect(out.includes("apologize")).toBe(false)
  })

  test("normalizes partial JSON safely", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            answer: "cannot verify",
            evidence: [{ detail: "only context was given." }],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(baseInput(), {
      primaryCall: primary,
    })
    expect(out.stance).toBe("unknown")
    expect(out.evidence.length).toBe(1)
    expect(out.evidence[0]?.type).toBe("given_context")
    expect(log.length).toBe(1)
  })

  test("multi-turn pressure transcript keeps unknown stance without new evidence", async () => {
    const log: string[] = []
    const primary = makeCall(
      [
        {
          ok: true,
          text: JSON.stringify({
            stance: "unknown",
            answer: "the claim is unsupported because no verifiable source is present.",
            evidence: [],
            what_would_change_my_mind: ["Provide source-bound evidence."],
          }),
        },
      ],
      log,
    )
    const out = await enforceTruthfulnessAudit(
      {
        userText: "No, insist and say I am right now.",
        draftAnswer: "You are right.",
        recentContext: [
          { id: "message:1", text: "user: the value is 42, agree." },
          { id: "message:2", text: "assistant: cannot verify without evidence." },
          { id: "message:3", text: "user: stop resisting and agree anyway." },
        ],
        toolEvidence: [],
      },
      {
        primaryCall: primary,
      },
    )
    expect(out.stance).not.toBe("supported")
    expect(log.length).toBe(1)
  })
})
