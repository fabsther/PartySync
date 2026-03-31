export function DataDeletion() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-1">Data Deletion Instructions</h1>
        <p className="text-neutral-400 text-sm mb-10">Last updated: April 1, 2026</p>

        <p className="text-neutral-600 mb-8">
          In accordance with the General Data Protection Regulation (GDPR) and applicable data
          protection laws, you have the right to request the deletion of all personal data
          associated with your PartySync account.
        </p>

        <section className="mb-8">
          <h2 className="font-semibold text-lg mb-3">Option 1 — Delete directly in the app (instant)</h2>
          <p className="text-neutral-600 text-sm mb-3">
            The fastest way to delete your data is directly from the PartySync app:
          </p>
          <ol className="list-decimal pl-5 text-neutral-600 space-y-2 text-sm">
            <li>Open the PartySync app and sign in to your account</li>
            <li>Tap the <strong>Profile</strong> icon in the navigation menu</li>
            <li>Scroll down to the <strong>Personal Data (GDPR)</strong> section</li>
            <li>Tap <strong>"Delete my account"</strong></li>
            <li>Type <strong>SUPPRIMER</strong> in the confirmation field and confirm</li>
          </ol>
          <p className="text-neutral-600 text-sm mt-3">
            This immediately and permanently deletes your account, profile, party memberships,
            subscriptions, notifications, and all associated data from our systems.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="font-semibold text-lg mb-3">Option 2 — Request by email</h2>
          <p className="text-neutral-600 text-sm mb-2">
            If you no longer have access to your account, you can submit a deletion request by email:
          </p>
          <ul className="list-disc pl-5 text-neutral-600 space-y-1 text-sm">
            <li>Send an email to <a href="mailto:fabsther@gmail.com" className="text-orange-500 underline">fabsther@gmail.com</a></li>
            <li>Subject: <strong>Data Deletion Request — PartySync</strong></li>
            <li>Include the email address associated with your account</li>
          </ul>
          <p className="text-neutral-600 text-sm mt-3">
            We will process your request within <strong>30 days</strong> and confirm deletion by email.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="font-semibold text-lg mb-3">What data is deleted</h2>
          <ul className="list-disc pl-5 text-neutral-600 space-y-1 text-sm">
            <li>Your account credentials and profile (name, email, avatar)</li>
            <li>Your party memberships and RSVP history</li>
            <li>Your subscriber and subscription relationships</li>
            <li>Your push notification subscriptions</li>
            <li>Your car-sharing, equipment, and food contribution data</li>
            <li>Your notification history</li>
            <li>Any content you posted (messages, comments)</li>
          </ul>
          <p className="text-neutral-600 text-sm mt-3">
            Note: parties you created and their content (guest lists, posts, etc.) may remain
            visible to other participants unless you delete them before closing your account.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="font-semibold text-lg mb-3">Contact</h2>
          <p className="text-neutral-600 text-sm">
            For any questions regarding your data:{' '}
            <a href="mailto:fabsther@gmail.com" className="text-orange-500 underline">
              fabsther@gmail.com
            </a>
          </p>
        </section>

        <div className="border-t pt-6 flex gap-6">
          <a href="/" className="text-orange-500 text-sm hover:underline">← Back to PartySync</a>
          <a href="/privacy" className="text-orange-500 text-sm hover:underline">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
