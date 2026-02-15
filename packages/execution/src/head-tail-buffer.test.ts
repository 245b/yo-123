import { describe, expect, test } from "bun:test"
import { HeadTailBuffer } from "./head-tail-buffer"

describe("HeadTailBuffer", () => {
  test("keeps prefix and suffix when over budget", () => {
    const buf = new HeadTailBuffer(10)
    buf.pushChunk(new TextEncoder().encode("0123456789"))
    expect(buf.omittedBytes()).toBe(0)
    buf.pushChunk(new TextEncoder().encode("ab"))
    expect(buf.omittedBytes()).toBeGreaterThan(0)
    const out = new TextDecoder().decode(buf.toBytes())
    expect(out.startsWith("01234")).toBe(true)
    expect(out.endsWith("89ab")).toBe(true)
  })

  test("maxBytes=0 drops everything", () => {
    const buf = new HeadTailBuffer(0)
    buf.pushChunk(new TextEncoder().encode("abc"))
    expect(buf.retainedBytes()).toBe(0)
    expect(buf.omittedBytes()).toBe(3)
    expect(buf.toBytes().length).toBe(0)
    expect(buf.snapshotChunks().length).toBe(0)
  })

  test("draining resets state", () => {
    const buf = new HeadTailBuffer(10)
    buf.pushChunk(new TextEncoder().encode("0123456789"))
    buf.pushChunk(new TextEncoder().encode("ab"))
    const drained = buf.drainChunks()
    expect(drained.length).toBeGreaterThan(0)
    expect(buf.retainedBytes()).toBe(0)
    expect(buf.omittedBytes()).toBe(0)
    expect(buf.toBytes().length).toBe(0)
  })
})

