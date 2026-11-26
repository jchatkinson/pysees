import { useEffect, useRef } from 'react'
import { openPath, readScriptFile } from '@/app/lib/project/open'
import { useAppStore } from '@/app/store/useAppStore'

/**
 * `/studio?open=/verification/<case>.pysees.py` opens that project, the way File > Open would: the site's "Open in PySees" links. Only paths
 * on this site are read. The parameter is removed from the address afterwards so a reload doesn't reopen it over the user's edits.
 */
export function OpenFromUrl() {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const path = openPath(window.location.search)
    if (!path) return
    const url = new URL(window.location.href)
    url.searchParams.delete('open')
    window.history.replaceState(null, '', url)
    const name = path.split('/').pop()!
    const { model, loadProject, initModel } = useAppStore.getState()
    if (model.config && !window.confirm(`Replace the current model with ${name}?`)) return
    fetch(path)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((text) => {
        const r = readScriptFile(text, name)
        if (r.project) loadProject(r.project, name)
        else if (r.writes.length) initModel(r.ndm, r.ndf, { writes: r.writes })
        else throw new Error(r.diagnostics.map((d) => d.message).join('\n') || 'nothing to open')
      })
      .catch((e: Error) => window.alert(`Could not open ${name}: ${e.message}`))
  }, [])
  return null
}
