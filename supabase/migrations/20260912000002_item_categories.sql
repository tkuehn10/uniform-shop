-- Makes item categories a fixed, mandatory set instead of free text.
--
-- items.category was previously an optional free-text column
-- (database-schema.md v0.5). The shop wants every item to carry exactly
-- one of a fixed set of categories, chosen from a dropdown rather than
-- typed -- so this converts the column to an enum and makes it required.
--
-- Any existing row whose category is null or doesn't match one of the
-- four values is backfilled to 'Tops' rather than failing the migration,
-- since we don't know what pre-existing data (if any) looks like on a
-- given deployment. Check Settings -> Items after this runs and correct
-- any item that got defaulted this way.

create type item_category as enum ('Tops', 'Bottoms', 'Hats', 'Socks');

update items
set category = 'Tops'
where category is null or category not in ('Tops', 'Bottoms', 'Hats', 'Socks');

alter table items
  alter column category type item_category using category::item_category,
  alter column category set not null;
