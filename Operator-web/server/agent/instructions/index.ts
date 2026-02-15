import path from "node:path"

type SkillInfo = {
  name: string
  description: string
  file: string
}

type ComposeInput = {
  cwd: string
  baseInstructions: string
  developerInstructions?: string
  collaborationInstructions?: string
  userInstructions?: string
  permissionsText?: string
  skills?: SkillInfo[]
  environmentContext?: string
}

const USER_PREFIX = "# AGENTS.md instructions for "

const normalizeText = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const readAgentsRules = async (root: string) => {
  const dir = path.join(root, "agents", "rules")
  const ok = await Bun.file(dir).exists()

  if (!ok) {
    return ""
  }

  const glob = new Bun.Glob("**/*.md")
  const list: string[] = []

  for await (const rel0 of glob.scan({ cwd: dir, onlyFiles: true })) {
    const rel = typeof rel0 === "string" ? rel0 : ""
    const clean = rel.trim()

    if (!clean) {
      continue
    }

    list.push(clean)
  }

  list.sort((a, b) => a.localeCompare(b))

  const docs: string[] = []

  for (var i = 0; i < list.length; i++) {
    const rel = list[i] ?? ""

    if (!rel) {
      continue
    }

    const fp = path.join(dir, rel)
    const txt = normalizeText(await Bun.file(fp).text())

    if (!txt) {
      continue
    }

    docs.push(txt)
  }

  return docs.join("\n\n").trim()
}

const readFirstExisting = async (dir: string, names: string[]) => {
  for (var i = 0; i < names.length; i++) {
    const name = names[i] ?? ""

    if (!name) {
      continue
    }

    const fp = path.join(dir, name)
    const f = Bun.file(fp)
    const ok = await f.exists()

    if (!ok) {
      continue
    }

    const txt = normalizeText(await f.text())

    if (txt) {
      return { file: fp, text: txt }
    }
  }

  return null
}

const pathChainToRoot = (cwd: string) => {
  const abs = path.resolve(cwd)
  const list: string[] = [abs]
  var cur = abs

  for (;;) {
    const parent = path.dirname(cur)

    if (!parent || parent === cur) {
      break
    }

    list.push(parent)
    cur = parent
  }

  list.reverse()
  return list
}

const findGitRoot = async (cwd: string) => {
  const abs = path.resolve(cwd)
  var cur = abs

  for (;;) {
    const marker = path.join(cur, ".git")
    const exists = await Bun.file(marker).exists()
    const headExists = await Bun.file(path.join(marker, "HEAD")).exists()

    if (exists || headExists) {
      return cur
    }

    const parent = path.dirname(cur)

    if (!parent || parent === cur) {
      return abs
    }

    cur = parent
  }
}

const renderSkills = (skills: SkillInfo[]) => {
  const list = Array.isArray(skills) ? skills : []

  if (!list.length) {
    return ""
  }

  const rows: string[] = []
  rows.push("## Skills")
  rows.push(
    "A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used."
  )
  rows.push("### Available skills")

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    rows.push(`- ${row.name}: ${row.description} (file: ${row.file})`)
  }

  return rows.join("\n")
}

export const readAgentsInstructions = async (cwd: string) => {
  const root = await findGitRoot(cwd)
  const chain = pathChainToRoot(cwd)
  const docs: string[] = []

  const rules = await readAgentsRules(root)

  if (rules) {
    docs.push(rules)
  }

  for (var i = 0; i < chain.length; i++) {
    const dir = chain[i] ?? ""

    if (!dir) {
      continue
    }

    if (!dir.startsWith(root)) {
      continue
    }

    const found = await readFirstExisting(dir, ["AGENTS.override.md", "agents.override.md", "AGENTS.md", "agents.md"])

    if (!found) {
      continue
    }

    docs.push(found.text)
  }

  const out = docs.join("\n\n").trim()
  return out
}

export const renderTaggedUserInstructions = (cwd: string, contents: string) => {
  const text = normalizeText(contents)

  if (!text) {
    return ""
  }

  const dir = path.resolve(cwd)
  return `${USER_PREFIX}${dir}\n\n<INSTRUCTIONS>\n${text}\n</INSTRUCTIONS>`
}

export const composeInstructionLayers = (input: ComposeInput) => {
  const sections: string[] = []
  const base = normalizeText(input.baseInstructions)

  if (base) {
    sections.push(base)
  }

  const permission = normalizeText(input.permissionsText || "")

  if (permission) {
    sections.push(`<permissions instructions>\n${permission}\n</permissions instructions>`)
  }

  const developer = normalizeText(input.developerInstructions || "")

  if (developer) {
    sections.push(developer)
  }

  const collab = normalizeText(input.collaborationInstructions || "")

  if (collab) {
    sections.push(`<collaboration_mode>${collab}</collaboration_mode>`)
  }

  const user = normalizeText(input.userInstructions || "")

  if (user) {
    sections.push(renderTaggedUserInstructions(input.cwd, user))
  }

  const skills = renderSkills(input.skills || [])

  if (skills) {
    sections.push(skills)
  }

  const env = normalizeText(input.environmentContext || "")

  if (env) {
    sections.push(`<environment_context>${env}</environment_context>`)
  }

  return sections.join("\n\n")
}
