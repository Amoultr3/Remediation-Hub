# Remediation Hub — Version 1

Remediation Hub is a calm, question-centered nursing remediation PWA. Version 1 is deliberately small so the core workflow can be tested before sync and AI-report features are added.

## Version 1 features

- Start and end study sessions
- Capture question text and answer choices
- Record your answer and the correct answer
- Save confidence, reasoning, missed clues, notes, and one supporting image
- Automatically place incorrect questions in the remediation queue
- Search and filter question records
- Store data locally in the browser
- Install as a PWA and reopen the interface offline
- Deploy directly through GitHub Pages without a server build

## GitHub Pages

In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

The site will be available at:

`https://amoultr3.github.io/Remediation-Hub/`

## Planned releases

### Version 2 — Remediation reports and linked learning

- Export a readable report for ChatGPT
- Import a structured completed report with preview
- Save AI notes inside the matching question record
- Linked Knowledge notes for pathophysiology, fundamentals, pharmacology, and labs
- Convert report items into flashcards and review tasks
- Basic topic quiz and mock Lab Sheet

### Version 3 — Connected capture and sync

- Accounts and cross-device sync
- Cloud storage for intentional image attachments
- Browser extension side panel
- Text capture and optional temporary OCR
- Sync and conflict handling
- Privacy controls and export/backup

Clinical exposure, puzzles, mock MAR, patient report sheets, and larger simulations remain future enhancements after the three core releases.

## Privacy

Version 1 data stays in the browser on the current device. Do not attach images containing real patient identifiers or protected health information.
