import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MarketingHeader } from '@/components/MarketingHeader'
import { Link } from 'react-router-dom'

const lastUpdated = 'March 9, 2026'

export function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <MarketingHeader currentPath="/terms" />

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 md:px-6 md:pt-18">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl">Terms of Use & Privacy</h1>
        <p className="mt-4 text-sm text-slate-500">Last updated: {lastUpdated}</p>

        <Card className="mt-8 border-sky-100 bg-sky-50/50">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-slate-900">Simple version</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              You are responsible for checking whether PySees is appropriate for your project. PySees helps generate OpenSeesPy scripts and visualize results, but you remain fully responsible for model assumptions, engineering decisions, code compliance, and project outcomes.
            </p>
          </CardContent>
        </Card>

        <section className="mt-10 space-y-8 text-slate-700">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">1. Terms of Use</h2>
            <p>These Terms govern your use of PySees (the “Service”). By accessing or using PySees, you agree to these Terms.</p>
            <p>PySees is a visual preprocessor/postprocessor for OpenSeesPy. PySees is an independant project and not directly affiliated with OpenSees or OpenSeesPy. It does not run OpenSees analyses in the browser. It does not replace engineering judgment.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">2. Eligibility and Account Use</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>You must provide accurate account information and keep your login credentials secure.</li>
              <li>You are responsible for activity under your account.</li>
              <li>By creating an account, you agree we may contact you about service operations, account security, billing (if applicable), and product updates. You can opt out of non-essential communications.</li>
              <li>You may not use the Service for unlawful activity, abuse, or attempts to compromise system security.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">3. Engineering Responsibility</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>PySees outputs scripts and visualizations “as-is” for your review.</li>
              <li>You must verify all model inputs, constraints, loading, recorder setup, and interpretation of results.</li>
              <li>Use of PySees does not create an engineer-client relationship with PySees or its contributors.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">4. Open Source and Third-Party Services</h3>
            <p>PySees may include or depend on third-party services and open source software. Their separate terms and licenses apply. We are not responsible for third-party service availability, content, or policies.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">5. Disclaimer of Warranties</h3>
            <p>To the maximum extent permitted by law, the Service is provided “as is” and “as available,” without warranties of any kind, express or implied, including fitness for a particular purpose, merchantability, non-infringement, and accuracy.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">6. Limitation of Liability</h3>
            <p>To the maximum extent permitted by law, PySees and its contributors are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, data, goodwill, or business interruption arising from use of the Service.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">7. Termination</h3>
            <p>We may suspend or terminate access to the Service at any time if these Terms are violated or if needed to protect users, systems, or legal compliance.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">8. Changes to These Terms</h3>
            <p>We may update these Terms from time to time. Continued use after updates means you accept the revised Terms.</p>
          </div>
        </section>

        <Separator className="my-10" />

        <section className="space-y-8 text-slate-700">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-slate-900">Privacy Notice</h2>
            <p>This section explains how PySees collects, uses, and handles personal information.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">1. Information We Collect</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Account data from authentication providers (for example: user ID, email, profile metadata).</li>
              <li>Usage and diagnostic data (for example: logs, basic analytics, error reports).</li>
              <li>Content you create in the app, such as model definitions and scripts you choose to store.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">2. How We Use Information</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Provide and secure the Service.</li>
              <li>Authenticate users and manage accounts.</li>
              <li>Diagnose issues, improve reliability, and develop features.</li>
              <li>Respond to support requests and enforce our Terms.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">3. Sharing</h3>
            <p>We do not sell personal information. We may share information with service providers that support authentication, hosting, analytics, and operations, or when required by law.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">4. Data Retention and Security</h3>
            <p>We retain information for as long as needed to operate the Service and meet legal obligations. We use reasonable technical and organizational safeguards, but no system is completely secure.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">5. Your Choices</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>You can request account deletion by contacting us.</li>
              <li>You can avoid storing sensitive project data in the Service.</li>
              <li>You can stop using the Service at any time.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">6. International Users</h3>
            <p>If you access the Service from outside the region where our infrastructure is hosted, your information may be transferred and processed in that region.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">7. Contact</h3>
            <p>
              Questions about these Terms or this Privacy Notice can be sent through our{' '}
              <Link to="/contact" className="font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800">contact page</Link>.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}
