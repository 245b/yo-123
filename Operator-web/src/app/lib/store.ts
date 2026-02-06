export const loadOpen = () => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return false
  }

  const v = window.localStorage.getItem("ms_open") ?? ""
  return v === "1"
}

export const saveOpen = (open: boolean) => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return
  }

  window.localStorage.setItem("ms_open", open ? "1" : "0")
}

export type DraftFile = { id: string; name: string; type: string; file: Blob }

const draftDb = "ms_pj_draft_files"
const draftStore = "files"

const openDraft = () => {
  const ok = typeof indexedDB !== "undefined"

  if (!ok) {
    return Promise.resolve(null as IDBDatabase | null)
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(draftDb, 1)

    req.onupgradeneeded = () => {
      const db = req.result
      const has = db.objectStoreNames.contains(draftStore)

      if (has) {
        return
      }

      db.createObjectStore(draftStore, { keyPath: "id" })
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

export const loadDraftFiles = () => {
  return openDraft().then((db) => {
    if (!db) {
      return null as DraftFile[] | null
    }

    return new Promise<DraftFile[]>((resolve) => {
      const tx = db.transaction(draftStore, "readonly")
      const st = tx.objectStore(draftStore)
      const req = st.getAll()

      req.onsuccess = () => {
        const res = (req.result as DraftFile[]) ?? []
        resolve(res)
      }

      req.onerror = () => resolve([])
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  })
}

export const saveDraftFiles = (fs: DraftFile[]) => {
  return openDraft().then((db) => {
    if (!db) {
      return
    }

    return new Promise<void>((resolve) => {
      const tx = db.transaction(draftStore, "readwrite")
      const st = tx.objectStore(draftStore)
      st.clear()

      for (var i = 0; i < fs.length; i++) {
        const it = fs[i]

        if (!it) {
          continue
        }

        st.put(it)
      }

      tx.oncomplete = () => {
        db.close()
        resolve()
      }

      tx.onerror = () => {
        db.close()
        resolve()
      }
    })
  })
}
