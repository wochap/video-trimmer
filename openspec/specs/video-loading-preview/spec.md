# video-loading-preview Specification

## Purpose
Define secure MP4 selection, validation, preview, and degraded thumbnail behavior.

## Requirements

### Requirement: Empty-state video selection
The system SHALL present the undecorated window as a clear file-selection target when no video is loaded and SHALL allow a user to invoke an MP4 file picker using either mouse or keyboard.

#### Scenario: Select with the mouse
- **WHEN** the user clicks the empty-state selection target and chooses a valid MP4
- **THEN** the system loads that file for inspection and preview

#### Scenario: Select with the keyboard
- **WHEN** the user focuses and activates the empty-state selection target or presses `Ctrl+O`
- **THEN** the system opens a keyboard-operable MP4 file picker

#### Scenario: Cancel selection
- **WHEN** the user cancels the file picker
- **THEN** the system remains in the empty state without reporting an error

### Requirement: Native file drag and drop
The system SHALL accept exactly one local MP4 path delivered by Tauri's native drag-and-drop event and SHALL provide visible feedback while an acceptable file is over the window.

#### Scenario: Drop one MP4
- **WHEN** the user drops exactly one valid MP4 anywhere on the window while no export is running
- **THEN** the system loads the dropped file and resets the trim selection to its full duration

#### Scenario: Drop an unsupported selection
- **WHEN** the user drops multiple paths, a directory, or a non-MP4 file
- **THEN** the system rejects the drop with an actionable message and retains the currently loaded video, if any

### Requirement: Input validation and probing
The system MUST use ffprobe to validate that the selected local file is a readable MP4 containing at least one video stream and SHALL obtain its duration, dimensions, codec, frame-rate information, and audio-stream presence before entering the ready state.

#### Scenario: Valid MP4
- **WHEN** ffprobe successfully identifies a video stream in an MP4
- **THEN** the system exposes the probed metadata to the editor and enters the ready state

#### Scenario: Invalid or unreadable input
- **WHEN** the selected path is missing, unreadable, malformed, not an MP4, or contains no video stream
- **THEN** the system displays a concise error and allows the user to choose another file

### Requirement: Secure local preview
The system SHALL preview only the currently selected file through the Tauri asset protocol, SHALL add that individual path to the runtime asset scope, and MUST NOT grant the webview blanket access to the user's home directory.

#### Scenario: Preview a selected file
- **WHEN** a valid file finishes probing
- **THEN** the system authorizes that path, loads it into the video element, and provides mouse-operable playback controls

#### Scenario: Replace the selected file
- **WHEN** the user successfully opens or drops a different valid file
- **THEN** the system revokes or stops using the previous preview and displays the new file

### Requirement: Preview and thumbnail failure handling
The system SHALL keep file inspection, video playback, and thumbnail generation as separately reportable operations so that a thumbnail failure does not invalidate an otherwise playable video.

#### Scenario: Thumbnail generation fails
- **WHEN** the selected MP4 can be previewed but FFmpeg cannot generate the filmstrip
- **THEN** the system retains playback and trim controls, substitutes a non-thumbnail timeline, and reports the degraded state

#### Scenario: WebKit cannot preview a probed MP4
- **WHEN** FFmpeg accepts the MP4 but the WebKit/GStreamer video element cannot decode it
- **THEN** the system explains that the file cannot be previewed and does not enable trimming
