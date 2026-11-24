import { printScript } from '@/app/lib/commands/print'
import { scriptCalls } from '@/app/lib/exportScript'
import { PROJECT_VERSION, directive } from '@/app/lib/project/annotations'
import type { ProjectDocument } from '@/app/lib/project/types'

/** The saved project: executable OpenSeesPy (model, then the enabled analysis sequence) plus `# @pysees` annotations that restore the authored project. Deterministic. */
export function serializeProject(doc: ProjectDocument): string {
  const { model } = doc
  const commands = doc.analysis.commands.slice(0, doc.analysis.cursor + 1)
  const header = [
    directive('project', { version: PROJECT_VERSION, ndm: model.config?.ndm, ndf: model.config?.ndf, units: model.config?.units, nextIds: model.nextIds }),
    directive('layout', { gridlines: doc.gridlines, levels: doc.levels, nextGridlineId: doc.nextGridlineId, nextLevelId: doc.nextLevelId }),
    directive('report', { savedPlots: doc.savedPlots, nextSavedPlotId: doc.nextSavedPlotId, activeSavedPlotId: doc.activeSavedPlotId }),
    directive('display', doc.display),
  ]
  return printScript([...header, ...scriptCalls(model, { commands, cursor: commands.length - 1 }, true)], 'py')
}
