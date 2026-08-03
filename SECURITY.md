# Security Policy

## Supported version

Security fixes are applied to the latest commit on the `main` branch.

## Reporting a vulnerability

Please do not open a public issue containing exploit details, credentials, or personal data.

Use the repository's **Security → Report a vulnerability** flow to submit a private GitHub Security Advisory. If that option is unavailable, open a minimal issue asking the maintainer for a private contact channel without including the vulnerability details.

Include the affected URL or commit, impact, reproduction steps, proof-of-concept input, and any suggested mitigation. You should receive an initial acknowledgement within seven days.

## Scope notes

The current application performs dictionary search in the browser and does not expose a database or user-data API. If those capabilities are added, reports concerning authentication, authorization, injection, data exposure, and privilege boundaries are in scope.
