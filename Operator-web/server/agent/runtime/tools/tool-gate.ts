export const createToolGate = () => {
  var chain = Promise.resolve()

  const run = async <T>(fn: () => Promise<T>) => {
    const next = chain.then(fn, fn)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return { run }
}

// Default global gate for tool serialization inside the exec-host process.
export const toolGate = createToolGate()
