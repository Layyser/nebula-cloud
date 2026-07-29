# Cloud authentication lifecycle

Nebula Cloud uses Better Auth for email authentication, sessions, and
organization membership. The browser keeps only the Better Auth session cookie;
Worker and runtime credentials never participate in browser authentication.

## Browser routes

- `/login` provides sign-in and account registration.
- `/auth/callback` and nested callback paths wait for Better Auth session
  resolution, then continue to `/app` or return to `/login`.
- `/app` requires a valid session and an active organization.
- Users without an active organization can select an existing membership or
  create and activate a new organization.
- Logout invalidates the Better Auth session and returns to `/login`.

## Expiration

Runtime and workspace API responses with status `401` emit a shared
session-expired event. The application revalidates Better Auth, redirects to
login, and shows a one-time explanation. The notice survives a page reload but
is cleared after successful authentication.

Organization membership is still resolved from SQLite for every Runtime and
Console request. A valid session therefore cannot preserve access after
membership removal.
