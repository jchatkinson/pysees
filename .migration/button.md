# button

2026-09-18, golden pair via CLI (`shadcn add button --overwrite` against `base-mira`). Clean migration to the real `@base-ui/react/button` primitive (not a hand-rolled `useRender` wrapper, per the skill's hard rule).

## Changed

- `src/app/components/ui/button.tsx` — CLI-delivered `base-mira` variant. Re-pointed `import { cn } from "cn"` -> `import { cn } from "@/app/lib/utils"` to match the project's existing convention (see `project.md`). Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/app/components/ui/button.tsx` — no matches.
- Every consumer using `<Button asChild>...</Button>` had to move to `render`, since Base UI's `Button` has no `asChild`:
  - `src/App.tsx:55`
  - `src/marketing/pages/LandingPage.tsx:33,36,40`
  - `src/marketing/components/LandingFooter.tsx:43,46,51`
  - `src/marketing/components/MarketingHeader.tsx:42`
  - `src/marketing/components/ChangelogSection.tsx:122`
  - `src/app/components/ui/input-group.tsx`'s `InputGroupButton` forwards `React.ComponentProps<typeof Button>` unchanged, so it inherited `render` support automatically — only its one consumer (`combobox.tsx`) needed a call-site fix, tracked in `dropdown-menu.md`'s sibling note (see `combobox.tsx` change in `project.md`).

## Left alone

- `src/app/components/ui/badge.tsx`, `chart.tsx`, `combobox.tsx`, `tabs.tsx`, `toggle.tsx` each have an unrelated pre-existing `react-refresh/only-export-components` ESLint error (verified against `git show HEAD:<file>`, not introduced here).

## Behavior changes

None observed. Base UI's `Button` renders a native `<button>` by default, matching Radix's `Slot`-based `<button>` fallback; all `variant`/`size` classes are unchanged (`buttonVariants` untouched by the primitive swap).

## Verify by hand

1. Every button in the top bar, action bar, and dialogs is clickable and focus-visible ring still appears on keyboard focus.
2. Landing page and 404 page "Sign up" / "Open Studio" buttons render as real `<a>` tags (inspect DOM) and navigate via React Router, not a full page reload.
