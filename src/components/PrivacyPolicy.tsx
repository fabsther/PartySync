export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-neutral-400 text-sm mb-10">Last updated: February 24, 2026</p>

        <p className="text-neutral-600 mb-8">
          PartySync is a private application for organizing events with friends. This policy explains how we handle your personal data.
        </p>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">1. Data We Collect</h2>
          <ul className="list-disc pl-5 text-neutral-600 space-y-1 text-sm">
            <li><strong>Account information</strong>: email address, full name, and profile photo (provided directly or via Google Sign-In)</li>
            <li><strong>Party data</strong>: events you create or join, guest lists, car-sharing details, and shared content</li>
            <li><strong>Device data</strong>: push notification subscription tokens to deliver notifications</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">2. How We Use Your Data</h2>
          <ul className="list-disc pl-5 text-neutral-600 space-y-1 text-sm">
            <li>To authenticate you and manage your account</li>
            <li>To enable party organization features (guest lists, car sharing, etc.)</li>
            <li>To send you push notifications about events you are part of</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">3. Third-Party Services</h2>
          <ul className="list-disc pl-5 text-neutral-600 space-y-1 text-sm">
            <li><strong>Supabase</strong> — database and authentication provider. Data is stored on Supabase infrastructure. See <a href="https://supabase.com/privacy" className="text-orange-500 underline" target="_blank" rel="noreferrer">Supabase Privacy Policy</a>.</li>
            <li><strong>Google Sign-In</strong> — optional authentication method. We only receive your name, email, and profile photo. See <a href="https://policies.google.com/privacy" className="text-orange-500 underline" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">4. Data Sharing</h2>
          <p className="text-neutral-600 text-sm">We do not sell, rent, or share your personal data with any third parties beyond the services listed above. Your data is only visible to other members of parties you have joined.</p>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">5. Data Retention</h2>
          <p className="text-neutral-600 text-sm">Your data is retained as long as your account exists. You may request deletion of your account and associated data at any time by contacting us.</p>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">6. Security</h2>
          <p className="text-neutral-600 text-sm">All data is transmitted over HTTPS and stored securely on Supabase. We follow industry-standard practices to protect your information.</p>
        </section>

        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-2">7. Your Rights</h2>
          <p className="text-neutral-600 text-sm">You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us at the address below.</p>
        </section>

        <section className="mb-10">
          <h2 className="font-semibold text-lg mb-2">8. Contact</h2>
          <p className="text-neutral-600 text-sm">For any privacy-related questions: <a href="mailto:fabsther@gmail.com" className="text-orange-500 underline">fabsther@gmail.com</a></p>
        </section>

        <div className="border-t pt-6">
          <a href="/" className="text-orange-500 text-sm hover:underline">← Back to PartySync</a>
        </div>
      </div>
    </div>
  );
}
