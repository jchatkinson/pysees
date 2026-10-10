import { captureProject, type ProjectSource } from '@/app/lib/project/types'
import { serializeProject } from '@/app/lib/project/serialize'

/** Downloads the current project as an annotated OpenSeesPy script. */
export function downloadProject(source: ProjectSource, filename = 'model.py') {
  const url = URL.createObjectURL(new Blob([serializeProject(captureProject(source))], { type: 'text/x-python' }))
  const a = document.createElement('a')
  a.href = url
  a.download = /\.py$/i.test(filename) ? filename : `${filename.replace(/\.[^.]*$/, '')}.py`
  a.click()
  URL.revokeObjectURL(url)
}
