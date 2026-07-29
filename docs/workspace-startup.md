# Personal workspace startup

After authentication and organization selection, the Cloud Web application
opens the member's personal workspace through four explicit stages:

1. **Resolving workspace** creates or retrieves the persistent workspace record.
2. **Provisioning container** schedules the durable `ensure_running` job and
   polls the control plane until the Worker reports the workspace ready.
3. **Starting Nebula** checks the private Runtime through the authenticated
   Cloud gateway until the Nebula API responds.
4. **Ready** mounts the shared RuntimeWorkspace.

The browser never calls the Worker directly. Polling uses the organization-bound
control-plane APIs, and Runtime readiness uses CloudRuntimeTransport.

Startup is cancelled when the component unmounts or the active organization
changes. Resolution, provisioning, and Runtime failures retain their stage and
show an actionable retry. Retrying re-runs the idempotent flow; it does not
create a second personal workspace or duplicate an active provisioning job.
