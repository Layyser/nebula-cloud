## Overview

Organizations group members, operators, usage, and access rules under one roof. Every account signs in to an active organization; every operator belongs to exactly one. Roles decide who can govern, join codes decide who can enter.

## Roles

| Role | Scope |
| --- | --- |
| Owner | Full control of the organization |
| Admin | Manage members, view organization-wide usage, rotate the join code |
| Member | Work in their own operator; see their own usage |

Role checks happen server-side on every request — the UI hides what your role cannot reach, and the API refuses it regardless.

## Active organization

You have one **active** organization at a time. Switching it changes which dashboard, member list, and usage view you see, and which workspace opens. Cross-organization access is not possible: a session only reaches workspaces inside its active membership.

## Joining with codes

Admins share a signed join code that looks like `NBL-XXXXXXXXXXXX-XXXXXXXXXXXX`:

1. Open the organization picker from the app.
2. Paste the code.
3. Membership activates immediately — no email round-trips.

There is one active code per organization at any time; rotating it instantly invalidates every copy already shared. Email invitations are not part of this release.

## Managing members

Admins can **disable** a member:

- Access ends immediately — sign-ins stop resolving against the organization.
- Nothing is deleted: the member's operator, home directory, and usage history remain intact.
- Re-enabling restores access as if nothing happened.

This makes disabling the safe administrative pause button between "suspended" and "gone".

## Admin visibility

Owners and admins additionally get the full member roster and organization-wide usage dashboards across all members' operators — see [Usage & costs](/docs?topic=usage).
