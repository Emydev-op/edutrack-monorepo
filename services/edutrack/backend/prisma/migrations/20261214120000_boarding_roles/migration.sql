-- Boarding roles and permissions for schools that already exist (new schools get them when
-- they are set up). Whole-school roles that run boarding gain the new `boarding` permissions;
-- four new predefined roles are added (skipped where a school already has a role of that name).

UPDATE "school_roles"
SET "permissions" = "permissions" || '{"boarding":["view","manage","exeats","gate","health","rollcall"]}'::jsonb
WHERE "type" = 'PREDEFINED' AND "key" IN ('owner', 'school_admin');

UPDATE "school_roles"
SET "permissions" = "permissions" || '{"boarding":["view","exeats"]}'::jsonb
WHERE "type" = 'PREDEFINED' AND "key" = 'principal';

UPDATE "school_roles"
SET "permissions" = "permissions" || '{"boarding":["view","manage","exeats"]}'::jsonb
WHERE "type" = 'PREDEFINED' AND "key" = 'branch_admin';

INSERT INTO "school_roles" ("id", "school_id", "key", "name", "type", "scope", "description", "permissions", "created_at", "updated_at")
SELECT gen_random_uuid(), s."id", r.key, r.name, 'PREDEFINED', 'SCHOOL', r.description, r.permissions::jsonb, now(), now()
FROM "schools" s
CROSS JOIN (VALUES
  ('head_of_boarding', 'Head of Boarding', 'Run the boarding house: hostels, places, exeats, roll calls, sick bay',
   '{"students":["view"],"comms":["view","class"],"boarding":["view","manage","exeats","gate","health","rollcall"]}'),
  ('house_staff', 'House Staff', 'House master or mistress, matron: their hostel, roll calls, exeats',
   '{"students":["view"],"comms":["view","class"],"boarding":["view","exeats","rollcall"]}'),
  ('gate_officer', 'Gate Officer', 'Sign boarders out and in at the gate, and log visitors',
   '{"boarding":["view","gate"]}'),
  ('nurse', 'Nurse', 'Sick bay visits and boarders’ health',
   '{"students":["view"],"boarding":["view","health"]}')
) AS r(key, name, description, permissions)
ON CONFLICT DO NOTHING;
