declare module '@mkkellogg/gaussian-splats-3d' {
  export enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4
  }

  export enum WebXRMode {
    None = 0,
    VR = 1,
    AR = 2
  }

  export enum RenderMode {
    Always = 0,
    OnChange = 1,
    Never = 2
  }

  export enum SceneRevealMode {
    Default = 0,
    Instant = 1,
    Gradual = 2
  }

  export enum SplatRenderMode {
    ThreeD = 0,
    TwoD = 1
  }

  export interface ViewerOptions {
    cameraUp?: number[];
    initialCameraPosition?: number[];
    initialCameraLookAt?: number[];
    selfDrivenMode?: boolean;
    renderer?: any;
    camera?: any;
    useBuiltInControls?: boolean;
    ignoreDevicePixelRatio?: boolean;
    gpuAcceleratedSort?: boolean;
    enableSIMDInSort?: boolean;
    sharedMemoryForWorkers?: boolean;
    integerBasedSort?: boolean;
    halfPrecisionCovariancesOnGPU?: boolean;
    dynamicScene?: boolean;
    webXRMode?: WebXRMode;
    renderMode?: RenderMode;
    sceneRevealMode?: SceneRevealMode;
    antialiased?: boolean;
    focalAdjustment?: number;
    logLevel?: LogLevel;
    sphericalHarmonicsDegree?: number;
    enableOptionalEffects?: boolean;
    inMemoryCompressionLevel?: number;
    freeIntermediateSplatData?: boolean;
    splatRenderMode?: SplatRenderMode;
  }

  export interface SplatSceneOptions {
    splatAlphaRemovalThreshold?: number;
    showLoadingUI?: boolean;
    position?: number[];
    rotation?: number[];
    scale?: number[];
    progressiveLoad?: boolean;
  }

  export interface SplatBufferOptions {
    splatAlphaRemovalThreshold?: number;
  }

  export class Viewer {
    constructor(options?: ViewerOptions);

    addSplatScene(path: string, options?: SplatSceneOptions): Promise<void>;
    addSplatScenes(scenes: Array<{ path: string } & SplatSceneOptions>, showLoadingUI?: boolean): Promise<void>;
    addSplatBuffers(buffers: any[], options?: SplatBufferOptions[]): Promise<void>;

    start(): Promise<void>;
    stop(): void;
    dispose(): void;

    setRenderMode(mode: RenderMode): void;
    setActiveSphericalHarmonicsDegrees(degrees: number): void;

    getCameraPosition(): number[];
    getCameraLookAt(): number[];
    getCameraUp(): number[];

    setCameraPosition(position: number[]): void;
    setCameraLookAt(lookAt: number[]): void;
    setCameraUp(up: number[]): void;
  }

  export class DropInViewer extends Viewer {
    constructor(options?: ViewerOptions);

    // Inherits from THREE.Object3D
    add(object: any): void;
    remove(object: any): void;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  }

  export function fileBufferToSplatBuffer(
    fileBuffer: { data: ArrayBuffer },
    format: string,
    alphaRemovalThreshold?: number,
    compressionLevel?: number,
    sectionSize?: number,
    sceneCenter?: number[],
    blockSize?: number,
    bucketSize?: number,
    sphericalHarmonicsDegree?: number
  ): Promise<any>;
}
