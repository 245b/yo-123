import { describe, expect, test } from "bun:test"
import { createServiceIdentifier } from "./service-id"
import { InstantiationService } from "./instantiation-service"

type AType = {
  value: string
}

type BType = {
  value: string
}

const AId = createServiceIdentifier<AType>("runtime-core.test.A")
const BId = createServiceIdentifier<BType>("runtime-core.test.B")

class A {
  value = "a"
}

class B {
  static dependencies = [AId] as const

  constructor(private readonly a: A) {}

  get value() {
    return `${this.a.value}b`
  }
}

const CId = createServiceIdentifier<{ value: string }>("runtime-core.test.C")
const DId = createServiceIdentifier<{ value: string }>("runtime-core.test.D")

class C {
  static dependencies = [DId] as const

  constructor(private readonly d: { value: string }) {}

  get value() {
    return this.d.value
  }
}

class D {
  static dependencies = [CId] as const

  constructor(private readonly c: { value: string }) {}

  get value() {
    return this.c.value
  }
}

describe("InstantiationService", () => {
  test("resolves descriptors with dependency injection", () => {
    const s = new InstantiationService()
    s.set(AId, { ctor: A })
    s.set(BId, { ctor: B })

    const b = s.require(BId)
    expect(b.value).toBe("ab")
  })

  test("detects cyclic dependencies", () => {
    const s = new InstantiationService()
    s.set(CId, { ctor: C })
    s.set(DId, { ctor: D })

    expect(() => s.require(CId)).toThrow("Cyclic dependency")
  })
})
