import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ClerkProvider } from "@clerk/clerk-react"

import "./index.css"
import App from "./App.tsx"

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    ) : (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <section className="max-w-xl rounded-xl border bg-white p-6 text-sm text-slate-700 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Missing Clerk Configuration</h1>
          <p className="mt-2">Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in your environment to enable routing and authentication.</p>
        </section>
      </main>
    )}
  </StrictMode>
)
