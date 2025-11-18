import { browser } from '$app/environment';

export interface Sparkle {
  id: string;
  x: number;
  y: number;
  size: number;
  color: 'gold' | 'silver';
  duration: number;
  delay: number;
  opacity: number;
}

export function createSparkles(count: number, container: HTMLElement): Sparkle[] {
  if (!browser || !container) return [];
  
  const sparkles: Sparkle[] = [];
  const containerRect = container.getBoundingClientRect();
  
  for (let i = 0; i < count; i++) {
    sparkles.push({
      id: `sparkle-${Date.now()}-${i}`,
      x: Math.random() * containerRect.width,
      y: Math.random() * containerRect.height,
      size: Math.random() * 4 + 2, // 2-6px
      color: Math.random() > 0.5 ? 'gold' : 'silver',
      duration: Math.random() * 2000 + 1000, // 1-3 seconds
      delay: Math.random() * 1000,
      opacity: Math.random() * 0.5 + 0.5, // 0.5-1.0
    });
  }
  
  return sparkles;
}

export function createSparkleElement(sparkle: Sparkle): HTMLElement {
  const element = document.createElement('div');
  element.className = `sparkle sparkle-${sparkle.color}`;
  element.style.cssText = `
    position: absolute;
    left: ${sparkle.x}px;
    top: ${sparkle.y}px;
    width: ${sparkle.size}px;
    height: ${sparkle.size}px;
    background: ${sparkle.color === 'gold' ? 'radial-gradient(circle, #ffd700, transparent)' : 'radial-gradient(circle, #c0c0c0, transparent)'};
    border-radius: 50%;
    pointer-events: none;
    z-index: 1000;
    opacity: ${sparkle.opacity};
    animation: sparkle-twinkle ${sparkle.duration}ms ease-in-out ${sparkle.delay}ms infinite;
    box-shadow: 0 0 ${sparkle.size * 2}px ${sparkle.color === 'gold' ? 'rgba(255, 215, 0, 0.8)' : 'rgba(192, 192, 192, 0.8)'};
  `;
  return element;
}

