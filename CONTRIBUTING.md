# Contributing to MovieNight

Thank you for your interest in contributing to **MovieNight**! 🎉

MovieNight is an open-source, private, small-group peer-to-peer watch party application built with native WebRTC, HTML5 Media APIs, and PeerJS. We welcome contributions from developers, designers, technical writers, and testers of all skill levels.

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior following the instructions in the Code of Conduct.

- **Be respectful and empathetic** toward differing viewpoints and experiences.
- **Provide constructive feedback** focused on the code and architecture, not individuals.
- **Prioritize user privacy and safety** in all technical designs.

---

## 🧭 Architectural Principles

Before writing code, please keep MovieNight's core architectural tenets in mind:

1. **Zero Media Server Storage**: No central media server stores or processes streamed video. All media flows directly between peer browsers over encrypted DTLS/SRTP (with TURN relay when direct P2P is blocked).
2. **Ephemeral Operation**: MovieNight operates with zero database persistence. Room codes, participant lists, and chat messages exist solely in memory while participants are active.
3. **Bounded Operating Envelope**: Designed and tested specifically for groups of **2–6 participants**. Changes must maintain efficiency for $O(N^2)$ full-mesh scaling and adapt to host uplink constraints.
4. **Vanilla & Lightweight**: MovieNight avoids heavy framework runtimes on the client. UI components use semantic HTML5, modern CSS3, and standard ECMAScript.
5. **Security First**: The Node.js video proxy is disabled by default and hardened against SSRF, DNS rebinding, and header abuse. All contributions touching networking or proxying must maintain strict security boundaries.

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18 LTS or later (tested on Node 18, 20, and 22 LTS).
- A modern web browser with WebRTC support (Chrome, Edge, Firefox, Brave, Safari).
- [Git](https://git-scm.com/).

### 1. Fork & Clone
Fork the repository on GitHub and clone your fork locally:

```bash
git clone https://github.com/<your-username>/movienight.git
cd movienight
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Automated Tests
Ensure your environment passes all existing test suites before making changes:

```bash
npm test
```

### 4. Start the Local Server
```bash
npm start
```
Open `http://localhost:3000` in your browser.

---

## 🌿 Branching & Development Workflow

1. Create a feature or bugfix branch off `main`:
   ```bash
   git checkout -b fix/sync-drift-rounding
   # or
   git checkout -b feat/keyboard-volume-slider
   ```
2. Keep your branch focused on a single change or fix. Avoid bundling unrelated modifications.
3. Write clean, self-documenting code. Add concise comments for non-obvious WebRTC, SDP, or timing calculations.

---

## 🧪 Testing & Verification Requirements

Quality and regression avoidance are critical. Every pull request should include verification:

### Automated Tests
Run the automated test runner:
```bash
npm test
```
- If adding a new feature, utility, or security check, add corresponding tests in `test/`.
- Test files follow the native Node test runner naming convention: `test/<componentName>.test.js`.

### Manual Testing
Test your changes in a real multi-client screening session:
1. Open two separate browser windows (or one regular tab and one incognito tab).
2. Create a screening room in Tab A.
3. Join the room code from Tab B and click **Approve** on the host Knock-and-Approval modal.
4. Test media playback (Local File, Web Video, or YouTube embed) and verify:
   - Video and audio play synchronously across both tabs.
   - WebRTC DataChannel messages (chat, reactions) deliver smoothly.
   - Browser developer console (`F12`) displays zero uncaught exceptions or WebRTC errors.

---

## 📝 Commit Conventions

MovieNight follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This enables clean changelog generation and clear version history.

### Commit Format
```text
<type>(<scope>): <short summary in imperative mood>

[optional body explaining rationale]

[optional footer(s), e.g., Closes #123]
```

### Common Types
- `feat`: A new user-facing feature or enhancement.
- `fix`: A bug fix or security patch.
- `docs`: Documentation updates (README, guides, comments).
- `test`: Adding or updating test suites.
- `refactor`: Code restructuring without functional or bug fixes.
- `perf`: Code changes that improve performance or bandwidth efficiency.
- `chore`: Build tasks, package updates, or CI configuration.

### Examples
- `feat(sync): add dynamic playback rate smoothing for 200ms drift`
- `fix(proxy): enforce RFC canonical casing on safe response headers`
- `docs(readme): publish empirical operating envelope benchmark table`

---

## 📤 Submitting a Pull Request

1. **Push your branch** to your GitHub fork:
   ```bash
   git push origin fix/sync-drift-rounding
   ```
2. **Open a Pull Request** against the `main` branch of `sagegallant/movienight`.
3. **Fill out the PR Template**: Describe what changed, the rationale, related issue numbers, and your verification steps.
4. **Ensure CI Passes**: GitHub Actions will automatically run the test suite across Node.js 18, 20, and 22 LTS.
5. **Code Review**: A maintainer will review your PR. Please be responsive to feedback and discussions.

---

## 🔒 Reporting Security Vulnerabilities

**Do not file public GitHub issues for security vulnerabilities.**

If you discover a security flaw (e.g., SSRF, bypass of origin validation, buffer exhaustion), please review [SECURITY.md](SECURITY.md) and report it confidentially to:

📧 **security@movienight.app**

We adhere to coordinated vulnerability disclosure and will acknowledge your report within 48 hours.

---

## 💬 Getting Help

- Open an [Issue](https://github.com/sagegallant/movienight/issues) for bug reports and feature requests.
- Start a [Discussion](https://github.com/sagegallant/movienight/discussions) for general questions or architecture proposals.

Thank you for helping make MovieNight better for everyone! 🍿
