/**
 * Programmatically generates a soft 2-tone chime using Web Audio API.
 * Frequency: 880Hz (A5) then 1100Hz (C#6)
 */
export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    playTone(880, now, 0.15);
    playTone(1100, now + 0.1, 0.2);
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
  }
}
