// Every tunable gameplay number lives here.

export const CONFIG = {
  seed: 20261107,

  sim: {
    tickRate: 60,
    /** AI brains think at this rate, staggered across ticks. */
    aiRate: 10,
  },

  match: {
    spies: 8,
    minSpies: 8,
    maxSpies: 10,
    civilians: 112,
    roundSeconds: 480,
    respawnSeconds: 5,
    civilianRespawnSeconds: 20,
    /** How long a dead spy's body stays on the floor before vanishing (≤ respawn). */
    bodyLingerSeconds: 4.5,
    civilianBodyLingerSeconds: 12,
    spawnMinDistance: 15,
  },

  body: {
    radius: 0.3,
    height: 1.8,
    crouchHeight: 1.25,
    sitHeight: 1.35,
    eyeHeight: 1.65,
    crouchEyeHeight: 1.1,
    stepHeight: 0.45,
    headRadius: 0.15,
    bodyHalfWidth: 0.26,
  },

  movement: {
    walkSpeed: 2.2,
    runSpeed: 5,
    crouchSpeed: 1.2,
    jumpVelocity: 4.4,
    gravity: 14,
    groundAccel: 16,
    airAccel: 3,
    separationRadius: 0.85,
    separationStrength: 2.2,
  },

  score: {
    target: 100,
    unseenBonus: 50,
    headshotBonus: 25,
    hunter: 50,
    wrongSpy: -25,
    civilian: -50,
    unseenWindow: 2,
    revealSeconds: 5,
  },

  health: {
    max: 100,
    head: 100,
    body: 55,
  },

  weapon: {
    magSize: 8,
    reloadTime: 1.5,
    fireInterval: 0.35,
    range: 120,
    drawTime: 0.25,
    holsterDelayAfterFire: 2,
    holsterDelayAfterAim: 1.2,
    fovNormal: 75,
    fovAim: 55,
    /** Reload animation marks, as fractions of reloadTime (the viewmodel and the reload sounds share them). */
    reloadAnim: { dropStart: 0.1, dropEnd: 0.45, seated: 0.75, slide: 0.87 },
  },

  suspicion: {
    max: 100,
    run: 25,
    /** Running inside a panicking crowd is less conspicuous. */
    runCoverFactor: 0.4,
    coverRadius: 6,
    drawn: 15,
    aim: 30,
    jump: 10,
    proximityRadius: 1.2,
    proximityDelay: 3,
    proximity: 10,
    decay: 20,
    /** Decay per second while seated on a bench or café chair (blending in). */
    seatedDecay: 30,
    /** Decay per second during a standing activity (reading, phone, board). */
    activityDecay: 26,
    /** Gain per second while down on the track bed. */
    onTracks: 20,
    exposed: 60,
  },

  interact: {
    /** Max distance from the seat or activity spot (m). */
    range: 1.6,
    /** Half-angle of the look cone that an interactable must fall in. */
    coneDeg: 35,
    /** Movement lock after standing up from a seat (s). */
    standUpTime: 0.4,
    /** The blending bonus (faster decay, weaker observation) stops after this long in one spot. */
    blendBonusSeconds: 25,
  },

  tracks: {
    /** Max gap between the body and the platform edge to climb up or drop down (m). */
    edgeReach: 0.8,
    /** Facing within this angle of the edge normal to climb or drop. */
    edgeConeDeg: 60,
    mantleTime: 0.7,
    dropTime: 0.45,
    /** A car moving faster than this kills anyone on its bed (m/s). */
    killSpeed: 0.5,
    /** Civilians within this radius panic when someone is down on the tracks. */
    panicRadius: 6,
    panicInterval: 2,
    /** Arriving/departing trains sound the horn at someone on their bed within this distance ahead. */
    hornRange: 70,
    hornCooldown: 6,
  },

  gadgets: {
    scanner: { cooldown: 20, duration: 2, near: 15, mid: 40, suspicion: 20 },
    disguise: { cooldown: 45, duration: 20 },
    smoke: { cooldown: 30, radius: 3.2, duration: 8, throwSpeed: 11, fuse: 1.6 },
  },

  civilian: {
    minSpeed: 1.8,
    maxSpeed: 2.4,
    idleMin: 5,
    idleMax: 20,
    panicSpeed: 4.5,
    panicMin: 4,
    panicMax: 6,
    panicShotRadius: 8,
    panicBodyRadius: 10,
    chatChance: 0.25,
    sitChance: 0.6,
    /** A civilian who grows this suspicious of someone this close backs away from them. */
    alarmRadius: 10,
  },

  perception: {
    fovDeg: 110,
    range: 35,
    hearShot: 20,
    hearRun: 8,
  },

  spyAI: {
    reactionMin: 0.4,
    reactionMax: 0.9,
    bodyAccMin: 0.55,
    bodyAccMax: 0.8,
    headMin: 0.15,
    headMax: 0.35,
    /** Belief gain per second while watching the true target up close (min..max by skill). */
    observeMin: 0.5,
    observeMax: 0.9,
    observeRange: 28,
    /** Observation gain multiplier while the target is seated or busy with an activity. */
    blendObserveFactor: 0.5,
    /** Belief gain per second from a visible agent with high suspicion. */
    suspiciousGain: 0.5,
    /** Belief gain per second when the target's red outline is visible to its hunter. */
    outlineGain: 3,
    /** Prior mass in the confidence denominator ("someone I haven't seen"). */
    unknownPrior: 0.4,
    decayPerSecond: 0.3,
    confidence: 0.7,
    strikeConfidence: 0.75,
    lowConfidence: 0.85,
    mistakeChance: 0.05,
    stalkRange: 25,
    /** Brisk walk while closing in — below the running-suspicion threshold. */
    hurrySpeed: 2.7,
    stalkMin: 6,
    stalkMax: 12,
    strikeRange: 10,
    loseSightTime: 1.5,
    fleeTime: 4,
    followNotice: 5,
    /** Civilians that happen to walk your way count less toward "being followed". */
    civilianFollowWeight: 0.25,
    noticeRadius: 10,
    evadeCooldown: 30,
    evadeTime: 7,
    scanSuspicionLimit: 40,
    /** Seconds a scanner reading guides the search. */
    scanMemory: 30,
    /** Blending bots pick points of interest within this radius (large maps). */
    blendRadius: 28,
    /** While searching near a scanner estimate: chance per stop to linger at a bench/stand instead of wandering on. */
    searchBlendChance: 0.3,
    /** How long a searching bot lingers there (s). Short, so the search keeps moving. */
    searchBlendMin: 2,
    searchBlendMax: 5,
    scanConeDeg: 32,
    retaliateTime: 4,
    /** Nobody strikes during the opening seconds of a round (time to read the dossier). */
    openingGrace: 20,
    firstScanMin: 8,
    firstScanMax: 18,
  },

  trains: {
    cars: 4,
    carLength: 15,
    carGap: 0.35,
    /** Distance from the buffers where an arriving train starts braking. */
    approachDistance: 110,
    arriveTime: 20,
    dwell: 40,
    departTime: 22,
    awayMin: 25,
    awayMax: 50,
    doorsOpenAfter: 2.5,
    doorsCloseBefore: 6,
    doorTime: 1.4,
    /** Doors must be at least this open to board or step off. */
    boardDoors: 0.8,
    /** Riding out: the train leaves the map this far past the trainshed end (m). */
    offMapBeyond: 10,
    /** A rider is off the map for at most this long (s); the train's away time is capped to fit. */
    rideMaxOffMap: 40,
  },

  render: {
    maxPixelRatio: 1.5,
    viewDistance: 230,
  },

  quality: {
    lowFps: 50,
    highFps: 58,
    raiseAfter: 5,
    window: 2,
    scales: [1, 0.85, 0.7],
  },
} as const;

export type GameConfig = typeof CONFIG;
