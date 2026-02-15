const css = `
html,body{background:var(--ms_bg, var(--background-gray-main, rgb(24,24,27)))!important;}
nav{box-shadow:none!important;border-right:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
nav::before,nav::after{box-shadow:none!important;border-right:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
html[data-ms-w] nav{width:var(--ms-side-w, auto)!important;min-width:var(--ms-side-w, auto)!important;max-width:var(--ms-side-w, none)!important;flex:0 0 var(--ms-side-w, auto)!important;}
[data-testid="model-selector-dropdown"]{color:inherit!important;opacity:1!important;visibility:visible!important;background:transparent!important;border:0!important;padding:0!important;cursor:pointer!important;}
[data-testid="model-selector-dropdown"]:hover{background:transparent!important;}
#__ms_operator{position:fixed;z-index:2147483647;display:none;padding:0;border:0;background:transparent;color:var(--text-secondary);backdrop-filter:none;-webkit-backdrop-filter:none;max-height:min(20rem,calc(100vh - 24px));overflow-y:auto;overflow-x:hidden;pointer-events:auto;transform:translateX(-100%);transform-origin:100% 0;will-change:transform,opacity;}
#__ms_operator[data-open="1"]{display:block;animation:msIn .14s cubic-bezier(0.165,0.85,0.45,1);}
@keyframes msIn{from{opacity:0;transform:translateX(-100%) translateY(8px) scale(.97);}to{opacity:1;transform:translateX(-100%) translateY(0) scale(1);}}
#__ms_operator button[data-ms-item]{width:100%;background:transparent;border:0;text-align:left;cursor:pointer;}
#__ms_operator .ms_ck{opacity:0;color:var(--icon-primary);}
#__ms_operator button[data-ms-item][data-active="1"] .ms_ck{opacity:1;}
.max-h-\\[300px\\] textarea{overflow-wrap:anywhere!important;word-break:break-word!important;}
[data-ms-chatbox="1"]{position:relative!important;}
#__ms_chat_more{position:absolute;top:10px;right:10px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:0;padding:0;background:transparent;color:var(--icon-secondary,var(--icon-tertiary));opacity:0;pointer-events:none;z-index:5;cursor:pointer;transition:opacity .15s ease,background-color .15s ease;}
[data-ms-chatbox="1"]:hover #__ms_chat_more,[data-ms-chatbox="1"]:focus-within #__ms_chat_more{opacity:1;pointer-events:auto;}
#__ms_chat_more:hover{background:var(--fill-tsp-gray-main);}
html[data-ms-chat-active="1"] #js-update-notification-button{display:none!important;}
html[data-ms-chat-active="1"] #js-update-notification-button + div[aria-haspopup="dialog"]{display:none!important;}
#chat-home-view-container{margin-top:0!important;}
#chat-home-view-container:not(:has(#__ms_ds)){position:fixed!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;}
html[data-ms-side="1"] #chat-home-view-container:not(:has(#__ms_ds)){left:calc(50% + (var(--ms-side-w, 0px)/2))!important;}
`.trim()

export const styles = (doc: Document, win: Window) => {
  const head = doc.head

  if (!head) {
    return
  }

  const id = "__shift"
  const st0 = doc.getElementById(id)
  const st = st0?.tagName === "STYLE" ? (st0 as HTMLStyleElement) : doc.createElement("style")

  if (!(st0?.tagName === "STYLE")) {
    st.id = id
    head.appendChild(st)
  }

  const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
  const root0 = doc.getElementById("chat-home-view-container") ?? sr?.querySelector("#chat-home-view-container") ?? null
  const root = root0 instanceof HTMLElement ? root0 : null

  const bg = (el: Element | null): string => {
    if (!el) {
      return ""
    }

    const c = win.getComputedStyle(el).backgroundColor
    const ok = c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent"

    if (ok) {
      return c
    }

    return bg(el.parentElement)
  }

  const bg0 = doc.querySelector('[class*="background-gray-main"]')
  const bg1 = bg(bg0 ?? root)

  if (bg1) {
    doc.documentElement.style.setProperty("--ms_bg", bg1)
  }

  st.textContent = css
}

