/*---------------------------------------------------------------------------------------------
 *  Ported (selective copy + adaptation) from OpenAI Codex (codex-rs):
 *  codex-rs/core/src/unified_exec/head_tail_buffer.rs
 *  License: Apache-2.0
 *--------------------------------------------------------------------------------------------*/

const clamp = (n: number, min: number) => {
  if (!Number.isFinite(n)) {
    return min
  }

  if (n < min) {
    return min
  }

  return Math.floor(n)
}

const sliceTail = (chunk: Uint8Array, max: number) => {
  const cap = clamp(max, 0)

  if (cap <= 0) {
    return new Uint8Array()
  }

  if (chunk.length <= cap) {
    return chunk
  }

  return chunk.slice(chunk.length - cap)
}

export class HeadTailBuffer {
  private readonly maxBytes: number
  private readonly headBudget: number
  private readonly tailBudget: number
  private readonly head: Uint8Array[] = []
  private readonly tail: Uint8Array[] = []
  private headBytes = 0
  private tailBytes = 0
  private omitted = 0

  constructor(maxBytes = 1024 * 1024) {
    const max = clamp(maxBytes, 0)
    const headBudget = Math.floor(max / 2)
    const tailBudget = Math.max(0, max - headBudget)
    this.maxBytes = max
    this.headBudget = headBudget
    this.tailBudget = tailBudget
  }

  retainedBytes() {
    return this.headBytes + this.tailBytes
  }

  omittedBytes() {
    return this.omitted
  }

  pushChunk(chunk: Uint8Array) {
    if (!(chunk instanceof Uint8Array)) {
      return
    }

    if (chunk.length === 0) {
      return
    }

    if (this.maxBytes === 0) {
      this.omitted += chunk.length
      return
    }

    if (this.headBytes < this.headBudget) {
      const remaining = Math.max(0, this.headBudget - this.headBytes)

      if (chunk.length <= remaining) {
        this.head.push(chunk)
        this.headBytes += chunk.length
        return
      }

      const headPart = chunk.slice(0, remaining)
      const tailPart = chunk.slice(remaining)

      if (headPart.length) {
        this.head.push(headPart)
        this.headBytes += headPart.length
      }

      this.pushToTail(tailPart)
      return
    }

    this.pushToTail(chunk)
  }

  snapshotChunks() {
    return this.head.concat(this.tail)
  }

  toBytes() {
    const out = new Uint8Array(this.retainedBytes())
    var off = 0

    for (var i = 0; i < this.head.length; i++) {
      const chunk = this.head[i]

      if (!chunk) {
        continue
      }

      out.set(chunk, off)
      off += chunk.length
    }

    for (var i = 0; i < this.tail.length; i++) {
      const chunk = this.tail[i]

      if (!chunk) {
        continue
      }

      out.set(chunk, off)
      off += chunk.length
    }

    return out
  }

  drainChunks() {
    const out = this.snapshotChunks()
    this.head.splice(0, this.head.length)
    this.tail.splice(0, this.tail.length)
    this.headBytes = 0
    this.tailBytes = 0
    this.omitted = 0
    return out
  }

  private pushToTail(chunk: Uint8Array) {
    if (this.tailBudget === 0) {
      this.omitted += chunk.length
      return
    }

    if (chunk.length >= this.tailBudget) {
      const kept = sliceTail(chunk, this.tailBudget)
      const dropped = Math.max(0, chunk.length - kept.length)
      this.omitted += this.tailBytes + dropped
      this.tail.splice(0, this.tail.length)
      this.tail.push(kept)
      this.tailBytes = kept.length
      return
    }

    this.tail.push(chunk)
    this.tailBytes += chunk.length
    this.trimTailToBudget()
  }

  private trimTailToBudget() {
    var excess = Math.max(0, this.tailBytes - this.tailBudget)

    while (excess > 0) {
      const front = this.tail[0]

      if (!front) {
        this.tail.shift()
        continue
      }

      if (excess >= front.length) {
        this.tail.shift()
        this.tailBytes -= front.length
        this.omitted += front.length
        excess = Math.max(0, this.tailBytes - this.tailBudget)
        continue
      }

      const next = front.slice(excess)
      this.tail[0] = next
      this.tailBytes -= excess
      this.omitted += excess
      break
    }
  }
}
