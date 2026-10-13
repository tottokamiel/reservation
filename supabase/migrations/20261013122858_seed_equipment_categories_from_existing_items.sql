/*
# Seed managed categories from existing equipment

1. Purpose
- Populate the new category management table with every category already used by equipment.

2. Data Safety
- Existing equipment rows are not modified.
- Duplicate category names are ignored.
- The migration is safe to run more than once.
*/

INSERT INTO equipment_categories (name)
SELECT DISTINCT trim(category)
FROM equipment
WHERE trim(category) <> ''
ON CONFLICT (name) DO NOTHING;
