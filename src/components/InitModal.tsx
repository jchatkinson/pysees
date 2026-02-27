import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import {
  momentCurvatureTemplate,
  cantileverTemplate,
  frameTemplate,
  type CantileverParams,
  type FrameParams,
} from '@/lib/templates'

type Choice = 'new' | 'load' | 'momentCurvature' | 'cantilever' | 'frame'

interface CardProps {
  title: string
  description: string
  onClick?: () => void
  disabled?: boolean
}

function Card({ title, description, onClick, disabled }: CardProps) {
  return (
    <button
      className={[
        'border rounded-sm p-2 text-left w-full transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent cursor-pointer',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className="bg-muted rounded-sm aspect-video w-full mb-2" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </button>
  )
}

export function InitModal() {
  const config = useAppStore((s) => s.config)
  const initModel = useAppStore((s) => s.initModel)

  const [step, setStep] = useState<1 | 2>(1)
  const [choice, setChoice] = useState<Choice | null>(null)

  // New model
  const [ndm, setNdm] = useState<2 | 3>(3)
  const [ndf, setNdf] = useState(6)

  // Cantilever
  const [cantN, setCantN] = useState(10)
  const [cantH, setCantH] = useState(5.0)
  const [cantEle, setCantEle] = useState<CantileverParams['eleType']>('elasticBeamColumn')

  // 2D Frame
  const [stories, setStories] = useState(3)
  const [storyH, setStoryH] = useState(3.0)
  const [bays, setBays] = useState(2)
  const [bayW, setBayW] = useState(5.0)
  const [frameEle, setFrameEle] = useState<FrameParams['eleType']>('elasticBeamColumn')
  const [frameBase, setFrameBase] = useState<FrameParams['base']>('fixed')

  if (config) return null

  function select(c: Choice) {
    setChoice(c)
    setStep(2)
  }

  function handleCreate() {
    if (choice === 'new') {
      initModel(ndm, ndf)
    } else if (choice === 'momentCurvature') {
      const t = momentCurvatureTemplate()
      initModel(t.ndm, t.ndf, t.commands)
    } else if (choice === 'cantilever') {
      const t = cantileverTemplate({ n: cantN, h: cantH, eleType: cantEle })
      initModel(t.ndm, t.ndf, t.commands)
    } else if (choice === 'frame') {
      const t = frameTemplate({ stories, storyH, bays, bayW, eleType: frameEle, base: frameBase })
      initModel(t.ndm, t.ndf, t.commands)
    }
  }

  const step2Title: Record<Exclude<Choice, 'load'>, string> = {
    new: 'New Model',
    momentCurvature: 'Moment-Curvature',
    cantilever: 'Cantilever Column',
    frame: '2D Frame',
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>PySees</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Card title="New" description="Start from scratch with custom ndm/ndf." onClick={() => select('new')} />
              <Card title="Load" description="Open a previously saved project." disabled />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Templates</p>
            <div className="grid grid-cols-3 gap-2">
              <Card
                title="Moment-Curvature"
                description="Two-node zerolength with fiber section (300×500mm, 4 Ø20 bars)."
                onClick={() => select('momentCurvature')}
              />
              <Card
                title="Cantilever Column"
                description="Single column of n elements in y, fixed base."
                onClick={() => select('cantilever')}
              />
              <Card
                title="2D Frame"
                description="Story-bay grid with columns and beams."
                onClick={() => select('frame')}
              />
            </div>
          </>
        )}

        {step === 2 && choice && choice !== 'load' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  onClick={() => setStep(1)}
                >
                  ← Back
                </button>
                <DialogTitle>{step2Title[choice]}</DialogTitle>
              </div>
            </DialogHeader>

            {choice === 'new' && (
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Dimensions (ndm)</Label>
                  <Select
                    value={String(ndm)}
                    onValueChange={(v) => { const n = Number(v) as 2 | 3; setNdm(n); setNdf(n === 2 ? 3 : 6) }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2D</SelectItem>
                      <SelectItem value="3">3D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>DOFs per node (ndf)</Label>
                  <Input
                    type="number"
                    value={ndf}
                    min={1}
                    max={6}
                    onChange={(e) => setNdf(Math.max(1, Math.min(6, Number(e.target.value))))}
                  />
                </div>
              </div>
            )}

            {choice === 'momentCurvature' && (
              <div className="py-2 text-sm text-muted-foreground space-y-1">
                <p>Creates a 2D model (ndm=2, ndf=3) with:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>2 nodes at the origin (zerolength element)</li>
                  <li>Fixed end at node 1</li>
                  <li>Steel01 — Fy=400 MPa, E=200 GPa, b=0.01</li>
                  <li>Concrete01 — fpc=−30 MPa, epsu=0.006</li>
                  <li>Fiber section: 300×500 mm, 4×Ø20 mm corner bars (40 mm cover)</li>
                </ul>
              </div>
            )}

            {choice === 'cantilever' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Elements (n)</Label>
                    <Input type="number" value={cantN} min={1} onChange={(e) => setCantN(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Height (m)</Label>
                    <Input type="number" value={cantH} min={0.1} step={0.5} onChange={(e) => setCantH(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Element type</Label>
                  <Select value={cantEle} onValueChange={(v) => setCantEle(v as CantileverParams['eleType'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="elasticBeamColumn">elasticBeamColumn</SelectItem>
                      <SelectItem value="dispBeamColumn">dispBeamColumn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {choice === 'frame' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Stories</Label>
                    <Input type="number" value={stories} min={1} onChange={(e) => setStories(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Story height (m)</Label>
                    <Input type="number" value={storyH} min={0.1} step={0.5} onChange={(e) => setStoryH(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bays</Label>
                    <Input type="number" value={bays} min={1} onChange={(e) => setBays(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bay width (m)</Label>
                    <Input type="number" value={bayW} min={0.1} step={0.5} onChange={(e) => setBayW(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Element type</Label>
                    <Select value={frameEle} onValueChange={(v) => setFrameEle(v as FrameParams['eleType'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elasticBeamColumn">elasticBeamColumn</SelectItem>
                        <SelectItem value="dispBeamColumn">dispBeamColumn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Base condition</Label>
                    <Select value={frameBase} onValueChange={(v) => setFrameBase(v as FrameParams['base'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="pinned">Pinned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleCreate}>Create Model</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
