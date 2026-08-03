# QuickCalc macOS Redesign — Design QA

## Comparison target

- Light source visual truth: `C:\Users\YAKEZHOU\.codex\generated_images\019fc5f3-3128-7241-a6b2-5aacef6896ae\exec-94f667eb-715e-470c-b4d9-419970bf2ef6.png`
- Dark source visual truth: `C:\Users\YAKEZHOU\.codex\generated_images\019fc5f3-3128-7241-a6b2-5aacef6896ae\exec-0e35e769-1aee-4c2c-a0ca-64056837158c.png`
- Light implementation screenshot: `C:\Users\YAKEZHOU\.codex\visualizations\2026\08\03\019fc5f3-3128-7241-a6b2-5aacef6896ae\quickcalc-light-implementation.png`
- Dark implementation screenshot: `C:\Users\YAKEZHOU\.codex\visualizations\2026\08\03\019fc5f3-3128-7241-a6b2-5aacef6896ae\quickcalc-dark-implementation.png`
- Light side-by-side evidence: `C:\Users\YAKEZHOU\.codex\visualizations\2026\08\03\019fc5f3-3128-7241-a6b2-5aacef6896ae\quickcalc-light-comparison.png`
- Dark side-by-side evidence: `C:\Users\YAKEZHOU\.codex\visualizations\2026\08\03\019fc5f3-3128-7241-a6b2-5aacef6896ae\quickcalc-dark-comparison.png`
- Current regression viewport: 720 × 620 px, matching the fixed application width and an expanded content-height state.
- Source pixels: 1568 × 1001 px; normalized to 720 × 460 with high-quality bicubic resampling for comparison.
- Implementation pixels: 720 × 460 px at browser device scale 1.
- State: populated design-preview state, Simplified Chinese locale, active expression, successful result, one user variable, and three history entries.

## Full-view comparison evidence

The original side-by-side composites validate the selected two-column direction. The v0.2.0 browser regression additionally validates the expanded built-in variable list, larger support text, dedicated top-right exit control, and both color modes at 720 × 620. The final browser captures report no horizontal or vertical overflow.

Focused-region crops were not required: this is a compact single-screen utility, the source and implementation were normalized to the same 720 × 460 canvas, and the typography, spacing, icons, copy, and controls remain legible in the original-resolution composites.

## Required fidelity surfaces

- Fonts and typography: system UI and SF Mono-compatible stacks reproduce the macOS character and numeric hierarchy. Weight, line height, truncation, and antialiasing are consistent across light and dark themes.
- Spacing and layout rhythm: the 63.5/36.5 split, 44 px title bar, input baseline, result block, variable rows, history rows, and bottom anchors remain aligned without overflow.
- Colors and visual tokens: light mode uses the selected neutral palette with system blue; dark mode maps the same semantic roles to graphite surfaces, macOS dark blue, and subdued separators. Contrast remains readable without pure-black surfaces.
- Image quality and asset fidelity: the interface contains no photographic or illustrative assets. All visible UI symbols come from the packaged Phosphor icon font; no placeholder, CSS-drawn, inline SVG, emoji, or generated raster icon substitutes remain.
- Copy and content: app-specific Chinese copy is preserved. The implementation intentionally displays the real configured `Ctrl + Shift + Space` shortcut and evaluator-safe ASCII operators instead of the mock's macOS-only shortcut glyphs and typographic multiplication sign.

## Comparison history

### Pass 1

- [P2] Result content sat too low within the fixed result region.
  - Fix: reduced the result panel's top padding and aligned its content to the start while retaining the original section height.
  - Post-fix evidence: both final composites show the result and success status aligned to the source while the variable heading remains on the same baseline.
- [P2] The compact variable preview did not expose all built-in variables and was difficult to scan.
  - Fix: changed the section to a name/value list, one variable per row, with right-aligned values and ellipsis for oversized values.
  - Post-fix evidence: `pi`, `e`, `res`, `tmstamp`, `tmlocal`, `tmutc`, and `tax` are all visible and aligned in both themes.
- [P3] History expression/result text was slightly lighter and smaller than the reference.
  - Fix: increased the two history text sizes by 1 px.

### Pass 2

No actionable P0, P1, or P2 differences remain. The red traffic-light now hides the window, while the explicit right-side localized button owns the destructive Quit action. The real configured shortcut is intentionally preserved.

## Primary interactions and runtime checks

- Input completion: entering `255.he` displays `.hex`; Tab completes it to `255.hex`.
- History recall: selecting `15% of 199` places the expression back into the input.
- Theme rendering: explicit light and dark preview states render at 720 × 620 with no overflow; computed `color-scheme` matches each requested theme.
- Variable rendering: seven name/value rows appear in the populated state, using a two-column grid with right-aligned values.
- Window controls: the red light has the accessible name “隐藏 QuickCalc”; the right-side button is labeled “退出”.
- Input copy: the Simplified Chinese placeholder is exactly “输入表达式”.
- Completion rows: candidate names are left-aligned and localized explanations are right-aligned; long text truncates without changing the replacement value.
- Submission flow: expressions and commands clear the field after capture; an empty Enter retains the previous-result copy action.
- Browser console: no errors or warnings in either theme.
- Automated checks: 27 frontend unit tests and 15 Rust unit tests pass; TypeScript typecheck, production Vite build, and v0.2.0 release-version check pass.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- [P3] The dedicated text exit button intentionally differs from the original decorative reference to make background-process termination unambiguous.
- [P3] Platform-native font rendering can vary slightly between Windows WebView and macOS WebKit while retaining the same type scale and fallbacks.

## Implementation checklist

- [x] Match selected light layout and hierarchy.
- [x] Add a system-following dark theme with a deterministic browser QA override.
- [x] Add persisted `/color` modes, `/clean`, a 100-entry limit, and a complete variable list.
- [x] Preserve the top edge while content growth animates the bottom edge downward.
- [x] Preserve calculator, completion, history, copy, and window behaviors.
- [x] Verify both visual modes, console, tests, typecheck, production build, and release version.

final result: passed
