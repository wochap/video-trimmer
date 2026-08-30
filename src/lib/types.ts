export type AccelerationState="available"|"active"|"software"|"failed"|"unknown";
export type AccelerationComponent="playback_decode"|"playback_render"|"export_decode"|"export_encode";
export interface AccelerationRecord { component:AccelerationComponent;state:AccelerationState;implementation?:string;api?:string;device?:string;reason?:string; }
export interface LaunchOptions { input:string|null;output:string|null;force:boolean;verbose:boolean; }
export interface VideoMetadata { path:string;previewUrl:string;durationMicros:number;width:number;height:number;codec:string;frameRate:number;hasAudio:boolean;thumbnails:string[];thumbnailWarning?:string;playbackAcceleration:AccelerationRecord[]; }
export interface ExportRequest { input:string;output:string;startMicros:number;endMicros:number;force:boolean; }
export interface ExportProgress { fraction:number;outTimeMicros:number;attempt:string; }
export interface ExportResult { output:string;acceleration:AccelerationRecord[]; }
