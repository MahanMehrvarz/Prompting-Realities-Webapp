"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FirstUseModal } from "./FirstUseModal";

// The notice is about using the app, so it belongs on the app routes. The public
// pages (/ and /research) must not greet a first-time visitor with a modal.
const PUBLIC_ROUTES = ["/", "/research"];

export function FirstUseModalWrapper() {
  const [showModal, setShowModal] = useState(false);
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

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

  return <FirstUseModal isOpen={showModal && !isPublicRoute} onAccept={handleAccept} />;
}
