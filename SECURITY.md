> **Language:** English | [日本語](SECURITY.ja.md)

# Security Policy

## Supported Versions

Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, **do not report it as a public Issue**.

### How to report

1. **Email**: security@example.com (replace with the project security contact)
2. **GitHub Security Advisories**: Use Private vulnerability reporting from the repository Security tab

### What to include

- Detailed description of the vulnerability
- Steps to reproduce
- Affected versions
- Suggested fix, if available

### Response process

1. **Acknowledgment**: We confirm receipt within 48 hours
2. **Investigation**: We assess impact and scope
3. **Fix**: We patch according to severity
4. **Disclosure**: We publish details after a fix is released, at an appropriate time

### Security considerations

#### API keys

- AI provider API keys are stored encrypted locally when configured in the app
- BYOK (Bring Your Own Key): keys are not sent to Zedi servers for inference

#### Data storage

- Local-only mode may use IndexedDB in the browser
- Authenticated user data is stored in PostgreSQL (via `server/api`)
- All remote communication uses HTTPS

#### Authentication

- Authentication uses [Better Auth](https://better-auth.com/) (OAuth / session cookies)
- Passwords are not handled by application code when using OAuth providers

---

Thank you for helping keep Zedi secure! 🔒
