# trim-interaction Specification

## Purpose
Define the editor workspace, precise range selection, accessibility, and cancellation interactions.

## Requirements

### Requirement: QuickTime-like trim workspace
The system SHALL display the video prominently above a compact thumbnail timeline containing a playhead, start handle, end handle, current selection, time labels, and only the actions needed to cancel or trim.

#### Scenario: Editor becomes ready
- **WHEN** a video's metadata, preview, and initial timeline are available
- **THEN** the trim range spans the full video and the workspace shows the video, timeline, `Cancel`, and `Trim`

### Requirement: Complete mouse operation
The system SHALL allow playback, seeking, range selection, cancellation, and export initiation using only a pointing device.

#### Scenario: Adjust trim range with the mouse
- **WHEN** the user drags either timeline handle
- **THEN** the corresponding boundary updates continuously, remains within the media duration, and cannot cross the other handle

#### Scenario: Seek with the mouse
- **WHEN** the user clicks or drags within the timeline selection
- **THEN** the playhead and preview seek to the corresponding media time without moving a trim boundary

#### Scenario: Control playback with the mouse
- **WHEN** the user activates the visible play/pause control or clicks the video
- **THEN** the preview toggles between playing and paused

### Requirement: Complete keyboard operation
The system SHALL allow every trimming workflow action using the keyboard and SHALL avoid overriding keystrokes used by a focused native dialog or text-like control.

#### Scenario: Playback and seek shortcuts
- **WHEN** the editor has focus and the user presses `Space`, `Left`, `Right`, `Shift+Left`, or `Shift+Right`
- **THEN** the system respectively toggles playback, seeks approximately one probed frame backward or forward, or seeks one second backward or forward

#### Scenario: Set boundaries from playhead
- **WHEN** the editor has focus and the user presses `I` or `O`
- **THEN** the system sets the start or end boundary to the current playhead time subject to range validity

#### Scenario: Adjust a focused boundary
- **WHEN** a trim handle has keyboard focus and the user presses an arrow key, `Home`, or `End`
- **THEN** the system adjusts it by one probed frame or moves it to its allowed duration endpoint without crossing the other handle

#### Scenario: Invoke primary actions
- **WHEN** the editor has focus and the user presses `Enter`, `Escape`, or `Ctrl+O`
- **THEN** the system respectively initiates a valid trim, requests cancellation/exit, or opens the input picker

### Requirement: Accessible timeline semantics
The system MUST expose the trim boundaries as independently focusable, labelled slider controls and SHALL announce changing times, validation errors, export progress, and completion through accessible status semantics.

#### Scenario: Navigate with assistive technology
- **WHEN** focus reaches either trim handle
- **THEN** its accessible name, current time, minimum, maximum, and adjustment instructions are available

#### Scenario: Focus visibility
- **WHEN** the user navigates through interactive controls with the keyboard
- **THEN** every focused control has a clearly visible focus indicator

### Requirement: Valid exact selection
The system MUST maintain `0 <= start < end <= duration`, require at least one probed frame between the boundaries, and display normalized time values with millisecond precision.

#### Scenario: Boundary would invalidate the range
- **WHEN** a mouse or keyboard adjustment would cross the other boundary or create a sub-frame selection
- **THEN** the system clamps the adjustment to the nearest valid timestamp and keeps `Trim` valid only for a non-empty range

### Requirement: Cancel behavior
The system SHALL let the user exit from the empty or ready state immediately and SHALL require confirmation before abandoning an export in progress.

#### Scenario: Cancel before export
- **WHEN** the user activates `Cancel` or presses `Escape` before export begins
- **THEN** the application exits without producing output

#### Scenario: Cancel during export
- **WHEN** the user requests cancellation while FFmpeg is running
- **THEN** the system asks for confirmation before terminating the export process
