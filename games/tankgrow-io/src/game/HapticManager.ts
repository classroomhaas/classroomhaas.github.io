
import { Point } from './types';

class HapticManager {
  private enabled: boolean = true;
  private listenerPos: Point = { x: 0, y: 0 };
  private readonly MAX_DISTANCE = 1000;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setListenerPosition(pos: Point) {
    this.listenerPos = pos;
  }

  private getDistanceIntensity(sourcePos?: Point): number {
    if (!sourcePos) return 1.0;
    const dx = sourcePos.x - this.listenerPos.x;
    const dy = sourcePos.y - this.listenerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > this.MAX_DISTANCE) return 0;
    return 1 - (distance / this.MAX_DISTANCE);
  }

  rumble(duration: number, strongMagnitude: number = 1.0, weakMagnitude: number = 1.0, sourcePos?: Point) {
    if (!this.enabled) return;
    
    const intensity = this.getDistanceIntensity(sourcePos);
    if (intensity <= 0) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];
    
    if (gp && gp.vibrationActuator) {
      (gp.vibrationActuator as any).playEffect('dual-rumble', {
        startDelay: 0,
        duration: duration,
        strongMagnitude: strongMagnitude * intensity,
        weakMagnitude: weakMagnitude * intensity,
      }).catch((e: any) => {
        console.warn('Haptic feedback failed', e);
      });
    }
  }

  playDamage() {
    this.rumble(200, 0.8, 0.5);
  }

  playExplosion(pos?: Point) {
    this.rumble(400, 1.0, 0.8, pos);
  }

  playShoot(isPowerful: boolean = false, pos?: Point) {
    if (isPowerful) {
      this.rumble(150, 0.5, 0.3, pos);
    } else {
      this.rumble(50, 0.2, 0.1, pos);
    }
  }

  playCollect() {
    this.rumble(100, 0.1, 0.4);
  }
}

export const hapticManager = new HapticManager();
