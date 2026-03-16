# Converting TypeScript/React to Rip-Lang

Everything learned during the migration of this extension from TypeScript + React to rip-lang + Rip UI.

## Table of Contents
- [Build Setup](#build-setup)
- [Syntax Mapping (TS → Rip)](#syntax-mapping-ts--rip)
- [What Works](#what-works)
- [What Doesn't Work (Parser Limitations)](#what-doesnt-work-parser-limitations)
- [Workarounds](#workarounds)
- [Rip UI Components (React → Rip UI)](#rip-ui-components-react--rip-ui)
- [Chrome Extension Specifics](#chrome-extension-specifics)
- [Gotchas](#gotchas)

---

## Build Setup

### Vite Plugin

The core integration is a Vite plugin (`vite-plugin-rip.js`) that calls `compileToJS()` from the `rip-lang` npm package:

```js
import { compileToJS } from 'rip-lang';

export default function ripPlugin() {
  return {
    name: 'vite-plugin-rip',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.rip')) return null;
      const cleaned = code.replace(/\r\n/g, '\n'); // CRITICAL: strip CRLF
      const usesComponents = /^export\s+\w+\s*=\s*component\b/m.test(cleaned);
      const js = compileToJS(cleaned, { skipPreamble: !usesComponents });
      return { code: js, map: null };
    },
  };
}
```

Key points:
- **`skipPreamble: true`** for pure logic files — emits only your code
- **`skipPreamble: false`** for component files — includes the Rip UI runtime (~16KB of signals, effects, reconciler, component base class)
- Add `.rip` to Vite's `resolve.extensions` array so imports without extension work
- The first component file compiled with `skipPreamble: false` puts the runtime on `globalThis`, so subsequent component files can use `skipPreamble: true` if desired

### Vite Config

```ts
resolve: {
  extensions: ['.rip', '.ts', '.tsx', '.js', '.jsx', '.json'],
},
```

### Test Script

Essential to have a compilation test that checks every `.rip` file independently:

```js
import { compileToJS } from 'rip-lang';
import { readFileSync, readdirSync } from 'fs';

// For each .rip file:
const code = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
compileToJS(code, { skipPreamble: true });
```

---

## Syntax Mapping (TS → Rip)

### Basics

| TypeScript | Rip |
|---|---|
| `const x = 5` | `x = 5` |
| `let x = 5` | `x = 5` |
| `function foo(a, b) {}` | `foo = (a, b) -> ...` |
| `export function foo() {}` | `export foo = () -> ...` |
| `export const X = {}` | `export X = {}` |
| `if (x) { ... }` | `if x` (indentation-based blocks) |
| `x === y` | `x is y` |
| `x !== y` | `x isnt y` |
| `!x` | `not x` |
| `x && y` | `x and y` |
| `x \|\| y` | `x or y` |
| `return x` | `return x` or just `x` as last expression |
| `null` / `undefined` | `null` / `undefined` |
| `for (const x of arr)` | `for x in arr` |
| `for (const key in obj)` | `for key, val of obj` |
| `x?.y` | `x?.y` (same!) |
| `x ?? y` | `x ?? y` (same!) |
| `arr.map(x => x + 1)` | `arr.map((x) -> x + 1)` |
| `arr.filter(x => x > 0)` | `arr.filter((x) -> x > 0)` |
| `switch(x) { case 'a': ... }` | `switch x` / `when 'a'` |
| `try { } catch(e) { }` | `try` / `catch e` |
| `async function f() { await x }` | `f = -> x!` (the `!` postfix is await) |
| `continue` | `continue` |
| `break` | `break` |
| `new Map()` | `new Map()` (same!) |
| `new Set()` | `new Set()` (same!) |

### String Interpolation

| TypeScript | Rip |
|---|---|
| `` `hello ${name}` `` | `"hello #{name}"` |

### Imports/Exports

| TypeScript | Rip |
|---|---|
| `import { a, b } from './x'` | `import { a, b } from './x.rip'` |
| `export const x = 5` | `export x = 5` |
| `export { a, b }` | `export { a, b }` |

**Important**: Imports MUST be on a single line. Multi-line destructured imports fail:
```coffee
# ❌ FAILS
import {
  a, b, c
} from './x.rip'

# ✅ WORKS
import { a, b, c } from './x.rip'
```

### Early Returns

```coffee
# TS
if (!cache?.entries) return accepted;

# Rip — two styles:
return accepted unless cache?.entries    # guard clause
return accepted if not cache?.entries    # postfix if
```

### Conditional Assignment

```coffee
# TS
const status = normalized >= 1.0 ? 'ready' : normalized > 0.7 ? 'almost' : 'notReady';

# Rip — block form (RECOMMENDED for complex ternaries)
status = if normalized >= 1.0
  'ready'
else if normalized > 0.7
  'almost'
else
  'notReady'

# Rip — inline ternary (works for SIMPLE cases)
label = if hasMore then "Next" else "Random"

# Rip — JS ternary also works
label = hasMore ? "Next" : "Random"
```

---

## What Works

These patterns compile without issues:

1. **Plain functions** with any combination of `if`, `for`, `switch`, `try/catch`
2. **Optional chaining** (`?.`) and **nullish coalescing** (`??`)
3. **String interpolation** with `#{}`
4. **Array methods**: `.map()`, `.filter()`, `.some()`, `.find()`, `.forEach()`, `.reduce()`
5. **Destructuring**: `{ a, b } = obj` and `[a, b] = arr`
6. **Spread**: `[...arr]`, `{ ...obj }`
7. **Object literals** with explicit braces: `{ key: val, key2: val2 }`
8. **`for x in arr`** (compiles to `for (const x of arr)`)
9. **`for key, val of obj`** (compiles to `for (const key in obj)`)
10. **`switch/when`** — clean, no fall-through, no `break` needed
11. **Guard clauses**: `return x unless condition` and `continue unless condition`
12. **Postfix conditionals**: `x++ if condition`
13. **Late imports** — `import` statements can appear anywhere in the file, not just the top
14. **Re-exports**: `export { a, b }` after importing
15. **`in` operator**: `slug of obj` compiles to `slug in obj`
16. **Parenthesized function calls**: always use parens — `foo(a, b)` not `foo a, b` when inside complex expressions
17. **Async with `!`**: `result = fetch!('url')` compiles to `result = await fetch('url')`

---

## What Doesn't Work (Parser Limitations)

### 1. Multi-line destructured imports
```coffee
# ❌ Parse error
import {
  a, b, c
} from './foo.rip'
```
**Workaround**: Single-line import.

### 2. Indent-based object literals inside for-loop bodies
```coffee
# ❌ The parser can lose track of nesting
for topic in TOPICS
  avail[topic] =
    suggested: { total: 0, unsolved: 0 }
    easy: { total: 0, unsolved: 0 }
```
**Workaround**: Use explicit braces on one line: `avail[topic] = { suggested: { total: 0, unsolved: 0 }, easy: { total: 0, unsolved: 0 } }`

### 3. Inline nested ternary inside for-loops (sometimes)
```coffee
# ❌ Can fail in complex files (works in isolation)
for topic in TOPICS
  status = if x >= 1.0 then 'ready' else if x > 0.7 then 'almost' else 'notReady'
```
**Workaround**: Use block-form ternary (see above).

### 4. Very large arrays (150+ items) in files with complex logic
The parser chokes when a 150-item array literal appears in the same file as deeply nested functions. Works fine in isolation or when extracted to its own file.

**Workaround**: Extract to a separate `.rip` file and import.

### 5. CRLF line endings
The parser doesn't handle `\r\n` gracefully — can cause mysterious parse errors that don't reproduce in isolation.

**Workaround**: Always strip CRLF to LF: `code.replace(/\r\n/g, '\n')`

### 6. `for` inside `select` elements (Rip UI)
```coffee
# ❌ Parse error
render
  select value: @val
    for opt in options
      option value: opt.value, "#{opt.label}"
```
**Workaround**: Use static option elements.

### 7. Nested `for` loops in render templates (Rip UI)
```coffee
# ❌ Parse error — for inside for in a render block
render
  for topic in @topics
    div
      for diff in DIFFS
        button "#{diff}"
```
**Workaround**: Inline the inner loop's items (if fixed/small), or extract to a child component in a separate file.

### 8. `#id` selector with other attributes (Rip UI)
```coffee
# ❌ Parse error
button #myId, @click: handler, "label"
```
**Workaround**: Use `id:` attribute instead: `button id: 'myId', @click: handler, "label"`

---

## Workarounds

### The "Rewrite from Scratch" Trick
When iteratively editing a large `.rip` file and hitting mystery parse errors, **delete the file and rewrite it from scratch**. The issues are often caused by:
- Leftover CRLF bytes from the original `.ts` file
- Parser state corruption from partial edits
- Invisible whitespace differences

In our case, `readiness.rip` failed when iteratively edited but compiled perfectly when written from scratch with the same patterns.

### Binary Search for Parse Errors
The rip parser's error messages are sparse (just line/column). Use binary search:
```js
const lines = code.split('\n');
let lo = 1, hi = lines.length, lastGood = 0;
while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  try {
    compileToJS(lines.slice(0, mid).join('\n'), { skipPreamble: true });
    lastGood = mid;
    lo = mid + 1;
  } catch { hi = mid - 1; }
}
console.log(`Fails at line ${lastGood + 1}`);
```

### Parenthesized Function Calls
When in doubt, add parentheses. Bare calls like `foo bar, baz` can confuse the parser in certain contexts (inside objects, after `if`, etc.):
```coffee
# Risky
isSolved slug, q.status, accepted, allowFallback, entries

# Safe
isSolved(slug, q.status, accepted, allowFallback, entries)
```

---

## Rip UI Components (React → Rip UI)

### React → Rip UI Mapping

| React | Rip UI | Notes |
|---|---|---|
| `useState(init)` | `@name := init` | `:=` creates a reactive signal |
| `useMemo(() => expr, [deps])` | `@name ~= expr` | Auto-tracks dependencies |
| `useEffect(() => { ... }, [])` | `mounted = -> ...` | Runs once after mount |
| `useEffect(() => { ... }, [dep])` | `~-> ...` | Runs when deps change |
| `useCallback(fn, [deps])` | `fn = -> ...` | No memoization needed — fine-grained |
| `useRef()` | Not needed | Direct DOM access via template |
| JSX `<div className="x">` | `div.x` | Dot notation for classes |
| JSX `<div id="x">` | `div id: 'x'` | Use attribute, not `#x` with attrs |
| `children` prop | `slot` | Built-in slot mechanism |
| `onClick={() => ...}` | `@click: (-> ...)` | Event handler |
| `onChange={handler}` | `@change: handler` | |
| `disabled={bool}` | `disabled: bool` | Boolean attributes |
| `style={{ width: pct }}` | `style: "width: #{pct}%"` | String-based styles |
| `{condition && <X/>}` | `if condition` / `X` | Template conditional |
| `{cond ? <A/> : <B/>}` | `if cond` / `A` / `else` / `B` | |
| `arr.map(x => <X/>)` | `for x in arr` / `X ...` | Template loop |
| Fragment `<>...</>` | Not needed | Multiple root elements OK |

### Component Structure

```coffee
export MyComponent = component
  # Props (from parent)
  accept propName: defaultValue

  # Reactive state
  @count := 0

  # Computed values (auto-tracked dependencies)
  @label ~= "Count: #{@count}"
  @isHigh ~= @count > 10

  # Methods
  increment = -> @count++

  # Lifecycle
  mounted = ->
    console.log "component mounted"

  # Effects (re-run when dependencies change)
  ~-> console.log "count changed:", @count

  # Template
  render
    div.my-component
      h1 @label
      button @click: @increment, "+"
```

### Component Mounting (Entry Point)

```coffee
# React equivalent:
# createRoot(document.getElementById('root')).render(<App />);

# Rip UI:
import { App } from './App.rip'
App.mount '#root'
```

### Event Handling Patterns

```coffee
# Inline handler
button @click: (-> @count++), "Click"

# Method reference  
button @click: @handleClick, "Click"

# Handler with arguments needs a wrapper
button @click: (-> @handleClick 'arg1'), "Click"
```

### Callback `this` Binding

Use **fat arrows** (`=>`) for callbacks that need to access component state:
```coffee
# ❌ `this` will be wrong inside setTimeout
setTimeout((-> @loading = false), 2000)

# ✅ Fat arrow preserves `this`
setTimeout((=> @loading = false), 2000)

# ✅ Also works for event listeners
chrome.storage.onChanged.addListener (changes) =>
  @data = changes.key.newValue if changes.key
```

### Async in Lifecycle

The `!` operator is Rip's await:
```coffee
mounted = ->
  result = chrome.storage.local.get!(['key1', 'key2'])
  @data = result.key1
```

---

## Chrome Extension Specifics

### Manifest V3 Compliance
Rip compiles to **standard JavaScript** — no `eval()`, no `new Function()`, no dynamic code. The output is fully CSP-compliant for Chrome extensions.

### Content Script (IIFE)
Configure Vite for IIFE output:
```ts
build: {
  rollupOptions: {
    output: { format: 'iife' }
  }
}
```

### Popup (ES Module)
Chrome extension popups support `<script type="module">`:
```html
<script type="module" src="./main.rip"></script>
```

### Type Safety
Keep TypeScript type definition files (`.d.ts` / `.types.ts`) — they don't produce runtime code and can coexist with `.rip` files. Rip has optional type annotations but they're not needed for runtime correctness.

---

## Gotchas

1. **Don't edit `.rip` files created from `.ts` — rewrite them.** Copy-pasting and modifying often leaves CRLF artifacts that cause silent parse failures.

2. **Always test compilation in isolation.** A pattern that works in a 10-line file may fail in a 200-line file due to parser state interactions.

3. **The Rip UI runtime is ~16KB.** Each component file compiled with `skipPreamble: false` includes the full runtime. If bundling multiple components, only the first one needs the preamble.

4. **Import paths use `.rip` extension.** Unlike TypeScript where extensions are omitted, rip imports should include the `.rip` extension for clarity (Vite extension resolution handles both cases).

5. **Rip arrays use spaces, not commas.** But commas also work:
   ```coffee
   # Both valid
   arr = ['a' 'b' 'c']
   arr = ['a', 'b', 'c']
   ```

6. **Objects in arrays need explicit braces:**
   ```coffee
   # Works
   opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
   ```

7. **The `of` keyword means `in` (JS).** `slug of obj` → `slug in obj`. This is the opposite of CoffeeScript.

8. **`is` vs `==`.** `is` compiles to `===` (strict equality). Use `is` exclusively.
