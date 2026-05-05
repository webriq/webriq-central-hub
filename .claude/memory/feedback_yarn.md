---
name: Use yarn as package manager
description: User prefers yarn over npm for all package management in this project
type: feedback
---

Always use yarn (not npm) for all package management commands in the WebriQ Central Hub project.

**Why:** User preference — stated explicitly when npm was being used during Sprint 0 scaffold.

**How to apply:** Use `yarn add`, `yarn install`, `yarn dev`, `yarn build`, `yarn lint` etc. For create-next-app scaffolding, pass `--use-yarn` flag. Never use `npm install`, `npm run`, or `npx` for package installation when yarn is available.
