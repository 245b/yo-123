import { z } from "zod"

export type ExtensionApiVersion = "v1"

export type ExtensionApiCapabilitiesV1 = {
  commandRegistration: boolean
  terminalAccess: boolean
  workspaceRead: boolean
  workspaceWrite: boolean
  diagnostics: boolean
}

export type ExtensionHostHelloV1 = {
  type: "hello"
  version: ExtensionApiVersion
  extensionHostId: string
  capabilities: ExtensionApiCapabilitiesV1
}

export type ExtensionHostReadyV1 = {
  type: "ready"
  version: ExtensionApiVersion
  extensionHostId: string
}

export type ExtensionHostInitializedV1 = {
  type: "initialized"
  version: ExtensionApiVersion
  extensionHostId: string
}

export type ExtensionHostInitializeRequestV1 = {
  type: "initialize_host"
  version: ExtensionApiVersion
  extensionHostId: string
  capabilities: ExtensionApiCapabilitiesV1
}

export type ExtensionHostInitializeAckV1 = {
  type: "initialize_ack"
  version: ExtensionApiVersion
  extensionHostId: string
}

export type ExtensionHostMessageV1 =
  | ExtensionHostHelloV1
  | ExtensionHostReadyV1
  | ExtensionHostInitializedV1
  | ExtensionHostInitializeRequestV1
  | ExtensionHostInitializeAckV1

export const ExtensionApiCapabilitiesV1Schema = z.object({
  commandRegistration: z.boolean(),
  terminalAccess: z.boolean(),
  workspaceRead: z.boolean(),
  workspaceWrite: z.boolean(),
  diagnostics: z.boolean(),
})

const ExtensionHostHelloV1Schema = z.object({
  type: z.literal("hello"),
  version: z.literal("v1"),
  extensionHostId: z.string().trim().min(1),
  capabilities: ExtensionApiCapabilitiesV1Schema,
})

const ExtensionHostReadyV1Schema = z.object({
  type: z.literal("ready"),
  version: z.literal("v1"),
  extensionHostId: z.string().trim().min(1),
})

const ExtensionHostInitializedV1Schema = z.object({
  type: z.literal("initialized"),
  version: z.literal("v1"),
  extensionHostId: z.string().trim().min(1),
})

const ExtensionHostInitializeRequestV1Schema = z.object({
  type: z.literal("initialize_host"),
  version: z.literal("v1"),
  extensionHostId: z.string().trim().min(1),
  capabilities: ExtensionApiCapabilitiesV1Schema,
})

const ExtensionHostInitializeAckV1Schema = z.object({
  type: z.literal("initialize_ack"),
  version: z.literal("v1"),
  extensionHostId: z.string().trim().min(1),
})

export const ExtensionHostMessageV1Schema = z.discriminatedUnion("type", [
  ExtensionHostHelloV1Schema,
  ExtensionHostReadyV1Schema,
  ExtensionHostInitializedV1Schema,
  ExtensionHostInitializeRequestV1Schema,
  ExtensionHostInitializeAckV1Schema,
])

export const decodeExtensionHostMessageV1 = (raw: unknown) => ExtensionHostMessageV1Schema.safeParse(raw)
