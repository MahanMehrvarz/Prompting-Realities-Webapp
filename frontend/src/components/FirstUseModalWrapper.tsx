"use client";

import { useEffect, useState } from "react";
import { FirstUseModal } from "./FirstUseModal";

export function FirstUseModalWrapper() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if user has seen the modal before
    const hasSeenModal = localStorage.getItem("hasSeenDataPrivacyNotice");
    
    if (!hasSeenModal) {
      setShowModal(true);
    }
  }, []);

  const handleAccept = () => {
    // Mark that user has seen the modal
    localStorage.setItem("hasSeenDataPrivacyNotice", "true");
    setShowModal(false);
  };

  return <FirstUseModal isOpen={showModal} onAccept={handleAccept} />;
}
