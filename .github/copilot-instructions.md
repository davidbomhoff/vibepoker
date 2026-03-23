# Copilot Instructions for VibePoker

## Project Overview

VibePoker is a WPT-inspired Texas Hold'em poker game built with:
- **Vanilla JavaScript (ES6+)** – all game logic and AI live in `poker.js`
- **HTML5** – single-page app entry point in `index.html`
- **CSS3** – animations and layout in `styles.css`
- **SVG assets** – card images in the `cards/` folder and dealer/player avatars in the root

There are no build tools, bundlers, or frameworks. Open `index.html` directly in a browser to run the game.

## Repository Owner Context

The repository owner is **still learning JavaScript, HTML, and CSS**. Every pull request and code explanation must be written with a beginner in mind.

## Pull Request Requirements

Every pull request you open **must** include a plain-English explanation that covers:

1. **What changed** – which files and lines were modified and why.
2. **How it works** – explain every function or method you added or modified in simple terms. Avoid jargon; if a technical term is unavoidable, define it briefly.
3. **Why it solves the problem** – connect the change back to the original issue so the owner can follow the reasoning.
4. **Key concepts used** – call out any JavaScript/CSS/HTML concepts that appear in the change (e.g. event listeners, DOM manipulation, CSS selectors, array methods) with a one-sentence explanation of each.

## Code Style Guidelines

- Use **vanilla JavaScript** only – no external libraries or frameworks.
- Prefer **`const`** for values that never change and **`let`** for values that do; avoid `var`.
- Use **ES6+ features** (arrow functions, template literals, destructuring, `class`) consistently with the existing code in `poker.js`.
- Keep functions small and focused on a single responsibility.
- Add **inline comments** on any line whose purpose is not immediately obvious, written in plain English.
- Match the existing indentation (4 spaces) and brace style.

## Testing & Validation

- There is no automated test suite. After making changes, manually verify behavior by opening `index.html` in a browser and exercising the affected code path.
- Note any manual testing steps taken in the pull request description so the owner can reproduce them.

## Explaining Code to the Owner

When writing PR descriptions or inline comments, follow these principles:

- **Use analogies** – relate programming concepts to real-world poker or everyday ideas when possible.
- **Show before/after snippets** – include a short diff excerpt in the PR description so the owner can see exactly what changed.
- **Link to MDN** – when referencing a built-in JavaScript or Web API (e.g. `Array.prototype.filter`, `addEventListener`), add a brief description and an MDN link if helpful.
- **Avoid unexplained abbreviations** – spell out variable names or explain short ones.
