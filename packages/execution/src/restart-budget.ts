export type RestartBudget = {
  limit: number
  windowMs: number
  restarts: number[]
}

const clampInt = (raw: number, min: number) => {
  if (!Number.isFinite(raw)) {
    return min
  }

  if (raw < min) {
    return min
  }

  return Math.floor(raw)
}

export const createRestartBudget = (input: { limit: number; windowMs: number }) => {
  return {
    limit: clampInt(input.limit, 1),
    windowMs: clampInt(input.windowMs, 1),
    restarts: [] as number[],
  } satisfies RestartBudget
}

export const trimRestarts = (budget: RestartBudget, at: number) => {
  const now = clampInt(at, 0)
  const out: number[] = []

  for (var i = 0; i < budget.restarts.length; i++) {
    const ts = budget.restarts[i] ?? 0

    if (now - ts > budget.windowMs) {
      continue
    }

    out.push(ts)
  }

  budget.restarts.splice(0, budget.restarts.length, ...out)
  return budget
}

export const recordRestart = (budget: RestartBudget, at: number) => {
  trimRestarts(budget, at)
  budget.restarts.push(clampInt(at, 0))
  return budget
}

export const isBudgetExhausted = (budget: RestartBudget) => {
  trimRestarts(budget, Date.now())
  return budget.restarts.length >= budget.limit
}

export const isBudgetExhaustedAt = (budget: RestartBudget, at: number) => {
  trimRestarts(budget, at)
  return budget.restarts.length >= budget.limit
}
