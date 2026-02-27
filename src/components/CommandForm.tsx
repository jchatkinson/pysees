export function CommandForm() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b shrink-0">Command</div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a command type to add.</p>
      </div>
    </div>
  )
}
