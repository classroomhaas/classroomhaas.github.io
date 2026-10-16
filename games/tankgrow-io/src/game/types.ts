export interface Point {
  x: number;
  y: number;
}

export type TankType = 'SCOUT' | 'HEAVY' | 'ARTILLERY' | 'FOLLOWER' | 'BOUNCER' | 'HEALER';
export type BotPersonality = 'AGGRESSIVE' | 'DEFENSIVE' | 'SCAVENGER';
export type BotDifficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';
export type GameMode = 'CLASSIC' | 'BATTLE_ROYALE' | 'TEAM_DEATHMATCH' | 'KING_OF_THE_HILL' | 'CAPTURE_THE_FLAG' | 'BOUNTY_HUNTER';
export type PowerUpType = 'SPEED' | 'RAPID_FIRE' | 'HEALTH' | 'SHIELD' | 'STRIKER';

export type ObstacleType = 'WALL' | 'MUD' | 'HAZARD' | 'BUSH' | 'WATER' | 'PLATFORM';

export interface CaptureArea {
  pos: Point;
  width: number;
  height: number;
  controllingTeam: 'RED' | 'BLUE' | 'NONE' | 'CONTESTED';
  pendingStatus?: 'RED' | 'BLUE' | 'NONE' | 'CONTESTED';
  statusTimer?: number;
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  pos: Point;
  radius: number;
}

export interface Obstacle {
  id: string;
  type: ObstacleType;
  pos: Point;
  width: number;
  height: number;
}

export type SkinType = 'DEFAULT' | 'STRIPED' | 'POLKA' | 'CAMO' | 'GALAXY' | 'NEON' | 'CHROMA' | 'WOOD' | 'GOLD' | 'RUBY' | 'EMERALD' | 'SAPPHIRE' | 'MAGMA' | 'FROST' | 'CARBON' | 'LAVA';

export interface Skin {
  id: SkinType;
  name: string;
  price: number;
}

export interface Drone {
  id: string;
  ownerId: string;
  pos: Point;
  vel: Point;
  targetId?: string;
  lastShotTime: number;
  life: number;
  health: number;
  maxHealth: number;
}

export interface Flag {
  team: 'RED' | 'BLUE';
  pos: Point;
  basePos: Point;
  carrierId: string | null;
  isDropped: boolean;
  dropTime: number | null;
}

export interface CaptureBase {
  team: 'RED' | 'BLUE';
  pos: Point;
  width: number;
  height: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  team?: 'RED' | 'BLUE';
  isSystem?: boolean;
}

export interface Tank {
  id: string;
  type: TankType;
  pos: Point;
  vel: Point;
  angle: number;
  turretAngle: number;
  radius: number;
  color: string;
  score: number;
  health: number;
  maxHealth: number;
  isBot: boolean;
  lastShotTime: number;
  name: string;
  team?: 'RED' | 'BLUE';
  personality?: BotPersonality;
  difficulty?: BotDifficulty;
  shield: number;
  activePowerUps: { [key in PowerUpType]?: number }; // expiration timestamp
  powerUpStacks: { [key in PowerUpType]?: number }; // number of stacks
  isShooting?: boolean;
  dashCooldown?: number;
  dashEndTime?: number;
  lastHitTime?: number;
  lastCollectTime?: number;
  path?: Point[];
  pathTarget?: Point;
  lastPathUpdateTime?: number;
  abilityCooldown?: number;
  abilityActiveUntil?: number;
  skin?: SkinType;
  isInBush?: boolean;
  prefersPlatforms?: boolean;
  isDead?: boolean;
  carryingFlag?: 'RED' | 'BLUE';
  spawnProtectionUntil?: number;
  isBounty?: boolean;
}

export interface Bullet {
  id: string;
  ownerId: string;
  pos: Point;
  vel: Point;
  radius: number;
  damage: number;
  color: string;
  life: number; // Time to live
  type?: TankType;
  bounces?: number;
}

export interface Particle {
  pos: Point;
  vel: Point;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface DamageText {
  id: string;
  pos: Point;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vel: Point;
}

export interface Trail {
  pos: Point;
  color: string;
  life: number;
  maxLife: number;
  radius: number;
}

export interface GameState {
  tanks: Tank[];
  bullets: Bullet[];
  particles: Particle[];
  powerUps: PowerUp[];
  obstacles: Obstacle[];
  damageTexts: DamageText[];
  trails: Trail[];
  drones: Drone[];
  worldSize: { width: number; height: number };
  teamScores?: { RED: number; BLUE: number };
  captureArea?: CaptureArea;
  heatmap?: number[][]; // Grid of activity values
  waterLevel?: number;
  flags?: Flag[];
  captureBases?: CaptureBase[];
}
