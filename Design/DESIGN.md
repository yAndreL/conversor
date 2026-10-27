---
name: Document Utility Engine
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#5b403d'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#906f6c'
  outline-variant: '#e4beb9'
  surface-tint: '#bb171c'
  primary: '#b7131a'
  on-primary: '#ffffff'
  primary-container: '#db322f'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4ac'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#006578'
  on-tertiary: '#ffffff'
  tertiary-container: '#008097'
  on-tertiary-container: '#f9fdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ac'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#93000d'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#afecff'
  tertiary-fixed-dim: '#72d4ef'
  on-tertiary-fixed: '#001f27'
  on-tertiary-fixed-variant: '#004e5d'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-sm: 0.75rem
  gutter-lg: 2rem
  margin: 1.5rem
  margin-mobile: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers a fast, distraction-free document processing environment tailored for high-frequency utility tasks such as converting, merging, splitting, and compressing files. The emotional resonance centers on instant efficiency, dependability, and clinical precision without sterile coldness.

The aesthetic leans decisively into **Functional Modernism**:
- Pure structural clarity over decorative flourishes.
- Zero gradients, heavy skeuomorphism, or glassy refractions.
- Confident flat geometry anchored by a disciplined crimson/coral primary signature that signals action, tool readiness, and precision processing.
- Ample negative space coupled with crisp containment borders (1px) to organize document states, batches, and operations intuitively.

## Colors

The palette is strictly bounded to eliminate competing color noise. No blues or purples are permitted; state and emphasis are communicated via tonal grays and warm coral-red variations.

- **Primary Accent (`#E53935`)**: Reserved strictly for actionable elements, primary process triggers (e.g., "Merge PDF", "Convert Now"), active selection indicators, and primary drop zone highlights.
  - Hover state: `#D32F2F`
  - Active/Tapped state: `#B71C1C`
  - Subtle highlight/accent wash: `#FFEBEE` or `#FF5252` (10% tint for tags and warning pills)
- **Secondary Tone (`#475569`)**: A balanced slate gray applied to secondary tools, supplementary actions, icons, and supporting chrome.
- **Surface Canvas (`#F8F9FA`)**: An ultra-clean, warm off-white canvas that ensures prolonged visual comfort.
- **Pure Surface (`#FFFFFF`)**: Dedicated to cards, drop zones, sheet views, and modal canvases.
- **Text & Contrast**:
  - Primary text: `#1E293B` (slate-900)
  - Secondary/Caption text: `#475569` (slate-600)
  - Muted/Placeholder text: `#94A3B8` (slate-400)
- **Structural Outlines (`#E2E8F0`)**: A universal 1px border value used across cards, inputs, separators, and list boundaries.

## Typography

The design system exclusively utilizes **Plus Jakarta Sans** across all hierarchies to maintain structural consistency, legibility, and modern warmth. 

- Maintain standard baseline alignment across all text components.
- Tool titles and page headers emphasize a solid semi-bold or bold weight with tight letter spacing for immediate legibility.
- Body text retains relaxed, comfortable line heights (1.5–1.6×) to minimize eye strain during rapid file inspection and settings adjustments.
- Numerical metadata (file sizes, page counts, process percentages) is rendered cleanly using `label-md` or `body-sm` with tabular numerical alignment where supported.

## Layout & Spacing

A disciplined, 12-column responsive grid structures all page layouts. The canvas prioritizes fixed maximum bounds (`1200px` for utility dashboards; `960px` for focused single-action workflows like file conversion or merging) to prevent interactive elements from decoupling over wide displays.

- **Breakpoints**:
  - **Mobile (< 768px)**: 4-column layout, compact outer margins (`margin-mobile`), vertical tool stacking.
  - **Tablet (768px – 1024px)**: 8-column layout, `gutter-sm`, inline horizontal tool bars.
  - **Desktop (> 1024px)**: 12-column layout, centered content container, persistent processing sidebars or bottom sticky status trays.
- **Rhythm**: All spatial values are derived from a strict 4px/8px incremental base. Layout distances must be applied symmetrically to preserve structural order.

## Elevation & Depth

Depth is established strictly through **pure surface contrast, subtle 1px structural outlines, and whisper-quiet ambient shadows**. Multi-tiered drop shadows, colored glow effects, and gradient backdrops are prohibited.

- **Level 0 (Base Canvas)**: Background color `#F8F9FA`. Completely flat with zero elevation.
- **Level 1 (Cards, Input Fields, Tables)**: Pure White `#FFFFFF` with a crisp `1px solid #E2E8F0` border. Shadow is an imperceptible ambient blur: `0 1px 3px rgba(15, 23, 42, 0.04)`.
- **Level 2 (Hovered Cards, Dropdowns, Batch Action Bars)**: Pure White `#FFFFFF`, border remains `1px solid #CBD5E1`, with elevation `0 4px 12px -2px rgba(15, 23, 42, 0.06)`.
- **Level 3 (Modals, Overlays, Drag Overlays)**: Surface `#FFFFFF`, border `1px solid #CBD5E1`, elevated via `0 12px 24px -4px rgba(15, 23, 42, 0.08)`.

## Shapes

The system implements balanced corner radii (`roundedness: 2`) across major functional elements to combine modern friendliness with operational precision.

- **Cards, Panels & Modal Shells**: `12px` to `16px` border-radius (`rounded-lg` / `rounded-xl`).
- **Interactive Inputs, Standard Buttons & Select Triggers**: `8px` (`rounded-md`).
- **Status Badges, File Type Tags & Filter Chips**: Strictly **full pill** (`9999px` border-radius) for quick visual scanning against squared document tiles.
- **Drag-and-Drop Zones**: `12px` corner radius with a uniform dashed stroke.

## Components

### Buttons
- **Primary**: Solid background `#E53935`, white label text, no border. Hover transitions to `#D32F2F`. Active state is `#B71C1C`.
- **Secondary**: Surface `#FFFFFF`, border `1px solid #E2E8F0`, label `#1E293B`. Hover state applies background `#F1F5F9` and border `#CBD5E1`.
- **Destructive/Ghost**: Background transparent, label `#E53935`. Hover background `#FFEBEE`.
- All buttons maintain an internal padding of `10px 20px` (`space-sm` to `space-md`) with `label-md` typography.

### Drag-and-Drop Target Zones
- Base State: Surface `#FFFFFF`, border `2px dashed #CBD5E1`, rounded `12px`, with an internal gap of `space-md`. Large coral accent action button centered inside.
- Active Drag State: Border dynamically shifts to `2px dashed #E53935`, with background tint `#FFEBEE` (5% opacity).

### Chips & Pill Badges
- **Status & Type Badges**: Full pill shape (`9999px`).
  - Standard/Neutral: Background `#F1F5F9`, text `#475569`, border `1px solid #E2E8F0`.
  - Alert/PDF Active: Background `#FFEBEE`, text `#D32F2F`.
- **Filter Chips**: Clickable pills. Unselected: `#FFFFFF` border `1px solid #E2E8F0`, text `#475569`. Selected: `#1E293B` background, text `#FFFFFF`, border `#1E293B`.

### Document Cards & Queue Tiles
- Compact white cards (`#FFFFFF`) with `1px solid #E2E8F0` border.
- Includes a dedicated file thumbnail preview, title truncated to a single line, metadata (page count, size) styled in `body-sm` `#475569`, and an end-aligned action icon (delete, rotate, or reorder handle).

### Inputs & Controls
- **Text Inputs**: Background `#FFFFFF`, border `1px solid #E2E8F0`, padding `10px 14px`. On focus: `1px solid #E53935` outline with no outer halo.
- **Checkboxes & Radios**: Size `18px`, border `1px solid #CBD5E1`. Checked state: solid `#E53935` fill with pure white icon indicator.

### Data Tables & Processing Lists
- Container bordered with `1px solid #E2E8F0` on `#FFFFFF` surface.
- Header row: `#F8F9FA`, bottom border `1px solid #E2E8F0`, typography `label-sm` with text `#475569`.
- Row height: 48px baseline; cell dividers use `1px solid #F1F5F9`. Hover row background highlights subtly with `#F8F9FA`.