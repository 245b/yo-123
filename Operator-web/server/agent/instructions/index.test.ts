import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { composeInstructionLayers, readAgentsInstructions } from "./index"

describe("composeInstructionLayers", () => {
  test("keeps codex layering order", () => {
    const out = composeInstructionLayers({
      cwd: "C:/repo/app",
      baseInstructions: "base",
      permissionsText: "perms",
      developerInstructions: "dev",
      collaborationInstructions: "collab",
      userInstructions: "agents",
      skills: [
        {
          name: "debugger",
          description: "debug workflow",
          file: "/skills/debugger/SKILL.md",
        },
      ],
      environmentContext: '{"cwd":"C:/repo/app"}',
    })

    const iBase = out.indexOf("base")
    const iPerms = out.indexOf("<permissions instructions>")
    const iDev = out.indexOf("dev")
    const iCollab = out.indexOf("<collaboration_mode>")
    const iUser = out.indexOf("# AGENTS.md instructions for C:\\repo\\app")
    const iSkills = out.indexOf("## Skills")
    const iEnv = out.indexOf("<environment_context>")

    expect(iBase).toBeGreaterThanOrEqual(0)
    expect(iPerms).toBeGreaterThan(iBase)
    expect(iDev).toBeGreaterThan(iPerms)
    expect(iCollab).toBeGreaterThan(iDev)
    expect(iUser).toBeGreaterThan(iCollab)
    expect(iSkills).toBeGreaterThan(iUser)
    expect(iEnv).toBeGreaterThan(iSkills)
  })
})

describe("readAgentsInstructions", () => {
  test("merges AGENTS from git root to cwd with override precedence per folder", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agents-test-"))
    const sub = path.join(root, "a", "b")
    mkdirSync(sub, { recursive: true })
    mkdirSync(path.join(root, ".git"))
    writeFileSync(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8")
    writeFileSync(path.join(root, "AGENTS.md"), "root-agents", "utf8")
    writeFileSync(path.join(root, "a", "AGENTS.md"), "a-agents", "utf8")
    writeFileSync(path.join(root, "a", "b", "AGENTS.md"), "b-agents", "utf8")
    writeFileSync(path.join(root, "a", "b", "AGENTS.override.md"), "b-override", "utf8")

    const out = await readAgentsInstructions(sub)
    rmSync(root, { recursive: true, force: true })

    expect(out).toContain("root-agents")
    expect(out).toContain("a-agents")
    expect(out).toContain("b-override")
    expect(out.includes("b-agents")).toBe(false)
  })
})
