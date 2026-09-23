# app-branding Specification

## Purpose

Define the application icon artwork and the rule that every packaged icon size is generated from one vector source.

## Requirements

### Requirement: Icon artwork
The application icon SHALL be the "Clip" design: a rounded-square tile with a horizontal filmstrip, dimmed frames outside a selection, an accent-colored trim bracket with grip lines, and a light playhead with a diamond head, using the Nocturne palette.

#### Scenario: Icon at large size
- **WHEN** the icon is rendered at 256px or larger
- **THEN** the filmstrip sprocket holes, bracket grips, and playhead diamond are all visible

#### Scenario: Icon at small size
- **WHEN** the icon is rendered at 32px or 16px
- **THEN** the accent bracket and light playhead remain distinguishable against the dark tile

### Requirement: Generated icon sizes
The system SHALL derive every icon file referenced by the Tauri configuration from one committed SVG through a repeatable script, and the generated files SHALL be committed.

#### Scenario: Regenerate icons
- **WHEN** a developer runs the icon script after editing the SVG
- **THEN** every file under `src-tauri/icons/` is rewritten from the SVG and `tauri build` uses the new artwork

#### Scenario: Window and desktop entry
- **WHEN** the application runs under Wayland
- **THEN** the compositor shows the Clip icon for the window and the desktop entry
