# GitHub Swap

Desktop app (Electron) to use several GitHub accounts on the same computer without touching the terminal: SSH keys, identities and projects.

![Accounts in GitHub Swap](docs/cuentas.webp)

- Adds an account end to end: creates the key, signs in to GitHub, uploads it and checks that it works.
- Each account has its own folder: everything inside uses its key and email.
- Finds the projects on your computer, shows pending work, and pulls or pushes without losing local changes.
- Only writes inside its own block in `~/.ssh/config`, and keeps a backup.
- Updates are installed only if their SHA-256 matches the published one.

## Run it

Download the installer from [Releases](https://github.com/Serberar/github-swap/releases/latest), or:

```bash
npm install
npm start
npm run lint && npm test   # real Git repositories and a temporary home folder
```

More details in the [Spanish README](README.md). [MIT](LICENSE) license.
