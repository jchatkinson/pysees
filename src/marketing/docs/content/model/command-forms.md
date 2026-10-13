---
title: Command forms
description: How the schema-driven forms add and edit model entities.
order: 13
keywords: form search add edit command combobox idlist reset delete
---

Every entity is edited through a form in the **Command** panel. The forms are generated from the OpenSees command definitions, so the same layout applies to every command.

## Adding

Open the add box and type to search. On the **Model** tab it lists model commands; on the **Analysis** tab it lists analysis commands and analysis blocks. Results are filtered to your model's dimension.

## The form

- A live line of generated code shows what will be exported, with a **?** link to the OpenSees docs.
- Number fields understand units. See [Units](/docs/viewport/units).
- **List of IDs** fields can be filled by clicking nodes in the viewport.
- Optional flags reveal their own fields; choices reveal fields that depend on the option.
- Fields with no default start blank and are validated when you press **Add Command** or **Save**, with errors shown inline.
- **Reset** restores defaults; **Cancel** discards; **Delete** appears when editing.

When you add a command that takes a list of IDs, one command is created for each selected ID.

## Deleting

**Delete and dependencies?** previews everything that depends on the entity, such as elements using a deleted material, before you confirm.
