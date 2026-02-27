import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

export function InitModal() {
  const [ndm, setNdm] = useState<2 | 3>(3)
  const [ndf, setNdf] = useState(6)
  const config = useAppStore((s) => s.config)
  const initModel = useAppStore((s) => s.initModel)

  if (config) return null

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>New Model</DialogTitle>
          <DialogDescription>
            Set model dimensions. These cannot be changed after the model is created.
          </DialogDescription>
        </DialogHeader>
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
        <div className="flex justify-end">
          <Button onClick={() => initModel(ndm, ndf)}>Create Model</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
