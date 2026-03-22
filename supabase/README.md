# Supabase Setup for Attendance Allowance for You

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Create a new project
3. Note your **Project URL** and **anon public** key (Settings > API)

## 2. Create the tables

1. In Supabase Dashboard, go to **SQL Editor**
2. Run the migration files in order:
   - `supabase/migrations/20250321000000_create_application_submissions.sql`
   - `supabase/migrations/20250321000001_create_callback_submissions.sql`

## 3. Configure your website

Add these to your HTML (before the form script), or in a `config.js` file:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  window.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
  window.SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
</script>
```

**Important:** Add `config.js` to `.gitignore` if you store keys there. The anon key is safe to expose in frontend code; Row Level Security (RLS) restricts what it can do.

## 4. Form integration

The `js/form-submit.js` module expects `formData` with:

- `fullName` (required)
- `email` (required)
- `phone`
- `address`
- `dateOfBirth` (YYYY-MM-DD)
- `careNeedsDescription`
- `preferredContactMethod` ('phone' | 'email' | 'either')
- `eligibilityResult` (optional, from eligibility checker)

Example form submit handler:

```javascript
document.getElementById('application-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const result = await submitApplicationForm({
    fullName: form.querySelector('[name="fullName"]').value,
    email: form.querySelector('[name="email"]').value,
    phone: form.querySelector('[name="phone"]')?.value,
    address: form.querySelector('[name="address"]')?.value,
    dateOfBirth: form.querySelector('[name="dateOfBirth"]')?.value || null,
    careNeedsDescription: form.querySelector('[name="careNeedsDescription"]')?.value,
    preferredContactMethod: form.querySelector('[name="preferredContactMethod"]')?.value
  });
  if (result.success) {
    // Show success message
  } else {
    // Show error: result.error
  }
});
```
