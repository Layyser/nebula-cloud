# Agent-assisted deployment

## Reusing a temporary SSH connection

When the deployment SSH key is protected by a passphrase, the user can open a
temporary SSH ControlMaster connection from their local WSL shell. An agent can
then reuse that already-authenticated connection without receiving the private
key or its passphrase.

Open the connection locally:

```bash
ssh -M -S ~/.ssh/nubols-control -fnNT nubols
```

SSH asks for the key passphrase once. Confirm that the shared connection is
alive before starting deployment work:

```bash
ssh -S ~/.ssh/nubols-control -O check nubols
```

The agent can execute commands through it with non-interactive authentication:

```bash
ssh -S ~/.ssh/nubols-control -o BatchMode=yes nubols '<remote command>'
```

Close the shared connection when deployment work is finished:

```bash
ssh -S ~/.ssh/nubols-control -O exit nubols
```

## Safety rules

- The user creates the ControlMaster and enters the passphrase. Never ask for,
  copy, display, or transmit the private key or passphrase.
- Verify the exact SSH host alias and the ControlMaster status before changing
  the remote host. If the status check fails, stop and ask the user to recreate
  the connection.
- Keep the socket in the user's local `~/.ssh` directory. It is temporary,
  user-owned access and must not be committed or copied to a repository.
- Use `BatchMode=yes` for agent commands so a deployment cannot pause on a
  password or host-authentication prompt.
- Keep an independent OVH console or existing SSH session available while
  changing SSH or firewall settings, and validate configuration before reload.
- Close the ControlMaster after the work is complete. Anyone able to access its
  Unix socket as that local user may reuse the authenticated connection while
  it remains alive.
