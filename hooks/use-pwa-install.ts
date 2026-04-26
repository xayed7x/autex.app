"use client";

import { useEffect, useState } from 'react';

/**
 * Hook to handle PWA installation
 */
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event globally and locally
      (window as any).deferredPrompt = e;
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    const checkForExistingPrompt = () => {
      if ((window as any).deferredPrompt) {
        setInstallPrompt((window as any).deferredPrompt);
        setIsInstallable(true);
      }
    };

    // Detect if the user is on an iOS device
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    } else if (isIosDevice) {
      // On iOS, we consider it "installable" even without the event
      setIsInstallable(true);
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
      (window as any).deferredPrompt = null;
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    checkForExistingPrompt();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return false;

    // Show the prompt
    installPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, throw it away
    setInstallPrompt(null);
    setIsInstallable(false);

    return outcome === 'accepted';
  };

  return {
    isInstallable,
    isInstalled,
    isIos: /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream,
    installApp
  };
}
