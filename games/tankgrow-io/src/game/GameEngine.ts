import { Bullet, GameState, Particle, Tank, Point, TankType, GameMode, PowerUp, PowerUpType, Obstacle, ObstacleType, BotPersonality, CaptureArea, BotDifficulty, SkinType } from './types';

const BASE_RADIUS = 20;
const GROWTH_FACTOR = 1.5;
import { soundManager } from './SoundManager';
import { hapticManager } from './HapticManager';

const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 5000;
const MAX_BOTS = 29;
const POWERUP_SPAWN_RATE = 0.005; // chance per frame
const MAX_POWERUPS = 25;

export const TANK_STATS: Record<TankType, any> = {
  SCOUT: {
    baseSpeed: 5,
    minSpeed: 2.5,
    baseBulletSpeed: 12,
    minBulletSpeed: 6,
    shootCooldown: 250,
    damage: 5,
    maxHealth: 80,
    bulletLife: 1500,
    abilityCooldown: 15000,
    abilityDuration: 5000,
  },
  HEAVY: {
    baseSpeed: 3,
    minSpeed: 1,
    baseBulletSpeed: 6,
    minBulletSpeed: 3,
    shootCooldown: 600,
    damage: 20,
    maxHealth: 200,
    bulletLife: 2000,
    armor: 0.5,
    abilityCooldown: 10000,
    abilityDuration: 500,
  },
  ARTILLERY: {
    baseSpeed: 3.8,
    minSpeed: 1.5,
    baseBulletSpeed: 10,
    minBulletSpeed: 5,
    shootCooldown: 1000,
    damage: 40,
    maxHealth: 100,
    bulletLife: 4000,
    abilityCooldown: 12000,
    abilityDuration: 10000,
  },
  FOLLOWER: {
    baseSpeed: 4.4,
    minSpeed: 1.5,
    baseBulletSpeed: 9,
    minBulletSpeed: 4.5,
    shootCooldown: 800,
    damage: 8,
    maxHealth: 120,
    bulletLife: 3000,
    abilityCooldown: 20000,
    abilityDuration: 15000,
  },
  BOUNCER: {
    baseSpeed: 4.5,
    minSpeed: 2,
    baseBulletSpeed: 11,
    minBulletSpeed: 5.5,
    shootCooldown: 500,
    damage: 12,
    maxHealth: 100,
    bulletLife: 2500,
    abilityCooldown: 15000,
    abilityDuration: 8000,
  },
  HEALER: {
    baseSpeed: 4.1,
    minSpeed: 1.8,
    baseBulletSpeed: 10,
    minBulletSpeed: 5,
    shootCooldown: 400,
    damage: 4,
    maxHealth: 250,
    bulletLife: 2000,
    abilityCooldown: 25000,
    abilityDuration: 0,
  }
};

export class GameEngine {
  state: GameState;
  playerId: string;
  playerJoined: boolean = false;
  disableBots: boolean = false;
  onShoot?: (bullet: Bullet) => void;
  onHit?: (targetId: string, damage: number, shooterId: string) => void;
  onKill?: (victim: Tank, killer: Tank) => void;
  onWin?: (team: 'RED' | 'BLUE') => void;
  private initialBotsSpawned: boolean = false;
  gameMode: GameMode = 'CLASSIC';
  mapType: 'ARENA' | 'LABYRINTH' | 'WASTELAND' | 'FORTRESS' | 'ISLANDS' | 'RUINS' | 'ICE' | 'REGIONS' = 'ARENA';
  botDifficulty: BotDifficulty | 'DYNAMIC' = 'NORMAL';
  private botSpawnQueue: { time: number; team?: 'RED' | 'BLUE' }[] = [];
  private staticObstacleGrid: boolean[][] = [];
  private readonly pathfindingGridSize = 250;
  private lastPathfindingCleanup = 0;
  private obstacleGrid: Obstacle[][] = [];
  private readonly spatialGridSize = 500;
  private lastHeatmapUpdate = 0;
  playerStats = {
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0
  };

  setGameMode(mode: GameMode) {
    this.gameMode = mode;
    if (mode === 'KING_OF_THE_HILL') {
      const areaSize = 1200;
      this.state.captureArea = {
        pos: { x: (WORLD_WIDTH - areaSize) / 2, y: (WORLD_HEIGHT - areaSize) / 2 },
        width: areaSize,
        height: areaSize,
        controllingTeam: 'NONE',
      };
      this.state.teamScores = { RED: 0, BLUE: 0 };
    } else if (mode === 'TEAM_DEATHMATCH' || mode === 'CAPTURE_THE_FLAG' || mode === 'BOUNTY_HUNTER') {
      this.state.teamScores = { RED: 0, BLUE: 0 };
    }
  }

  constructor(playerId: string) {
    this.playerId = playerId;
    this.state = {
      tanks: [],
      bullets: [],
      particles: [],
      powerUps: [],
      obstacles: [],
      damageTexts: [],
      trails: [],
      drones: [],
      worldSize: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      teamScores: { RED: 0, BLUE: 0 },
      heatmap: Array(50).fill(0).map(() => Array(50).fill(0)),
    };
  }

  private updateHeatmap(dt: number) {
    if (!this.state.heatmap) return;
    const now = Date.now();
    if (now - this.lastHeatmapUpdate < 100) return; // Throttle to 10fps
    this.lastHeatmapUpdate = now;

    const gridSize = 50;
    const cellWidth = WORLD_WIDTH / gridSize;
    const cellHeight = WORLD_HEIGHT / gridSize;

    // Decay existing heatmap
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        this.state.heatmap[y][x] *= Math.pow(0.95, dt / 1000);
      }
    }

    // Add activity from tanks
    this.state.tanks.forEach(tank => {
      const hx = Math.floor(tank.pos.x / cellWidth);
      const hy = Math.floor(tank.pos.y / cellHeight);
      if (hx >= 0 && hx < gridSize && hy >= 0 && hy < gridSize) {
        this.state.heatmap![hy][hx] += 0.1 * (dt / 1000);
      }
    });

    // Add activity from bullets (combat frequency)
    this.state.bullets.forEach(bullet => {
      const hx = Math.floor(bullet.pos.x / cellWidth);
      const hy = Math.floor(bullet.pos.y / cellHeight);
      if (hx >= 0 && hx < gridSize && hy >= 0 && hy < gridSize) {
        this.state.heatmap![hy][hx] += 0.5 * (dt / 1000);
      }
    });
  }

  private getPath(start: Point, end: Point, botId: string): Point[] | null {
    const gridSize = this.pathfindingGridSize;
    const cols = Math.ceil(WORLD_WIDTH / gridSize);
    const rows = Math.ceil(WORLD_HEIGHT / gridSize);

    const toGrid = (p: Point) => ({
      x: Math.floor(p.x / gridSize),
      y: Math.floor(p.y / gridSize)
    });

    const startGrid = toGrid(start);
    const endGrid = toGrid(end);

    if (startGrid.x === endGrid.x && startGrid.y === endGrid.y) return [end];

    // Check if we have a valid pre-calculated grid
    if (this.staticObstacleGrid.length === 0) {
      this.precalculateObstacleGrid();
    }

    const openSet: any[] = [{ ...startGrid, g: 0, h: this.getDist(startGrid, endGrid), parent: null }];
    const openSetMap = new Map<string, any>();
    openSetMap.set(`${startGrid.x},${startGrid.y}`, openSet[0]);
    const closedSet = new Set<string>();

    const getNeighbors = (node: any) => {
      const neighbors = [];
      const dirs = [
        { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
      ];

      for (const dir of dirs) {
        const nx = node.x + dir.x;
        const ny = node.y + dir.y;

        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
          if (this.staticObstacleGrid[ny][nx]) continue;
          
          const worldPos = { x: nx * gridSize + gridSize / 2, y: ny * gridSize + gridSize / 2 };
          let collides = false;
          
          // Dynamic obstacles (Tanks) - Only check nearby ones to save performance
          for (const tank of this.state.tanks) {
            if (tank.id === botId) continue;
            const d = this.getDist(worldPos, tank.pos);
            if (d < tank.radius + 40) {
              collides = true;
              break;
            }
          }
          
          // Dynamic obstacles (Bullets) - Only check nearby ones
          if (!collides) {
            for (const bullet of this.state.bullets) {
              const d = this.getDist(worldPos, bullet.pos);
              if (d < 60) {
                collides = true;
                break;
              }
            }
          }

          if (!collides) neighbors.push({ x: nx, y: ny });
        }
      }
      return neighbors;
    };

    while (openSet.length > 0) {
      // Use a faster way to find the min node than sorting every time
      let minIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if ((openSet[i].g + openSet[i].h) < (openSet[minIdx].g + openSet[minIdx].h)) {
          minIdx = i;
        }
      }
      const current = openSet.splice(minIdx, 1)[0];
      openSetMap.delete(`${current.x},${current.y}`);

      if (current.x === endGrid.x && current.y === endGrid.y) {
        const path = [];
        let curr = current;
        while (curr) {
          path.push({ x: curr.x * gridSize + gridSize / 2, y: curr.y * gridSize + gridSize / 2 });
          curr = curr.parent;
        }
        return path.reverse();
      }

      closedSet.add(`${current.x},${current.y}`);

      for (const neighbor of getNeighbors(current)) {
        if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue;

        const gScore = current.g + 1;
        const key = `${neighbor.x},${neighbor.y}`;
        let openNode = openSetMap.get(key);

        if (!openNode) {
          openNode = { ...neighbor, g: gScore, h: this.getDist(neighbor, endGrid), parent: current };
          openSet.push(openNode);
          openSetMap.set(key, openNode);
        } else if (gScore < openNode.g) {
          openNode.g = gScore;
          openNode.parent = current;
        }
      }

      if (closedSet.size > 100) break; // Reduced limit for better performance
    }

    return null;
  }

  private precalculateObstacleGrid() {
    const cols = Math.ceil(WORLD_WIDTH / this.pathfindingGridSize);
    const rows = Math.ceil(WORLD_HEIGHT / this.pathfindingGridSize);
    this.staticObstacleGrid = Array(rows).fill(false).map(() => Array(cols).fill(false));

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const worldPos = { 
          x: x * this.pathfindingGridSize + this.pathfindingGridSize / 2, 
          y: y * this.pathfindingGridSize + this.pathfindingGridSize / 2 
        };
        for (const obs of this.state.obstacles) {
          if (obs.type === 'WALL' && this.checkRectCircleCollision(obs, worldPos, 60)) {
            this.staticObstacleGrid[y][x] = true;
            break;
          }
        }
      }
    }
  }

  generateMap(mapType: 'ARENA' | 'LABYRINTH' | 'WASTELAND' | 'FORTRESS' | 'ISLANDS' | 'RUINS' | 'ICE' | 'REGIONS') {
    this.mapType = mapType;
    this.state.obstacles = [];
    this.staticObstacleGrid = []; // Reset grid
    this.obstacleGrid = []; // Reset spatial grid
    if (mapType === 'ARENA') {
      // Empty map - no walls
    } else if (mapType === 'REGIONS') {
      // Jungle quadrant (Top Right) bushes
      for (let i = 0; i < 40; i++) {
        const x = 2500 + Math.random() * 2400 + 50;
        const y = Math.random() * 2400 + 50;
        this.state.obstacles.push({
          id: `bush_${i}`,
          type: 'BUSH',
          pos: { x, y },
          width: 150 + Math.random() * 100,
          height: 150 + Math.random() * 100
        });
      }
    } else if (mapType === 'LABYRINTH') {
      // Maze-like structure with guaranteed gaps to prevent closed shapes
      const cellSize = 350;
      const cols = Math.floor(WORLD_WIDTH / cellSize);
      const rows = Math.floor(WORLD_HEIGHT / cellSize);
      const wallThickness = 25;

      for (let x = 1; x < cols; x++) {
        for (let y = 1; y < rows; y++) {
          // Place walls that are shorter than the cell size to ensure gaps at every intersection
          // This makes it impossible to form a closed box/shape
          const isVertical = Math.random() > 0.5;
          if (isVertical) {
            this.state.obstacles.push({
              id: `w-v-${x}-${y}`,
              type: 'WALL',
              pos: { x: x * cellSize, y: y * cellSize - cellSize * 0.4 },
              width: wallThickness,
              height: cellSize * 0.8, // 80% height ensures 20% gap
            });
          } else {
            this.state.obstacles.push({
              id: `w-h-${x}-${y}`,
              type: 'WALL',
              pos: { x: x * cellSize - cellSize * 0.4, y: y * cellSize },
              width: cellSize * 0.8, // 80% width ensures 20% gap
              height: wallThickness,
            });
          }
        }
      }
    } else if (mapType === 'WASTELAND') {
      for (let i = 0; i < 10; i++) {
        this.addObstacle('MUD', 300, 300);
        this.addObstacle('HAZARD', 200, 200);
      }
      for (let i = 0; i < 10; i++) {
        this.addObstacle('WALL', 100, 100);
      }
    } else if (mapType === 'FORTRESS') {
      // Central fortress
      const center = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
      const size = 1200;
      const thickness = 50;
      
      // Outer walls with larger gaps
      this.state.obstacles.push({ id: 'f1', type: 'WALL', pos: { x: center.x - size/2, y: center.y - size/2 }, width: size * 0.35, height: thickness });
      this.state.obstacles.push({ id: 'f2', type: 'WALL', pos: { x: center.x + size/2 - size * 0.35, y: center.y - size/2 }, width: size * 0.35, height: thickness });
      this.state.obstacles.push({ id: 'f3', type: 'WALL', pos: { x: center.x - size/2, y: center.y + size/2 - thickness }, width: size * 0.35, height: thickness });
      this.state.obstacles.push({ id: 'f4', type: 'WALL', pos: { x: center.x + size/2 - size * 0.35, y: center.y + size/2 - thickness }, width: size * 0.35, height: thickness });
      this.state.obstacles.push({ id: 'f5', type: 'WALL', pos: { x: center.x - size/2, y: center.y - size/2 }, width: thickness, height: size * 0.35 });
      this.state.obstacles.push({ id: 'f6', type: 'WALL', pos: { x: center.x - size/2, y: center.y + size/2 - size * 0.35 }, width: thickness, height: size * 0.35 });
      this.state.obstacles.push({ id: 'f7', type: 'WALL', pos: { x: center.x + size/2 - thickness, y: center.y - size/2 }, width: thickness, height: size * 0.35 });
      this.state.obstacles.push({ id: 'f8', type: 'WALL', pos: { x: center.x + size/2 - thickness, y: center.y + size/2 - size * 0.35 }, width: thickness, height: size * 0.35 });
      
      // Inner cross walls
      this.state.obstacles.push({ id: 'f9', type: 'WALL', pos: { x: center.x - 100, y: center.y - size/2 + 100 }, width: 200, height: thickness });
      this.state.obstacles.push({ id: 'f10', type: 'WALL', pos: { x: center.x - 100, y: center.y + size/2 - 150 }, width: 200, height: thickness });
      
      // Mini structures at corners
      const corners = [
        { x: 800, y: 800 },
        { x: WORLD_WIDTH - 800, y: 800 },
        { x: 800, y: WORLD_HEIGHT - 800 },
        { x: WORLD_WIDTH - 800, y: WORLD_HEIGHT - 800 }
      ];
      
      corners.forEach((corner, idx) => {
        const mSize = 300;
        // Mini structures with larger gaps
        this.state.obstacles.push({ id: `m${idx}1`, type: 'WALL', pos: { x: corner.x - mSize/2, y: corner.y - mSize/2 }, width: mSize * 0.3, height: 20 });
        this.state.obstacles.push({ id: `m${idx}1g`, type: 'WALL', pos: { x: corner.x + mSize/2 - mSize * 0.3, y: corner.y - mSize/2 }, width: mSize * 0.3, height: 20 });
        
        this.state.obstacles.push({ id: `m${idx}2`, type: 'WALL', pos: { x: corner.x - mSize/2, y: corner.y + mSize/2 }, width: mSize * 0.3, height: 20 });
        this.state.obstacles.push({ id: `m${idx}2g`, type: 'WALL', pos: { x: corner.x + mSize/2 - mSize * 0.3, y: corner.y + mSize/2 }, width: mSize * 0.3, height: 20 });
        
        this.state.obstacles.push({ id: `m${idx}3`, type: 'WALL', pos: { x: corner.x - mSize/2, y: corner.y - mSize/2 }, width: 20, height: mSize * 0.3 });
        this.state.obstacles.push({ id: `m${idx}3g`, type: 'WALL', pos: { x: corner.x - mSize/2, y: corner.y + mSize/2 - mSize * 0.3 }, width: 20, height: mSize * 0.3 });
        
        this.state.obstacles.push({ id: `m${idx}4`, type: 'WALL', pos: { x: corner.x + mSize/2, y: corner.y - mSize/2 }, width: 20, height: mSize * 0.3 });
        this.state.obstacles.push({ id: `m${idx}4g`, type: 'WALL', pos: { x: corner.x + mSize/2, y: corner.y + mSize/2 - mSize * 0.3 }, width: 20, height: mSize * 0.3 });
      });

    } else if (mapType === 'ISLANDS') {
      // Water covers the map
      this.state.obstacles.push({ id: 'water', type: 'WATER', pos: { x: 0, y: 0 }, width: WORLD_WIDTH, height: WORLD_HEIGHT });
      this.state.waterLevel = 0;

      // Platforms as safe spots - Larger and spread out
      for (let i = 0; i < 40; i++) {
        this.addObstacle('PLATFORM', 400, 400);
      }
    } else if (mapType === 'RUINS') {
      // Scattered broken walls
      for (let i = 0; i < 40; i++) {
        const isVert = Math.random() > 0.5;
        this.addObstacle('WALL', isVert ? 30 : 120, isVert ? 120 : 30);
      }
      // Bushes for hiding - More and larger
      for (let i = 0; i < 25; i++) {
        this.addObstacle('BUSH', 800, 800);
      }
      for (let i = 0; i < 10; i++) {
        this.addObstacle('HAZARD', 150, 150);
      }
    }

    if (this.gameMode === 'CAPTURE_THE_FLAG') {
      this.state.flags = [
        {
          team: 'RED',
          pos: { x: 400, y: WORLD_HEIGHT / 2 },
          basePos: { x: 400, y: WORLD_HEIGHT / 2 },
          carrierId: null,
          isDropped: false,
          dropTime: null
        },
        {
          team: 'BLUE',
          pos: { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT / 2 },
          basePos: { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT / 2 },
          carrierId: null,
          isDropped: false,
          dropTime: null
        }
      ];

      this.state.captureBases = [
        {
          team: 'RED',
          pos: { x: 300, y: WORLD_HEIGHT / 2 - 150 },
          width: 200,
          height: 300
        },
        {
          team: 'BLUE',
          pos: { x: WORLD_WIDTH - 500, y: WORLD_HEIGHT / 2 - 150 },
          width: 200,
          height: 300
        }
      ];
    }
  }

  private addObstacle(type: ObstacleType, w: number, h: number) {
    this.state.obstacles.push({
      id: Math.random().toString(36).substr(2, 9),
      type,
      pos: { x: Math.random() * (WORLD_WIDTH - w), y: Math.random() * (WORLD_HEIGHT - h) },
      width: w,
      height: h,
    });
  }

  private getSafeSpawnPos(radius: number, team?: 'RED' | 'BLUE'): Point {
    if (this.gameMode === 'CAPTURE_THE_FLAG' && team) {
      const base = this.state.captureBases?.find(b => b.team === team);
      if (base) {
        // Spawn near base
        for (let i = 0; i < 20; i++) {
          const testPos = {
            x: base.pos.x + Math.random() * base.width,
            y: base.pos.y + Math.random() * base.height
          };
          let collides = false;
          for (const obs of this.state.obstacles) {
            if (obs.type === 'WALL' && this.checkRectCircleCollision(obs, testPos, radius + 10)) {
              collides = true;
              break;
            }
          }
          if (!collides) return testPos;
        }
      }
    }

    let bestPos: Point = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
    let maxMinDist = -1;

    // Try 50 random positions and pick the one furthest from enemies
    for (let i = 0; i < 50; i++) {
      const testPos = { 
        x: radius + Math.random() * (WORLD_WIDTH - radius * 2), 
        y: radius + Math.random() * (WORLD_HEIGHT - radius * 2) 
      };
      
      // Check for wall collisions
      let collidesWithWall = false;
      for (const obs of this.state.obstacles) {
        if (obs.type === 'WALL' && this.checkRectCircleCollision(obs, testPos, radius + 20)) {
          collidesWithWall = true;
          break;
        }
      }
      if (collidesWithWall) continue;

      let minDist = Infinity;
      this.state.tanks.forEach(tank => {
        // Only care about enemies
        const isEnemy = this.gameMode === 'CLASSIC' || this.gameMode === 'BATTLE_ROYALE' || (team && tank.team !== team);
        if (isEnemy) {
          const dist = this.getDist(testPos, tank.pos);
          if (dist < minDist) minDist = dist;
        }
      });

      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestPos = testPos;
      }
      
      // If we found a spot far enough away, just take it
      if (maxMinDist > 600) break;
    }

    return bestPos;
  }

  addTank(id: string, name: string, color: string, type: TankType, isBot: boolean = false, initialScore: number = 0, team?: 'RED' | 'BLUE', personality?: BotPersonality, difficulty?: BotDifficulty, skin?: SkinType) {
    if (!isBot) this.playerJoined = true;
    const stats = TANK_STATS[type];
    const tank: Tank = {
      id,
      name,
      type,
      team,
      personality,
      difficulty,
      pos: this.getSafeSpawnPos(BASE_RADIUS, team),
      vel: { x: 0, y: 0 },
      angle: 0,
      turretAngle: 0,
      radius: BASE_RADIUS + (initialScore * GROWTH_FACTOR),
      color: team === 'RED' ? '#ef4444' : (team === 'BLUE' ? '#3b82f6' : color),
      score: initialScore,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      isBot,
      lastShotTime: 0,
      shield: 0,
      activePowerUps: { 'SHIELD': Date.now() + 3000 },
      isShooting: false,
      dashCooldown: 0,
      dashEndTime: 0,
      powerUpStacks: {},
      skin: skin || 'DEFAULT',
      prefersPlatforms: isBot ? Math.random() > 0.5 : false,
      spawnProtectionUntil: Date.now() + 3000,
    };
    this.state.tanks.push(tank);
    return tank;
  }

  private spawnBot(queuedTeam?: 'RED' | 'BLUE') {
    const types: TankType[] = ['SCOUT', 'HEAVY', 'ARTILLERY', 'FOLLOWER'];
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const personalities: BotPersonality[] = ['AGGRESSIVE', 'DEFENSIVE', 'SCAVENGER'];
    const skins: SkinType[] = ['DEFAULT', 'STRIPED', 'POLKA', 'CAMO', 'GALAXY', 'NEON', 'CHROMA', 'WOOD', 'GOLD', 'RUBY', 'EMERALD', 'SAPPHIRE', 'MAGMA', 'FROST', 'CARBON', 'LAVA'];
    
    let initialScore = 0;
    if (!this.playerJoined && this.gameMode === 'CLASSIC') {
      const rand = Math.random();
      if (rand < 0.3) initialScore = Math.floor(Math.random() * 80) + 20;
    }

    let team = queuedTeam;
    if ((this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG') && !team) {
      const redCount = this.state.tanks.filter(t => t.team === 'RED').length;
      const totalTanks = MAX_BOTS + 1;
      team = redCount < totalTanks / 2 ? 'RED' : 'BLUE';
    }

    let difficulty: BotDifficulty = 'NORMAL';
    if (this.botDifficulty === 'DYNAMIC') {
      const rand = Math.random();
      if (rand < 0.4) difficulty = 'EASY';
      else if (rand < 0.8) difficulty = 'NORMAL';
      else difficulty = 'HARD';
    } else {
      difficulty = this.botDifficulty;
    }

    this.addTank(
      Math.random().toString(36).substr(2, 9),
      `Bot ${Math.floor(Math.random() * 100)}`,
      colors[Math.floor(Math.random() * colors.length)],
      types[Math.floor(Math.random() * types.length)],
      true,
      initialScore,
      team,
      personalities[Math.floor(Math.random() * personalities.length)],
      difficulty,
      skins[Math.floor(Math.random() * skins.length)]
    );
  }

  private buildSpatialGrid() {
    const cols = Math.ceil(WORLD_WIDTH / this.spatialGridSize);
    const rows = Math.ceil(WORLD_HEIGHT / this.spatialGridSize);
    this.obstacleGrid = Array(rows * cols).fill(null).map(() => []);

    this.state.obstacles.forEach(obs => {
      const startX = Math.floor(obs.pos.x / this.spatialGridSize);
      const endX = Math.floor((obs.pos.x + obs.width) / this.spatialGridSize);
      const startY = Math.floor(obs.pos.y / this.spatialGridSize);
      const endY = Math.floor((obs.pos.y + obs.height) / this.spatialGridSize);

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (x >= 0 && x < cols && y >= 0 && y < rows) {
            this.obstacleGrid[y * cols + x].push(obs);
          }
        }
      }
    });
  }

  private getNearbyObstacles(pos: Point, radius: number): Obstacle[] {
    if (this.obstacleGrid.length === 0) this.buildSpatialGrid();
    
    const cols = Math.ceil(WORLD_WIDTH / this.spatialGridSize);
    const rows = Math.ceil(WORLD_HEIGHT / this.spatialGridSize);
    
    const startX = Math.floor((pos.x - radius) / this.spatialGridSize);
    const endX = Math.floor((pos.x + radius) / this.spatialGridSize);
    const startY = Math.floor((pos.y - radius) / this.spatialGridSize);
    const endY = Math.floor((pos.y + radius) / this.spatialGridSize);
    
    const nearby: Obstacle[] = [];
    const seen = new Set<string>();

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const cell = this.obstacleGrid[y * cols + x];
          cell.forEach(obs => {
            if (!seen.has(obs.id)) {
              nearby.push(obs);
              seen.add(obs.id);
            }
          });
        }
      }
    }
    return nearby;
  }

  update(dt: number, input: { moveX: number; moveY: number; mouseX: number; mouseY: number; shooting: boolean; dash?: boolean; ability?: boolean }) {
    const now = Date.now();
    this.updateHeatmap(dt);

    // Tide logic for ISLANDS map
    if (this.state.waterLevel !== undefined) {
      const cycleTime = 15000; // 15 seconds per cycle
      const rawTide = (Math.sin(now / cycleTime * Math.PI * 2) + 1) / 2; // 0 to 1
      // Make low tide longer by biasing the curve
      const tide = Math.max(0, (rawTide - 0.3) / 0.7);
      this.state.waterLevel = tide;
    }

    // Spawn Power-ups
    if (this.state.powerUps.length < MAX_POWERUPS && Math.random() < POWERUP_SPAWN_RATE) {
      const types: PowerUpType[] = ['SPEED', 'RAPID_FIRE', 'HEALTH', 'SHIELD', 'STRIKER'];
      this.state.powerUps.push({
        id: Math.random().toString(36).substr(2, 9),
        type: types[Math.floor(Math.random() * types.length)],
        pos: { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT },
        radius: 15,
      });
    }

    // Respawn Bots
    const botCount = this.state.tanks.filter(t => t.isBot).length;
    
    if (!this.disableBots) {
      // Immediate spawn for initial bots
      if (this.playerJoined && !this.initialBotsSpawned && (this.gameMode === 'CLASSIC' || this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG' || this.gameMode === 'BOUNTY_HUNTER')) {
        while (this.state.tanks.filter(t => t.isBot).length < MAX_BOTS) {
          this.spawnBot();
        }
        this.initialBotsSpawned = true;
      }

      // Process spawn queue
      for (let i = this.botSpawnQueue.length - 1; i >= 0; i--) {
        if (now >= this.botSpawnQueue[i].time) {
          const spawn = this.botSpawnQueue.splice(i, 1)[0];
          this.spawnBot(spawn.team);
        }
      }

      // In Battle Royale, bots only spawn at the start and don't respawn after player joins
      // In TDM, Classic, and Bounty Hunter, bots respawn with a delay
      if (this.gameMode === 'CLASSIC' || this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG' || this.gameMode === 'BOUNTY_HUNTER') {
        const activeAndQueued = botCount + this.botSpawnQueue.length;
        if (activeAndQueued < MAX_BOTS) {
          this.botSpawnQueue.push({ time: now + 5000 });
        }
      } else if (this.gameMode === 'BATTLE_ROYALE') {
        // One-time spawn at start
        if (!this.playerJoined && botCount < MAX_BOTS) {
          this.spawnBot();
        }
      }
    }

    // Update Tanks
    this.state.tanks.forEach(tank => {
      const stats = TANK_STATS[tank.type];
      
      // Handle Power-up expirations
      for (const type in tank.activePowerUps) {
        if (tank.activePowerUps[type as PowerUpType]! < now) {
          delete tank.activePowerUps[type as PowerUpType];
          delete tank.powerUpStacks[type as PowerUpType];
        }
      }

      // Handle Dash for all tanks (visuals)
      const isDashing = now < (tank.dashEndTime || 0);
      if (isDashing && Math.random() > 0.5) {
        this.state.particles.push({
          pos: { ...tank.pos },
          vel: { x: 0, y: 0 },
          radius: tank.radius * 0.8,
          color: tank.color,
          life: 200,
          maxLife: 200,
        });
      }

      let speed = this.getTankSpeed(tank);
      const speedStacks = tank.powerUpStacks['SPEED'] || 0;
      if (speedStacks > 0) speed *= (1 + speedStacks * 0.5);
      if (isDashing) speed *= 3; // Dash speed boost
      
      if (tank.id === this.playerId && (Math.abs(tank.vel.x) > 0.1 || Math.abs(tank.vel.y) > 0.1)) {
        soundManager.playEngine(speed / 10);
      }
      
      // Obstacle effects (Now applies to all tanks, including bots)
      let onSafeSpot = false;
      let inBush = false;
      this.state.obstacles.forEach(obs => {
        if (this.checkRectCircleCollision(obs, tank.pos, tank.radius)) {
          if (obs.type === 'MUD') {
            speed *= 0.4;
            onSafeSpot = true;
          }
          if (obs.type === 'HAZARD') tank.health -= 0.1;
          if (obs.type === 'PLATFORM') onSafeSpot = true;
          if (obs.type === 'BUSH') inBush = true;
        }
      });
      tank.isInBush = inBush;

      // Water damage on ISLANDS
      if (this.state.waterLevel !== undefined && !onSafeSpot) {
        // Damage increases with tide level
        const damage = 0.05 + (this.state.waterLevel * 0.2);
        tank.health -= damage;
        if (Math.random() > 0.8) {
          this.state.particles.push({
            pos: { ...tank.pos },
            vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
            radius: 2,
            color: '#3b82f6',
            life: 300,
            maxLife: 300
          });
        }
      }

      if (tank.id === this.playerId) {
        tank.isShooting = input.shooting;
        
        // Handle Ability Activation
        if (input.ability) {
          this.activateAbility(tank);
        }

        // Handle Dash Activation
        if (input.dash && now > (tank.dashCooldown || 0) && (input.moveX !== 0 || input.moveY !== 0)) {
          tank.dashEndTime = now + 200; // 200ms dash
          tank.dashCooldown = now + 3000; // 3s cooldown
          
          // Create dash particles
          for (let i = 0; i < 10; i++) {
            this.state.particles.push({
              pos: { ...tank.pos },
              vel: { 
                x: (Math.random() - 0.5) * 5, 
                y: (Math.random() - 0.5) * 5 
              },
              radius: Math.random() * 5 + 2,
              color: tank.color,
              life: 500,
              maxLife: 500,
            });
          }
        }

        const targetVelX = input.moveX * speed;
        const targetVelY = input.moveY * speed;

        let currentFriction = 1.0;
        let isIce = this.mapType === 'ICE';
        let isDesert = false;

        if (this.mapType === 'REGIONS') {
          if (tank.pos.x >= 2500 && tank.pos.y >= 2500) {
            isIce = true;
          } else if (tank.pos.x < 2500 && tank.pos.y >= 2500) {
            isDesert = true;
          }
        }

        if (isIce) {
          const friction = 0.05;
          tank.vel.x += (targetVelX - tank.vel.x) * friction;
          tank.vel.y += (targetVelY - tank.vel.y) * friction;
        } else if (isDesert) {
          // Desert slows you down
          tank.vel.x = targetVelX * 0.4;
          tank.vel.y = targetVelY * 0.4;
        } else {
          tank.vel.x = targetVelX;
          tank.vel.y = targetVelY;
        }

        tank.turretAngle = Math.atan2(input.mouseY - tank.pos.y, input.mouseX - tank.pos.x);
        
        const stats = TANK_STATS[tank.type];
        let cooldown = stats.shootCooldown;
        const rapidStacks = tank.powerUpStacks['RAPID_FIRE'] || 0;
        if (rapidStacks > 0) cooldown *= Math.pow(0.6, rapidStacks);

        if (input.shooting && now - tank.lastShotTime > cooldown) {
          this.shoot(tank);
        }
      } else if (tank.isBot) {
        // Apply environmental effects to bots too
        let botSpeed = speed;
        if (this.mapType === 'REGIONS') {
          if (tank.pos.x < 2500 && tank.pos.y >= 2500) {
            botSpeed *= 0.4; // Desert slow
          }
        }
        this.updateBot(tank, now, botSpeed);
      }

      // Health Regeneration: 1% of max health per second (5% if standing still)
      // Regeneration stops if the tank is shooting
      if (tank.health < tank.maxHealth && !tank.isShooting) {
        const isMoving = Math.abs(tank.vel.x) > 0.1 || Math.abs(tank.vel.y) > 0.1;
        const regenMultiplier = isMoving ? 1 : 5;
        tank.health = Math.min(tank.maxHealth, tank.health + (tank.maxHealth * 0.01 * regenMultiplier) * (dt / 1000));
      }

      // Physics & Obstacle Collision
      const nextX = tank.pos.x + tank.vel.x;
      const nextY = tank.pos.y + tank.vel.y;
      
      let canMoveX = true;
      let canMoveY = true;

      const nearbyObstacles = this.getNearbyObstacles(tank.pos, tank.radius + 50);
      nearbyObstacles.forEach(obs => {
        if (obs.type === 'WALL') {
          if (this.checkRectCircleCollision(obs, { x: nextX, y: tank.pos.y }, tank.radius)) canMoveX = false;
          if (this.checkRectCircleCollision(obs, { x: tank.pos.x, y: nextY }, tank.radius)) canMoveY = false;
        }
      });

      if (canMoveX) tank.pos.x = nextX;
      if (canMoveY) tank.pos.y = nextY;

      // Tank-to-Tank Collisions
      this.state.tanks.forEach(other => {
        if (other.id === tank.id) return;
        
        const dist = this.getDist(tank.pos, other.pos);
        const minDist = tank.radius + other.radius;
        
        if (dist < minDist) {
          // Collision detected!
          const angle = Math.atan2(other.pos.y - tank.pos.y, other.pos.x - tank.pos.x);
          const overlap = minDist - dist;
          
          // Push both tanks apart
          const pushX = Math.cos(angle) * overlap * 0.5;
          const pushY = Math.sin(angle) * overlap * 0.5;
          
          tank.pos.x -= pushX;
          tank.pos.y -= pushY;
          other.pos.x += pushX;
          other.pos.y += pushY;
          
          // Bounce effect: transfer some velocity
          const bounceForce = 2;
          tank.vel.x -= Math.cos(angle) * bounceForce;
          tank.vel.y -= Math.sin(angle) * bounceForce;
          other.vel.x += Math.cos(angle) * bounceForce;
          other.vel.y += Math.sin(angle) * bounceForce;
          
          // Visual feedback
          if (now % 100 < 20) {
            this.createImpactParticles(tank.pos, tank.color);
            this.createImpactParticles(other.pos, other.color);
          }
        }
      });

      // Spawn Trail
      const isInvisible = tank.type === 'SCOUT' && now < (tank.abilityActiveUntil || 0);
      if (!isInvisible && (Math.abs(tank.vel.x) > 0.1 || Math.abs(tank.vel.y) > 0.1)) {
        const speedMag = Math.sqrt(tank.vel.x**2 + tank.vel.y**2);
        const intensity = Math.min(1, speedMag / 8);
        const hasPowerUp = Object.keys(tank.activePowerUps).length > 0;
        
        // Only spawn trail sometimes to save performance
        if (Math.random() < 0.3) {
          this.state.trails.push({
            pos: { ...tank.pos },
            color: hasPowerUp ? '#fbbf24' : tank.color, // Golden if powered up
            life: 400 * intensity,
            maxLife: 400 * intensity,
            radius: tank.radius * 0.6 * intensity
          });
        }
      }

      // Boundary check
      tank.pos.x = Math.max(tank.radius, Math.min(WORLD_WIDTH - tank.radius, tank.pos.x));
      tank.pos.y = Math.max(tank.radius, Math.min(WORLD_HEIGHT - tank.radius, tank.pos.y));

      // Update radius based on score
      tank.radius = BASE_RADIUS + (tank.score * GROWTH_FACTOR);

      // Collect Power-ups (Bots can now collect them too)
      for (let i = this.state.powerUps.length - 1; i >= 0; i--) {
        const pu = this.state.powerUps[i];
        if (this.checkCollision(tank.pos, tank.radius, pu.pos, pu.radius)) {
          this.applyPowerUp(tank, pu.type);
          tank.score += 5; // Reward for collecting powerup
          this.state.powerUps.splice(i, 1);
        }
      }
    });

    // Update CTF Flags
    if (this.gameMode === 'CAPTURE_THE_FLAG' && this.state.flags) {
      this.state.flags.forEach(flag => {
        if (flag.carrierId) {
          const carrier = this.state.tanks.find(t => t.id === flag.carrierId);
          if (carrier && !carrier.isDead) {
            flag.pos = { ...carrier.pos };
            // Check if carrier reached their own base
            const ownBase = this.state.captureBases?.find(b => b.team === carrier.team);
            if (ownBase && this.checkRectCircleCollision(ownBase, carrier.pos, carrier.radius)) {
              // Score!
              if (this.state.teamScores) {
                this.state.teamScores[carrier.team]++;
                carrier.score += 50; // Award individual points to player
                if (this.state.teamScores[carrier.team] >= 3 && this.onWin) {
                  this.onWin(carrier.team);
                }
              }
              // Reset flag
              flag.carrierId = null;
              flag.pos = { ...flag.basePos };
              flag.isDropped = false;
              carrier.carryingFlag = undefined;
              
              // Visual feedback
              this.createExplosion(carrier.pos, carrier.team === 'RED' ? '#ef4444' : '#3b82f6', 10);
              soundManager.playPowerUp(carrier.pos);
            }
          } else {
            // Carrier died or disconnected
            flag.carrierId = null;
            flag.isDropped = true;
            flag.dropTime = now;
            if (carrier) carrier.carryingFlag = undefined;
          }
        } else if (flag.isDropped) {
          // Check for pickup
          this.state.tanks.forEach(tank => {
            if (tank.isDead) return;
            if (tank.team !== flag.team && !tank.carryingFlag) {
              if (this.getDist(tank.pos, flag.pos) < tank.radius + 20) {
                flag.carrierId = tank.id;
                flag.isDropped = false;
                flag.dropTime = null;
                tank.carryingFlag = flag.team;
              }
            }
          });

          // Check for reset
          if (flag.dropTime && now - flag.dropTime > 10000) {
            flag.pos = { ...flag.basePos };
            flag.isDropped = false;
            flag.dropTime = null;
          }
        } else {
          // Flag is at base, check for pickup
          this.state.tanks.forEach(tank => {
            if (tank.isDead) return;
            if (tank.team !== flag.team && !tank.carryingFlag) {
              if (this.getDist(tank.pos, flag.pos) < tank.radius + 20) {
                flag.carrierId = tank.id;
                tank.carryingFlag = flag.team;
              }
            }
          });
        }
      });
    }

    // Update Bullets
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      
      // Homing logic for FOLLOWER bullets
      if (b.type === 'FOLLOWER') {
        const owner = this.state.tanks.find(t => t.id === b.ownerId);
        let nearestTarget: Tank | null = null;
        let minDist = Infinity;

        this.state.tanks.forEach(tank => {
          if (tank.id === b.ownerId) return;
          if (owner && owner.team && tank.team === owner.team) return;

          const d = this.getDist(b.pos, tank.pos);
          if (d < minDist && d < 600) { // Homing range
            minDist = d;
            nearestTarget = tank;
          }
        });

        if (nearestTarget) {
          const targetAngle = Math.atan2(nearestTarget.pos.y - b.pos.y, nearestTarget.pos.x - b.pos.x);
          const currentAngle = Math.atan2(b.vel.y, b.vel.x);
          
          // Gradually adjust angle
          let diff = targetAngle - currentAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          
          const newAngle = currentAngle + diff * 0.05; // Homing strength
          const speed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
          b.vel.x = Math.cos(newAngle) * speed;
          b.vel.y = Math.sin(newAngle) * speed;
        }
      }

      b.pos.x += b.vel.x;
      b.pos.y += b.vel.y;
      b.life -= dt;

      let hitWall = false;
      let bounceObs: Obstacle | null = null;
      this.state.obstacles.forEach(obs => {
        if (obs.type === 'WALL' && this.checkRectCircleCollision(obs, b.pos, b.radius)) {
          hitWall = true;
          bounceObs = obs;
        }
      });

      if (hitWall) {
        const owner = this.state.tanks.find(t => t.id === b.ownerId);
        const canBounce = owner?.type === 'BOUNCER' || (b.bounces || 0) > 0;
        
        if (canBounce && (b.bounces === undefined || b.bounces < 5)) {
          // Ricochet logic
          b.bounces = (b.bounces || 0) + 1;
          
          // Determine which side was hit
          const dx = b.pos.x - (bounceObs!.pos.x + bounceObs!.width / 2);
          const dy = b.pos.y - (bounceObs!.pos.y + bounceObs!.height / 2);
          const absDx = Math.abs(dx / bounceObs!.width);
          const absDy = Math.abs(dy / bounceObs!.height);
          
          if (absDx > absDy) {
            b.vel.x *= -1;
          } else {
            b.vel.y *= -1;
          }
          
          // Move out of wall slightly
          b.pos.x += b.vel.x;
          b.pos.y += b.vel.y;
          
          this.createImpactParticles(b.pos, b.color);
          soundManager.playImpact(b.pos);
          continue;
        } else {
          this.createImpactParticles(b.pos, b.color);
          soundManager.playImpact(b.pos);
          this.state.bullets.splice(i, 1);
          continue;
        }
      }

      if (b.life <= 0 || b.pos.x < 0 || b.pos.x > WORLD_WIDTH || b.pos.y < 0 || b.pos.y > WORLD_HEIGHT) {
        this.state.bullets.splice(i, 1);
        continue;
      }

      // Bullet-Bullet collision (Only if one has STRIKER or one is BOUNCER)
      for (let j = i - 1; j >= 0; j--) {
        const b2 = this.state.bullets[j];
        if (this.checkCollision(b.pos, b.radius, b2.pos, b2.radius)) {
          const owner1 = this.state.tanks.find(t => t.id === b.ownerId);
          const owner2 = this.state.tanks.find(t => t.id === b2.ownerId);
          
          const striker1 = owner1?.activePowerUps['STRIKER'];
          const striker2 = owner2?.activePowerUps['STRIKER'];
          const bouncer1 = owner1?.type === 'BOUNCER';
          const bouncer2 = owner2?.type === 'BOUNCER';

          if (striker1 || striker2 || bouncer1 || bouncer2) {
            this.createExplosion(b.pos, b.color, 3);
            
            if (bouncer1 || bouncer2) {
              // Ricochet off each other
              const tempVel = { ...b.vel };
              b.vel = { ...b2.vel };
              b2.vel = tempVel;
              // Add some randomness to avoid sticking
              b.pos.x += b.vel.x;
              b.pos.y += b.vel.y;
              b2.pos.x += b2.vel.x;
              b2.pos.y += b2.vel.y;
              continue;
            }

            if (striker1 && striker2) {
              this.state.bullets.splice(i, 1);
              this.state.bullets.splice(j, 1);
              i--;
            } else if (striker1) {
              this.state.bullets.splice(j, 1);
            } else {
              this.state.bullets.splice(i, 1);
              i--;
            }
            break;
          }
        }
      }
    }

    // Bullet-Tank collision
    this.state.bullets.forEach((bullet, bIdx) => {
      this.state.tanks.forEach(tank => {
        if (bullet.ownerId !== tank.id && this.checkCollision(bullet.pos, bullet.radius, tank.pos, tank.radius)) {
          const owner = this.state.tanks.find(t => t.id === bullet.ownerId);
          
          // Friendly fire check in TDM, KOTH, and CTF
          if ((this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG') && owner?.team === tank.team) {
            return;
          }

          // Spawn protection
          if (tank.spawnProtectionUntil && Date.now() < tank.spawnProtectionUntil) {
            return;
          }

          if (!tank.activePowerUps['SHIELD'] && Date.now() > (tank.dashEndTime || 0)) {
            const stats = TANK_STATS[tank.type];
            // Base damage + 0.1 per score point
            const baseDamage = bullet.damage + (owner ? owner.score * 0.1 : 0);
            const damage = baseDamage * (stats.armor || 1);
            tank.health -= damage;
            tank.lastHitTime = Date.now();
            if (tank.id === this.playerId) hapticManager.playDamage();
            
            // Spawn Damage Text
            this.state.damageTexts.push({
              id: Math.random().toString(36).substr(2, 9),
              pos: { x: tank.pos.x, y: tank.pos.y - tank.radius },
              text: `-${Math.round(damage)}`,
              color: '#ef4444',
              life: 800,
              maxLife: 800,
              vel: { x: (Math.random() - 0.5) * 2, y: -1.5 }
            });

            if (this.onHit) {
              this.onHit(tank.id, damage, bullet.ownerId);
            }

            if (owner) {
              owner.score += 1; // Reward for landing a hit
              
              // HEALER Passive: Heal 5% of max health on hit
              if (owner.type === 'HEALER') {
                const healAmount = owner.maxHealth * 0.05;
                owner.health = Math.min(owner.maxHealth, owner.health + healAmount);
                
                // Visual feedback for healing
                if (Math.random() > 0.5) {
                  this.state.particles.push({
                    pos: { ...owner.pos },
                    vel: { x: (Math.random() - 0.5) * 2, y: -2 },
                    radius: 3,
                    color: '#10b981',
                    life: 500,
                    maxLife: 500
                  });
                }
              }

              if (owner.id === this.playerId) {
                this.playerStats.shotsHit++;
                this.playerStats.damageDealt += damage;
              }
            }
            
            // Death check for score reward
            if (tank.health <= 0 && !tank.isDead) {
              tank.isDead = true;

              // CTF Flag Drop
              if (this.gameMode === 'CAPTURE_THE_FLAG' && tank.carryingFlag) {
                const flag = this.state.flags?.find(f => f.team === tank.carryingFlag);
                if (flag) {
                  flag.carrierId = null;
                  flag.isDropped = true;
                  flag.dropTime = Date.now();
                }
                tank.carryingFlag = undefined;
              }

              if (owner) {
                owner.score += 10; // Reward for kill
                
                // Bounty Hunter Scoring
                if (this.gameMode === 'BOUNTY_HUNTER' && tank.isBounty && owner.id === this.playerId) {
                  owner.score += 90; // Additional score for bounty (total 100)
                  if (this.state.teamScores) {
                    this.state.teamScores.RED += 1;
                  }
                }

                if (owner.id === this.playerId) {
                  this.playerStats.kills++;
                }
                if (this.onKill) {
                  this.onKill(tank, owner);
                }
                if (this.gameMode === 'TEAM_DEATHMATCH' && owner.team && this.state.teamScores) {
                  this.state.teamScores[owner.team]++;
                }
              }
            }
          }
          this.createImpactParticles(bullet.pos, bullet.color);
          this.createExplosion(bullet.pos, bullet.color, 5);
          soundManager.playImpact(bullet.pos);
          this.state.bullets.splice(bIdx, 1);
        }
      });

      // Bullet-Drone collision
      this.state.drones.forEach((drone, dIdx) => {
        if (bullet.ownerId !== drone.ownerId && this.checkCollision(bullet.pos, bullet.radius, drone.pos, 10)) {
          drone.health -= bullet.damage;
          this.createImpactParticles(bullet.pos, '#94a3b8');
          if (drone.health <= 0) {
            this.createExplosion(drone.pos, '#94a3b8', 5);
            this.state.drones.splice(dIdx, 1);
          }
          this.state.bullets.splice(bIdx, 1);
        }
      });
    });

    // Handle deaths
    this.state.tanks = this.state.tanks.filter(tank => {
      if (tank.health <= 0) {
        this.createExplosion(tank.pos, tank.color, 20);
        soundManager.playExplosion(tank.pos);
        hapticManager.playExplosion(tank.pos);
        return false;
      }
      return true;
    });

    // Update Particles
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.life -= dt;
      if (p.life <= 0) this.state.particles.splice(i, 1);
    }

    // Update Damage Texts
    for (let i = this.state.damageTexts.length - 1; i >= 0; i--) {
      const dtText = this.state.damageTexts[i];
      dtText.pos.x += dtText.vel.x;
      dtText.pos.y += dtText.vel.y;
      dtText.life -= dt;
      if (dtText.life <= 0) this.state.damageTexts.splice(i, 1);
    }

    // Update Trails
    for (let i = this.state.trails.length - 1; i >= 0; i--) {
      const trail = this.state.trails[i];
      trail.life -= dt;
      if (trail.life <= 0) this.state.trails.splice(i, 1);
    }

    // Update Drones
    for (let i = this.state.drones.length - 1; i >= 0; i--) {
      const drone = this.state.drones[i];
      const owner = this.state.tanks.find(t => t.id === drone.ownerId);
      if (!owner) {
        this.state.drones.splice(i, 1);
        continue;
      }

      drone.life -= dt;
      if (drone.life <= 0) {
        this.state.drones.splice(i, 1);
        continue;
      }

      // Hover around owner
      const targetPos = {
        x: owner.pos.x + Math.cos(now / 500) * 100,
        y: owner.pos.y + Math.sin(now / 500) * 100
      };
      const angle = Math.atan2(targetPos.y - drone.pos.y, targetPos.x - drone.pos.x);
      drone.pos.x += Math.cos(angle) * 3;
      drone.pos.y += Math.sin(angle) * 3;

      // Shoot at nearest enemy
      if (now - drone.lastShotTime > 1000) {
        let nearest: Tank | null = null;
        let minDist = 500;
        this.state.tanks.forEach(t => {
          if (t.id === owner.id || (owner.team && t.team === owner.team)) return;
          const d = this.getDist(drone.pos, t.pos);
          if (d < minDist) {
            minDist = d;
            nearest = t;
          }
        });

        if (nearest) {
          const sAngle = Math.atan2(nearest.pos.y - drone.pos.y, nearest.pos.x - drone.pos.x);
          const bullet: Bullet = {
            id: Math.random().toString(36).substr(2, 9),
            ownerId: owner.id,
            pos: { ...drone.pos },
            vel: { x: Math.cos(sAngle) * 10, y: Math.sin(sAngle) * 10 },
            radius: 5,
            damage: 5,
            color: owner.color,
            life: 1000
          };
          this.state.bullets.push(bullet);
          drone.lastShotTime = now;
          if (this.onShoot) this.onShoot(bullet);
        }
      }
    }

    // KING OF THE HILL Logic
    if (this.gameMode === 'KING_OF_THE_HILL' && this.state.captureArea) {
      const area = this.state.captureArea;
      let redInArea = 0;
      let blueInArea = 0;

      this.state.tanks.forEach(tank => {
        if (tank.pos.x >= area.pos.x && tank.pos.x <= area.pos.x + area.width &&
            tank.pos.y >= area.pos.y && tank.pos.y <= area.pos.y + area.height) {
          if (tank.team === 'RED') redInArea++;
          else if (tank.team === 'BLUE') blueInArea++;
        }
      });

      let currentStatus: 'RED' | 'BLUE' | 'NONE' | 'CONTESTED' = 'NONE';
      if (redInArea > blueInArea) {
        currentStatus = 'RED';
      } else if (blueInArea > redInArea) {
        currentStatus = 'BLUE';
      } else if (redInArea > 0 && blueInArea > 0 && redInArea === blueInArea) {
        currentStatus = 'CONTESTED';
      } else {
        currentStatus = 'NONE';
      }

      // Only change status if it persists for 2 seconds
      if (currentStatus !== area.controllingTeam) {
        if (currentStatus !== area.pendingStatus) {
          area.pendingStatus = currentStatus;
          area.statusTimer = 0;
        } else {
          area.statusTimer = (area.statusTimer || 0) + dt;
          if (area.statusTimer >= 2000) {
            area.controllingTeam = currentStatus;
            area.statusTimer = 0;
            area.pendingStatus = undefined;
          }
        }
      } else {
        area.pendingStatus = undefined;
        area.statusTimer = 0;
      }

      // Points every second (approx 60fps, so every 60 frames)
      // Actually, let's use a timer or just add fractional points
      if (this.state.teamScores) {
        if (area.controllingTeam === 'RED') {
          this.state.teamScores.RED += dt / 1000;
        } else if (area.controllingTeam === 'BLUE') {
          this.state.teamScores.BLUE += dt / 1000;
        }
      }
    }

    // BOUNTY HUNTER Logic
    if (this.gameMode === 'BOUNTY_HUNTER') {
      const currentBounty = this.state.tanks.find(t => t.isBounty && !t.isDead);
      if (!currentBounty) {
        const potentialBounties = this.state.tanks.filter(t => t.isBot && !t.isDead);
        if (potentialBounties.length > 0) {
          const newBounty = potentialBounties[Math.floor(Math.random() * potentialBounties.length)];
          newBounty.isBounty = true;
          // Visual feedback for new bounty
          for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 50;
            this.state.particles.push({
              pos: { x: newBounty.pos.x + Math.cos(angle) * dist, y: newBounty.pos.y + Math.sin(angle) * dist },
              vel: { x: Math.cos(angle) * 5, y: Math.sin(angle) * 5 },
              radius: 4,
              color: '#fbbf24',
              life: 1000,
              maxLife: 1000
            });
          }
        }
      } else {
        // Continuous particles for active bounty
        if (now % 100 < 30) {
          this.state.particles.push({
            pos: { 
              x: currentBounty.pos.x + (Math.random() - 0.5) * currentBounty.radius * 2, 
              y: currentBounty.pos.y + (Math.random() - 0.5) * currentBounty.radius * 2 
            },
            vel: { x: 0, y: -2 },
            radius: 3,
            color: '#fbbf24',
            life: 800,
            maxLife: 800
          });
        }
      }
    }
  }

  applyPowerUp(tank: Tank, type: PowerUpType) {
    const duration = 10000; // 10 seconds
    const now = Date.now();
    tank.lastCollectTime = now;

    // Visual feedback for collecting power-up
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * tank.radius;
      const pSpeed = Math.random() * 3 + 2;
      this.state.particles.push({
        pos: { 
          x: tank.pos.x + Math.cos(angle) * dist, 
          y: tank.pos.y + Math.sin(angle) * dist 
        },
        vel: {
          x: Math.cos(angle) * pSpeed,
          y: Math.sin(angle) * pSpeed,
        },
        radius: Math.random() * 3 + 2,
        color: '#ffffff', // White flash
        life: 300 + Math.random() * 200,
        maxLife: 500,
      });
    }
    
    if (type === 'HEALTH') {
      tank.health = Math.min(tank.maxHealth, tank.health + 50);
      soundManager.playCollect(tank.pos);
      if (tank.id === this.playerId) hapticManager.playCollect();
    } else {
      const currentStacks = tank.powerUpStacks[type] || 0;
      const maxStacks = 3;
      
      if (currentStacks < maxStacks) {
        tank.powerUpStacks[type] = currentStacks + 1;
        // Extend duration
        const currentExpiry = tank.activePowerUps[type] || now;
        tank.activePowerUps[type] = Math.max(now, currentExpiry) + duration;
      } else {
        // Just refresh duration if at max stacks
        tank.activePowerUps[type] = now + duration;
      }
      soundManager.playPowerUp(tank.pos);
      if (tank.id === this.playerId) hapticManager.playCollect();
    }
  }

  updateBot(bot: Tank, now: number, currentSpeed?: number) {
    const stats = TANK_STATS[bot.type];
    let speed = currentSpeed || this.getTankSpeed(bot);
    if (!currentSpeed && bot.activePowerUps['SPEED']) speed *= 1.5;

    // 1. Dodging Logic (Smart AI)
    let dodgeX = 0;
    let dodgeY = 0;
    
    // Difficulty affects dodge distance and awareness
    let dodgeDist = 150;
    let dodgeChance = 1.0;
    if (bot.difficulty === 'EASY') { dodgeDist = 60; dodgeChance = 0.1; }
    else if (bot.difficulty === 'NORMAL') { dodgeDist = 150; dodgeChance = 0.7; }
    else if (bot.difficulty === 'HARD') { dodgeDist = 220; dodgeChance = 0.95; }
    else if (bot.difficulty === 'EXTREME') { dodgeDist = 250; dodgeChance = 1.0; }

    if (Math.random() < dodgeChance) {
      this.state.bullets.forEach(bullet => {
        if (bullet.ownerId === bot.id) return;
        
        const dist = this.getDist(bot.pos, bullet.pos);
        if (dist < dodgeDist) {
          // Check if bullet is moving towards bot
          const toBotX = bot.pos.x - bullet.pos.x;
          const toBotY = bot.pos.y - bullet.pos.y;
          const bulletSpeed = Math.sqrt(bullet.vel.x**2 + bullet.vel.y**2);
          const dot = (toBotX * bullet.vel.x + toBotY * bullet.vel.y) / (dist * bulletSpeed);
          
          if (dot > 0.7) { // Bullet is heading roughly towards bot
            // Move perpendicular to bullet
            dodgeX += -bullet.vel.y;
            dodgeY += bullet.vel.x;
          }
        }
      });
    }

    // Normalize dodge vector
    if (dodgeX !== 0 || dodgeY !== 0) {
      const mag = Math.sqrt(dodgeX**2 + dodgeY**2);
      dodgeX = (dodgeX / mag) * speed;
      dodgeY = (dodgeY / mag) * speed;
    }

    // 2. Target Selection
    let nearestTarget: Tank | null = null;
    let minDist = this.gameMode === 'TEAM_DEATHMATCH' ? 2000 : 1000;

    this.state.tanks.forEach(other => {
      if (other.id === bot.id) return;
      // SCOUT Stealth: Bots ignore stealthed scouts
      if (other.type === 'SCOUT' && now < (other.abilityActiveUntil || 0)) return;
      
      // Bush Hiding: Bots ignore tanks in bushes unless very close
      if (other.isInBush) {
        const d = this.getDist(bot.pos, other.pos);
        if (d > 200) return;
      }

      if ((this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG') && bot.team === other.team) return;

      const dist = this.getDist(bot.pos, other.pos);
      
      // Target selection weighting
      let weight = 1;
      
      // Prioritize Bounty in Bounty Hunter mode
      if (this.gameMode === 'BOUNTY_HUNTER' && other.isBounty && other.id !== bot.id) {
        weight = 0.3; // Very attractive target for everyone
      }
      
      // Prioritize flag carriers in CTF
      if (this.gameMode === 'CAPTURE_THE_FLAG' && other.carryingFlag) {
        weight = 0.5; // Half the "distance" to make them more attractive targets
      }

      if (dist * weight < minDist) {
        minDist = dist * weight;
        nearestTarget = other;
      }
    });

    // 3. Power-up Selection
    let nearestPowerUp: PowerUp | null = null;
    let minPUDist = bot.personality === 'SCAVENGER' ? 800 : 400;
    this.state.powerUps.forEach(pu => {
      const dist = this.getDist(bot.pos, pu.pos);
      if (dist < minPUDist) {
        minPUDist = dist;
        nearestPowerUp = pu;
      }
    });

    // Priority: KING OF THE HILL Area
    const inKOTHArea = (this.gameMode === 'KING_OF_THE_HILL') && this.state.captureArea && 
                       bot.pos.x >= this.state.captureArea.pos.x && bot.pos.x <= this.state.captureArea.pos.x + this.state.captureArea.width &&
                       bot.pos.y >= this.state.captureArea.pos.y && bot.pos.y <= this.state.captureArea.pos.y + this.state.captureArea.height;

    // Priority: CAPTURE THE FLAG
    let ctfTarget: Point | null = null;
    if (this.gameMode === 'CAPTURE_THE_FLAG' && bot.team) {
      const enemyTeam = bot.team === 'RED' ? 'BLUE' : 'RED';
      const enemyFlag = this.state.flags?.find(f => f.team === enemyTeam);
      const ownBase = this.state.captureBases?.find(b => b.team === bot.team);
      
      if (bot.carryingFlag) {
        // Go to own base
        if (ownBase) {
          ctfTarget = { x: ownBase.pos.x + ownBase.width / 2, y: ownBase.pos.y + ownBase.height / 2 };
        }
      } else if (enemyFlag) {
        // Go to enemy flag
        ctfTarget = { ...enemyFlag.pos };
      }
    }

    // Priority: Power-ups for Scavengers or if health is low
    const needsHealing = bot.health < bot.maxHealth * 0.4;
    const isLowHealth = bot.health < bot.maxHealth * 0.3;
    const prioritizePU = bot.personality === 'SCAVENGER' || (needsHealing && nearestPowerUp?.type === 'HEALTH');

    // 4. Behavior Logic
    let moveX = 0;
    let moveY = 0;
    let targetAngle = bot.turretAngle;

    // Platform Preference Logic (Islands Map)
    let platformTarget: Point | null = null;
    if (bot.prefersPlatforms && this.state.waterLevel !== undefined) {
      // Check if currently on a platform
      const onPlatform = this.state.obstacles.some(obs => 
        obs.type === 'PLATFORM' && 
        bot.pos.x >= obs.pos.x && bot.pos.x <= obs.pos.x + obs.width &&
        bot.pos.y >= obs.pos.y && bot.pos.y <= obs.pos.y + obs.height
      );

      if (!onPlatform) {
        // Find nearest platform
        let minPlatDist = Infinity;
        this.state.obstacles.forEach(obs => {
          if (obs.type === 'PLATFORM') {
            const platCenter = { x: obs.pos.x + obs.width / 2, y: obs.pos.y + obs.height / 2 };
            const dist = this.getDist(bot.pos, platCenter);
            if (dist < minPlatDist) {
              minPlatDist = dist;
              platformTarget = platCenter;
            }
          }
        });
      }
    }

    // Use A* Pathfinding if there's a target and we're in Labyrinth/Wasteland
    let targetPoint: Point | null = null;
    if (platformTarget) {
      targetPoint = platformTarget;
    } else if (this.gameMode === 'CAPTURE_THE_FLAG' && ctfTarget && !prioritizePU) {
      targetPoint = ctfTarget;
    } else if (this.gameMode === 'KING_OF_THE_HILL' && this.state.captureArea && !inKOTHArea && !prioritizePU) {
      targetPoint = { x: this.state.captureArea.pos.x + this.state.captureArea.width / 2, y: this.state.captureArea.pos.y + this.state.captureArea.height / 2 };
    } else if (prioritizePU && nearestPowerUp) {
      targetPoint = nearestPowerUp.pos;
    } else if (nearestTarget) {
      targetPoint = nearestTarget.pos;
    }

    // Throttled Pathfinding
    if (targetPoint && this.state.obstacles.some(o => o.type === 'WALL')) {
      // Only update path if target moved significantly or enough time passed
      const distToTarget = bot.pathTarget ? this.getDist(targetPoint, bot.pathTarget) : Infinity;
      const timeSinceUpdate = now - (bot.lastPathUpdateTime || 0);
      
      if (!bot.path || bot.path.length === 0 || distToTarget > 200 || timeSinceUpdate > 1000) {
        bot.path = this.getPath(bot.pos, targetPoint, bot.id) || undefined;
        bot.pathTarget = { ...targetPoint };
        bot.lastPathUpdateTime = now;
      }

      if (bot.path && bot.path.length > 1) {
        // Check if we reached the current node
        const nextNode = bot.path[1];
        if (this.getDist(bot.pos, nextNode) < 50) {
          bot.path.splice(0, 1);
        }
        
        if (bot.path.length > 1) {
          const targetNode = bot.path[1];
          const angle = Math.atan2(targetNode.y - bot.pos.y, targetNode.x - bot.pos.x);
          moveX = Math.cos(angle) * speed;
          moveY = Math.sin(angle) * speed;
          if (nearestTarget) {
            targetAngle = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
          } else {
            targetAngle = angle;
          }
        }
      }
    }

    // Fallback to direct movement if no path or not needed
    if (moveX === 0 && moveY === 0) {
      if (this.gameMode === 'KING_OF_THE_HILL' && this.state.captureArea && !inKOTHArea && !prioritizePU) {
        const area = this.state.captureArea;
        const centerX = area.pos.x + area.width / 2;
        const centerY = area.pos.y + area.height / 2;
        const angle = Math.atan2(centerY - bot.pos.y, centerX - bot.pos.x);
        moveX = Math.cos(angle) * speed;
        moveY = Math.sin(angle) * speed;
        if (nearestTarget) {
          targetAngle = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
        } else {
          targetAngle = angle;
        }
      } else if (this.gameMode === 'CAPTURE_THE_FLAG' && ctfTarget && !prioritizePU) {
        const angle = Math.atan2(ctfTarget.y - bot.pos.y, ctfTarget.x - bot.pos.x);
        moveX = Math.cos(angle) * speed;
        moveY = Math.sin(angle) * speed;
        if (nearestTarget) {
          targetAngle = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
        } else {
          targetAngle = angle;
        }
      } else if (prioritizePU && nearestPowerUp) {
        const angle = Math.atan2(nearestPowerUp.pos.y - bot.pos.y, nearestPowerUp.pos.x - bot.pos.x);
        moveX = Math.cos(angle) * speed;
        moveY = Math.sin(angle) * speed;
        if (nearestTarget) {
          targetAngle = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
        } else {
          targetAngle = angle;
        }
      } else if (nearestTarget) {
        const angleToTarget = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
        targetAngle = angleToTarget;

        const isDefensive = bot.personality === 'DEFENSIVE' || needsHealing || isLowHealth;
        
        if (isDefensive) {
          // Try to stay at a distance
          const retreatDist = isLowHealth ? 800 : 400;
          if (minDist < retreatDist) {
            // Run away
            moveX = -Math.cos(angleToTarget) * speed;
            moveY = -Math.sin(angleToTarget) * speed;
          } else if (minDist > retreatDist + 200) {
            // Move closer
            moveX = Math.cos(angleToTarget) * speed;
            moveY = Math.sin(angleToTarget) * speed;
          } else {
            // Circle
            moveX = Math.cos(angleToTarget + Math.PI/2) * speed;
            moveY = Math.sin(angleToTarget + Math.PI/2) * speed;
          }
        } else {
          // Aggressive
          if (minDist > 200) {
            moveX = Math.cos(angleToTarget) * speed;
            moveY = Math.sin(angleToTarget) * speed;
          } else {
            // Circle closely
            moveX = Math.cos(angleToTarget + Math.PI/2) * speed;
            moveY = Math.sin(angleToTarget + Math.PI/2) * speed;
          }
        }
      } else {
        // Idle movement
        moveX = Math.cos(now / 1000) * speed * 0.5;
        moveY = Math.sin(now / 1000) * speed * 0.5;
        targetAngle = Math.atan2(moveY, moveX);
      }
    }

    // Combine behaviors (Dodge has high priority)
    let targetVelX = 0;
    let targetVelY = 0;

    if (dodgeX !== 0 || dodgeY !== 0) {
      targetVelX = dodgeX * 0.8 + moveX * 0.2;
      targetVelY = dodgeY * 0.8 + moveY * 0.2;
    } else {
      targetVelX = moveX;
      targetVelY = moveY;
    }

    if (this.mapType === 'ICE') {
      const friction = 0.05;
      bot.vel.x += (targetVelX - bot.vel.x) * friction;
      bot.vel.y += (targetVelY - bot.vel.y) * friction;
    } else if (this.mapType === 'REGIONS' && bot.pos.x >= 2500 && bot.pos.y >= 2500) {
      const friction = 0.05;
      bot.vel.x += (targetVelX - bot.vel.x) * friction;
      bot.vel.y += (targetVelY - bot.vel.y) * friction;
    } else {
      bot.vel.x = targetVelX;
      bot.vel.y = targetVelY;
    }

    bot.turretAngle = targetAngle;

    // Bot Dash Logic
    const canDash = bot.difficulty === 'HARD' || bot.difficulty === 'EXTREME';
    if (canDash && now > (bot.dashCooldown || 0)) {
      let shouldDash = false;
      
      // Dash if dodging bullets
      if (dodgeX !== 0 || dodgeY !== 0) {
        shouldDash = Math.random() < 0.3;
      }
      
      // Dash if aggressive and close to target
      if (!shouldDash && bot.personality === 'AGGRESSIVE' && nearestTarget && minDist < 300) {
        shouldDash = Math.random() < 0.1;
      }

      if (shouldDash) {
        bot.dashEndTime = now + 200;
        bot.dashCooldown = now + 4000; // Bots have slightly longer cooldown
        
        // Dash particles
        for (let i = 0; i < 8; i++) {
          this.state.particles.push({
            pos: { ...bot.pos },
            vel: { 
              x: (Math.random() - 0.5) * 4, 
              y: (Math.random() - 0.5) * 4 
            },
            radius: Math.random() * 4 + 1,
            color: bot.color,
            life: 400,
            maxLife: 400,
          });
        }
      }
    }

    // 5. Ability Usage (EXTREME bots only)
    if (bot.difficulty === 'EXTREME' && now > (bot.abilityCooldown || 0)) {
      if (nearestTarget && minDist < 600) {
        this.activateAbility(bot);
      }
    }

    // Shooting logic
    bot.isShooting = false;
    if (nearestTarget && minDist < 800) {
      // Check for obstacles or teammates in the way
      const angle = Math.atan2(nearestTarget.pos.y - bot.pos.y, nearestTarget.pos.x - bot.pos.x);
      const dist = this.getDist(bot.pos, nearestTarget.pos);
      
      let blocked = false;
      const step = 50;
      for (let d = step; d < dist; d += step) {
        const checkPos = {
          x: bot.pos.x + Math.cos(angle) * d,
          y: bot.pos.y + Math.sin(angle) * d
        };
        
        const nearby = this.getNearbyObstacles(checkPos, 20);
        if (nearby.some(obs => obs.type === 'WALL' && this.checkRectCircleCollision(obs, checkPos, 10))) {
          blocked = true;
          break;
        }

        // Avoid shooting through teammates
        if (this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL' || this.gameMode === 'CAPTURE_THE_FLAG') {
          const teammateNearby = this.state.tanks.some(t => 
            t.id !== bot.id && 
            t.id !== nearestTarget?.id && 
            t.team === bot.team && 
            this.getDist(t.pos, checkPos) < t.radius + 10
          );
          if (teammateNearby) {
            blocked = true;
            break;
          }
        }
      }

      if (!blocked) {
        bot.isShooting = true;
        let cooldown = stats.shootCooldown;
        if (bot.activePowerUps['RAPID_FIRE']) cooldown *= 0.5;
        
        // Difficulty affects reaction time and accuracy
        let reactionDelay = 200;
        let accuracyError = 0;
        
        if (bot.difficulty === 'EASY') { reactionDelay = 1000; accuracyError = 0.5; }
        else if (bot.difficulty === 'NORMAL') { reactionDelay = 300; accuracyError = 0.15; }
        else if (bot.difficulty === 'HARD') { reactionDelay = 50; accuracyError = 0.03; }
        else if (bot.difficulty === 'EXTREME') { reactionDelay = 0; accuracyError = 0; }

        if (now - bot.lastShotTime > cooldown + Math.random() * reactionDelay) {
          // Apply accuracy error to turret angle
          const originalAngle = bot.turretAngle;
          bot.turretAngle += (Math.random() - 0.5) * accuracyError;
          this.shoot(bot);
          bot.turretAngle = originalAngle;
        }
      }
    }
  }

  activateAbility(tank: Tank) {
    const now = Date.now();
    const stats = TANK_STATS[tank.type];
    if (now < (tank.abilityCooldown || 0)) return;

    tank.abilityActiveUntil = now + stats.abilityDuration;
    tank.abilityCooldown = now + stats.abilityCooldown;

    if (tank.type === 'HEAVY') {
      // Shield Bash: Push nearby enemies
      this.state.tanks.forEach(other => {
        if (other.id === tank.id) return;
        const dist = this.getDist(tank.pos, other.pos);
        if (dist < 300) {
          const angle = Math.atan2(other.pos.y - tank.pos.y, other.pos.x - tank.pos.x);
          const pushForce = 20;
          other.vel.x += Math.cos(angle) * pushForce;
          other.vel.y += Math.sin(angle) * pushForce;
          other.health -= 10; // Small damage
          this.createImpactParticles(other.pos, tank.color);
        }
      });
      soundManager.playImpact(tank.pos);
    } else if (tank.type === 'FOLLOWER') {
      // Deploy Drone
      this.state.drones.push({
        id: Math.random().toString(36).substr(2, 9),
        ownerId: tank.id,
        pos: { ...tank.pos },
        vel: { x: 0, y: 0 },
        lastShotTime: 0,
        life: stats.abilityDuration,
        health: 50,
        maxHealth: 50
      });
    } else if (tank.type === 'BOUNCER') {
      // Bouncy Barrage: Fire 8 bullets in a circle that bounce
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const bSpeed = this.getBulletSpeed(tank);
        const bullet: Bullet = {
          id: Math.random().toString(36).substr(2, 9),
          ownerId: tank.id,
          type: tank.type,
          pos: { ...tank.pos },
          vel: {
            x: Math.cos(angle) * bSpeed,
            y: Math.sin(angle) * bSpeed,
          },
          radius: 6,
          damage: 10,
          color: '#f472b6',
          life: 4000,
          bounces: 0,
        };
        this.state.bullets.push(bullet);
      }
      soundManager.playAbility('BOUNCER', tank.pos);
    } else if (tank.type === 'HEALER') {
      // Heal self to full
      tank.health = tank.maxHealth;
      
      // Heal others in radius
      const healRadius = tank.radius * 6;
      this.state.tanks.forEach(other => {
        if (other.id === tank.id) return;
        
        const isAlly = (this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL') 
          ? other.team === tank.team 
          : false;

        const isEnemy = (this.gameMode === 'TEAM_DEATHMATCH' || this.gameMode === 'KING_OF_THE_HILL')
          ? other.team !== tank.team
          : true;

        if (!isEnemy && this.getDist(tank.pos, other.pos) < healRadius) {
          other.health = other.maxHealth;
          this.createExplosion(other.pos, '#10b981', 10);
        }
      });
      
      this.createExplosion(tank.pos, '#10b981', 20);
      soundManager.playCollect(tank.pos);
    }
  }

  shoot(tank: Tank) {
    tank.spawnProtectionUntil = 0;
    const stats = TANK_STATS[tank.type];
    const bSpeed = this.getBulletSpeed(tank);
    const now = Date.now();
    const isCharged = tank.type === 'ARTILLERY' && now < (tank.abilityActiveUntil || 0);
    
    const bRadius = (isCharged ? 15 : 5) * (tank.radius / BASE_RADIUS);
    const bullet: Bullet = {
      id: Math.random().toString(36).substr(2, 9),
      ownerId: tank.id,
      type: tank.type,
      pos: { 
        x: tank.pos.x + Math.cos(tank.turretAngle) * (tank.radius + bRadius), 
        y: tank.pos.y + Math.sin(tank.turretAngle) * (tank.radius + bRadius) 
      },
      vel: {
        x: Math.cos(tank.turretAngle) * bSpeed,
        y: Math.sin(tank.turretAngle) * bSpeed,
      },
      radius: bRadius,
      damage: isCharged ? stats.damage * 2.5 : stats.damage,
      color: isCharged ? '#facc15' : tank.color,
      life: stats.bulletLife,
    };

    if (isCharged) {
      tank.abilityActiveUntil = 0; // Consume charge
      this.createExplosion(tank.pos, '#facc15', 10);
    }

    if (tank.type === 'SCOUT') {
      tank.abilityActiveUntil = 0; // Shooting breaks stealth
    }

    this.state.bullets.push(bullet);
    tank.lastShotTime = Date.now();
    if (tank.id === this.playerId) {
      this.playerStats.shotsFired++;
      soundManager.playShoot(tank.pos);
      hapticManager.playShoot(tank.type === 'ARTILLERY' || tank.type === 'HEAVY', tank.pos);
    }
    
    if (this.onShoot) {
      this.onShoot(bullet);
    }
  }

  getTankSpeed(tank: Tank) {
    const stats = TANK_STATS[tank.type];
    const reductionSteps = Math.floor(tank.score / 50);
    const reduction = reductionSteps * 0.1; 
    return Math.max(stats.minSpeed, stats.baseSpeed - reduction);
  }

  getBulletSpeed(tank: Tank) {
    const stats = TANK_STATS[tank.type];
    const reductionSteps = Math.floor(tank.score / 50);
    const reduction = reductionSteps * 0.2;
    return Math.max(stats.minBulletSpeed, stats.baseBulletSpeed - reduction);
  }

  checkCollision(p1: Point, r1: number, p2: Point, r2: number) {
    const dist = this.getDist(p1, p2);
    return dist < r1 + r2;
  }

  checkRectCircleCollision(rect: { pos: Point; width: number; height: number }, circle: Point, radius: number) {
    const closestX = Math.max(rect.pos.x, Math.min(circle.x, rect.pos.x + rect.width));
    const closestY = Math.max(rect.pos.y, Math.min(circle.y, rect.pos.y + rect.height));
    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
    return distanceSquared < (radius * radius);
  }

  getDist(p1: Point, p2: Point) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  createExplosion(pos: Point, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      this.state.particles.push({
        pos: { ...pos },
        vel: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        radius: Math.random() * 4 + 2,
        color,
        life: 400 + Math.random() * 600,
        maxLife: 1000,
      });
    }
    // Add smoke particles for larger explosions
    if (count > 10) {
      for (let i = 0; i < count / 2; i++) {
        this.state.particles.push({
          pos: { ...pos },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          radius: Math.random() * 8 + 4,
          color: '#475569',
          life: 800 + Math.random() * 400,
          maxLife: 1200,
        });
      }
    }
  }

  createImpactParticles(pos: Point, color: string) {
    for (let i = 0; i < 5; i++) {
      this.state.particles.push({
        pos: { ...pos },
        vel: {
          x: (Math.random() - 0.5) * 4,
          y: (Math.random() - 0.5) * 4,
        },
        radius: Math.random() * 2 + 1,
        color,
        life: 200 + Math.random() * 200,
        maxLife: 400,
      });
    }
  }
}
