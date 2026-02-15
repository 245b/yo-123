export const uiTokens = {
  panelRadius: "14px",
  panelGap: "12px",
  borderColor: "var(--border-main, rgba(255,255,255,0.12))",
  panelBackground: "color-mix(in srgb, var(--background-operator-gray) 76%, black 24%)",
}

export const uiSlots = {
  sidePanel: "side-panel",
  chatCanvas: "chat-canvas",
  attachmentsTray: "attachments-tray",
  activityPanel: "activity-panel",
}

export type UiSlot = keyof typeof uiSlots