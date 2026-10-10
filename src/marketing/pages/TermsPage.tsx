import { Card, CardContent } from '@/app/components/ui/card'
import { Separator } from '@/app/components/ui/separator'
import { MarketingHeader } from '@/marketing/components/MarketingHeader'
import { Link } from 'react-router-dom'

const lastUpdated = 'October 10, 2026'

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
            <p>PySees is a browser-based tool for building, analyzing and postprocessing structural models, and for exporting them to OpenSeesPy. Analyses run in your browser on the Carapace engine; PySees does not run OpenSees itself. PySees is an independent project and not directly affiliated with OpenSees or OpenSeesPy. It does not replace engineering judgment.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">2. Use of the Service</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>PySees does not require an account or login.</li>
              <li>You are responsible for your use of the Service and for keeping copies of your models and scripts.</li>
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
              <li>PySees has no user accounts and does not collect account identifiers, email addresses, or profile data for authentication.</li>
              <li>Models and analyses run in your browser. Analysis results are stored locally in your browser, and model definitions and scripts are not uploaded by the app.</li>
              <li>Hosting providers may process standard request information, such as IP addresses and browser details, when serving the website.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">2. How We Use Information</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Provide and secure the Service.</li>
              <li>Diagnose issues, improve reliability, and develop features.</li>
              <li>Respond to support requests and enforce our Terms.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">3. Sharing</h3>
            <p>We do not sell personal information. Website hosting may involve service providers processing request information, or disclosure when required by law.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">4. Data Retention and Security</h3>
            <p>Analysis results remain in browser storage until removed by the app or cleared through your browser settings. Keep your own copies of models and exported scripts. Hosting providers manage any request logs under their own retention and security policies.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">5. Your Choices</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>You can clear locally stored results through your browser’s site-data settings.</li>
              <li>You can export scripts and keep your own project files.</li>
              <li>You can stop using the Service at any time.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-slate-900">6. International Users</h3>
            <p>Website requests may be processed wherever the hosting provider operates. Model analysis and result storage take place in your browser.</p>
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
