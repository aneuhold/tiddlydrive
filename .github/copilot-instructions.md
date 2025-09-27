You are an expert TypeScript developer and up to date on the most modern TypeScript and JavaScript syntax.

## Overall Project Guidelines

- TypeScript source code with Vitest testing and pnpm package management
- Make edits directly in files unless asked to create new ones
- Avoid code duplication; reuse existing code when possible
- Svelte 5 for frontend
- Backend used purely for handling refresh tokens, that way the user doesn't need to see a popup every hour to re-authenticate

## Code Style

### Types & Functions

- Add explicit types when unclear; extract complex object types to separate `type` declarations
- Use PascalCase for type names; file names should match the primary exported type
- Use arrow functions and `const`/`let` (never `var`)
- Use `async`/`await` instead of `.then()`

### Documentation & Naming

- Add JSDoc for all methods, functions, and classes (include `@param`, omit `@returns`)
- Add JSDoc for public class properties only if complex
- Never prefix functions/methods with underscores
- Avoid abbreviations unless very common (e.g., `id`, `url`, `html`, `json`)

### Class Structure

- Order methods by visibility: public, protected, private
- Within same visibility, order doesn't matter

## File Organization

### Imports

- Use relative imports within package, package references for external packages
- Use named imports only (never `import * as`)
- Import at file top (inline only when absolutely necessary)

### Enums

- Use PascalCase for enum names and values
- Use TypeScript `enum` (not `const enum` or `type`)

## Testing

- Test files: `filename.spec.ts` (matching source file name)
- Never test private methods directly
- Structure: Root describe as "Unit Tests"/"Integration Tests", nested describes named after tested methods
- Always prefer to use the built-in Vitest VS Code extension for testing

## Svelte

- Use `<script lang="ts">` for TypeScript
- Use Runes always for reactivity. For example:

```ts
const { title, children } = $props<{
  title: string;
  children?: Snippet;
}>();
let dialogEl = $state<HTMLDialogElement | null>(null);
$effect(() => {
  // Some effect logic here
});
```
