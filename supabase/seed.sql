-- ==============================================================================
-- Mysuru Civic Connect (MCC) — Database Seed Script
-- File: supabase/seed.sql
-- ==============================================================================

-- 1. Insert Official MCC Departments
INSERT INTO public.departments (id, department_name, description) VALUES
  (1, 'Solid Waste Management', 'Handles municipal solid waste, garbage dumping, and street sanitation.'),
  (2, 'Roads & Infrastructure', 'Handles potholes, asphalt repairs, pavements, and civil road engineering.'),
  (3, 'Electrical & Street Lighting', 'Handles street illumination, LED poles, junction boxes, and streetlights.'),
  (4, 'Water Supply & Sewerage', 'Handles drinking water pipelines, valves, water leakages, and sewage drains.')
ON CONFLICT (id) DO UPDATE SET
  department_name = EXCLUDED.department_name,
  description = EXCLUDED.description;

SELECT setval('public.departments_id_seq', (SELECT MAX(id) FROM public.departments));

-- 2. Insert 65 Verified MCC Municipal Wards
INSERT INTO public.wards (ward_number, ward_name) VALUES
  (1, 'Hebbalu Lakshmikanthanagar'),
  (2, 'Manchegowdanakoppalu'),
  (3, 'Madeshwaranagara Badavane'),
  (4, 'Hebbalu Lokanayakananagar'),
  (5, 'Kumbarakoppalu'),
  (6, 'Gokulam,Brudhavana'),
  (7, 'Metagali'),
  (8, 'Bannimantapa Hudco Badavane'),
  (9, 'Kesare'),
  (10, 'Rajivanagara'),
  (11, 'Shanthinagara 1'),
  (12, 'Shanthinagara 2'),
  (13, 'Udayagiri'),
  (14, 'Sathyanagara'),
  (15, 'Rajendranagara'),
  (16, 'Subashnagara'),
  (17, 'Bannimantapa'),
  (18, 'Yadavagiri'),
  (19, 'Jayalakshmipuram,V.V.Mohalla'),
  (20, 'Vijayanagara 1St & 2Nd Stage'),
  (21, 'Gangothri Ward'),
  (22, 'Padavarahalli_Vontikoppal'),
  (23, 'Subbarayanakere'),
  (24, 'Mandi Mohalla'),
  (25, 'Thilaknagara'),
  (26, 'Meenabazaar'),
  (27, 'Yeraganahalli'),
  (28, 'Gandhinagara'),
  (29, 'N R_Mohalla'),
  (30, 'Kyathamaranahalli'),
  (31, 'K N Pura & Gousianagara'),
  (32, 'Gousianagara Ablock,Usmaniya Block'),
  (33, 'Ajizsait Nagara'),
  (34, 'Kalyanagiri'),
  (35, 'Sathgallai Badavane 1St Stage'),
  (36, 'Yaraganahalli, Ambedkar Colony'),
  (37, 'Ragavendra Nagara'),
  (38, 'Giriyabovipallya'),
  (39, 'Gathripuram 1St Stage'),
  (40, 'Lashkar Mohalla'),
  (41, 'Devarajamohalla'),
  (42, 'K G Koppal'),
  (43, 'Tk_Layout'),
  (44, 'Janathanagara'),
  (45, 'Sharadadevinagara'),
  (46, 'Dattagalli'),
  (47, 'Kuvempu Nagara'),
  (48, 'Jayanagara'),
  (49, 'Lakshmipuram'),
  (50, 'Sunnadakeri'),
  (51, 'Agrahara'),
  (52, 'Ittigegudu'),
  (53, 'Kurubarahalli'),
  (54, 'Gunduraonagara'),
  (55, 'Chamundipuram'),
  (56, 'Krishnamurthipuram'),
  (57, 'Kuvempu Nagara C I T B'),
  (58, 'Ramakrishnanagara'),
  (59, 'Kuvempu Nagara M Block'),
  (60, 'Ashokapuram'),
  (61, 'Vidyaranyapuram'),
  (62, 'Vishweshwaranagara'),
  (63, 'J P Nagara'),
  (64, 'Aravindanagara'),
  (65, 'Srirampura')
ON CONFLICT (ward_number) DO UPDATE SET ward_name = EXCLUDED.ward_name;

SELECT setval('public.wards_id_seq', (SELECT MAX(id) FROM public.wards));

-- ==============================================================================
-- 3. Staff Role Configuration (Run AFTER creating Auth accounts in Supabase)
-- ==============================================================================
-- Once you register or invite staff accounts in Supabase Auth, run this snippet
-- to elevate their roles from the default 'citizen' to their official staff roles:
/*
-- 1. Central Administrator
UPDATE public.profiles
SET role = 'admin', full_name = 'MCC Central Administrator'
WHERE email = 'admin@mcc.gov.in';

-- 2. Roads Executive Engineer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Suresh Gowda (EE - Roads)'
WHERE email = 'roads.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 2, NULL FROM public.profiles WHERE email = 'roads.officer@mcc.gov.in'
ON CONFLICT DO NOTHING;

-- 3. Solid Waste Management Officer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Ramesh Kumar (SWM Officer)'
WHERE email = 'swm.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 1, NULL FROM public.profiles WHERE email = 'swm.officer@mcc.gov.in'
ON CONFLICT DO NOTHING;

-- 4. Electrical & Street Lighting AEE
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Vijay Bhaskar (AEE - Lighting)'
WHERE email = 'elec.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 3, NULL FROM public.profiles WHERE email = 'elec.officer@mcc.gov.in'
ON CONFLICT DO NOTHING;

-- 5. Water Supply & Sewerage Officer
UPDATE public.profiles
SET role = 'field_officer', full_name = 'Manjunath Swamy (Water Supply)'
WHERE email = 'water.officer@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, 4, NULL FROM public.profiles WHERE email = 'water.officer@mcc.gov.in'
ON CONFLICT DO NOTHING;

-- 6. Corporator (Ward 12 - J P Nagar)
UPDATE public.profiles
SET role = 'corporator', full_name = 'Corporator (Ward 12 - J P Nagar)', ward_id = 12
WHERE email = 'ward12.corporator@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, NULL, 12 FROM public.profiles WHERE email = 'ward12.corporator@mcc.gov.in'
ON CONFLICT DO NOTHING;

-- 7. Corporator (Ward 1 - Hebbalu)
UPDATE public.profiles
SET role = 'corporator', full_name = 'Corporator (Ward 1 - Hebbalu)', ward_id = 1
WHERE email = 'ward1.corporator@mcc.gov.in';

INSERT INTO public.staff_assignments (staff_id, department_id, ward_id)
SELECT id, NULL, 1 FROM public.profiles WHERE email = 'ward1.corporator@mcc.gov.in'
ON CONFLICT DO NOTHING;
*/
