"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Check if the app is already installed and running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    // Detect if the user is on an iOS device
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('PWA: beforeinstallprompt event fired!');
      e.preventDefault();
      setInstallPrompt(e);
      // Also store it globally for other components
      (window as any).deferredPrompt = e;
    };

    const checkForExistingPrompt = () => {
      console.log('Checking for existing PWA prompt...');
      if ((window as any).deferredPrompt) {
        console.log('Found deferred prompt in window!');
        setInstallPrompt((window as any).deferredPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      (window as any).deferredPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    checkForExistingPrompt();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    console.log('Install clicked. Prompt state:', !!installPrompt);
    
    if (installPrompt) {
      // This is for Android/Chrome/Desktop
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      console.log('Install outcome:', outcome);
      if (outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } else if (isIos) {
      // This is for iOS/Safari
      toast.info("To install this app:", {
        description: "Tap the 'Share' button and then 'Add to Home Screen'.",
      });
    } else {
      // If no prompt and not iOS, it might be already installed
      if (isStandalone) {
        toast.success("Autex is already installed!", {
          description: "You can find it in your Apps menu.",
        });
      } else {
        toast.error("Install prompt not ready", {
          description: "Try refreshing or checking your browser address bar icon.",
        });
      }
    }
  };

  // Hide button if already installed/standalone
  if (isStandalone) {
    return null;
  }

  // Only show if we have a prompt or if it's iOS (manual instructions)
  if (!installPrompt && !isIos) {
    return null;
  }

  return (
    <Button 
      onClick={handleInstallClick} 
      variant="default" 
      size="icon" 
      aria-label="Install App"
      className="fixed top-3 right-14 z-[9999] h-9 w-9 bg-primary text-primary-foreground rounded-full shadow-2xl hover:bg-primary/90 border border-primary/20 animate-in zoom-in duration-300"
    >
      <ArrowDownToLine className="h-5 w-5" />
    </Button>
  );
}
