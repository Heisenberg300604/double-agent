// Plain-data simulation types. No Three.js here — the render layer reads these.

export type AgentKind = 'civilian' | 'spy';
export type Pose = 'stand' | 'sit' | 'dead';
export type MoveMode = 'walk' | 'run' | 'crouch';
/** Standing idle activity at a point of interest (reading, phone/coffee, looking up at the board). */
export type Activity = 'none' | 'read' | 'phone' | 'look';

export type BagKind = 'none' | 'briefcase' | 'shoulder' | 'backpack';
/** 0 short, 1 long, 2 tied back, 3 shaved. */
export type HairStyle = 0 | 1 | 2 | 3;

export interface Appearance {
  coat: number;
  pants: number;
  tie: number;
  /** Index into TIE_NAMES (spies' dossier); -1 for no tie. */
  tieName: number;
  hat: boolean;
  hatColor: number;
  glasses: boolean;
  hair: number;
  /** Index into HAIR_NAMES. */
  hairName: number;
  hairStyle: HairStyle;
  bag: BagKind;
  scarf: boolean;
  skirt: boolean;
  longCoat: boolean;
  /** 0 slim .. 1 broad. */
  build: number;
  /** 0..1 skin tone blend. */
  skin: number;
  /** Small per-person height scale. */
  scale: number;
  /** Per-person random for animation variety. */
  seed: number;
}

/** What a spy wants to do this tick. Produced by input (player) or a brain (bot). */
export interface SpyIntent {
  /** World-space desired move direction, magnitude 0..1. */
  moveX: number;
  moveZ: number;
  mode: MoveMode;
  jump: boolean;
  yaw: number;
  pitch: number;
  aim: boolean;
  fire: boolean;
  reload: boolean;
  scanner: boolean;
  disguise: boolean;
  smoke: boolean;
  /** Use the interactable in front of you (sit, stand up, start or stop an activity). */
  interact: boolean;
}

export function emptyIntent(): SpyIntent {
  return {
    moveX: 0, moveZ: 0, mode: 'walk', jump: false, yaw: 0, pitch: 0,
    aim: false, fire: false, reload: false, scanner: false, disguise: false, smoke: false, interact: false,
  };
}

export interface SpyState {
  name: string;
  score: number;
  kills: number;
  deaths: number;
  civKills: number;
  targetKills: number;
  /** Derived: the highest suspicion any single witness holds of this spy. */
  suspicion: number;
  /** How many others can see this spy right now (kept for the player, for the HUD). */
  watchers: number;
  /** What this spy is visibly doing that raises suspicion (gain per second), refreshed each tick. */
  gain: number;
  proximityTimer: number;
  /** Weapon state. */
  drawn: boolean;
  drawTimer: number;
  holsterTimer: number;
  aiming: boolean;
  ammo: number;
  reloadTimer: number;
  fireCooldown: number;
  firePending: boolean;
  /** Gadgets. */
  cdScanner: number;
  cdDisguise: number;
  cdSmoke: number;
  scanTimer: number;
  disguiseTimer: number;
  /** Seconds the spy remains revealed to everyone after killing a civilian. */
  revealTimer: number;
  respawnTimer: number;
  /** Last time each other spy (by id) had this spy in view. */
  seenBy: Map<number, number>;
  lastAttacker: number;
  lastAttackTime: number;
  running: boolean;
  intent: SpyIntent;
}

export interface CivState {
  state: 'wander' | 'idle' | 'panic';
  timer: number;
  poi: number;
}

export interface Agent {
  id: number;
  kind: AgentKind;
  isPlayer: boolean;
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  /** Previous tick position for render interpolation. */
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  prevYaw: number;
  /** Desired horizontal velocity (set by brain / intent). */
  wantX: number;
  wantZ: number;
  wantJump: boolean;
  /** Target facing when standing still (NaN = face movement). */
  faceYaw: number;
  speed: number;
  maxSpeed: number;
  crouch: boolean;
  onGround: boolean;
  pose: Pose;
  seatX: number;
  seatY: number;
  seatZ: number;
  /** Standing idle activity at the occupied POI. */
  activity: Activity;
  /** Seconds spent seated or in the current activity (the blending bonus caps on this). */
  blendTimer: number;
  /** Movement lock while standing up from a seat (s). */
  standLock: number;
  /** Climbing up from (or dropping down to) a track bed: seconds left, 0 when not. */
  mantleT: number;
  mantleDur: number;
  mantleFromX: number;
  mantleFromY: number;
  mantleFromZ: number;
  mantleToX: number;
  mantleToY: number;
  mantleToZ: number;
  /** Seconds until the next "someone is on the tracks" civilian panic check. */
  trackPanicTimer: number;
  /** Track index of the train this agent is aboard, or -1. */
  aboard: number;
  /** Train-local x while aboard (world x = train front + localX). */
  localX: number;
  /** Seat index inside the train while seated aboard, or -1. */
  trainSeat: number;
  /** Riding a train off the map: invisible, untouchable, can't act. */
  away: boolean;
  /**
   * This agent's own suspicion of each spy (indexed by spy order), from what it
   * has seen itself. Nothing here is shared with anyone else.
   */
  sus: Float32Array;
  /** Walk cycle phase (radians). */
  animPhase: number;
  alive: boolean;
  health: number;
  /** Seconds since death. */
  deadTime: number;
  appearance: Appearance;
  baseAppearance: Appearance;
  /** Path following. */
  path: number[] | null;
  pathIndex: number;
  goalX: number;
  goalY: number;
  goalZ: number;
  hasGoal: boolean;
  laneOffset: number;
  stuckTimer: number;
  /** Consecutive repaths without progress; the goal is abandoned after a few. */
  stuckCount: number;
  progressX: number;
  progressZ: number;
  occupiedPoi: number;
  spy: SpyState | null;
  civ: CivState | null;
}

export interface Smoke {
  active: boolean;
  /** 'flying' while thrown, then 'cloud'. */
  phase: 'flying' | 'cloud';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  timer: number;
  radius: number;
  owner: number;
}

export type SimEvent =
  | { type: 'shot'; shooter: number; fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; hitAgent: number; headshot: boolean }
  | { type: 'impact'; x: number; y: number; z: number; nx: number; ny: number; nz: number }
  | { type: 'damage'; victim: number; attacker: number; amount: number; headshot: boolean }
  | {
      type: 'kill';
      /** How they died: shot, or hit by a moving train. */
      cause: 'shot' | 'train';
      killer: number;
      victim: number;
      victimKind: AgentKind;
      relation: 'target' | 'hunter' | 'other' | 'civilian' | 'none';
      points: number;
      headshot: boolean;
      unseen: boolean;
    }
  | { type: 'respawn'; agent: number }
  | { type: 'contract'; spy: number; target: number }
  | { type: 'scanner'; spy: number; x: number; y: number; z: number }
  | { type: 'disguise'; spy: number; on: boolean }
  | { type: 'smokeThrow'; spy: number }
  | { type: 'smokeDeploy'; x: number; y: number; z: number }
  | { type: 'reload'; spy: number }
  /** Trigger pulled while the gun can't fire (reloading). */
  | { type: 'dryFire'; spy: number }
  | { type: 'jump'; agent: number }
  | { type: 'reveal'; spy: number }
  | { type: 'train'; track: number; phase: 'arriving' | 'arrived' | 'closing' | 'departing'; service: number }
  /** A moving train sounds its horn at someone on its bed. */
  | { type: 'trainHorn'; track: number; x: number; z: number }
  | { type: 'mantle'; agent: number; up: boolean }
  | { type: 'ride'; agent: number; phase: 'board' | 'alight' | 'away' | 'return'; track: number; service: number }
  | { type: 'roundEnd' };

export interface Noise {
  x: number;
  y: number;
  z: number;
  kind: 'shot' | 'body';
  source: number;
  time: number;
}
