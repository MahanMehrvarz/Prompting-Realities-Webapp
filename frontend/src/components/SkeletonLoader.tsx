import React from "react";

interface SkeletonLoaderProps {
  variant?: "card" | "text" | "stat" | "button" | "assistant" | "mqtt-log";
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant = "card", 
  className = "" 
}) => {
  const baseClasses = "animate-pulse bg-gradient-to-r from-[var(--card-fill)]/40 via-[var(--card-fill)]/60 to-[var(--card-fill)]/40 bg-[length:200%_100%]";
  
  if (variant === "assistant") {
    return (
      <div className={`rounded-[20px] border-[3px] border-transparent bg-white/70 px-4 py-4 ${className}`}>
        <div className="rounded-[20px] bg-[var(--ink-dark)]/10 px-4 py-2">
          <div className={`h-5 w-32 rounded ${baseClasses}`} />
          <div className={`mt-2 h-3 w-24 rounded ${baseClasses}`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className={`h-6 w-20 rounded-full ${baseClasses}`} />
          <div className={`h-6 w-24 rounded-full ${baseClasses}`} />
        </div>
      </div>
    );
  }
  
  if (variant === "stat") {
    return (
      <div className={`rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white px-4 py-3 shadow-[5px_5px_0_var(--card-shell)] ${className}`}>
        <div className={`h-3 w-24 rounded ${baseClasses}`} />
        <div className={`mt-2 h-5 w-32 rounded ${baseClasses}`} />
        <div className={`mt-1 h-3 w-28 rounded ${baseClasses}`} />
      </div>
    );
  }
  
  if (variant === "mqtt-log") {
    return (
      <li className="flex items-start gap-3 rounded-[20px] border-[2px] border-[var(--card-shell)] bg-white p-3">
        <div className={`h-10 w-10 rounded-[20px] ${baseClasses}`} />
        <div className="flex-1">
          <div className={`h-4 w-full rounded ${baseClasses}`} />
          <div className={`mt-2 h-3 w-20 rounded ${baseClasses}`} />
        </div>
      </li>
    );
  }
  
  if (variant === "text") {
    return <div className={`h-4 rounded ${baseClasses} ${className}`} />;
  }
  
  if (variant === "button") {
    return <div className={`h-10 w-32 rounded-full ${baseClasses} ${className}`} />;
  }
  
  // Default card variant
  return (
    <div className={`rounded-[20px] border-[3px] border-[var(--card-shell)] bg-white/90 p-6 ${baseClasses} ${className}`}>
      <div className="space-y-3">
        <div className={`h-5 w-3/4 rounded ${baseClasses}`} />
        <div className={`h-4 w-full rounded ${baseClasses}`} />
        <div className={`h-4 w-5/6 rounded ${baseClasses}`} />
      </div>
    </div>
  );
};

export default SkeletonLoader;
