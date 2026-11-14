-- ==============================================================================
-- Mysuru Civic Connect (MCC) — Supabase PostgreSQL Database Foundation
-- Migration: 001_initial_schema.sql
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. Master Tables: Wards & Departments
-- ==============================================================================

-- 2.1 Wards Table (65 Verified Mysuru City Corporation Wards)
CREATE TABLE IF NOT EXISTS public.wards (
  id SERIAL PRIMARY KEY,
  ward_number INTEGER NOT NULL UNIQUE,
  ward_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Departments Table (4 Official MCC Departments)
CREATE TABLE IF NOT EXISTS public.departments (
  id SERIAL PRIMARY KEY,
  department_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. Profiles Table (Linked 1-to-1 with Supabase Auth Users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('citizen', 'field_officer', 'corporator', 'admin')) DEFAULT 'citizen',
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_ward_id ON public.profiles(ward_id);

-- ==============================================================================
-- 4. Staff Assignments Table (Maps Officers to Depts and Corporators to Wards)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id SERIAL PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES public.departments(id) ON DELETE CASCADE,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff_id ON public.staff_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_dept ON public.staff_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_ward ON public.staff_assignments(ward_id);

-- ==============================================================================
-- 5. Complaints Table (Core Civic Grievance Records)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_code TEXT NOT NULL UNIQUE,
  citizen_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ward_id INTEGER REFERENCES public.wards(id) ON DELETE SET NULL,
  department_id INTEGER REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_officer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'LOW',
  priority_score INTEGER DEFAULT 0,
  priority_reasons JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN (
    'Submitted', 
    'Assigned', 
    'In Progress', 
    'Verification Pending', 
    'Resolved', 
    'Rejected'
  )) DEFAULT 'Submitted',
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_citizen ON public.complaints(citizen_id);
CREATE INDEX IF NOT EXISTS idx_complaints_ward ON public.complaints(ward_id);
CREATE INDEX IF NOT EXISTS idx_complaints_dept ON public.complaints(department_id);
CREATE INDEX IF NOT EXISTS idx_complaints_officer ON public.complaints(assigned_officer_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_code ON public.complaints(complaint_code);

-- ==============================================================================
-- 6. Attachments & History Tables
-- ==============================================================================

-- 6.1 Complaint Attachments (AWS S3 Object Metadata)
CREATE TABLE IF NOT EXISTS public.complaint_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  s3_object_key TEXT NOT NULL,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('issue', 'resolution')),
  file_name TEXT,
  file_size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_complaint ON public.complaint_attachments(complaint_id);

-- 6.2 Complaint History (Lifecycle Audit Trail)
CREATE TABLE IF NOT EXISTS public.complaint_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_complaint ON public.complaint_history(complaint_id);

-- ==============================================================================
-- 7. Utility Functions & Automatic Timestamps
-- ==============================================================================

-- 7.1 Auto-update updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON public.complaints;
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7.2 Helper Function: Get Current Authenticated User's Role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 8. Supabase Auth Integration Trigger (Auto-provision Profile)
-- ==============================================================================

-- Automatically inserts a corresponding profile when a citizen registers via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    'citizen' -- Safety rule: public registrations always default strictly to 'citizen'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 9. Row Level Security (RLS) Policies
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_history ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 9.1 Wards & Departments RLS
-- ------------------------------------------------------------------------------
-- Public and authenticated users can read wards and departments (needed for dropdowns & GIS maps)
CREATE POLICY "wards_public_read" ON public.wards
  FOR SELECT USING (true);

CREATE POLICY "departments_public_read" ON public.departments
  FOR SELECT USING (true);

-- Admin write access
CREATE POLICY "wards_admin_write" ON public.wards
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');

CREATE POLICY "departments_admin_write" ON public.departments
  FOR ALL TO authenticated USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- 9.2 Profiles RLS
-- ------------------------------------------------------------------------------
-- Authenticated users can read profiles (needed to display submitter/officer names)
CREATE POLICY "profiles_authenticated_read" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update their own personal info, but CANNOT escalate their own role
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() 
    AND (role = (SELECT role FROM public.profiles WHERE id = auth.uid()) OR public.current_user_role() = 'admin')
  );

-- Admins can update/manage all profiles
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- 9.3 Staff Assignments RLS
-- ------------------------------------------------------------------------------
CREATE POLICY "assignments_read_all" ON public.staff_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assignments_admin_manage" ON public.staff_assignments
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- 9.4 Complaints RLS (Role-Scoped Access Control)
-- ------------------------------------------------------------------------------
-- SELECT:
-- 1. Admins see all city-wide complaints
-- 2. Citizens see complaints they submitted
-- 3. Officers see complaints assigned to them OR assigned to their department
-- 4. Corporators see complaints within their assigned ward
CREATE POLICY "complaints_select_policy" ON public.complaints
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR citizen_id = auth.uid()
    OR (
      public.current_user_role() = 'field_officer'
      AND (
        assigned_officer_id = auth.uid()
        OR department_id IN (
          SELECT department_id FROM public.staff_assignments WHERE staff_id = auth.uid()
        )
      )
    )
    OR (
      public.current_user_role() = 'corporator'
      AND (
        ward_id IN (
          SELECT ward_id FROM public.staff_assignments WHERE staff_id = auth.uid()
        )
        OR ward_id = (SELECT ward_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- INSERT:
-- Authenticated users can insert grievances with citizen_id bound to their auth.uid()
CREATE POLICY "complaints_insert_policy" ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    citizen_id = auth.uid()
  );

-- UPDATE:
-- Role-based update permissions
CREATE POLICY "complaints_update_policy" ON public.complaints
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'field_officer'
      AND (
        assigned_officer_id = auth.uid()
        OR department_id IN (
          SELECT department_id FROM public.staff_assignments WHERE staff_id = auth.uid()
        )
      )
    )
    OR (
      public.current_user_role() = 'corporator'
      AND (
        ward_id IN (
          SELECT ward_id FROM public.staff_assignments WHERE staff_id = auth.uid()
        )
        OR ward_id = (SELECT ward_id FROM public.profiles WHERE id = auth.uid())
      )
    )
    OR (
      public.current_user_role() = 'citizen'
      AND citizen_id = auth.uid()
      AND status = 'Submitted'
    )
  );

-- ------------------------------------------------------------------------------
-- 9.5 Complaint Attachments RLS
-- ------------------------------------------------------------------------------
-- Readable if the user has access to view the parent complaint
CREATE POLICY "attachments_select_policy" ON public.complaint_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_attachments.complaint_id
    )
  );

-- Insert allowed if uploaded_by is the current authenticated user
CREATE POLICY "attachments_insert_policy" ON public.complaint_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
  );

-- ------------------------------------------------------------------------------
-- 9.6 Complaint History RLS
-- ------------------------------------------------------------------------------
-- Readable if the user has access to view the parent complaint
CREATE POLICY "history_select_policy" ON public.complaint_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_history.complaint_id
    )
  );

-- Insert audit entry allowed for authenticated users updating complaint
CREATE POLICY "history_insert_policy" ON public.complaint_history
  FOR INSERT TO authenticated
  WITH CHECK (
    updated_by = auth.uid()
  );

