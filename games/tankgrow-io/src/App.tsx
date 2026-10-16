import { useEffect, useRef, useState, FormEvent } from 'react';
import { GameEngine, TANK_STATS } from './game/GameEngine';
import { Tank, Bullet, Particle, TankType, GameMode, Point, PowerUpType, BotDifficulty, SkinType, ChatMessage } from './game/types';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Target, Zap, ShieldAlert, Shield, FastForward, Heart, Flame, Sword, LogOut, Users, Globe, Volume2, VolumeX, Gamepad2, HelpCircle, MousePointer2, Keyboard, Sparkles, Info, Settings, Sliders, Mouse, Smartphone, Copy, Check, Crown, Play, UserPlus, UserMinus, MessageSquare } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { soundManager } from './game/SoundManager';
import { hapticManager } from './game/HapticManager';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, User } from './firebase';
import { serverTimestamp } from 'firebase/firestore';

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

type MapType = 'ARENA' | 'LABYRINTH' | 'WASTELAND' | 'FORTRESS' | 'ISLANDS' | 'RUINS' | 'ICE' | 'REGIONS';

const getOppositeColor = (hex: string) => {
  if (hex.startsWith('#')) hex = hex.slice(1);
  const r = 255 - parseInt(hex.slice(0, 2), 16);
  const g = 255 - parseInt(hex.slice(2, 4), 16);
  const b = 255 - parseInt(hex.slice(4, 6), 16);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover' | 'lobby'>('menu');
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  const [playerName, setPlayerName] = useState('');
  const [tankType, setTankType] = useState<TankType>('SCOUT');
  const [mapType, setMapType] = useState<MapType>('ARENA');
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty | 'DYNAMIC'>('NORMAL');
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const currentZoomRef = useRef(1);
  const targetZoomRef = useRef(1);
  const [gameOverType, setGameOverType] = useState<'WIN' | 'DEFEAT' | 'WASTED'>('WASTED');
  const [activePowerUps, setActivePowerUps] = useState<{ type: string; expires: number; stacks: number }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [teamScores, setTeamScores] = useState({ RED: 0, BLUE: 0 });
  const [playerTeam, setPlayerTeam] = useState<'RED' | 'BLUE' | null>(null);
  const [captureStatus, setCaptureStatus] = useState<'RED' | 'BLUE' | 'NONE' | 'CONTESTED'>('NONE');
  const [remainingPlayers, setRemainingPlayers] = useState(0);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [roomId, setRoomId] = useState('');
  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  const lastGamepadButtons = useRef<boolean[]>([]);
  const lastGamepadAxes = useRef<number[]>([0, 0, 0, 0]);
  const [menuFocus, setMenuFocus] = useState({ category: 0, index: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [isControllerConnected, setIsControllerConnected] = useState(false);
  const [lastDamageTime, setLastDamageTime] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Firebase Auth Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      
      if (currentUser) {
        // Sync progress from Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setCurrency(data.currency || 0);
          setUnlockedSkins(data.unlockedSkins || ['DEFAULT']);
        } else {
          // Create initial profile
          await setDoc(userDocRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            currency: 0,
            unlockedSkins: ['DEFAULT'],
            lastUpdated: serverTimestamp()
          });
        }
      }
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room.toUpperCase());
      setIsMultiplayer(true);
    }
  }, []);

  // Save progress to Firestore
  const saveProgress = async (newCurrency: number, newSkins: SkinType[]) => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          currency: newCurrency,
          unlockedSkins: newSkins,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error("Error saving progress:", error);
      }
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrency(0);
      setUnlockedSkins(['DEFAULT']);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  const [killFeed, setKillFeed] = useState<{ id: string; victim: string; killer: string; victimType: TankType; killerType: TankType; time: number }[]>([]);
  const [finalStats, setFinalStats] = useState({ kills: 0, damage: 0, accuracy: 0 });
  const [respawnTimer, setRespawnTimer] = useState<number | null>(null);
  const respawnTimerRef = useRef<number | null>(null);
  const [currency, setCurrency] = useState(0);
  const currencyRef = useRef(0);
  const [selectedSkin, setSelectedSkin] = useState<SkinType>('DEFAULT');
  const [unlockedSkins, setUnlockedSkins] = useState<SkinType[]>(['DEFAULT']);
  const unlockedSkinsRef = useRef<SkinType[]>(['DEFAULT']);

  useEffect(() => {
    currencyRef.current = currency;
  }, [currency]);

  useEffect(() => {
    unlockedSkinsRef.current = unlockedSkins;
  }, [unlockedSkins]);
  const [isSkinMenuOpen, setIsSkinMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lobbyData, setLobbyData] = useState<any>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [lastChatTime, setLastChatTime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const COMBAT_COOLDOWN = 5000;

  useEffect(() => {
    const handleConnected = () => setIsControllerConnected(true);
    const handleDisconnected = () => {
      const gamepads = navigator.getGamepads();
      const anyConnected = Array.from(gamepads).some(gp => gp !== null);
      setIsControllerConnected(anyConnected);
    };

    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);

    // Initial check
    const gamepads = navigator.getGamepads();
    if (Array.from(gamepads).some(gp => gp !== null)) {
      setIsControllerConnected(true);
    }

    return () => {
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
    };
  }, []);

  // Global Gamepad Handler for Menus and Actions
  useEffect(() => {
    let rafId: number;
    
    const checkGamepad = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0];
      if (gp) {
        const buttons = gp.buttons.map(b => b.pressed);
        
        // Y Button (Index 3) - Exit Match or Quick Start
        if (buttons[3] && !lastGamepadButtons.current[3]) {
          if (gameState === 'playing') {
            const timeSinceDamage = Date.now() - lastDamageTime;
            if (timeSinceDamage >= COMBAT_COOLDOWN) {
              setGameState('menu');
            }
          } else if (gameState === 'menu') {
            startGame();
          }
        }

        // A Button (Index 0) - Select/Toggle or Start Game
        if (buttons[0] && !lastGamepadButtons.current[0]) {
          if (gameState === 'menu') {
            const { category, index } = menuFocus;
            if (category === 0) setTankType(['SCOUT', 'HEAVY', 'ARTILLERY', 'FOLLOWER'][index]);
            if (category === 1) setMapType(['ARENA', 'LABYRINTH', 'WASTELAND'][index]);
            if (category === 2) {
              const modes: GameMode[] = ['CLASSIC', 'BATTLE_ROYALE', 'TEAM_DEATHMATCH', 'KING_OF_THE_HILL'];
              const filtered = modes.filter(m => !isMultiplayer || m !== 'BATTLE_ROYALE');
              setGameMode(filtered[index % filtered.length]);
            }
            if (category === 3) {
              setIsMultiplayer(prev => {
                const next = !prev;
                if (next && gameMode === 'BATTLE_ROYALE') setGameMode('CLASSIC');
                return next;
              });
            }
            if (category === 4) {
              const diffs: (BotDifficulty | 'DYNAMIC')[] = ['DYNAMIC', 'EASY', 'NORMAL', 'HARD', 'EXTREME'];
              setBotDifficulty(diffs[index % diffs.length]);
            }
            if (category === 5) startGame();
          } else if (gameState === 'gameover') {
            setGameState('menu');
          }
        }

        // B Button (Index 1) - Dash
        if (buttons[1] && !lastGamepadButtons.current[1]) {
          if (gameState === 'playing') inputRef.current.dash = true;
        } else if (!buttons[1] && lastGamepadButtons.current[1]) {
          if (gameState === 'playing') inputRef.current.dash = false;
        }

        // Right Stick Click (Index 11) - Special Ability
        if (buttons[11] && !lastGamepadButtons.current[11]) {
          if (gameState === 'playing') inputRef.current.ability = true;
        } else if (!buttons[11] && lastGamepadButtons.current[11]) {
          if (gameState === 'playing') inputRef.current.ability = false;
        }

        // Menu Navigation (Left Stick)
        if (gameState === 'menu') {
          const lx = gp.axes[0];
          const ly = gp.axes[1];
          const threshold = 0.5;
          
          let dx = 0;
          let dy = 0;
          
          if (lx > threshold && lastGamepadAxes.current[0] <= threshold) dx = 1;
          if (lx < -threshold && lastGamepadAxes.current[0] >= -threshold) dx = -1;
          if (ly > threshold && lastGamepadAxes.current[1] <= threshold) dy = 1;
          if (ly < -threshold && lastGamepadAxes.current[1] >= -threshold) dy = -1;
          
          if (dx !== 0 || dy !== 0) {
            setMenuFocus(prev => {
              let { category, index } = prev;
              
              if (dy !== 0) {
                category = Math.max(0, Math.min(5, category + dy));
                index = 0; // Reset index when changing category
              } else if (dx !== 0) {
                // Handle index change based on category
                if (category === 0) index = (index + dx + 4) % 4;
                if (category === 1) index = (index + dx + 3) % 3;
                if (category === 2) index = (index + dx + 4) % 4;
              }
              
              return { category, index };
            });
          }
          
          // Menu Scrolling (Right Stick)
          const ry = gp.axes[3];
          if (Math.abs(ry) > 0.1 && menuRef.current) {
            menuRef.current.scrollTop += ry * 15;
          }
          
          lastGamepadAxes.current = [lx, ly, gp.axes[2], ry];
        }

        lastGamepadButtons.current = buttons;
      }
      rafId = requestAnimationFrame(checkGamepad);
    };

    rafId = requestAnimationFrame(checkGamepad);
    return () => cancelAnimationFrame(rafId);
  }, [gameState, tankType, gameMode, isMultiplayer, menuFocus, lastDamageTime]);
  const socketRef = useRef<Socket | null>(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  });
  const [touchState, setTouchState] = useState({
    active: false,
    start: { x: 0, y: 0 },
    current: { x: 0, y: 0 }
  });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const moveTouchIdRef = useRef<number | null>(null);
  const aimTouchIdRef = useRef<number | null>(null);
  const lastPosRef = useRef<Point | null>(null);

  const inputRef = useRef({
    moveX: 0,
    moveY: 0,
    mouseX: 0,
    mouseY: 0,
    shooting: false,
    dash: false,
    ability: false,
    touchMoveActive: false,
    touchAimActive: false,
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const docElm = document.documentElement as any;
      const requestFullscreen = docElm.requestFullscreen || docElm.mozRequestFullScreen || docElm.webkitRequestFullScreen || docElm.msRequestFullscreen;
      
      if (requestFullscreen) {
        requestFullscreen.call(docElm).catch((e: any) => {
          console.error(`Error attempting to enable full-screen mode: ${e.message}`);
        });
        setIsFullscreen(true);
      } else {
        console.warn("Fullscreen API is not supported in this environment.");
        // Fallback: just set the state to true to hide UI if that's what the user expects, 
        // but real fullscreen won't happen.
        setIsFullscreen(true); 
      }
    } else {
      const doc = document as any;
      const exitFullscreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exitFullscreen) {
        exitFullscreen.call(doc);
        setIsFullscreen(false);
      } else {
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFull = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
      setIsFullscreen(isFull);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const startMultiplayerGame = (socket: Socket, settings: any) => {
    const id = socket.id!;
    const engine = new GameEngine(id);
    engine.disableBots = true;
    engine.setGameMode(settings.gameMode);
    engine.generateMap(settings.mapType);

    const actualRoomId = settings.roomId || lobbyData?.id || roomId;
    socket.emit('join-room', { roomId: actualRoomId, playerName: playerName || 'Player', tankType, skin: selectedSkin });

    socket.on('team-assigned', (assignedTeam) => {
      setPlayerTeam(assignedTeam);
      const player = engine.state.tanks.find(t => t.id === id);
      if (player) {
        player.team = assignedTeam;
        player.color = assignedTeam === 'RED' ? '#ef4444' : (assignedTeam === 'BLUE' ? '#3b82f6' : player.color);
      }
    });

    socket.on('player-joined', (players) => {
      players.forEach((p: any) => {
        if (p.id !== id && !engine.state.tanks.find(t => t.id === p.id)) {
          if (p.health <= 0) return;
          const tank = engine.addTank(p.id, p.name, COLORS[Math.floor(Math.random() * COLORS.length)], p.tankType, false, p.score, p.team, undefined, undefined, p.skin);
          tank.health = p.health;
          tank.dashEndTime = p.dashEndTime;
        }
      });
    });

    socket.on('player-updated', (p: any) => {
      // Ignore stale death updates for local player if they already respawned
      if (p.id === id && p.health <= 0 && gameStateRef.current === 'playing') {
        return;
      }

      if (p.health <= 0) {
        engine.state.tanks = engine.state.tanks.filter(t => t.id !== p.id);
        return;
      }
      
      let tank = engine.state.tanks.find(t => t.id === p.id);
      if (!tank) {
        tank = engine.addTank(p.id, p.name, COLORS[Math.floor(Math.random() * COLORS.length)], p.tankType, false, p.score, p.team, undefined, undefined, p.skin);
      }
      
      // Update position and other stats
      tank.pos = p.pos;
      tank.turretAngle = p.turretAngle;
      tank.health = p.health;
      tank.score = p.score;
      tank.activePowerUps = p.activePowerUps;
      tank.dashEndTime = p.dashEndTime;
      tank.spawnProtectionUntil = p.spawnProtectionUntil;
    });

    socket.on('player-left', (leftId: string) => {
      engine.state.tanks = engine.state.tanks.filter(t => t.id !== leftId);
    });

    socket.on('bullet-fired', (b: any) => {
      if (b.ownerId !== id) {
        engine.state.bullets.push(b);
      }
    });

    socket.on('chat-message', (message: ChatMessage) => {
      setChatMessages(prev => {
        const next = [...prev, message].slice(-50); // Keep last 50 messages
        return next;
      });
      setLastChatTime(Date.now());
    });

    engine.onShoot = (bullet) => {
      if (bullet.ownerId === id) {
        socket.emit('shoot', { roomId: actualRoomId, bullet });
      }
    };

    engine.onHit = (targetId, damage, shooterId) => {
      if (targetId === id) {
        setLastDamageTime(Date.now());
      }
      if (shooterId === id) {
        socket.emit('hit', { roomId: actualRoomId, targetId, damage, shooterId });
      }
    };

    engine.onKill = (victim, killer) => {
      if (killer.id === id) {
        setCurrency(prev => {
          const newVal = prev + 10;
          saveProgress(newVal, unlockedSkinsRef.current);
          return newVal;
        });
      }
      setKillFeed(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        victim: victim.name,
        killer: killer.name,
        victimType: victim.type,
        killerType: killer.type,
        time: Date.now()
      }, ...prev].slice(0, 5));
    };

    const player = engine.addTank(id, playerName || 'Player', COLORS[Math.floor(Math.random() * COLORS.length)], tankType, false, 0, undefined, undefined, undefined, selectedSkin);
    
    engineRef.current = engine;
    setGameOverType('WASTED');
    targetZoomRef.current = 1;
    currentZoomRef.current = 1;
    setGameState('playing');
    setIsTransitioning(false);
  };

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current || !isMultiplayer) return;

    socketRef.current.emit('chat-message', {
      roomId,
      text: chatInput,
      team: isChatOpen === true ? undefined : playerTeam // Placeholder for team chat logic if needed
    });

    setChatInput('');
    setIsChatOpen(false);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (!isChatOpen && gameState === 'playing' && isMultiplayer && isChatEnabled) {
          setIsChatOpen(true);
        }
      }
      if (e.key === 'Escape' && isChatOpen) {
        setIsChatOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatOpen, gameState, isMultiplayer, isChatEnabled]);

  const startGame = () => {
    setIsTransitioning(true);
    
    // Brief delay for transition effect
    setTimeout(() => {
      setScore(0);
      setHealth(100);
      setFinalStats({ kills: 0, damage: 0, accuracy: 0 });
      setRespawnTimer(null);
      respawnTimerRef.current = null;

      if (isMultiplayer && gameState === 'menu') {
        const socket = io();
        socketRef.current = socket;

        socket.on('connect', () => {
          if (roomId) {
            socket.emit('join-lobby', { roomId, playerName: playerName || 'Player', tankType, skin: selectedSkin });
          } else {
            // Public game: join a default public room and start immediately
            const publicRoomId = `PUBLIC_${gameMode}_${mapType}`;
            setRoomId(publicRoomId);
            socket.emit('join-room', { roomId: publicRoomId, playerName: playerName || 'Player', tankType, skin: selectedSkin });
            startMultiplayerGame(socket, { gameMode, mapType, roomId: publicRoomId });
          }
        });

        socket.on('lobby-created', ({ roomId, lobby }) => {
          setRoomId(roomId);
          setLobbyData(lobby);
          setGameState('lobby');
          setIsTransitioning(false);
          // Update URL without reload
          const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
          window.history.pushState({ path: newUrl }, '', newUrl);
        });

        socket.on('lobby-joined', ({ roomId, lobby }) => {
          setRoomId(roomId);
          setLobbyData(lobby);
          setGameState('lobby');
          setIsTransitioning(false);
        });

        socket.on('lobby-update', (lobby) => {
          setLobbyData(lobby);
          setMapType(lobby.settings.mapType);
          setGameMode(lobby.settings.gameMode);
        });

        socket.on('game-starting', (settings) => {
          setMapType(settings.mapType);
          setGameMode(settings.gameMode);
          startMultiplayerGame(socket, settings);
        });

        socket.on('kicked', () => {
          setGameState('menu');
          setLobbyData(null);
          socket.disconnect();
          alert('You have been kicked from the lobby');
        });

        socket.on('error', (msg) => {
          alert(msg);
          setIsTransitioning(false);
          socket.disconnect();
        });
        return;
      }

      if (isMultiplayer && gameState === 'lobby') {
        // This is handled by 'game-starting' event
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      const engine = new GameEngine(id);
      engine.botDifficulty = botDifficulty;
      engine.setGameMode(gameMode);
      engine.generateMap(mapType);
      
      let team: 'RED' | 'BLUE' | undefined;
      if (gameMode === 'TEAM_DEATHMATCH' || gameMode === 'KING_OF_THE_HILL' || gameMode === 'CAPTURE_THE_FLAG') {
        team = Math.random() > 0.5 ? 'RED' : 'BLUE';
        setPlayerTeam(team);
      } else {
        setPlayerTeam(null);
      }

      // Spawn 30 bots for Battle Royale at the very beginning
      if (gameMode === 'BATTLE_ROYALE') {
        for (let i = 0; i < 30; i++) {
          engine.addTank(Math.random().toString(36).substr(2, 9), `Bot ${i}`, COLORS[i % COLORS.length], 'SCOUT', true, 0);
        }
      }

      const player = engine.addTank(id, playerName || 'Player', COLORS[Math.floor(Math.random() * COLORS.length)], tankType, false, 0, team, undefined, undefined, selectedSkin);
      
      engine.onWin = (winningTeam) => {
        setGameOverType(winningTeam === team ? 'WIN' : 'DEFEAT');
        setGameState('gameover');
      };

      engine.onHit = (targetId) => {
        if (targetId === id) {
          setLastDamageTime(Date.now());
        }
      };

      engine.onKill = (victim, killer) => {
        if (killer.id === id) {
          setCurrency(prev => {
            const newVal = prev + 50;
            saveProgress(newVal, unlockedSkinsRef.current);
            return newVal;
          });
        }
        setKillFeed(prev => [{
          id: Math.random().toString(36).substr(2, 9),
          victim: victim.name,
          killer: killer.name,
          victimType: victim.type,
          killerType: killer.type,
          time: Date.now()
        }, ...prev].slice(0, 5));
      };

      engineRef.current = engine;
      setGameOverType('WASTED');
      targetZoomRef.current = 1;
      currentZoomRef.current = 1;
      setGameState('playing');
      setIsTransitioning(false);

      // Reset input state and touch refs to prevent sticking between games
      inputRef.current = {
        moveX: 0,
        moveY: 0,
        mouseX: 0,
        mouseY: 0,
        shooting: false,
        touchMoveActive: false,
        touchAimActive: false,
      };
      moveTouchIdRef.current = null;
      aimTouchIdRef.current = null;
      setTouchState({
        active: false,
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 }
      });
    }, 800);
  };

  const respawnPlayer = () => {
    const engine = engineRef.current;
    if (!engine) return;
    
    setRespawnTimer(null);
    respawnTimerRef.current = null;
    // Reset score to 0 on respawn in Team Deathmatch or King of the Hill
    const respawnScore = (gameMode === 'TEAM_DEATHMATCH' || gameMode === 'KING_OF_THE_HILL') ? 0 : score;
    const tank = engine.addTank(engine.playerId, playerName || 'Player', COLORS[0], tankType, false, respawnScore, playerTeam || undefined, undefined, undefined, selectedSkin);
    
    targetZoomRef.current = 1;
    currentZoomRef.current = 1;

    setGameState('playing');
  };

  useEffect(() => {
    if (gameState === 'gameover') {
      const engine = engineRef.current;
      if (engine) {
        const accuracy = engine.playerStats.shotsFired > 0 
          ? (engine.playerStats.shotsHit / engine.playerStats.shotsFired) * 100 
          : 0;
        setFinalStats({
          kills: engine.playerStats.kills,
          damage: Math.floor(engine.playerStats.damageDealt),
          accuracy: Math.floor(accuracy)
        });
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const engine = engineRef.current;
      if (!engine) return;

      engine.update(dt, inputRef.current);

      const player = engine.state.tanks.find(t => t.id === engine.playerId);
      
      if (player) {
        soundManager.setListenerPosition(player.pos);
        hapticManager.setListenerPosition(player.pos);
      }

      // Gamepad Support
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0]; // Use first gamepad
      if (gp) {
        const deadzone = 0.2;
        
        // Movement (Left Stick)
        const lx = gp.axes[0];
        const ly = gp.axes[1];
        if (Math.abs(lx) > deadzone) inputRef.current.moveX = lx;
        else if (!inputRef.current.touchMoveActive) {
          // Only reset if not using keyboard (keyboard sets it to 1 or -1)
          // Actually, let's just check if keyboard keys are NOT pressed
          // But inputRef.current.moveX is shared.
          // Better approach: if gamepad is moved, it overrides.
          inputRef.current.moveX = lx;
        }
        
        if (Math.abs(ly) > deadzone) inputRef.current.moveY = ly;
        else if (!inputRef.current.touchMoveActive) {
          inputRef.current.moveY = ly;
        }

        // Aiming (Right Stick)
        const rx = gp.axes[2];
        const ry = gp.axes[3];
        if (player && (Math.abs(rx) > deadzone || Math.abs(ry) > deadzone)) {
          inputRef.current.mouseX = player.pos.x + rx * 500;
          inputRef.current.mouseY = player.pos.y + ry * 500;
        }

        // Actions
        // RT (index 7) or A (index 0) or X (index 2)
        inputRef.current.shooting = gp.buttons[7].pressed || gp.buttons[6].pressed || gp.buttons[0].pressed || gp.buttons[2].pressed;
        inputRef.current.dash = gp.buttons[1].pressed || gp.buttons[10].pressed; // B or L3
        inputRef.current.ability = gp.buttons[11].pressed; // R3
      }

      if (isMultiplayer && player && socketRef.current) {
        socketRef.current.emit('update-player', {
          roomId: roomIdRef.current || 'PUBLIC_ARENA',
          data: {
            pos: player.pos,
            turretAngle: player.turretAngle,
            health: player.health,
            score: player.score,
            activePowerUps: player.activePowerUps,
            dashEndTime: player.dashEndTime,
            spawnProtectionUntil: player.spawnProtectionUntil
          }
        });
      }
      
      // Check for win in Battle Royale
      if (engine.gameMode === 'BATTLE_ROYALE' && engine.state.tanks.length === 1 && player) {
        setGameOverType('WIN');
        setGameState('gameover');
        return;
      }

      // Check for win in BOUNTY_HUNTER
      if (engine.gameMode === 'BOUNTY_HUNTER' && player) {
        if (engine.state.teamScores && engine.state.teamScores.RED >= 10) { // 10 bounties
          setGameOverType('WIN');
          setGameState('gameover');
          return;
        }
      }

      // Check for win in Team Deathmatch, King of the Hill, Capture the Flag, or Bounty Hunter
      if ((engine.gameMode === 'TEAM_DEATHMATCH' || engine.gameMode === 'KING_OF_THE_HILL' || engine.gameMode === 'CAPTURE_THE_FLAG' || engine.gameMode === 'BOUNTY_HUNTER') && engine.state.teamScores) {
        const newScores = engine.state.teamScores;
        setTeamScores(prev => {
          // Only update state if values changed significantly (integer part) to prevent excessive re-renders
          if (Math.floor(prev.RED) !== Math.floor(newScores.RED) || Math.floor(prev.BLUE) !== Math.floor(newScores.BLUE)) {
            return { ...newScores };
          }
          return prev;
        });

        if (engine.gameMode === 'KING_OF_THE_HILL' && engine.state.captureArea) {
          const status = engine.state.captureArea.controllingTeam;
          setCaptureStatus(prev => prev !== status ? status : prev);
        }
        
        const winThreshold = engine.gameMode === 'KING_OF_THE_HILL' ? 100 : (engine.gameMode === 'CAPTURE_THE_FLAG' ? 3 : 50);
        
        if (engine.state.teamScores.RED >= winThreshold || engine.state.teamScores.BLUE >= winThreshold) {
          const winningTeam = engine.state.teamScores.RED >= winThreshold ? 'RED' : 'BLUE';
          setGameOverType(playerTeam === winningTeam ? 'WIN' : 'DEFEAT');
          setGameState('gameover');
          return;
        }
      }

      if (!player) {
        if (engine.gameMode === 'BATTLE_ROYALE') {
          setGameOverType('WASTED');
          setGameState('gameover');
          return;
        } else {
          // Non-BR modes: start respawn timer if not already started
          if (respawnTimerRef.current === null) {
            respawnTimerRef.current = 3;
            setRespawnTimer(3);
          } else if (respawnTimerRef.current > 0) {
            respawnTimerRef.current = Math.max(0, respawnTimerRef.current - dt / 1000);
            setRespawnTimer(respawnTimerRef.current);
          } else {
            respawnTimerRef.current = null;
            setRespawnTimer(null);
            respawnPlayer();
          }
        }
      } else {
        respawnTimerRef.current = null;
        setRespawnTimer(null); // Reset if alive
        lastPosRef.current = { ...player.pos };
        setScore(player.score);
        setHealth(player.health);
        
        // Update active power-ups with expiration times
        const powerUps = Object.entries(player.activePowerUps).map(([type, expires]) => ({
          type,
          expires: expires as number,
          stacks: player.powerUpStacks[type as PowerUpType] || 1
        }));
        setActivePowerUps(powerUps);
        
        // Dynamic Zoom: Zoom out as score increases
        let effectiveScore = player.score;
        if (player.score >= 150 && player.score < 1000) {
          effectiveScore = 150;
        } else if (player.score >= 1000) {
          effectiveScore = player.score - 850; // 1000 - 150 = 850
        }
        
        const zoomSteps = Math.floor(effectiveScore / 25);
        const newTargetZoom = Math.max(0.05, 1.0 - (zoomSteps * 0.12));
        targetZoomRef.current = newTargetZoom;
        
        // More responsive interpolation for zoom (0.05 for faster reaction to score changes)
        currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.05;
      }

      setRemainingPlayers(engine.state.tanks.length);

      const sortedTanks = [...engine.state.tanks].sort((a, b) => b.score - a.score).slice(0, 5);
      setLeaderboard(sortedTanks.map(t => ({ name: t.name, score: t.score })));

      render(ctx, engine, player);
      animationFrameId = requestAnimationFrame(loop);
    };

    const render = (ctx: CanvasRenderingContext2D, engine: GameEngine, player: Tank | undefined) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const viewPos = player ? player.pos : (lastPosRef.current || { x: engine.state.worldSize.width / 2, y: engine.state.worldSize.height / 2 });

      ctx.save();
      // Apply Zoom and Center on Player
      ctx.translate(width / 2, height / 2);
      ctx.scale(currentZoomRef.current, currentZoomRef.current);
      ctx.translate(-viewPos.x, -viewPos.y);

      // Draw Grid
      if (mapType === 'ICE') {
        ctx.fillStyle = '#7dd3fc';
        ctx.fillRect(0, 0, engine.state.worldSize.width, engine.state.worldSize.height);
        ctx.strokeStyle = '#bae6fd';
        
        // Ice shine/cracks
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        for (let i = 0; i < engine.state.worldSize.width; i += 600) {
          for (let j = 0; j < engine.state.worldSize.height; j += 600) {
            ctx.beginPath();
            ctx.moveTo(i + 100, j + 100);
            ctx.lineTo(i + 150, j + 120);
            ctx.lineTo(i + 130, j + 180);
            ctx.stroke();
            
            // Smaller cracks
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(i + 150, j + 120);
            ctx.lineTo(i + 180, j + 110);
            ctx.stroke();
          }
        }
        ctx.restore();
      } else if (mapType === 'REGIONS') {
        const halfW = engine.state.worldSize.width / 2;
        const halfH = engine.state.worldSize.height / 2;

        // Grasslands (Top-Left)
        ctx.fillStyle = '#15803d';
        ctx.fillRect(0, 0, halfW, halfH);

        // Jungle (Top-Right)
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(halfW, 0, halfW, halfH);

        // Desert (Bottom-Left)
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(0, halfH, halfW, halfH);

        // Ice (Bottom-Right)
        ctx.fillStyle = '#7dd3fc';
        ctx.fillRect(halfW, halfH, halfW, halfH);

        // Ice shine in Ice quadrant
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        for (let i = halfW + 100; i < engine.state.worldSize.width; i += 400) {
          for (let j = halfH + 100; j < engine.state.worldSize.height; j += 400) {
            ctx.beginPath();
            ctx.moveTo(i, j);
            ctx.lineTo(i + 30, j + 10);
            ctx.stroke();
          }
        }
        ctx.restore();

        // Quadrant Dividers
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(halfW, 0); ctx.lineTo(halfW, engine.state.worldSize.height);
        ctx.moveTo(0, halfH); ctx.lineTo(engine.state.worldSize.width, halfH);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      } else {
        ctx.strokeStyle = '#1e293b';
      }

      ctx.lineWidth = 1;
      const gridSize = 100;
      for (let x = 0; x <= engine.state.worldSize.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, engine.state.worldSize.height);
        ctx.stroke();
      }
      for (let y = 0; y <= engine.state.worldSize.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(engine.state.worldSize.width, y);
        ctx.stroke();
      }

      // Draw Obstacles
      engine.state.obstacles.forEach(obs => {
        if (obs.type === 'WALL') {
          ctx.fillStyle = '#334155';
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
          
          // Fortress Interior Visuals
          if (mapType === 'FORTRESS') {
            ctx.save();
            ctx.clip();
            
            // Support Beams
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 4;
            for (let i = -obs.width; i < obs.width + obs.height; i += 40) {
              ctx.beginPath();
              ctx.moveTo(obs.pos.x + i, obs.pos.y);
              ctx.lineTo(obs.pos.x + i - 40, obs.pos.y + obs.height);
              ctx.stroke();
            }
            
            // Interior Shadow/Lighting
            const gradient = ctx.createLinearGradient(obs.pos.x, obs.pos.y, obs.pos.x + obs.width, obs.pos.y + obs.height);
            gradient.addColorStop(0, 'rgba(0,0,0,0.2)');
            gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.2)');
            ctx.fillStyle = gradient;
            ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
            
            ctx.restore();
          }

          ctx.strokeStyle = '#475569';
          ctx.strokeRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
        } else if (obs.type === 'MUD') {
          ctx.fillStyle = 'rgba(120, 113, 108, 0.4)';
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
        } else if (obs.type === 'HAZARD') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + Math.sin(Date.now() / 200) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
        } else if (obs.type === 'WATER') {
          const tide = engine.state.waterLevel || 0;
          ctx.fillStyle = `rgba(59, 130, 246, ${0.2 + tide * 0.3})`;
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
          
          // Wave Animations
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 2;
          const waveOffset = (Date.now() / 1000) * 50 % 100;
          for (let i = -100; i < engine.state.worldSize.width; i += 100) {
            ctx.beginPath();
            ctx.moveTo(0, i + waveOffset);
            ctx.lineTo(engine.state.worldSize.width, i + waveOffset);
            ctx.stroke();
          }
          ctx.restore();
        } else if (obs.type === 'PLATFORM') {
          // Shoreline effect around platforms
          if (mapType === 'ISLANDS') {
            const tide = engine.state.waterLevel || 0;
            const shoreSize = 20 + tide * 40;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + (1 - tide) * 0.2})`;
            ctx.fillRect(obs.pos.x - shoreSize, obs.pos.y - shoreSize, obs.width + shoreSize * 2, obs.height + shoreSize * 2);
          }

          ctx.fillStyle = '#64748b';
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
        } else if (obs.type === 'BUSH') {
          ctx.fillStyle = 'rgba(22, 101, 52, 0.6)';
          ctx.fillRect(obs.pos.x, obs.pos.y, obs.width, obs.height);
          // Draw some "leaves"
          ctx.fillStyle = 'rgba(20, 83, 45, 0.4)';
          for (let i = 0; i < 5; i++) {
            const lx = obs.pos.x + (i * 100) % obs.width;
            const ly = obs.pos.y + (i * 70) % obs.height;
            ctx.beginPath();
            ctx.arc(lx, ly, 40, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Draw World Border
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, engine.state.worldSize.width, engine.state.worldSize.height);

      // Draw Capture Area (KOTH)
      if (gameMode === 'KING_OF_THE_HILL' && engine.state.captureArea) {
        const area = engine.state.captureArea;
        ctx.save();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fillRect(area.pos.x, area.pos.y, area.width, area.height);
        
        // Pulsing border
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.4;
        ctx.strokeStyle = `rgba(16, 185, 129, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(area.pos.x, area.pos.y, area.width, area.height);

        // Label
        ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.font = 'bold 40px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('CAPTURE ZONE', area.pos.x + area.width / 2, area.pos.y + area.height / 2 - 20);
        
        if (area.controllingTeam !== 'NONE') {
          ctx.fillStyle = area.controllingTeam === 'RED' ? '#ef4444' : 
                         area.controllingTeam === 'BLUE' ? '#3b82f6' : '#f59e0b';
          ctx.font = 'bold 30px Inter';
          ctx.fillText(area.controllingTeam === 'CONTESTED' ? 'CONTESTED!' : `${area.controllingTeam} TEAM`, 
                      area.pos.x + area.width / 2, area.pos.y + area.height / 2 + 30);
        }
        ctx.restore();
      }

      // Draw Power-ups
      engine.state.powerUps.forEach(pu => {
        ctx.save();
        ctx.translate(pu.pos.x, pu.pos.y);
        ctx.rotate(Date.now() / 1000);
        
        let color = '#fff';
        if (pu.type === 'SPEED') color = '#3b82f6';
        if (pu.type === 'RAPID_FIRE') color = '#f59e0b';
        if (pu.type === 'HEALTH') color = '#10b981';
        if (pu.type === 'SHIELD') color = '#8b5cf6';
        if (pu.type === 'STRIKER') color = '#ef4444';

        ctx.fillStyle = color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.rect(-10, -10, 20, 20);
        ctx.fill();
        ctx.restore();
      });

      // Draw Trails
      engine.state.trails.forEach(trail => {
        ctx.globalAlpha = (trail.life / trail.maxLife) * 0.5;
        ctx.fillStyle = trail.color;
        ctx.beginPath();
        ctx.arc(trail.pos.x, trail.pos.y, trail.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw Particles
      engine.state.particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw Drones
      engine.state.drones.forEach(drone => {
        ctx.save();
        ctx.translate(drone.pos.x, drone.pos.y);
        ctx.rotate(Date.now() / 200);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-8, -8, 16, 16);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.restore();
      });

      // Draw Bullets
      engine.state.bullets.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = b.color;
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Tanks
      engine.state.tanks.forEach(t => {
        const now = Date.now();
        ctx.save();
        ctx.translate(t.pos.x, t.pos.y);

        // Bounty Indicator (Crown)
        if (t.isBounty) {
          ctx.save();
          ctx.translate(0, -t.radius - 20);
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(-12, -15);
          ctx.lineTo(-5, -8);
          ctx.lineTo(0, -18);
          ctx.lineTo(5, -8);
          ctx.lineTo(12, -15);
          ctx.lineTo(10, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Glow
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fbbf24';
          ctx.stroke();
          ctx.restore();

          // TARGET Label
          ctx.save();
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 12px Inter';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 4;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.fillText('TARGET', 0, -t.radius - 45);
          ctx.restore();
        }

        // Subtle movement animation (wobble)
        const speed = Math.sqrt(t.vel.x**2 + t.vel.y**2);
        const wobble = Math.sin(now / 100) * (speed / 10);
        const scalePop = t.lastCollectTime && (now - t.lastCollectTime < 300) 
          ? 1 + Math.sin((now - t.lastCollectTime) / 300 * Math.PI) * 0.2 
          : 1;
        
        ctx.scale(scalePop, scalePop);
        ctx.rotate(wobble * 0.05);

        // Tank Visibility (Bushes)
        if (t.isInBush && t.id !== engine.playerId) {
          const distToPlayer = engine.getDist(t.pos, viewPos);
          if (distToPlayer > 200) {
            ctx.globalAlpha = 0; // Completely invisible
          } else {
            ctx.globalAlpha = 0.3; // Partially visible when close
          }
        } else if (t.isInBush && t.id === engine.playerId) {
          ctx.globalAlpha = 0.5; // Player is semi-transparent to themselves
        }

        // SCOUT Stealth: Lower opacity
        if (t.type === 'SCOUT' && now < (t.abilityActiveUntil || 0)) {
          ctx.globalAlpha = 0.2;
        }

        // Damage Flash
        const hitTime = t.lastHitTime || 0;
        const isHit = now - hitTime < 100;

        // Shield Effect
        if (t.activePowerUps['SHIELD']) {
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, t.radius + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(139, 92, 246, 0.1)';
          ctx.fill();
        }

        // HEALER Radius Indicator (Only visible to the owner)
        if (t.type === 'HEALER' && t.id === engine.playerId) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(0, 0, t.radius * 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Subtle fill
          ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
          ctx.fill();
        }

        // Player Glow
        if (t.id === engine.playerId) {
          ctx.shadowBlur = isHit ? 30 : 20;
          ctx.shadowColor = isHit ? '#fff' : t.color;
        }

        // Health Bar
        const barWidth = t.radius * 2;
        ctx.fillStyle = '#334155';
        ctx.fillRect(-t.radius, -t.radius - 15, barWidth, 6);
        ctx.fillStyle = t.health > t.maxHealth * 0.3 ? '#10b981' : '#ef4444';
        ctx.fillRect(-t.radius, -t.radius - 15, barWidth * (Math.max(0, t.health) / t.maxHealth), 6);

        // Name
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${t.name} [${t.type}]`, 0, -t.radius - 20);

        // Tank Body
        ctx.fillStyle = isHit ? '#fff' : t.color;
        ctx.beginPath();
        ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
        ctx.fill();

        // Spawn Protection Shimmer
        if (t.spawnProtectionUntil && now < t.spawnProtectionUntil) {
          const shimmer = (Math.sin(now / 100) + 1) / 2;
          ctx.strokeStyle = `rgba(255, 255, 255, ${shimmer * 0.8})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, t.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.fillStyle = `rgba(255, 255, 255, ${shimmer * 0.2})`;
          ctx.fill();
        }

        if (t.skin && t.skin !== 'DEFAULT') {
          ctx.save();
          ctx.clip();
          const oppositeColor = getOppositeColor(t.color);
          ctx.fillStyle = oppositeColor;
          if (t.skin === 'STRIPED') {
            // Racing stripes with metallic sheen
            ctx.rotate(Math.PI / 4);
            for (let i = -t.radius * 2; i < t.radius * 2; i += 15) {
              const grad = ctx.createLinearGradient(i, -t.radius, i + 8, t.radius);
              grad.addColorStop(0, oppositeColor);
              grad.addColorStop(0.5, '#fff'); // Sheen
              grad.addColorStop(1, oppositeColor);
              ctx.fillStyle = grad;
              ctx.fillRect(i, -t.radius * 2, 8, t.radius * 4);
            }
          } else if (t.skin === 'POLKA') {
            // Staggered dots with depth
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            ctx.fillStyle = oppositeColor;
            for (let i = -t.radius - 20; i < t.radius + 20; i += 20) {
              for (let j = -t.radius - 20; j < t.radius + 20; j += 20) {
                const shift = (Math.floor(i / 20) % 2) * 10;
                const r = 5 + Math.sin(now / 500 + i + j) * 1;
                
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(i + 1, j + shift + 1, r, 0, Math.PI * 2);
                ctx.fill();
                
                // Dot
                ctx.fillStyle = oppositeColor;
                ctx.beginPath();
                ctx.arc(i, j + shift, r, 0, Math.PI * 2);
                ctx.fill();

                // Small highlight
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(i - 1.5, j + shift - 1.5, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
              }
            }
          } else if (t.skin === 'CAMO') {
             // More organic multi-color camo with texture
             const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
             const camoColors = ['#166534', '#3f6212', '#422006', '#14532d', '#713f12'];
             for (let i = 0; i < 20; i++) {
               ctx.fillStyle = camoColors[(seed + i) % camoColors.length];
               ctx.globalAlpha = 0.8;
               const offsetX = (Math.sin(seed * (i + 1)) * t.radius);
               const offsetY = (Math.cos(seed * (i + 7)) * t.radius);
               const r = ((seed * (i + 3)) % 12) + 10;
               
               ctx.beginPath();
               // Distort slightly for organic feel
               ctx.ellipse(offsetX, offsetY, r, r * 0.7, seed * i, 0, Math.PI * 2);
               ctx.fill();
             }
             // Add grit texture
             ctx.globalAlpha = 0.1;
             ctx.fillStyle = '#000';
             for (let i = 0; i < 50; i++) {
               const tx = (Math.random() - 0.5) * t.radius * 2;
               const ty = (Math.random() - 0.5) * t.radius * 2;
               ctx.fillRect(tx, ty, 1, 1);
             }
             ctx.globalAlpha = 1;
          } else if (t.skin === 'GALAXY') {
            // Multi-layer nebula
            const time = now / 2000;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, t.radius);
            grad.addColorStop(0, '#1e1b4b');
            grad.addColorStop(0.4, '#312e81');
            grad.addColorStop(0.7, '#4338ca');
            grad.addColorStop(1, '#1e1b4b');
            ctx.fillStyle = grad;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);

            // Floating dust/nebula clouds
            for (let i = 0; i < 3; i++) {
              const nx = Math.sin(time + i) * t.radius * 0.3;
              const ny = Math.cos(time * 0.8 + i) * t.radius * 0.3;
              const nGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, t.radius * 0.6);
              nGrad.addColorStop(0, i === 0 ? 'rgba(236, 72, 153, 0.2)' : 'rgba(139, 92, 246, 0.2)');
              nGrad.addColorStop(1, 'transparent');
              ctx.fillStyle = nGrad;
              ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            }

            // Twinkling stars
            ctx.fillStyle = '#fff';
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = 0; i < 35; i++) {
              const x = (((seed * (i + 3)) % 100) / 100 - 0.5) * t.radius * 2;
              const y = (((seed * (i + 9)) % 100) / 100 - 0.5) * t.radius * 2;
              const twinkle = 0.2 + 0.8 * Math.abs(Math.sin(time * 2 + i));
              const size = ((seed * (i + 5)) % 1.5) + 0.5;
              ctx.globalAlpha = twinkle;
              ctx.beginPath();
              ctx.arc(x, y, size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          } else if (t.skin === 'NEON') {
            const time = now / 1000;
            // Background glow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);

            // Animated scanning grid
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + 0.1 * Math.sin(time * 5)})`;
            ctx.lineWidth = 1;
            for (let i = -t.radius; i < t.radius; i += 6) {
              ctx.beginPath();
              ctx.moveTo(i, -t.radius);
              ctx.lineTo(i, t.radius);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(-t.radius, i);
              ctx.lineTo(t.radius, i);
              ctx.stroke();
            }

            // Central pulsing core
            const pulse = 0.5 + 0.5 * Math.sin(time * 10);
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + 0.5 * pulse})`;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10 + 10 * pulse;
            ctx.shadowColor = '#0ff';
            ctx.beginPath();
            ctx.arc(0, 0, t.radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.strokeStyle = `rgba(255, 0, 255, ${0.5 + 0.5 * (1-pulse)})`;
            ctx.shadowColor = '#f0f';
            ctx.beginPath();
            ctx.arc(0, 0, t.radius * 0.4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else if (t.skin === 'CHROMA') {
            const time = now / 1000;
            // Metallic iridescent finish
            for (let i = 0; i < 3; i++) {
              const angle = time + (i * Math.PI * 2) / 3;
              const gradient = ctx.createLinearGradient(
                Math.cos(angle) * t.radius, Math.sin(angle) * t.radius,
                Math.cos(angle + Math.PI) * t.radius, Math.sin(angle + Math.PI) * t.radius
              );
              gradient.addColorStop(0, '#f8fafc');
              gradient.addColorStop(0.3, '#38bdf8'); // Sky blue
              gradient.addColorStop(0.6, '#ec4899'); // Pink
              gradient.addColorStop(0.8, '#fbbf24'); // Yellow
              gradient.addColorStop(1, '#f8fafc');
              
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = gradient;
              ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            }
            
            // Oil-slick shimmer
            ctx.globalAlpha = 0.3;
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = 0; i < 5; i++) {
              const x = Math.sin(time * 0.5 + i + seed) * t.radius * 0.6;
              const y = Math.cos(time * 0.4 + i + seed) * t.radius * 0.6;
              const r = t.radius * (0.2 + 0.2 * Math.sin(time + i));
              ctx.fillStyle = i % 2 === 0 ? '#4ade80' : '#818cf8';
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1.0;
          } else if (t.skin === 'WOOD') {
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            // Richer wood tones
            ctx.fillStyle = '#451a03'; // Darker base
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Grain layers
            const grainColors = ['#78350f', '#92400e', '#b45309'];
            for (let j = 0; j < 3; j++) {
              ctx.strokeStyle = grainColors[j];
              ctx.globalAlpha = 0.5;
              ctx.lineWidth = 1 + j * 0.5;
              for (let i = -t.radius - 10; i < t.radius + 10; i += 4) {
                ctx.beginPath();
                const wave = Math.sin(i * 0.15 + seed + j) * 4;
                ctx.moveTo(i + wave, -t.radius * 1.5);
                ctx.lineTo(i + wave, t.radius * 1.5);
                ctx.stroke();
              }
            }

            // Lacquer Shine
            const sheenGrad = ctx.createLinearGradient(-t.radius, -t.radius, t.radius, t.radius);
            sheenGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
            sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
            sheenGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
            ctx.fillStyle = sheenGrad;
            ctx.globalAlpha = 1.0;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);

            // Realistic Knots
            ctx.fillStyle = '#271201';
            for (let i = 0; i < 4; i++) {
              const kx = (((seed * (i + 1)) % 100) / 100 - 0.5) * t.radius * 1.6;
              const ky = (((seed * (i + 5)) % 100) / 100 - 0.5) * t.radius * 1.6;
              const kSize = ((seed * (i + 2)) % 4) + 2;
              
              ctx.beginPath();
              ctx.ellipse(kx, ky, kSize, kSize * 1.5, Math.PI / 4, 0, Math.PI * 2);
              ctx.fill();
              
              // Rings around knots
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
              ctx.beginPath();
              ctx.ellipse(kx, ky, kSize + 3, (kSize + 3) * 1.5, Math.PI / 4, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else if (t.skin === 'GOLD') {
            const time = now / 1000;
            const grad = ctx.createLinearGradient(-t.radius, -t.radius, t.radius, t.radius);
            grad.addColorStop(0, '#fde047'); // Yellow 300
            grad.addColorStop(0.3, '#ca8a04'); // Yellow 600
            grad.addColorStop(0.5, '#fef9c3'); // White-ish for glare
            grad.addColorStop(0.7, '#a16207'); // Yellow 700
            grad.addColorStop(1, '#fde047');
            ctx.fillStyle = grad;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Moving specular highlight
            const hx = Math.sin(time) * t.radius;
            const hy = Math.cos(time) * t.radius;
            const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, t.radius * 1.2);
            hGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
            hGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = hGrad;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);

            // Etched pattern
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
              const angle = (i * Math.PI * 2) / 8;
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(angle) * t.radius, Math.sin(angle) * t.radius);
            }
            ctx.stroke();
          } else if (t.skin === 'RUBY' || t.skin === 'EMERALD' || t.skin === 'SAPPHIRE') {
            const colors = {
              'RUBY': ['#7f1d1d', '#dc2626', '#f87171'],
              'EMERALD': ['#064e3b', '#059669', '#34d399'],
              'SAPPHIRE': ['#1e3a8a', '#2563eb', '#60a5fa']
            }[t.skin as 'RUBY' | 'EMERALD' | 'SAPPHIRE'];
            
            ctx.fillStyle = colors[0];
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Crystal Facets with depth
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = 0; i < 8; i++) {
              const x1 = ((Math.sin(seed + i) + 1) / 2 - 0.5) * t.radius * 2;
              const y1 = ((Math.cos(seed + i) + 1) / 2 - 0.5) * t.radius * 2;
              const x2 = ((Math.sin(seed + i + 1) + 1) / 2 - 0.5) * t.radius * 2;
              const y2 = ((Math.cos(seed + i + 1) + 1) / 2 - 0.5) * t.radius * 2;
              const x3 = 0;
              const y3 = 0;
              
              ctx.fillStyle = i % 2 === 0 ? colors[1] : colors[2];
              ctx.globalAlpha = 0.3 + 0.2 * Math.sin(now / 1000 + i);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.lineTo(x3, y3);
              ctx.closePath();
              ctx.fill();
            }
            
            // Surface shine
            const grad = ctx.createLinearGradient(-t.radius, -t.radius, t.radius, t.radius);
            grad.addColorStop(0, 'rgba(255,255,255,0.4)');
            grad.addColorStop(0.5, 'transparent');
            grad.addColorStop(1, 'rgba(255,255,255,0.1)');
            ctx.fillStyle = grad;
            ctx.globalAlpha = 1;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            ctx.globalAlpha = 1.0;
          } else if (t.skin === 'MAGMA') {
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            const time = now / 1000;
            // Glowing cracks
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f97316';
            
            for (let i = 0; i < 6; i++) {
              ctx.strokeStyle = `rgba(249, 115, 22, ${0.5 + 0.5 * Math.sin(time * 3 + i)})`;
              ctx.beginPath();
              const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + i;
              for (let j = 0; j < 4; j++) {
                const x = ((Math.sin(seed * (j + 1)) + 1) / 2 - 0.5) * t.radius * 2;
                const y = ((Math.cos(seed * (j + 2)) + 1) / 2 - 0.5) * t.radius * 2;
                if (j === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.stroke();
            }
            
            // Heat pulses
            const hGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, t.radius);
            hGrad.addColorStop(0, 'rgba(234, 88, 12, 0.2)');
            hGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = hGrad;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            ctx.shadowBlur = 0;
          } else if (t.skin === 'FROST') {
            // Icy blue gradients
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, t.radius);
            grad.addColorStop(0, '#f0f9ff'); // Cyan 50
            grad.addColorStop(0.6, '#bae6fd'); // Cyan 200
            grad.addColorStop(1, '#0284c7'); // Cyan 600
            ctx.fillStyle = grad;
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Crystalline structures
            const time = now / 2000;
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 12; i++) {
              const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + i;
              const angle = (seed % (Math.PI * 2)) + time;
              const dist = (seed % t.radius);
              const x = Math.cos(angle) * dist;
              const y = Math.sin(angle) * dist;
              const size = (seed % 6) + 2;
              
              ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time * 4 + i);
              ctx.beginPath();
              // Rhombus shape for crystal feel
              ctx.moveTo(x, y - size);
              ctx.lineTo(x + size / 2, y);
              ctx.lineTo(x, y + size);
              ctx.lineTo(x - size / 2, y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = 1.0;
          } else if (t.skin === 'CARBON') {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Hexagonal woven pattern
            const size = 6;
            for (let i = -t.radius - size; i < t.radius + size; i += size) {
              for (let j = -t.radius - size; j < t.radius + size; j += size) {
                const shift = (Math.floor(i / size) % 2) * (size / 2);
                const x = i;
                const y = j + shift;
                
                // Highlighted fiber
                const grad = ctx.createLinearGradient(x - size/2, y - size/2, x + size/2, y + size/2);
                grad.addColorStop(0, '#171717');
                grad.addColorStop(0.5, '#404040');
                grad.addColorStop(1, '#171717');
                ctx.fillStyle = grad;
                
                ctx.beginPath();
                for (let k = 0; k < 6; k++) {
                  const angle = (k / 6) * Math.PI * 2;
                  const px = x + Math.cos(angle) * (size * 0.55);
                  const py = y + Math.sin(angle) * (size * 0.55);
                  if (k === 0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
              }
            }
          } else if (t.skin === 'LAVA') {
            const time = now / 1000;
            // Magma base
            ctx.fillStyle = '#450a0a';
            ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);
            
            // Liquid blobs
            const seed = t.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = 0; i < 7; i++) {
              const bSeed = seed + i;
              const x = Math.sin(time * 0.7 + bSeed) * t.radius * 0.7;
              const y = Math.cos(time * 0.5 + bSeed) * t.radius * 0.7;
              const r = ((Math.sin(time * 1.5 + bSeed * 2) + 1) / 2) * 12 + 6;
              
              const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
              grad.addColorStop(0, '#f97316'); // Orange 500
              grad.addColorStop(0.6, '#dc2626'); // Red 600
              grad.addColorStop(1, 'transparent');
              
              ctx.fillStyle = grad;
              ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time + i);
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1.0;
          }
          ctx.restore();
        }

        // Tank Body Outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Turret
        ctx.save();
        ctx.rotate(t.turretAngle);
        ctx.fillStyle = isHit ? '#fff' : t.color;
        const turretLen = t.type === 'ARTILLERY' ? t.radius * 2 : t.radius * 1.5;
        const turretWidth = t.type === 'HEAVY' ? t.radius * 0.7 : t.radius / 2;
        ctx.fillRect(0, -turretWidth / 2, turretLen, turretWidth);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -turretWidth / 2, turretLen, turretWidth);
        ctx.restore();

        // Flag Carrier Icon
        if (gameMode === 'CAPTURE_THE_FLAG' && t.carryingFlag) {
          ctx.save();
          ctx.translate(0, -t.radius - 30);
          
          // Draw Mini Flag
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-1, -15, 2, 15);
          ctx.fillStyle = t.carryingFlag === 'RED' ? '#ef4444' : '#3b82f6';
          ctx.beginPath();
          ctx.moveTo(1, -15);
          ctx.lineTo(15, -10);
          ctx.lineTo(1, -5);
          ctx.fill();
          
          ctx.restore();
        }

        ctx.restore();
      });

      // Draw CTF Bases
      if (gameMode === 'CAPTURE_THE_FLAG' && engine.state.captureBases) {
        engine.state.captureBases.forEach(base => {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.3)'; // Green area
          ctx.fillRect(base.pos.x, base.pos.y, base.width, base.height);
          ctx.strokeStyle = base.team === 'RED' ? '#ef4444' : '#3b82f6';
          ctx.lineWidth = 4;
          ctx.strokeRect(base.pos.x, base.pos.y, base.width, base.height);
        });
      }

      // Draw CTF Flags
      if (gameMode === 'CAPTURE_THE_FLAG' && engine.state.flags) {
        engine.state.flags.forEach(flag => {
          if (!flag.carrierId) {
            ctx.save();
            ctx.translate(flag.pos.x, flag.pos.y);
            
            // Draw Flag Pole
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(-2, -40, 4, 40);
            
            // Draw Flag Cloth
            ctx.fillStyle = flag.team === 'RED' ? '#ef4444' : '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(2, -40);
            ctx.lineTo(30, -30);
            ctx.lineTo(2, -20);
            ctx.fill();
            
            // Draw Countdown if dropped
            if (flag.isDropped && flag.dropTime) {
              const timeLeft = Math.max(0, 10 - (Date.now() - flag.dropTime) / 1000);
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 14px Inter';
              ctx.textAlign = 'center';
              ctx.fillText(Math.ceil(timeLeft).toString(), 0, 20);
            }
            
            ctx.restore();
          }
        });
      }

      // Draw Damage Texts
      engine.state.damageTexts.forEach(dtText => {
        ctx.globalAlpha = dtText.life / dtText.maxLife;
        ctx.fillStyle = dtText.color;
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(dtText.text, dtText.pos.x, dtText.pos.y);
      });
      ctx.globalAlpha = 1;

      ctx.restore();

      // Minimap
      const mapSize = 150;
      const mapPadding = 20;
      ctx.save();
      ctx.translate(width - mapSize - mapPadding, height - mapSize - mapPadding);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(0, 0, mapSize, mapSize);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(0, 0, mapSize, mapSize);

      const scale = mapSize / engine.state.worldSize.width;
      
      // Draw Biomes on Minimap
      if (mapType === 'REGIONS') {
        const half = mapSize / 2;
        // Grasslands
        ctx.fillStyle = 'rgba(21, 128, 61, 0.4)';
        ctx.fillRect(0, 0, half, half);
        // Jungle
        ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
        ctx.fillRect(half, 0, half, half);
        // Desert
        ctx.fillStyle = 'rgba(253, 230, 138, 0.4)';
        ctx.fillRect(0, half, half, half);
        // Ice
        ctx.fillStyle = 'rgba(125, 211, 252, 0.4)';
        ctx.fillRect(half, half, half, half);
      }

      // Draw Heatmap on Minimap
      if (engine.state.heatmap) {
        const hGridSize = 50;
        const hCellSize = mapSize / hGridSize;
        
        ctx.save();
        for (let y = 0; y < hGridSize; y++) {
          for (let x = 0; x < hGridSize; x++) {
            const val = engine.state.heatmap[y][x];
            if (val > 0.01) {
              const alpha = Math.min(0.6, val * 0.3); // Slightly higher alpha for minimap visibility
              ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
              ctx.fillRect(x * hCellSize, y * hCellSize, hCellSize + 0.5, hCellSize + 0.5);
            }
          }
        }
        ctx.restore();
      }

      // Draw Obstacles on Minimap
      engine.state.obstacles.forEach(obs => {
        if (obs.type === 'WALL') {
          ctx.fillStyle = '#475569';
          ctx.fillRect(obs.pos.x * scale, obs.pos.y * scale, obs.width * scale, obs.height * scale);
        } else if (obs.type === 'PLATFORM') {
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(obs.pos.x * scale, obs.pos.y * scale, obs.width * scale, obs.height * scale);
        }
      });

      // Draw Capture Area on Minimap
      if (gameMode === 'KING_OF_THE_HILL' && engine.state.captureArea) {
        const area = engine.state.captureArea;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.fillRect(area.pos.x * scale, area.pos.y * scale, area.width * scale, area.height * scale);
      }

      // Draw CTF Flags on Minimap
      if (gameMode === 'CAPTURE_THE_FLAG' && engine.state.flags) {
        engine.state.flags.forEach(flag => {
          ctx.fillStyle = flag.team === 'RED' ? '#ef4444' : '#3b82f6';
          ctx.fillRect(flag.pos.x * scale - 2, flag.pos.y * scale - 2, 4, 4);
        });
      }

      engine.state.tanks.forEach(t => {
        if (gameMode === 'BOUNTY_HUNTER' && t.isBounty) {
          ctx.save();
          const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
          ctx.fillStyle = '#fbbf24';
          ctx.shadowBlur = 5 * pulse;
          ctx.shadowColor = '#fbbf24';
          ctx.beginPath();
          ctx.arc(t.pos.x * scale, t.pos.y * scale, 5 + 2 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }

        if (gameMode === 'CAPTURE_THE_FLAG' && t.carryingFlag) {
          const player = engine.state.tanks.find(p => p.id === engine.playerId);
          if (player) {
            ctx.fillStyle = t.team === player.team ? '#10b981' : '#f59e0b'; // Green for team, Yellow for enemy
            ctx.beginPath();
            ctx.arc(t.pos.x * scale, t.pos.y * scale, 4, 0, Math.PI * 2);
            ctx.fill();
            return; // Skip normal tank drawing for carrier to emphasize the highlight
          }
        }
        ctx.fillStyle = t.id === engine.playerId ? '#fff' : t.color;
        ctx.beginPath();
        ctx.arc(t.pos.x * scale, t.pos.y * scale, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // Draw Dash Indicator
      if (player) {
        const now = Date.now();
        const dashCooldown = player.dashCooldown || 0;
        const cooldownRemaining = Math.max(0, dashCooldown - now);
        const cooldownPercent = 1 - (cooldownRemaining / 3000);

        ctx.save();
        ctx.translate(width / 2, height - 100);
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-50, 0, 100, 6);
        
        // Progress
        ctx.fillStyle = cooldownRemaining > 0 ? '#475569' : '#3b82f6';
        ctx.fillRect(-50, 0, 100 * cooldownPercent, 6);
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('SPACE TO DASH', 0, 20);
        ctx.restore();
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      setIsMobile(hasTouch && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'w') inputRef.current.moveY = -1;
      if (e.key.toLowerCase() === 's') inputRef.current.moveY = 1;
      if (e.key.toLowerCase() === 'a') inputRef.current.moveX = -1;
      if (e.key.toLowerCase() === 'd') inputRef.current.moveX = 1;
      if (e.code === 'Space') inputRef.current.dash = true;
      if (e.key.toLowerCase() === 'e') inputRef.current.ability = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'w' && inputRef.current.moveY === -1) inputRef.current.moveY = 0;
      if (e.key.toLowerCase() === 's' && inputRef.current.moveY === 1) inputRef.current.moveY = 0;
      if (e.key.toLowerCase() === 'a' && inputRef.current.moveX === -1) inputRef.current.moveX = 0;
      if (e.key.toLowerCase() === 'd' && inputRef.current.moveX === 1) inputRef.current.moveX = 0;
      if (e.code === 'Space') inputRef.current.dash = false;
      if (e.key.toLowerCase() === 'e') inputRef.current.ability = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
      if (player) {
        const relX = (e.clientX - rect.left - canvas.width / 2) * sensitivity;
        const relY = (e.clientY - rect.top - canvas.height / 2) * sensitivity;
        inputRef.current.mouseX = player.pos.x + relX;
        inputRef.current.mouseY = player.pos.y + relY;
      }
    };
    const handleMouseDown = () => inputRef.current.shooting = true;
    const handleMouseUp = () => inputRef.current.shooting = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    const handleTouchStart = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        // Left side: Movement
        if (touch.clientX < window.innerWidth / 2 && moveTouchIdRef.current === null) {
          moveTouchIdRef.current = touch.identifier;
          inputRef.current.touchMoveActive = true;
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          setTouchState({
            active: true,
            start: { x: touch.clientX, y: touch.clientY },
            current: { x: touch.clientX, y: touch.clientY }
          });
        } 
        // Right side: Aiming/Shooting
        else if (touch.clientX >= window.innerWidth / 2 && aimTouchIdRef.current === null) {
          aimTouchIdRef.current = touch.identifier;
          inputRef.current.touchAimActive = true;
          inputRef.current.shooting = true;
          const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
          if (player) {
            inputRef.current.mouseX = touch.clientX - rect.left - (canvas.width / 2 - player.pos.x);
            inputRef.current.mouseY = touch.clientY - rect.top - (canvas.height / 2 - player.pos.y);
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
      
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        if (touch.identifier === moveTouchIdRef.current) {
          setTouchState(prev => ({ ...prev, current: { x: touch.clientX, y: touch.clientY } }));
          
          const dx = touch.clientX - touchStartRef.current.x;
          const dy = touch.clientY - touchStartRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 50;
          
          if (dist > 5) {
            inputRef.current.moveX = dx / Math.max(dist, maxDist);
            inputRef.current.moveY = dy / Math.max(dist, maxDist);
          } else {
            inputRef.current.moveX = 0;
            inputRef.current.moveY = 0;
          }
        } else if (touch.identifier === aimTouchIdRef.current) {
          if (player) {
            inputRef.current.mouseX = touch.clientX - rect.left - (canvas.width / 2 - player.pos.x);
            inputRef.current.mouseY = touch.clientY - rect.top - (canvas.height / 2 - player.pos.y);
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        if (touch.identifier === moveTouchIdRef.current) {
          moveTouchIdRef.current = null;
          inputRef.current.moveX = 0;
          inputRef.current.moveY = 0;
          inputRef.current.touchMoveActive = false;
          setTouchState(prev => ({ ...prev, active: false }));
        } else if (touch.identifier === aimTouchIdRef.current) {
          aimTouchIdRef.current = null;
          inputRef.current.shooting = false;
          inputRef.current.touchAimActive = false;
        }
      }
    };

    const handleTouchCancel = (e: TouchEvent) => {
      handleTouchEnd(e);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);

      // Reset input state on cleanup to prevent sticking between transitions
      inputRef.current = {
        moveX: 0,
        moveY: 0,
        mouseX: 0,
        mouseY: 0,
        shooting: false,
        touchMoveActive: false,
        touchAimActive: false,
      };
      moveTouchIdRef.current = null;
      aimTouchIdRef.current = null;
      setTouchState({
        active: false,
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 }
      });
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'menu' && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setLobbyData(null);
    }
  }, [gameState]);

  useEffect(() => {
    soundManager.setVolume(isMuted ? 0 : volume * 0.3);
  }, [volume, isMuted]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    soundManager.setEnabled(!newMuted);
  };

  const LobbyView = () => {
    if (!lobbyData) return null;

    const isHost = lobbyData.hostId === socketRef.current?.id;
    const players = lobbyData.players;
    const settings = lobbyData.settings;
    const isTeamMode = ['TEAM_DEATHMATCH', 'KING_OF_THE_HILL', 'CAPTURE_THE_FLAG'].includes(settings.gameMode);

    const copyLobbyLink = () => {
      const link = `${window.location.origin}${window.location.pathname}?room=${lobbyData.id}`;
      navigator.clipboard.writeText(link);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4">
        {/* Leave Button Top Right */}
        <button 
          onClick={() => setGameState('menu')}
          className="fixed top-8 right-8 z-[110] p-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 rounded-full border border-slate-700 transition-all group"
          title="Leave Lobby"
        >
          <LogOut className="w-6 h-6" />
        </button>

        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[80vh] relative"
        >
          {/* Left Side: Players List */}
          <div className="flex-1 p-8 border-r border-slate-800 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">Lobby</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{players.length} Players Waiting</p>
                </div>
              </div>
              <button 
                onClick={copyLobbyLink}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all group"
              >
                {isCopying ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-white" />}
                <span className="text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-widest">
                  {isCopying ? 'Copied!' : `Room: ${lobbyData.id}`}
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {players.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-slate-800/40 border border-slate-800 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <button
                      disabled={!isHost || !isTeamMode}
                      onClick={() => socketRef.current?.emit('change-player-team', { roomId: lobbyData.id, playerId: p.id })}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                        p.team === 'RED' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                      } ${isHost && isTeamMode ? 'hover:scale-110 active:scale-95 cursor-pointer ring-2 ring-white/10' : ''}`}
                      title={isHost && isTeamMode ? "Click to change team" : ""}
                    >
                      {p.id === lobbyData.hostId ? <Crown className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                    </button>
                    <div>
                      <p className="text-sm font-black text-white">{p.name} {p.id === socketRef.current?.id && '(You)'}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{p.tankType} • {p.team} TEAM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.isReady ? (
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase tracking-widest">Ready</span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full border border-slate-700 uppercase tracking-widest">Waiting</span>
                    )}
                    {isHost && p.id !== socketRef.current?.id && (
                      <button
                        onClick={() => socketRef.current?.emit('kick-player', { roomId: lobbyData.id, playerId: p.id })}
                        className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                        title="Kick Player"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 flex gap-4">
              <button 
                onClick={() => {
                  socketRef.current?.emit('toggle-ready', { roomId: lobbyData.id });
                }}
                className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  players.find((p: any) => p.id === socketRef.current?.id)?.isReady 
                  ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                }`}
              >
                {players.find((p: any) => p.id === socketRef.current?.id)?.isReady ? 'Unready' : 'Ready Up'}
              </button>
              {isHost && (
                <button 
                  onClick={() => {
                    socketRef.current?.emit('start-game', { roomId: lobbyData.id });
                  }}
                  disabled={!players.every((p: any) => p.isReady)}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Match
                </button>
              )}
            </div>
          </div>

          {/* Right Side: Settings (Host Only) */}
          <div className="w-full md:w-80 p-8 bg-slate-900/50 flex flex-col">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Match Settings</h3>
            
            <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Lobby Visibility</label>
                <div className="flex gap-2">
                  <button
                    disabled={!isHost}
                    onClick={() => socketRef.current?.emit('update-lobby-settings', { roomId: lobbyData.id, settings: { isPublic: true } })}
                    className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${
                      lobbyData.isPublic 
                      ? 'border-blue-500 bg-blue-500/10 text-white' 
                      : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-700'
                    } ${!isHost && 'cursor-default opacity-80'}`}
                  >
                    <p className="text-[10px] font-black uppercase">Public</p>
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => socketRef.current?.emit('update-lobby-settings', { roomId: lobbyData.id, settings: { isPublic: false } })}
                    className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${
                      !lobbyData.isPublic 
                      ? 'border-amber-500 bg-amber-500/10 text-white' 
                      : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-700'
                    } ${!isHost && 'cursor-default opacity-80'}`}
                  >
                    <p className="text-[10px] font-black uppercase">Private</p>
                  </button>
                </div>
                <p className="mt-2 text-[9px] text-slate-500 italic leading-tight">
                  {lobbyData.isPublic ? "Public: Matchmake with others globally." : "Private: Only players in this party can play."}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Game Mode</label>
                <div className="grid grid-cols-1 gap-2">
                  {['CLASSIC', 'TEAM_DEATHMATCH', 'KING_OF_THE_HILL', 'CAPTURE_THE_FLAG', 'BOUNTY_HUNTER'].map(mode => (
                    <button
                      key={mode}
                      disabled={!isHost}
                      onClick={() => socketRef.current?.emit('update-lobby-settings', { roomId: lobbyData.id, settings: { gameMode: mode } })}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        settings.gameMode === mode 
                        ? 'border-blue-500 bg-blue-500/10 text-white' 
                        : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-700'
                      } ${!isHost && 'cursor-default opacity-80'}`}
                    >
                      <p className="text-[10px] font-black uppercase">{mode.replace(/_/g, ' ')}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Map Selection</label>
                <div className="grid grid-cols-1 gap-2">
                  {['ARENA', 'LABYRINTH', 'WASTELAND', 'FORTRESS', 'ISLANDS', 'RUINS', 'ICE', 'REGIONS'].map(map => (
                    <button
                      key={map}
                      disabled={!isHost}
                      onClick={() => socketRef.current?.emit('update-lobby-settings', { roomId: lobbyData.id, settings: { mapType: map } })}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        settings.mapType === map 
                        ? 'border-emerald-500 bg-emerald-500/10 text-white' 
                        : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-700'
                      } ${!isHost && 'cursor-default opacity-80'}`}
                    >
                      <p className="text-[10px] font-black uppercase">{map}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden font-sans text-slate-200">
      {/* Settings Toggle */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        className="fixed top-4 right-16 z-50 p-2 bg-slate-800/80 hover:bg-slate-700 hover:scale-110 rounded-full border border-slate-700 transition-all"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Sound Toggle */}
      <button 
        onClick={toggleMute}
        className="fixed top-4 right-4 z-50 p-2 bg-slate-800/80 hover:bg-slate-700 hover:scale-110 rounded-full border border-slate-700 transition-all"
      >
        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 180, 360]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full mb-8"
            />
            <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase animate-pulse">
              Generating Arena...
            </h2>
            <p className="text-slate-500 text-xs font-bold mt-2 tracking-widest uppercase">
              Preparing {mapType}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {gameState === 'menu' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <motion.div 
            ref={menuRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl p-4 md:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-y-auto max-h-[95vh]"
          >
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">TankGrow.io</h1>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 hover:scale-110 rounded-xl border border-slate-700 transition-all ml-2"
                  title="Settings"
                >
                  <Settings className="w-5 h-5 text-slate-300" />
                </button>
              </div>
              
              {/* Google Sign-In */}
              <div className="flex items-center gap-2">
                {isAuthLoading ? (
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : user ? (
                  <div className="flex items-center gap-3 bg-slate-800 p-2 pr-4 rounded-full border border-slate-700">
                    <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-slate-600" referrerPolicy="no-referrer" />
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Signed in as</p>
                      <p className="text-xs font-black text-white leading-none truncate max-w-[100px]">{user.displayName}</p>
                    </div>
                    <button onClick={handleSignOut} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-red-400">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleSignIn}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-full font-bold text-xs hover:bg-slate-200 transition-all shadow-lg"
                  >
                    <Globe className="w-4 h-4" />
                    SIGN IN WITH GOOGLE
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:grid-cols-2 md:gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Pilot Name</label>
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Select Tank Class</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['SCOUT', 'HEAVY', 'ARTILLERY', 'FOLLOWER', 'BOUNCER', 'HEALER'] as TankType[]).map((type, i) => (
                      <button
                        key={type}
                        onClick={() => setTankType(type)}
                        className={`p-3 rounded-xl border-2 transition-all text-xs font-bold hover:scale-105 active:scale-95 ${
                          tankType === type ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-600'
                        } ${isControllerConnected && menuFocus.category === 0 && menuFocus.index === i ? 'ring-4 ring-blue-400 scale-105' : ''}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 italic">
                    {tankType === 'SCOUT' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Fast & agile, but low health. Rapid weak fire.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Stealth mode for 5s. Invisibility breaks on shoot.
                      </>
                    )}
                    {tankType === 'HEAVY' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Slow juggernaut. High health & armor. Heavy damage.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Shield Bash. Pushes and damages nearby enemies.
                      </>
                    )}
                    {tankType === 'ARTILLERY' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Long range specialist. Slow firing but massive impact.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Charged Shot. Next bullet is 3x larger and deals 2.5x damage.
                      </>
                    )}
                    {tankType === 'FOLLOWER' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Balanced speed. Shoots homing bullets that track enemies.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Deploy Drone. Automated drone follows and shoots enemies.
                      </>
                    )}
                    {tankType === 'BOUNCER' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Ricochet specialist. Bullets bounce off walls and each other.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Bouncy Barrage. Fires 8 bouncing bullets in a circle.
                      </>
                    )}
                    {tankType === 'HEALER' && (
                      <>
                        <span className="text-blue-400 font-bold">Class:</span> Support specialist. Heals 5% health on every hit.<br/>
                        <span className="text-emerald-400 font-bold">Ability [E]:</span> Holy Nova. Instantly heals self and nearby allies to full.
                      </>
                    )}
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    <button
                      onClick={() => setIsSkinMenuOpen(true)}
                      className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 hover:scale-[1.02] border border-slate-700 rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-2 transition-all"
                    >
                      <Flame className="w-4 h-4 text-yellow-500" />
                      CUSTOMIZE TANK SKIN
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Select Arena</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['ARENA', 'LABYRINTH', 'WASTELAND', 'FORTRESS', 'ISLANDS', 'RUINS', 'ICE', 'REGIONS'] as MapType[]).map((type, i) => (
                      <button
                        key={type}
                        onClick={() => setMapType(type)}
                        className={`p-3 rounded-xl border-2 transition-all text-xs font-bold hover:scale-105 active:scale-95 ${
                          mapType === type ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-600'
                        } ${isControllerConnected && menuFocus.category === 1 && menuFocus.index === i ? 'ring-4 ring-emerald-400 scale-105' : ''}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Select Game Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CLASSIC', 'BATTLE_ROYALE', 'TEAM_DEATHMATCH', 'KING_OF_THE_HILL', 'CAPTURE_THE_FLAG', 'BOUNTY_HUNTER'] as GameMode[])
                      .filter(mode => !isMultiplayer || (mode !== 'BATTLE_ROYALE' && mode !== 'BOUNTY_HUNTER'))
                      .map((mode, i) => (
                      <button
                        key={mode}
                        onClick={() => setGameMode(mode)}
                        className={`p-3 rounded-xl border-2 transition-all text-[10px] font-bold hover:scale-105 active:scale-95 ${
                          gameMode === mode ? 'border-amber-500 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-800/50 text-slate-500 hover:border-slate-600'
                        } ${isControllerConnected && menuFocus.category === 2 && menuFocus.index === i ? 'ring-4 ring-amber-400 scale-105' : ''}`}
                      >
                        {mode.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {!isMultiplayer && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Bot Difficulty</label>
                    <div className="grid grid-cols-5 gap-1">
                      {(['DYNAMIC', 'EASY', 'NORMAL', 'HARD', 'EXTREME'] as (BotDifficulty | 'DYNAMIC')[]).map((diff, i) => (
                        <button
                          key={diff}
                          onClick={() => setBotDifficulty(diff)}
                          className={`py-2 px-1 rounded-lg border-2 transition-all text-[9px] font-bold ${
                            botDifficulty === diff ? 'border-red-500 bg-red-500/10 text-white' : 'border-slate-800 bg-slate-800/50 text-slate-500'
                          } ${isControllerConnected && menuFocus.category === 4 && menuFocus.index === i ? 'ring-4 ring-red-400 scale-105' : ''}`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multiplayer Section */}
                <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Multiplayer</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <label className={`flex items-center gap-3 cursor-pointer group p-2 rounded-lg transition-all ${isControllerConnected && menuFocus.category === 3 ? 'bg-blue-500/10 ring-2 ring-blue-500/50' : ''}`}>
                      <div className={`w-10 h-5 rounded-full transition-colors relative ${isMultiplayer ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={isMultiplayer}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setIsMultiplayer(enabled);
                            if (enabled && gameMode === 'BATTLE_ROYALE') {
                              setGameMode('CLASSIC');
                            }
                          }}
                        />
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isMultiplayer ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Enable Online Mode</span>
                    </label>
                    
                    {isMultiplayer && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        <div className="relative flex gap-2">
                          <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                              type="text"
                              placeholder="Room ID (Optional)"
                              value={roomId}
                              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-all"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                              setRoomId(newRoomId);
                              // Trigger start game logic for lobby creation
                              setIsTransitioning(true);
                              setTimeout(() => {
                                const socket = io();
                                socketRef.current = socket;
                                socket.on('connect', () => {
                                  socket.emit('create-lobby', { playerName: playerName || 'Player', tankType, skin: selectedSkin, mapType, gameMode });
                                });
                                socket.on('lobby-created', ({ roomId: rid, lobby }) => {
                                  setRoomId(rid);
                                  setLobbyData(lobby);
                                  setGameState('lobby');
                                  setIsTransitioning(false);
                                  const newUrl = `${window.location.origin}${window.location.pathname}?room=${rid}`;
                                  window.history.pushState({ path: newUrl }, '', newUrl);
                                });
                                socket.on('lobby-joined', ({ roomId: rid, lobby }) => {
                                  setRoomId(rid);
                                  setLobbyData(lobby);
                                  setGameState('lobby');
                                  setIsTransitioning(false);
                                });
                                socket.on('lobby-update', (l) => setLobbyData(l));
                                socket.on('game-starting', (s) => startMultiplayerGame(socket, s));
                                socket.on('kicked', () => {
                                  setGameState('menu');
                                  setLobbyData(null);
                                  socket.disconnect();
                                  alert('You have been kicked from the lobby');
                                });
                                socket.on('error', (msg) => {
                                  alert(msg);
                                  setIsTransitioning(false);
                                  socket.disconnect();
                                });
                              }, 800);
                            }}
                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-2"
                          >
                            <UserPlus className="w-4 h-4" />
                            CREATE
                          </button>
                        </div>
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                          <p className="text-[10px] text-blue-300 leading-relaxed">
                            <span className="font-bold">Pro Tip:</span> Leave blank to join a public arena, or share a custom ID with friends to battle together. Bots are disabled in multiplayer.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <button
                  onClick={() => {
                    setTutorialStep(0);
                    setIsTutorialOpen(true);
                  }}
                  className="w-full py-3 px-4 bg-blue-500/10 hover:bg-blue-500/20 hover:scale-[1.02] border border-blue-500/30 rounded-xl text-sm font-bold text-blue-400 flex items-center justify-center gap-2 transition-all"
                >
                  <HelpCircle className="w-5 h-5" />
                  HOW TO PLAY & CONTROLS
                </button>

                <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Game Intel</h3>
                  <div className="space-y-6">
                    {/* New Features */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Advanced Intel</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                        <li className="flex gap-3">
                          <Flame className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span><span className="text-white font-bold">Stackable Power-ups:</span> Collect up to 3 of the same type to boost duration and power!</span>
                        </li>
                        <li className="flex gap-3">
                          <Volume2 className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                          <span><span className="text-white font-bold">Spatial Audio:</span> Sounds are now localized. Listen for nearby threats!</span>
                        </li>
                      </ul>
                    </div>

                    {/* Scoring */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Scoring System</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                        <li className="flex gap-3 items-center">
                          <span className="text-emerald-400 font-bold w-6">+1</span>
                          <span>Point for every hit landed on an enemy</span>
                        </li>
                        <li className="flex gap-3 items-center">
                          <span className="text-blue-400 font-bold w-6">+5</span>
                          <span>Points for each powerup collected</span>
                        </li>
                        <li className="flex gap-3 items-center">
                          <span className="text-red-400 font-bold w-6">+10</span>
                          <span>Points for every enemy defeated</span>
                        </li>
                      </ul>
                    </div>

                    {/* Modes */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Game Modes</h4>
                      <ul className="space-y-2 text-xs text-slate-400">
                        <li className="flex gap-3">
                          <Zap className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                          <span>Classic: Free-for-all. Be the last one standing or reach the highest score.</span>
                        </li>
                        <li className="flex gap-3">
                          <ShieldAlert className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                          <span>Battle Royale: Survival mode. The world shrinks over time. Be the sole survivor.</span>
                        </li>
                        <li className="flex gap-3">
                          <Trophy className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                          <span>TDM: First team to 50 kills wins the match.</span>
                        </li>
                        <li className="flex gap-3">
                          <Target className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                          <span>KOTH: Hold the center zone for 100s to win.</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={startGame}
              className={`w-full mt-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 ${isControllerConnected && menuFocus.category === 5 ? 'ring-4 ring-white scale-[1.02]' : ''}`}
            >
              <Zap className="w-5 h-5" />
              DEPLOY TO {mapType}
            </button>
          </motion.div>
        </div>
      )}

      {respawnTimer !== null && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <h2 className="text-4xl md:text-6xl font-black text-white mb-4 italic tracking-tighter uppercase">
              Respawning In
            </h2>
            <div className="text-8xl md:text-9xl font-black text-blue-500 animate-pulse mb-8">
              {Math.ceil(respawnTimer)}
            </div>
            <button 
              onClick={() => {
                setGameState('menu');
                setRespawnTimer(null);
                respawnTimerRef.current = null;
              }}
              className="px-8 py-3 bg-slate-800/80 hover:bg-slate-700 text-white font-bold rounded-full transition-all active:scale-95 uppercase tracking-widest text-sm border border-slate-600"
            >
              Exit to Menu
            </button>
          </motion.div>
        </div>
      )}

      {gameState === 'lobby' && <LobbyView />}

      {gameState === 'gameover' && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md ${gameOverType === 'WIN' ? 'bg-yellow-950/40' : 'bg-red-950/40'}`}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-center p-12 bg-slate-900 border-2 rounded-3xl shadow-2xl ${gameOverType === 'WIN' ? 'border-yellow-500/50' : 'border-red-500/50'}`}
          >
            {gameOverType === 'WIN' ? (
              <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
            ) : (
              <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-6" />
            )}
            <p className={`text-4xl md:text-6xl font-black mb-2 tracking-tighter italic uppercase ${gameOverType === 'WIN' ? 'text-yellow-500' : 'text-white'}`}>
              {gameOverType === 'WIN' ? 'VICTORY ROYALE' : gameOverType === 'DEFEAT' ? 'DEFEAT' : 'WASTED'}
            </p>
            
            {/* Post-Game Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8 mt-6">
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Kills</div>
                <div className="text-2xl font-black text-white">{finalStats.kills}</div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Damage</div>
                <div className="text-2xl font-black text-white">{finalStats.damage}</div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Accuracy</div>
                <div className="text-2xl font-black text-white">{finalStats.accuracy}%</div>
              </div>
            </div>

            {(gameMode === 'TEAM_DEATHMATCH' || gameMode === 'KING_OF_THE_HILL' || gameMode === 'CAPTURE_THE_FLAG') && (gameOverType === 'WIN' || gameOverType === 'DEFEAT') ? (
              <p className="text-xl md:text-2xl text-slate-400 mb-8">
                Final Score: <span className="text-red-500 font-bold">Red {Math.floor(teamScores.RED)}</span> - <span className="text-blue-500 font-bold">Blue {Math.floor(teamScores.BLUE)}</span>
              </p>
            ) : (
              <p className="text-xl md:text-2xl text-slate-400 mb-8">Final Score: <span className="text-white font-bold">{score}</span></p>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => setGameState('menu')}
                className="px-12 py-4 bg-slate-800 text-white font-black rounded-full hover:bg-slate-700 transition-all active:scale-95 uppercase tracking-widest"
              >
                Back to Menu
              </button>
              {(gameMode === 'TEAM_DEATHMATCH' || gameMode === 'KING_OF_THE_HILL' || gameMode === 'CAPTURE_THE_FLAG' || isMultiplayer) && gameOverType === 'WASTED' && (
                <button 
                  onClick={respawnPlayer}
                  className="px-12 py-4 bg-blue-600 text-white font-black rounded-full hover:bg-blue-500 transition-all active:scale-95 uppercase tracking-widest shadow-lg shadow-blue-600/20"
                >
                  Respawn
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {gameState === 'playing' && (
        <>
          {/* Chat Overlay */}
          {isMultiplayer && isChatEnabled && (
            <div className="fixed bottom-32 left-8 z-[60] w-80 pointer-events-none">
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-2"
                >
                    <div 
                      ref={scrollRef}
                      className="max-h-60 overflow-y-auto pointer-events-auto space-y-1 pr-2 custom-scrollbar bg-black/20 backdrop-blur-sm rounded-xl p-3"
                    >
                      {chatMessages.length === 0 ? (
                        <div className="text-[10px] text-slate-500 italic uppercase tracking-wider">No messages yet...</div>
                      ) : (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className="text-xs break-words">
                            <span className={`font-bold uppercase tracking-tight ${
                              msg.isSystem ? 'text-yellow-400' : 
                              msg.team === 'RED' ? 'text-red-400' : 
                              msg.team === 'BLUE' ? 'text-blue-400' : 'text-slate-200'
                            }`}>
                              {msg.senderName}: 
                            </span>
                            <span className="ml-1 text-white opacity-90">{msg.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
              </AnimatePresence>

              {isChatOpen && (
                <motion.form 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onSubmit={handleSendMessage}
                  className="mt-3 pointer-events-auto"
                >
                  <div className="relative group">
                    <input
                      autoFocus
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 backdrop-blur-md transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                       <span className="text-[9px] font-mono text-slate-600 bg-black/30 px-1 rounded border border-white/5">ENTER</span>
                    </div>
                  </div>
                </motion.form>
              )}

              {!isChatOpen && (
                <div className="mt-2 text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">
                  Press <span className="text-white/60">Enter</span> to Chat
                </div>
              )}
            </div>
          )}
          {/* HUD */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10 space-y-2 md:space-y-4 max-w-[calc(100vw-2rem)]">
            <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Trophy className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Score</p>
                <p className="text-xl md:text-2xl font-black text-white leading-none">{score}</p>
              </div>
            </div>

            {/* TDM Scores */}
            {gameMode === 'TEAM_DEATHMATCH' && (
              <div className="flex gap-4 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Red Team</p>
                  <p className="text-xl font-black text-white">{teamScores.RED} / 50</p>
                  <div className="h-1.5 bg-slate-800 rounded-full mt-1">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${(teamScores.RED / 50) * 100}%` }} />
                  </div>
                </div>
                <div className="w-px bg-slate-700" />
                <div className="flex-1 text-right">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Blue Team</p>
                  <p className="text-xl font-black text-white">{teamScores.BLUE} / 50</p>
                  <div className="h-1.5 bg-slate-800 rounded-full mt-1">
                    <div className="h-full bg-blue-500 rounded-full ml-auto" style={{ width: `${(teamScores.BLUE / 50) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* KOTH Scores */}
            {gameMode === 'KING_OF_THE_HILL' && (
              <div className="flex flex-col gap-3 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Red</p>
                    <p className="text-xl font-black text-white">{Math.floor(teamScores.RED)} / 100</p>
                  </div>
                  <div className="px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</p>
                    <p className={`text-[10px] font-black uppercase text-center ${
                      captureStatus === 'RED' ? 'text-red-500' :
                      captureStatus === 'BLUE' ? 'text-blue-500' :
                      captureStatus === 'CONTESTED' ? 'text-amber-500' : 'text-slate-500'
                    }`}>
                      {captureStatus}
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Blue</p>
                    <p className="text-xl font-black text-white">{Math.floor(teamScores.BLUE)} / 100</p>
                  </div>
                </div>
                <div className="flex h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${(teamScores.RED / 100) * 100}%` }} />
                  <div className="flex-1" />
                  <div className="h-full bg-blue-500" style={{ width: `${(teamScores.BLUE / 100) * 100}%` }} />
                </div>

                {/* Objective Indicator */}
                {(() => {
                  const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
                  const area = engineRef.current?.state.captureArea;
                  if (!player || !area) return null;

                  const centerX = area.pos.x + area.width / 2;
                  const centerY = area.pos.y + area.height / 2;
                  const dx = centerX - player.pos.x;
                  const dy = centerY - player.pos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                  return (
                    <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 bg-emerald-500 rounded-sm flex items-center justify-center"
                          style={{ transform: `rotate(${angle}deg)` }}
                        >
                          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-white" />
                        </div>
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Objective</p>
                      </div>
                      <p className="text-[10px] font-black text-emerald-500">{Math.round(dist)}m</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* CTF Scores */}
            {gameMode === 'CAPTURE_THE_FLAG' && (
              <div className="flex flex-col gap-3 p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Red Flag</p>
                    <p className="text-xl font-black text-white">{Math.floor(teamScores.RED)} / 3</p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Blue Flag</p>
                    <p className="text-xl font-black text-white">{Math.floor(teamScores.BLUE)} / 3</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${(teamScores.RED / 3) * 100}%` }} />
                  <div className="h-full bg-blue-500 transition-all duration-300 ml-auto" style={{ width: `${(teamScores.BLUE / 3) * 100}%` }} />
                </div>
                
                {/* Objective Indicator */}
                {(() => {
                  const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
                  if (!player || !engineRef.current?.state.flags) return null;

                  const enemyTeam = player.team === 'RED' ? 'BLUE' : 'RED';
                  const targetFlag = engineRef.current.state.flags.find(f => f.team === enemyTeam);
                  const ownBase = engineRef.current.state.captureBases?.find(b => b.team === player.team);
                  
                  if (!targetFlag || !ownBase) return null;

                  const target = player.carryingFlag ? { x: ownBase.pos.x + ownBase.width / 2, y: ownBase.pos.y + ownBase.height / 2 } : targetFlag.pos;
                  const dx = target.x - player.pos.x;
                  const dy = target.y - player.pos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                  return (
                    <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 bg-emerald-500 rounded-sm flex items-center justify-center"
                          style={{ transform: `rotate(${angle}deg)` }}
                        >
                          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-white" />
                        </div>
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                          {player.carryingFlag ? 'Return to Base' : 'Capture Flag'}
                        </p>
                      </div>
                      <p className="text-[10px] font-black text-emerald-500">{Math.round(dist)}m</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Bounty Hunter HUD */}
            {gameMode === 'BOUNTY_HUNTER' && (
              <div className="flex flex-col gap-3 p-4 bg-slate-900/80 backdrop-blur-md border border-amber-500/50 rounded-2xl shadow-lg shadow-amber-500/10">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Bounties Claimed</p>
                    <p className="text-2xl font-black text-white italic">
                      {Math.floor(teamScores.RED)} / 10
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Status</p>
                    {(() => {
                      const bounty = engineRef.current?.state.tanks.find(t => t.isBounty && !t.isDead);
                      return (
                        <p className={`text-xs font-black uppercase ${bounty ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`}>
                          {bounty ? 'MARK ACTIVE' : 'LOCATING...'}
                        </p>
                      );
                    })()}
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600" 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (teamScores.RED / 10) * 100)}%` }}
                    transition={{ type: "spring", stiffness: 50 }}
                  />
                </div>
                
                {/* Bounty Compass */}
                {(() => {
                  const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
                  const bounty = engineRef.current?.state.tanks.find(t => t.isBounty && !t.isDead);
                  if (!player || !bounty) return null;

                  const dx = bounty.pos.x - player.pos.x;
                  const dy = bounty.pos.y - player.pos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                  return (
                    <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 animate-pulse"
                          style={{ transform: `rotate(${angle}deg)` }}
                        >
                          <Target className="w-3 h-3 text-white" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-200 uppercase tracking-tight">{bounty.name || 'Unknown Mark'}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{bounty.type}</p>
                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                            <p className="text-[9px] font-black text-amber-400">100 PTS</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-rose-500">{Math.round(dist)}m</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase">Distance</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="w-48 md:w-64 p-3 md:p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
              <div className="flex justify-between items-end mb-1 md:mb-2">
                <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Health</p>
                <p className="text-xs md:text-sm font-bold text-white">{Math.round(health)}%</p>
              </div>
              <div className="h-2 md:h-3 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${health > 30 ? 'bg-emerald-500' : 'bg-red-500'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: `${health}%` }}
                />
              </div>
            </div>

            {/* Ability Cooldown */}
            <div className="w-48 md:w-64 p-3 md:p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
              <div className="flex justify-between items-end mb-1 md:mb-2">
                <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Special Ability</p>
                <p className="text-xs md:text-sm font-bold text-white">
                  {(() => {
                    const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
                    if (!player || !player.abilityCooldown || Date.now() >= player.abilityCooldown) return 'READY';
                    return `${Math.ceil((player.abilityCooldown - Date.now()) / 1000)}s`;
                  })()}
                </p>
              </div>
              <div className="h-2 md:h-3 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-100"
                  style={{ 
                    width: `${(() => {
                      const player = engineRef.current?.state.tanks.find(t => t.id === engineRef.current?.playerId);
                      if (!player) return 100;
                      if (!player.abilityCooldown || Date.now() >= player.abilityCooldown) return 100;
                      const stats = TANK_STATS[player.type];
                      const total = stats.abilityCooldown;
                      const elapsed = total - (player.abilityCooldown - Date.now());
                      return (elapsed / total) * 100;
                    })()}%` 
                  }}
                />
              </div>
            </div>

            {/* Currency Counter */}
            <div className="p-3 md:p-4 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Flame className="w-4 h-4 text-yellow-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Currency</p>
                <p className="text-sm md:text-lg font-black text-white">{Math.floor(currency)}</p>
              </div>
            </div>

            {/* Active Power-ups */}
            <div className="flex gap-2">
              <AnimatePresence>
                {activePowerUps.map(pu => {
                  const timeLeft = Math.max(0, Math.ceil((pu.expires - Date.now()) / 1000));
                  return (
                    <motion.div
                      key={`powerup-${pu.type}`}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className={`p-2 rounded-lg border flex items-center gap-2 ${
                        pu.type === 'SPEED' ? 'bg-blue-500/20 border-blue-500 text-blue-400' :
                        pu.type === 'RAPID_FIRE' ? 'bg-amber-500/20 border-amber-500 text-amber-400' :
                        pu.type === 'STRIKER' ? 'bg-red-500/20 border-red-500 text-red-400' :
                        'bg-purple-500/20 border-purple-500 text-purple-400'
                      }`}
                    >
                      {pu.type === 'SPEED' && <FastForward className="w-4 h-4" />}
                      {pu.type === 'RAPID_FIRE' && <Flame className="w-4 h-4" />}
                      {pu.type === 'SHIELD' && <Shield className="w-4 h-4" />}
                      {pu.type === 'STRIKER' && <Sword className="w-4 h-4" />}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-black uppercase tracking-tighter leading-none">{pu.type.replace('_', ' ')}</span>
                          {pu.stacks > 1 && (
                            <span className="text-[9px] font-black bg-white/20 px-1 rounded">x{pu.stacks}</span>
                          )}
                        </div>
                        <span className="text-[9px] font-mono font-bold opacity-80">{timeLeft}s</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* BR Player Count */}
          {gameMode === 'BATTLE_ROYALE' && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 px-6 py-2 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full flex items-center gap-3">
              <Target className="w-4 h-4 text-red-500" />
              <span className="text-sm font-black text-white uppercase tracking-widest">
                Tanks Remaining: <span className="text-red-500">{remainingPlayers}</span>
              </span>
            </div>
          )}

          {/* Leaderboard */}
          {!isMobile && (
            <div className="absolute top-6 right-6 z-10 w-64 space-y-4">
              <div className="p-6 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Top Predators
                </h3>
                <div className="space-y-3">
                  {leaderboard.map((entry, i) => (
                    <div key={`leaderboard-${i}-${entry.name}`} className="flex justify-between items-center">
                      <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : 'text-slate-300'}`}>
                        {i + 1}. {entry.name}
                      </span>
                      <span className="text-sm font-mono text-slate-500">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kill Feed */}
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {killFeed.map((kill) => (
                    <motion.div
                      key={kill.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-3 bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-tighter"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400">{kill.killer}</span>
                        <span className="text-slate-600 text-[8px]">[{kill.killerType}]</span>
                      </div>
                      <Zap className="w-3 h-3 text-red-500 shrink-0" />
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-slate-600 text-[8px]">[{kill.victimType}]</span>
                        <span className="text-red-400">{kill.victim}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Mobile Controls Overlay */}
          {isMobile && (
            <div className="absolute inset-0 pointer-events-none z-0">
              {touchState.active && (
                <div 
                  className="absolute w-32 h-32 rounded-full bg-white/10 border border-white/20 flex items-center justify-center"
                  style={{ 
                    left: touchState.start.x - 64, 
                    top: touchState.start.y - 64 
                  }}
                >
                  <div 
                    className="w-12 h-12 rounded-full bg-white/30 absolute"
                    style={{ 
                      left: 64 - 24 + (touchState.current.x - touchState.start.x),
                      top: 64 - 24 + (touchState.current.y - touchState.start.y),
                      transform: `translate(${
                        Math.max(-40, Math.min(40, touchState.current.x - touchState.start.x)) - (touchState.current.x - touchState.start.x)
                      }px, ${
                        Math.max(-40, Math.min(40, touchState.current.y - touchState.start.y)) - (touchState.current.y - touchState.start.y)
                      }px)`
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <canvas 
            ref={canvasRef} 
            className="w-full h-full cursor-crosshair"
          />

          {/* Exit Match Button (with Circular Progress) */}
          <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3">
            <div className="relative w-12 h-12">
              {/* Circular Progress Background */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="text-slate-800"
                />
                {/* Progress Circle */}
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={125.6}
                  strokeDashoffset={125.6 * (1 - Math.min(1, (Date.now() - lastDamageTime) / COMBAT_COOLDOWN))}
                  className={`${Date.now() - lastDamageTime < COMBAT_COOLDOWN ? 'text-red-500' : 'text-emerald-500'} transition-all duration-100`}
                />
              </svg>
              
              {/* Button */}
              <button 
                onClick={() => {
                  const timeSinceDamage = Date.now() - lastDamageTime;
                  if (timeSinceDamage >= COMBAT_COOLDOWN) {
                    setGameState('menu');
                  }
                }}
                disabled={Date.now() - lastDamageTime < COMBAT_COOLDOWN}
                className={`absolute inset-0 flex items-center justify-center rounded-full transition-all ${
                  Date.now() - lastDamageTime < COMBAT_COOLDOWN 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-800 hover:bg-red-600 text-white shadow-lg shadow-red-600/20'
                }`}
                title={Date.now() - lastDamageTime < COMBAT_COOLDOWN ? 'In Combat' : 'Leave Match'}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            
            {Date.now() - lastDamageTime < COMBAT_COOLDOWN && (
              <div className="bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-red-500/30">
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest animate-pulse">
                  In Combat: {Math.ceil((COMBAT_COOLDOWN - (Date.now() - lastDamageTime)) / 1000)}s
                </p>
              </div>
            )}
          </div>

          {/* Mobile Controls */}
          {isMobile && (
            <div className="fixed bottom-10 right-10 flex flex-col gap-4 pointer-events-auto z-50">
              <button 
                className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/50 active:scale-95 transition-transform"
                onPointerDown={() => inputRef.current.dash = true}
                onPointerUp={() => inputRef.current.dash = false}
              >
                <Zap className="w-10 h-10 text-white" />
              </button>
              <button 
                className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/50 active:scale-95 transition-transform"
                onPointerDown={() => inputRef.current.ability = true}
                onPointerUp={() => inputRef.current.ability = false}
              >
                <Sword className="w-10 h-10 text-white" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Skin Customization Screen */}
      <AnimatePresence>
        {isSkinMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 bg-slate-900 z-[100] flex flex-col p-10"
          >
            <button 
              onClick={() => setIsSkinMenuOpen(false)}
              className="absolute top-10 left-10 p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <LogOut className="w-8 h-8 text-white rotate-180" />
            </button>

            <div className="max-w-4xl mx-auto w-full">
              <h2 className="text-4xl font-bold text-white mb-8 text-center">TANK CUSTOMIZATION</h2>
              <div className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm border border-white/10">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-2xl text-white font-medium">YOUR CURRENCY: <span className="text-yellow-400">{Math.floor(currency)} 🪙</span></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                  {[
                    { id: 'DEFAULT', name: 'Original', price: 0 },
                    { id: 'STRIPED', name: 'Striped', price: 100 },
                    { id: 'POLKA', name: 'Polka Dots', price: 150 },
                    { id: 'CAMO', name: 'Camouflage', price: 250 },
                    { id: 'GALAXY', name: 'Galaxy', price: 500 },
                    { id: 'NEON', name: 'Neon', price: 750 },
                    { id: 'CHROMA', name: 'Chroma', price: 1000 },
                    { id: 'WOOD', name: 'Wood', price: 300 },
                    { id: 'GOLD', name: 'Gold', price: 2000 },
                    { id: 'RUBY', name: 'Ruby', price: 1500 },
                    { id: 'EMERALD', name: 'Emerald', price: 1500 },
                    { id: 'SAPPHIRE', name: 'Sapphire', price: 1500 },
                    { id: 'MAGMA', name: 'Magma', price: 1200 },
                    { id: 'FROST', name: 'Frost', price: 1200 },
                    { id: 'CARBON', name: 'Carbon Fiber', price: 800 },
                    { id: 'LAVA', name: 'Lava', price: 1200 },
                  ].map((skin) => {
                    const isUnlocked = unlockedSkins.includes(skin.id as SkinType);
                    const isSelected = selectedSkin === skin.id;
                    
                    return (
                      <button
                        key={`skin-${skin.id}`}
                        onClick={() => {
                          if (isUnlocked) {
                            setSelectedSkin(skin.id as SkinType);
                          } else if (currency >= skin.price) {
                            const newCurrency = currency - skin.price;
                            const newSkins = [...unlockedSkins, skin.id as SkinType];
                            setCurrency(newCurrency);
                            setUnlockedSkins(newSkins);
                            setSelectedSkin(skin.id as SkinType);
                            saveProgress(newCurrency, newSkins);
                            soundManager.playPowerUp({ x: 0, y: 0 });
                          }
                        }}
                        className={`p-6 rounded-xl border-2 transition-all flex items-center justify-between ${
                          isSelected ? 'border-yellow-400 bg-yellow-400/10' : 
                          isUnlocked ? 'border-white/20 bg-white/5 hover:border-white/40' : 
                          'border-white/10 bg-black/20 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="text-left">
                          <div className="text-xl font-bold text-white">{skin.name}</div>
                          {!isUnlocked && <div className="text-yellow-400 font-medium">{skin.price} 🪙</div>}
                        </div>
                        {isSelected ? (
                          <div className="bg-yellow-400 text-slate-900 px-3 py-1 rounded-full text-sm font-bold">EQUIPPED</div>
                        ) : isUnlocked ? (
                          <div className="text-white/60 text-sm font-bold">EQUIP</div>
                        ) : (
                          <div className="bg-white/10 text-white px-3 py-1 rounded-full text-sm font-bold">BUY</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tutorial Modal */}
      <AnimatePresence>
        {isTutorialOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/90 z-[200] flex items-center justify-center p-4 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500 rounded-lg">
                      <HelpCircle className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Combat Training</h2>
                  </div>
                  <button 
                    onClick={() => setIsTutorialOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-8 flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tutorialStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      {tutorialStep === 0 && (
                        <div className="space-y-6">
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                              <Keyboard className="w-4 h-4" />
                              Computer (Keyboard & Mouse)
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Move</p>
                                <p className="text-sm text-white font-bold">WASD / Arrows</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dash</p>
                                <p className="text-sm text-white font-bold">SPACE</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Aim</p>
                                <p className="text-sm text-white font-bold">Mouse</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Shoot</p>
                                <p className="text-sm text-white font-bold">Left Click</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 col-span-2">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Ability</p>
                                <p className="text-sm text-white font-bold">E Key</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                              <Gamepad2 className="w-4 h-4" />
                              Controller
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Move</p>
                                <p className="text-sm text-white font-bold">Left Stick</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Aim</p>
                                <p className="text-sm text-white font-bold">Right Stick</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Shoot</p>
                                <p className="text-sm text-white font-bold">RT / R2 / A</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dash</p>
                                <p className="text-sm text-white font-bold">B / Circle / L3</p>
                              </div>
                              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Ability</p>
                                <p className="text-sm text-white font-bold">R3 / Right Stick Press</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                              <Smartphone className="w-4 h-4" />
                              Mobile
                            </h4>
                            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                              <p className="text-sm text-slate-300 leading-relaxed">
                                Use the <span className="text-white font-bold">Left Joystick</span> to move your tank and the <span className="text-white font-bold">Right Joystick</span> to aim and shoot automatically.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {tutorialStep === 1 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                            <div className="p-3 bg-amber-500/20 rounded-xl">
                              <Zap className="w-8 h-8 text-amber-400" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white">Growth & Score</h3>
                              <p className="text-sm text-slate-400">Destroy enemy tanks or collect power-ups to increase your <span className="text-amber-400 font-bold">Score</span>. Higher score makes your tank <span className="text-white font-bold italic underline">LARGER</span> and more powerful!</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                            <div className="p-3 bg-purple-500/20 rounded-xl">
                              <FastForward className="w-8 h-8 text-purple-400" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white">Dash</h3>
                              <p className="text-sm text-slate-400">Press <span className="text-white font-mono bg-slate-700 px-2 py-0.5 rounded">SPACE</span> to perform a quick dash. Use it to dodge bullets or chase down targets.</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {tutorialStep === 2 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-yellow-400" />
                            Unique Abilities [E Key]
                          </h3>
                          <div className="grid grid-cols-1 gap-2">
                            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                              <span className="text-blue-400 font-bold">SCOUT</span>
                              <span className="text-xs text-slate-400 italic">Stealth Mode (Invisibility)</span>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                              <span className="text-red-400 font-bold">HEAVY</span>
                              <span className="text-xs text-slate-400 italic">Shield Bash (Knockback)</span>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                              <span className="text-yellow-400 font-bold">ARTILLERY</span>
                              <span className="text-xs text-slate-400 italic">Charged Shot (Massive DMG)</span>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between">
                              <span className="text-emerald-400 font-bold">HEALER</span>
                              <span className="text-xs text-slate-400 italic">Holy Nova (Team Heal)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {tutorialStep === 3 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-400" />
                            Game Modes
                          </h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                              <h4 className="font-bold text-white mb-1">Classic</h4>
                              <p className="text-[10px] text-slate-400">Endless free-for-all. Grow as big as you can.</p>
                            </div>
                            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                              <h4 className="font-bold text-white mb-1">Battle Royale</h4>
                              <p className="text-[10px] text-slate-400">30 tanks enter, only one survives. No respawns.</p>
                            </div>
                            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                              <h4 className="font-bold text-white mb-1">TDM</h4>
                              <p className="text-[10px] text-slate-400">Red vs Blue. First team to reach the kill limit wins.</p>
                            </div>
                            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                              <h4 className="font-bold text-white mb-1">KOTH</h4>
                              <p className="text-[10px] text-slate-400">Capture the central zone to earn points for your team.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((s) => (
                      <div 
                        key={`tutorial-dot-${s}`} 
                        className={`w-2 h-2 rounded-full transition-all ${tutorialStep === s ? 'w-6 bg-blue-500' : 'bg-slate-700'}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-3">
                    {tutorialStep > 0 && (
                      <button 
                        onClick={() => setTutorialStep(prev => prev - 1)}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all"
                      >
                        Back
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (tutorialStep < 3) setTutorialStep(prev => prev + 1);
                        else setIsTutorialOpen(false);
                      }}
                      className="px-8 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all"
                    >
                      {tutorialStep < 3 ? 'Next' : 'Got it!'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Settings className="w-5 h-5 text-blue-400" />
                    </div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Settings</h2>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                  >
                    <LogOut className="w-5 h-5 rotate-180" />
                  </button>
                </div>

                <div className="p-8 space-y-8">
                  {/* Volume */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Volume2 className="w-4 h-4" />
                        Master Volume
                      </label>
                      <span className="text-xs font-mono text-blue-400 font-bold">{Math.round(volume * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  {/* Sensitivity */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Mouse className="w-4 h-4" />
                        Aim Sensitivity
                      </label>
                      <span className="text-xs font-mono text-emerald-400 font-bold">{sensitivity.toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="3" 
                      step="0.1"
                      value={sensitivity}
                      onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Chat Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isChatEnabled ? 'bg-purple-500/20' : 'bg-slate-700/20'}`}>
                        <MessageSquare className={`w-4 h-4 ${isChatEnabled ? 'text-purple-400' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">In-Game Chat</span>
                        <span className="text-[10px] text-slate-500 font-medium">Communicate with players</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsChatEnabled(!isChatEnabled)}
                      className={`w-12 h-6 rounded-full transition-all duration-300 relative ${isChatEnabled ? 'bg-purple-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${isChatEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  {/* Other Preferences */}
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Sliders className="w-4 h-4" />
                      Preferences
                    </label>
                    <div className="space-y-2">
                      <button 
                        onClick={toggleFullscreen}
                        className="w-full p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-between group transition-all"
                      >
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Fullscreen Mode</span>
                        <div className={`w-10 h-5 rounded-full transition-all relative ${isFullscreen ? 'bg-blue-500' : 'bg-slate-700'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isFullscreen ? 'left-6' : 'left-1'}`} />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-900/50 border-t border-slate-800">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  >
                    SAVE & CLOSE
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}
