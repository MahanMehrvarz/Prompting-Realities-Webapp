"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FirstUseModal } from "./FirstUseModal";

// The notice is about using the app, so it belongs on the app routes. The public
// pages must not greet a first-time visitor with a modal. Matched by prefix so
// nested routes (/tutorials/<slug>) are covered without listing each one.
const PUBLIC_ROUTES = ["/", "/research", "/tutorials"];

const isPublic = (pathname: string) =>
  PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

export function FirstUseModalWrapper() {
  const [showModal, setShowModal] = useState(false);
  const pathname = usePathname();

  const isPublicRoute = isPublic(pathname);

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
