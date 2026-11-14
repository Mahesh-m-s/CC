# Mysuru Civic Connect (MCC) — Supabase Setup & Migration Guide

This guide walks you through setting up **Supabase PostgreSQL & Auth** for your Cloud Computing demonstration.

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose your organization, set:
   - **Name:** `mysuru-civic-connect`
   - **Database Password:** (choose a secure password and save it)
   - **Region:** `ap-south-1 (Mumbai)` (recommended for low latency in India)
4. Click **Create new project** and wait ~2 minutes for the database to provision.

---

## 2. Execute SQL Migrations

1. In your Supabase Dashboard, click on the **SQL Editor** icon in the left sidebar (looks like `>_`).
2. Click **New Query**.
3. Open and copy the entire contents of [supabase/migrations/001_initial_schema.sql](file:///run/media/mahesh/New%20Volume/Projects/CC_Project/MCC/supabase/migrations/001_initial_schema.sql).
4. Paste into the SQL Editor and click **Run** (green button).
   - This creates:
     - `wards` (65 wards)
     - `departments` (4 official MCC departments)
     - `profiles` (linked 1-to-1 with Supabase Auth)
     - `complaints` (civic grievance records)
     - `complaint_attachments` (AWS S3 keys and metadata)
     - `complaint_history` (audit lifecycle log)
     - `staff_assignments` (officers/corporators mapping)
     - Profile auto-creation trigger on `auth.users`
     - Complete Row Level Security (RLS) policies for all 4 roles.

---

## 3. Populate Seed Data (Wards & Departments)

1. Open another **New Query** in the Supabase SQL Editor.
2. Copy the contents of [supabase/seed.sql](file:///run/media/mahesh/New%20Volume/Projects/CC_Project/MCC/supabase/seed.sql).
3. Paste and click **Run**.
   - This seeds the 4 official departments and all 65 authentic Mysuru City Corporation municipal wards.

---

## 4. Configure Supabase Authentication for Live Demo

For a smooth college viva demonstration without waiting for email confirmation links:

1. In Supabase Dashboard, go to **Authentication** (left menu) -> **Providers** -> **Email**.
2. **Turn OFF** `Confirm email` (toggle switch).
3. Click **Save**.
   > *Result:* When a citizen registers on your React frontend, they are immediately authenticated and signed in without email verification delays.

---

## 5. Obtain API Keys for Environment Variables

1. In Supabase Dashboard, go to **Project Settings** (gear icon) -> **API**.
2. Find the following values:
   - **Project URL:** e.g., `https://abcdefghijkl.supabase.co`
   - **anon / public key:** e.g., `eyJhbGciOi...`
3. Add these to your project's `.env`:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
   ```
4. For the Express backend (`backend/.env`):
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
   ```

---

## 6. Pre-Creating Staff Accounts for Demo

By design, **public citizen registration strictly creates Citizen accounts** (preventing privilege escalation).

To test Officer, Corporator, and Admin workflows:

### Step 6.1: Create Accounts in Supabase Auth
Go to **Authentication** -> **Users** -> **Add user** -> **Create user**:
1. `admin@mcc.gov.in` (Password: `Admin@123`)
2. `roads.officer@mcc.gov.in` (Password: `Officer@123`)
3. `swm.officer@mcc.gov.in` (Password: `Officer@123`)
4. `elec.officer@mcc.gov.in` (Password: `Officer@123`)
5. `water.officer@mcc.gov.in` (Password: `Officer@123`)
6. `ward12.corporator@mcc.gov.in` (Password: `Corporator@123`)
7. `ward1.corporator@mcc.gov.in` (Password: `Corporator@123`)

*(Note: The auto-trigger will create standard profile records for them.)*

### Step 6.2: Elevate Staff Roles in SQL Editor
Run the elevation query at the bottom of `supabase/seed.sql`:

```sql
-- 1. Central Administrator
UPDATE public.profiles
SET role = 'admin', full_name = 'MCC Central Administrator'
WHERE email = 'admin@mcc.gov.in';

-- 2. Roads Executive Engineer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Suresh Gowda (EE - Roads)'
WHERE email = 'roads.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 2, NULL FROM public.profiles WHERE email = 'roads.officer@mcc.gov.in';

-- 3. Solid Waste Management Officer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Ramesh Kumar (SWM Officer)'
WHERE email = 'swm.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 1, NULL FROM public.profiles WHERE email = 'swm.officer@mcc.gov.in';

-- 4. Electrical Officer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Vijay Bhaskar (AEE - Lighting)'
WHERE email = 'elec.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 3, NULL FROM public.profiles WHERE email = 'elec.officer@mcc.gov.in';

-- 5. Water Supply Officer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Manjunath Swamy (Water Supply)'
WHERE email = 'water.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 4, NULL FROM public.profiles WHERE email = 'water.officer@mcc.gov.in';

-- 6. Corporator Ward 12 (J P Nagar)
UPDATE public.profiles
SET role = 'corporator', full_name = 'Corporator (Ward 12 - J P Nagar)', ward_id = 12
WHERE email = 'ward12.corporator@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, NULL, 12 FROM public.profiles WHERE email = 'ward12.corporator@mcc.gov.in';

-- 7. Corporator Ward 1 (Hebbalu)
UPDATE public.profiles
SET role = 'corporator', full_name = 'Corporator (Ward 1 - Hebbalu)', ward_id = 1
WHERE email = 'ward1.corporator@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, NULL, 1 FROM public.profiles WHERE email = 'ward1.corporator@mcc.gov.in';
```

