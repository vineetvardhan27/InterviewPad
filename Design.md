# UI/UX & Design System Specification — InterviewPad

## 1. Design Philosophy & Aesthetic Strategy

**InterviewPad** is designed to look modern, responsive, and visually impressive. It uses curated color tokens, glassmorphism overlays, custom monospaced typography, and reactive micro-animations to create a premium IDE experience.

### Key Visual Pillars
1. **Curated Color Palettes**: Dual-mode (Light and Dark) operating system with custom CSS properties. Avoids plain browser default blues/reds in favor of tailored HSL/HEX design tokens.
2. **IDE-Grade Typography**: Code areas use crisp monospaced font stacks (`Fira Code`, `IBM Plex Mono`, `monospace`) with clean line height (1.6) and ligature support. UI text uses system sans-serif font chains (`Inter`, `system-ui`).
3. **Dynamic Feedback & Micro-Interactions**: Hover transitions on action buttons, pulsing status indicators for connection states, and glowing badges for active user counts and unread messages.

---

## 2. Design System Tokens (`frontend/src/styles.css`)

### 2.1 Theme Tokens

```css
/* Dark Theme Variables (Default / Toggleable) */
[data-theme="dark"] {
  --bg-primary: #1e1e2e;
  --bg-secondary: #181825;
  --bg-tertiary: #313244;
  --text-primary: #cdd6f4;
  --text-secondary: #a6adc8;
  --accent-color: #89b4fa;
  --accent-hover: #b4befe;
  --border-color: #45475a;
  --success-color: #a6e3a1;
  --warning-color: #f9e2af;
  --error-color: #f38ba8;
}

/* Light Theme Variables */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f4f6;
  --bg-tertiary: #e5e7eb;
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --accent-color: #2563eb;
  --accent-hover: #1d4ed8;
  --border-color: #d1d5db;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
}
```

---

## 3. Wireframe & Structural Grid Layout

The layout uses a 3-tier structure: **Top Navbar**, **Left Control Sidebar**, and **Right Main Editor Workspace**.

```
+-----------------------------------------------------------------------------------+
|  BRAND LOGO | Subtitle                 [Connection Dot]  [User]  [Theme] [Sign In]|
+-----------------------------------------------------------------------------------+
|               |  [Language Dropdown]  [Status Dot]     [💬 Chat (2)]  [▶ Run Code]  |
|               +-------------------------------------------------------------------+
|  SIDEBAR      |                                                    |              |
|               |                                                    |  CHAT PANEL  |
|  - Room Info  |                  MONACO EDITOR CANVAS              |  (Collapsible|
|  - Invite     |                                                    |   Slot)      |
|  - Users List |                                                    |              |
|  - Question   |----------------------------------------------------+              |
|    Editor     |  INPUT TAB | OUTPUT TAB | ERRORS TAB | BUILD TAB   |              |
|  - Reset Code |  Console Input / Execution Stdout / Stderr Output  |              |
+---------------+----------------------------------------------------+--------------+
```

---

## 4. Presence & Remote Cursor Design

Remote client presence inside Monaco Editor is rendered dynamically using CSS injected by `setupMonacoBinding()` in `App.jsx`.

### Palette Allocation
A 10-color round-robin palette is assigned to clients:
`["#e06c75", "#61afef", "#98c379", "#c678dd", "#e5c07b", "#56b6c2", "#be5046", "#d19a66", "#7ec699", "#c792ea"]`

### Injected Selection CSS
```css
/* Dynamic CSS injected per awareness client ID */
.yRemoteSelection-clientID {
  background-color: rgba(97, 175, 239, 0.25);
}
.yRemoteSelectionHead-clientID {
  border-left: 2px solid #61afef;
}
.yRemoteSelectionHead-clientID::after {
  content: "Username";
  background-color: #61afef;
  color: #ffffff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
  position: absolute;
  top: -14px;
}
```

---

## 5. Component Interaction & State Indicators

### 5.1 Connection Status Indicator
Located in the navbar header to provide instant visual feedback on Socket.IO transport status:

| Status Class | Dot Color | Animation | Meaning |
|---|---|---|---|
| `.connection-connected` | `#10b981` (Green) | Static solid | Socket connected and synchronized |
| `.connection-reconnecting` | `#f59e0b` (Yellow) | Pulsing animation | Network lost; automatic reconnect in progress |
| `.connection-disconnected` | `#ef4444` (Red) | Static solid | Offline or connection failed |

### 5.2 Console Output Tabs
The console panel below Monaco Editor renders separate contextual tabs:
* **Input**: Editable `<textarea>` for optional `stdin` payload.
* **Output**: Renders `stdout` from Judge0 execution.
* **Errors (`.tab-item.error`)**: Rendered conditionally in red when `stderr` exists.
* **Build (`.tab-item.warning`)**: Rendered conditionally in yellow when `compileOutput` exists.
