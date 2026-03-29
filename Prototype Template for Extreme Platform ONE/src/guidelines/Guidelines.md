**Add your own guidelines here**

<!--

# ExtremeCloud One Design Language System (EDS) Guidelines

## General Guidelines

* Do not modify, remove or alter the components or the layout when using this template
* The Page Content Container div will be replaced when user prompts
* Use responsive layouts with flexbox and grid by default - avoid absolute positioning unless necessary
* Only use EDS component instances from the library - never create custom variants
* Use EDS color tokens exclusively - never hardcode color values
* Base font size: 14px
* Use EDS spacing scale: 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px, 64px
* Maintain WCAG 2.2 Level AA contrast ratios (4.5:1 for text, 3:1 for UI components)
* Design for desktop viewports 1280px+ (primary target for enterprise applications)

---

## Button Guidelines

* **Primary**: Solid fill, one per section, for main actions like "Save", "Create", "Submit"
* **Secondary**: Outlined style for alternative actions like "Cancel", "Go Back"
* **Tertiary**: Text-only for low priority actions like "Skip", "Dismiss"
* **Danger**: Red fill/outline, always pair with confirmation for "Delete", "Remove"
* Default height: 40px
* Labels should be 1-3 words, action-oriented (start with verbs)
* Include loading state with spinner for processing actions

---

## Form Input Guidelines

* **Text inputs**: 40px height, show validation states (default, focus, error, success, disabled)
* **Select dropdowns**: Use for 3-12 options, add search for 12+ options, max dropdown height 320px
* **Radio buttons**: Use for 2-5 mutually exclusive options, show all options visible
* **Checkboxes**: Use for multiple selections, include "Select All" for 5+ options
* Error messages appear below inputs in semantic error color
* Helper text appears below inputs in neutral color

---

## Data Grid Guidelines

* **Header row**: Fixed/sticky at top for scrolling tables
* **Row height**: Compact (32px), Default (40px), Comfortable (48px)
* Use zebra striping for readability in large tables
* Include column sorting indicators in headers
* Use checkboxes in first column for row selection
* Show pagination with 25, 50, 100 rows per page options
* Use skeleton loaders for loading states
* Display helpful empty states when no data exists

---

## Navigation Guidelines

* **Top nav**: 64px height, logo left, user profile right, fixed position
* **Side nav**: 240px expanded, 64px collapsed, show icons + labels when expanded
* **Breadcrumbs**: Separate with "/" character, make each level clickable
* **Tabs**: Use for 3-7 related views, highlight active tab with underline

---

## Modal & Dialog Guidelines

* Center in viewport with backdrop overlay
* Max width: 600px standard, 800px large
* Include close button in header
* Primary action button on right, cancel on left
* Close on backdrop click or ESC key
* For destructive actions, use confirmation dialogs with clear consequences

---

## Notification Guidelines

* **Toast notifications**: Top-right position, 3-5 seconds duration (10 seconds for errors), include close button
* **Alert banners**: Top of page/section, persistent until dismissed, include icon matching type
* Support variants: success (green), warning (yellow/orange), error (red), info (blue)

---

## Status & Indicator Guidelines

* **Status badges**: Pill shape with color + text label
* **Device states**: Online (green), Offline (gray), Error (red), Warning (yellow), Update Available (blue)
* **Port status**: Active (green with metrics), Inactive (gray), Error (red with details)
* **Progress**: Use spinner for indeterminate, progress bar for determinate (0-100%)

---

## Typography Guidelines

* Use system font stack or EDS typeface
* Line height: 1.5 for body, 1.2 for headings
* Weights: Regular (300), Medium (400), Semibold (500), Bold (600)
* Type scale: 12px, 14px, 16px, 18px, 20px, 24px, 32px, 40px

---

## Spacing & Layout Guidelines

* Component padding: Compact (8px), Default (16px), Comfortable (24px)
* Minimum 16px between major components
* Section spacing: 32px-48px between distinct sections
* Border radius: Small (4px), Medium (8px), Large (12px), Pills (999px)

---

## Content Guidelines

* Use sentence case for labels and buttons
* Be concise and action-oriented with active voice
* Error messages should be specific and helpful with next steps
* Use consistent terminology throughout the application
-->