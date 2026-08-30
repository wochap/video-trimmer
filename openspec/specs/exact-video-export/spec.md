# exact-video-export Specification

## Purpose
Define exact, responsive, and safely finalized MP4 exports with layered hardware acceleration.

## Requirements

### Requirement: Exact MP4 export
The system SHALL transcode the selected interval into an H.264 video and AAC audio MP4 whose media starts at timestamp zero and whose visible boundaries match the selected source interval to within one source frame.

#### Scenario: Export a selected interval
- **WHEN** the user activates `Trim` with a valid selection and destination
- **THEN** FFmpeg accurately seeks, decodes, and re-encodes the selected interval rather than performing keyframe-limited stream copying

#### Scenario: Input has no audio
- **WHEN** the selected MP4 contains no audio stream
- **THEN** the system exports a valid video-only MP4 without treating absent audio as an error

### Requirement: Layered hardware acceleration
The system SHALL attempt a full VA-API decode/encode path first, then software decode with VA-API encode, then software decode with libx264, and SHALL use the first path that initializes and completes successfully.

#### Scenario: Full VA-API succeeds
- **WHEN** the source decoder, DRM render node, VA-API driver, and H.264 VA-API encoder initialize successfully
- **THEN** the system performs hardware decode and hardware encode and reports both as active

#### Scenario: Hardware decode is unavailable
- **WHEN** VA-API encoding initializes but hardware decoding is unsupported for the source
- **THEN** the system retries with software decode and VA-API encode and reports their distinct states

#### Scenario: Hardware encode is unavailable
- **WHEN** no VA-API export path initializes or a hardware attempt fails
- **THEN** the system removes the failed temporary output, retries with libx264, and reports software fallback

### Requirement: Export progress and responsiveness
The system SHALL parse machine-readable FFmpeg progress, update the UI during export, and keep the application responsive enough to request cancellation.

#### Scenario: Export advances
- **WHEN** FFmpeg reports processed output time
- **THEN** the system displays progress relative to the selected duration without writing progress to application stdout

#### Scenario: Export fails
- **WHEN** all configured export paths fail
- **THEN** the system retains the editor and selection, removes temporary output, and displays a concise error with diagnostic log location

### Requirement: Safe destination handling
The system MUST render to a uniquely named temporary file in the destination directory and SHALL finalize the destination only after FFmpeg exits successfully and the temporary output passes validation.

#### Scenario: Destination does not exist
- **WHEN** a valid export completes
- **THEN** the system atomically renames the validated temporary file to the requested destination where supported

#### Scenario: Destination exists without overwrite permission
- **WHEN** the requested destination already exists and overwrite was not authorized
- **THEN** the system does not start export and asks for another destination or explicit confirmation

#### Scenario: Authorized replacement
- **WHEN** overwrite is authorized and export succeeds
- **THEN** the system safely replaces the destination without ever running FFmpeg directly against the source or final destination

#### Scenario: Export is cancelled
- **WHEN** the user confirms cancellation during export
- **THEN** the system terminates FFmpeg, removes the temporary file, preserves any pre-existing destination, and exits without printing a path

### Requirement: Successful completion
The system SHALL validate that the completed output is a readable MP4 with a video stream, report its canonical absolute path, and close the application after success.

#### Scenario: Export completes successfully
- **WHEN** FFmpeg exits successfully and output validation passes
- **THEN** the system logs completion, prints the canonical absolute destination path to application stdout, and exits successfully
