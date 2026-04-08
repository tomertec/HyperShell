# 1Password Vault Picker — Design

## Overview

A 3-step modal dialog that lets users browse their 1Password vaults and select a credential, constructing the `op://vault/item/field` reference automatically instead of requiring manual input.

## Flow

1. User clicks a **Browse** button next to the `op://` input field in the host edit form
2. Modal opens showing **vault list** (from `op vault list --format=json`)
3. User picks a vault → modal shows **item list** (from `op item list --vault=<id> --format=json`)
4. User picks an item → modal shows **field list** (from `op item get <id> --format=json`)
5. User picks a field → modal closes, `op://vault/item/field` is written into the input

## Backend (IPC)

Three new IPC channels in main process, all calling the `op` CLI:

| Channel | CLI command | Returns |
|---|---|---|
| `op:list-vaults` | `op vault list --format=json` | `{ id, name }[]` |
| `op:list-items` | `op item list --vault=<id> --format=json` | `{ id, title, category }[]` |
| `op:get-item-fields` | `op item get <id> --format=json` | `{ id, label, type }[]` (filtered to exclude internal/metadata fields) |

All three spawn `op` with `windowsHide: true` (matching existing `opResolver.ts` pattern). Biometric prompt is handled by the `op` CLI itself — no extra auth logic needed.

## Frontend (UI)

- **Trigger:** Small icon button next to the existing `opReference` text input
- **Modal:** Reuses existing modal component pattern (Framer Motion)
- **3 steps** with a header showing breadcrumbs (e.g. `Vaults > Personal > Login - server01`)
- **Back button** to return to previous step
- **Search input** at the top of each step for filtering the list
- **Loading state** while `op` commands run
- **Error state** if `op` CLI is not found or auth fails

## Reference Construction

Uses vault **name** and item **title** (not UUIDs) in the `op://` reference, since that's what `op read` expects. Field uses the field **label**.

## Error Handling

- `op` not found → show "1Password CLI not installed"
- Auth denied/cancelled → show "Authentication cancelled" and stay on current step
- Empty results → show "No items found" message
